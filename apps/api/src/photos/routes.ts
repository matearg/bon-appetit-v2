import { PHOTO_MAX_BYTES } from '@bonappetit/shared';
import { randomBytes } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { requireUser, type AuthedEnv } from '../auth/middleware.js';
import { recipes } from '../db/schema.js';
import { HttpError } from '../http/errors.js';
import { loadOwnedRecipe, toRecipe } from '../recipes/routes.js';
import type { PhotoStorage } from './storage.js';
import { processPhoto } from './process.js';

const tooBig = () => new HttpError(413, 'payload_too_large', 'Photo must be 4 MB or smaller');

// Post-commit cleanup: a leftover file must not fail a request that already succeeded.
export async function discardFile(storage: PhotoStorage, key: string) {
  try {
    await storage.delete(key);
  } catch (e) {
    console.error('failed to delete photo file', key, e);
  }
}

export const photoRoutes = new Hono<AuthedEnv>()
  .use('/:id/photo', requireUser)
  .put(
    '/:id/photo',
    bodyLimit({
      maxSize: PHOTO_MAX_BYTES,
      onError: () => {
        throw tooBig();
      },
    }),
    async (c) => {
      const { db, storage } = c.var.deps;
      const userId = c.var.user.id;
      const owned = await loadOwnedRecipe(db, userId, c.req.param('id'));

      const file = (await c.req.parseBody()).photo;
      if (!(file instanceof File)) {
        throw new HttpError(400, 'validation', 'Invalid request', {
          photo: ['A photo file is required'],
        });
      }
      const bytes = await processPhoto(Buffer.from(await file.arrayBuffer()));

      const newKey = `${userId}/${owned.id}/${randomBytes(16).toString('hex')}.webp`;
      await storage.put(newKey, bytes, 'image/webp');
      let row;
      try {
        [row] = await db
          .update(recipes)
          .set({ photoKey: newKey, updatedAt: new Date() })
          .where(and(eq(recipes.id, owned.id), eq(recipes.userId, userId)))
          .returning();
      } catch (e) {
        await storage.delete(newKey).catch(() => {});
        throw e;
      }
      if (!row) {
        await storage.delete(newKey).catch(() => {});
        throw new HttpError(404, 'not_found', 'Recipe not found');
      }
      if (owned.photoKey) await discardFile(storage, owned.photoKey);
      return c.json(await toRecipe(db, userId, row));
    },
  )
  .delete('/:id/photo', async (c) => {
    const { db, storage } = c.var.deps;
    const userId = c.var.user.id;
    const owned = await loadOwnedRecipe(db, userId, c.req.param('id'));
    await db
      .update(recipes)
      .set({ photoKey: null, updatedAt: new Date() })
      .where(and(eq(recipes.id, owned.id), eq(recipes.userId, userId)));
    if (owned.photoKey) await discardFile(storage, owned.photoKey);
    return c.body(null, 204);
  })
  .get('/:id/photo', async (c) => {
    const owned = await loadOwnedRecipe(c.var.deps.db, c.var.user.id, c.req.param('id'));
    const photo = owned.photoKey ? await c.var.deps.storage.get(owned.photoKey) : null;
    if (!photo) throw new HttpError(404, 'not_found', 'Photo not found');
    return c.body(new Uint8Array(photo.bytes), 200, {
      'Content-Type': 'image/webp',
      'Cache-Control': 'private, max-age=31536000, immutable',
    });
  });
