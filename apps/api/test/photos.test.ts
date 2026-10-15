import { existsSync } from 'node:fs';
import { mkdir, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { Recipe } from '@bonappetit/shared';
import { recipes } from '../src/db/schema.js';
import { makeTestApp, req, signupAs, truncateAll, uploadPhoto } from './helpers.js';

const { app, db, photoDir, close } = await makeTestApp();

beforeEach(async () => {
  await truncateAll(db);
  await rm(photoDir, { recursive: true, force: true });
  await mkdir(photoDir);
});
afterAll(() => close());

const jpeg = await sharp({
  create: { width: 3000, height: 2000, channels: 3, background: '#888' },
})
  .withExif({ IFD0: { Make: 'TestCam' } })
  .withMetadata({ orientation: 6 })
  .jpeg()
  .toBuffer();

const newRecipe = async (cookie: string) =>
  (
    (await (
      await req(app, 'POST', '/api/recipes', {
        cookie,
        body: { title: 'Soup', ingredients: [], steps: [] },
      })
    ).json()) as Recipe
  ).id;
const files = async () =>
  (await readdir(photoDir, { recursive: true })).filter((f) => f.endsWith('.webp'));
const photoKey = async (id: string) =>
  (await db.select().from(recipes).where(eq(recipes.id, id)))[0]?.photoKey ?? null;

describe('photos', () => {
  it('re-encodes to rotated, resized, metadata-free webp', async () => {
    expect((await sharp(jpeg).metadata()).exif).toBeDefined();
    const { cookie } = await signupAs(app);
    const id = await newRecipe(cookie);
    const put = await uploadPhoto(app, `/api/recipes/${id}/photo`, cookie, jpeg);
    expect(put.status).toBe(200);
    expect(((await put.json()) as Recipe).hasPhoto).toBe(true);

    const res = await req(app, 'GET', `/api/recipes/${id}/photo`, { cookie });
    expect(res.headers.get('content-type')).toBe('image/webp');
    expect(res.headers.get('cache-control')).toBe('private, max-age=31536000, immutable');
    const meta = await sharp(Buffer.from(await res.arrayBuffer())).metadata();
    expect(meta.format).toBe('webp');
    expect(Math.max(meta.width!, meta.height!)).toBeLessThanOrEqual(1600);
    expect(meta.height).toBeGreaterThan(meta.width!);
    expect(meta.exif).toBeUndefined();
    const got = (await (await req(app, 'GET', `/api/recipes/${id}`, { cookie })).json()) as Recipe;
    expect(got.hasPhoto).toBe(true);
  });

  it('rejects non-images (415), oversize (413) and a missing field (400)', async () => {
    const { cookie } = await signupAs(app);
    const id = await newRecipe(cookie);
    const path = `/api/recipes/${id}/photo`;
    expect((await uploadPhoto(app, path, cookie, 'hello, not an image')).status).toBe(415);
    const big = await uploadPhoto(app, path, cookie, new Uint8Array(5 * 1024 * 1024));
    expect(big.status).toBe(413);
    expect(((await big.json()) as { error: { code: string } }).error.code).toBe(
      'payload_too_large',
    );
    const form = new FormData();
    form.set('other', 'x');
    const none = await app.request(path, {
      method: 'PUT',
      headers: { origin: 'http://localhost:4200', cookie },
      body: form,
    });
    expect(none.status).toBe(400);
    expect(((await none.json()) as { error: { fields: object } }).error.fields).toHaveProperty(
      'photo',
    );
    expect(await files()).toHaveLength(0);
  });

  it('replacing removes the old file; DELETE /photo removes the file', async () => {
    const { cookie } = await signupAs(app);
    const id = await newRecipe(cookie);
    const path = `/api/recipes/${id}/photo`;
    await uploadPhoto(app, path, cookie, jpeg);
    const first = await files();
    expect(first).toHaveLength(1);
    await uploadPhoto(app, path, cookie, jpeg);
    const second = await files();
    expect(second).toHaveLength(1);
    expect(second[0]).not.toBe(first[0]);

    expect((await req(app, 'DELETE', path, { cookie })).status).toBe(204);
    expect(await files()).toHaveLength(0);
    expect((await req(app, 'GET', path, { cookie })).status).toBe(404);
    expect((await req(app, 'DELETE', path, { cookie })).status).toBe(204);
    const got = (await (await req(app, 'GET', `/api/recipes/${id}`, { cookie })).json()) as Recipe;
    expect(got.hasPhoto).toBe(false);
  });

  it('deleting the recipe removes its photo file, even if the file is already gone', async () => {
    const { cookie } = await signupAs(app);
    const a = await newRecipe(cookie);
    const b = await newRecipe(cookie);
    await uploadPhoto(app, `/api/recipes/${a}/photo`, cookie, jpeg);
    await uploadPhoto(app, `/api/recipes/${b}/photo`, cookie, jpeg);
    expect(await files()).toHaveLength(2);
    expect((await req(app, 'DELETE', `/api/recipes/${a}`, { cookie })).status).toBe(204);
    expect(await files()).toHaveLength(1);

    await rm(join(photoDir, (await photoKey(b))!));
    expect((await req(app, 'GET', `/api/recipes/${b}/photo`, { cookie })).status).toBe(404);
    expect((await req(app, 'DELETE', `/api/recipes/${b}`, { cookie })).status).toBe(204);
  });

  it('replacing succeeds when the old file is already missing', async () => {
    const { cookie } = await signupAs(app);
    const id = await newRecipe(cookie);
    const path = `/api/recipes/${id}/photo`;
    await uploadPhoto(app, path, cookie, jpeg);
    await rm(join(photoDir, (await photoKey(id))!));
    expect((await uploadPhoto(app, path, cookie, jpeg)).status).toBe(200);
    expect(existsSync(join(photoDir, (await photoKey(id))!))).toBe(true);
  });

  it("hides one user's photos from another", async () => {
    const a = await signupAs(app, 'a@example.com');
    const b = await signupAs(app, 'b@example.com');
    const id = await newRecipe(a.cookie);
    const path = `/api/recipes/${id}/photo`;
    await uploadPhoto(app, path, a.cookie, jpeg);
    expect((await req(app, 'GET', path, { cookie: b.cookie })).status).toBe(404);
    expect((await uploadPhoto(app, path, b.cookie, jpeg)).status).toBe(404);
    expect((await req(app, 'DELETE', path, { cookie: b.cookie })).status).toBe(404);
    expect(await files()).toHaveLength(1);
  });

  it('rejects a cross-origin multipart upload', async () => {
    const { cookie } = await signupAs(app);
    const id = await newRecipe(cookie);
    const res = await uploadPhoto(
      app,
      `/api/recipes/${id}/photo`,
      cookie,
      jpeg,
      'https://evil.example',
    );
    expect(res.status).toBe(403);
  });
});
