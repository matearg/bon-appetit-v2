import { createHash, timingSafeEqual } from 'node:crypto';
import { zValidator } from '@hono/zod-validator';
import { changePasswordBodySchema, loginBodySchema, signupBodySchema } from '@bonappetit/shared';
import { eq } from 'drizzle-orm';
import { Hono, type Context } from 'hono';
import type { AppEnv } from '../app.js';
import { lists, users } from '../db/schema.js';
import { HttpError, validationHook } from '../http/errors.js';
import { requireUser } from './middleware.js';
import { hashPassword, verifyPassword } from './password.js';
import {
  clearSessionCookie,
  createSession,
  deleteOtherSessions,
  deleteSession,
  setSessionCookie,
} from './sessions.js';

const sha256 = (s: string) => createHash('sha256').update(s).digest();

// Empty configured code = signup disabled.
function inviteCodeMatches(given: string, configured: string): boolean {
  return configured !== '' && timingSafeEqual(sha256(given), sha256(configured));
}

// Verified against on unknown emails so login takes as long as for a real account.
const dummyHash = hashPassword('not-a-real-password');

function isUniqueViolation(err: unknown): boolean {
  // drizzle wraps the postgres error in `cause`.
  for (let e: unknown = err; e instanceof Error; e = e.cause) {
    if ((e as { code?: unknown }).code === '23505') return true;
  }
  return false;
}

async function startSession(c: Context<AppEnv>, userId: string) {
  const { db, secureCookies } = c.var.deps;
  const { token, expiresAt } = await createSession(db, userId);
  setSessionCookie(c, token, expiresAt, secureCookies);
}

export const authRoutes = new Hono<AppEnv>()
  .post('/signup', zValidator('json', signupBodySchema, validationHook), async (c) => {
    const { email, password, inviteCode } = c.req.valid('json');
    const { db, inviteCode: configured } = c.var.deps;
    if (!inviteCodeMatches(inviteCode, configured)) {
      throw new HttpError(403, 'forbidden', 'Invalid invite code');
    }

    const passwordHash = await hashPassword(password);
    let user: { id: string; email: string };
    try {
      user = await db.transaction(async (tx) => {
        const [created] = await tx
          .insert(users)
          .values({ email, passwordHash })
          .returning({ id: users.id, email: users.email });
        await tx.insert(lists).values({ userId: created.id, name: 'Favorites', isFavorites: true });
        return created;
      });
    } catch (err) {
      if (isUniqueViolation(err)) throw new HttpError(409, 'conflict', 'Email already registered');
      throw err;
    }

    await startSession(c, user.id);
    return c.json(user, 201);
  })
  .post('/login', zValidator('json', loginBodySchema, validationHook), async (c) => {
    const { email, password } = c.req.valid('json');
    const [user] = await c.var.deps.db.select().from(users).where(eq(users.email, email));
    const ok = await verifyPassword(user?.passwordHash ?? (await dummyHash), password);
    if (!user || !ok) throw new HttpError(401, 'unauthorized', 'Invalid email or password');

    await startSession(c, user.id);
    return c.json({ id: user.id, email: user.email });
  })
  .post('/logout', requireUser, async (c) => {
    await deleteSession(c.var.deps.db, c.var.sessionId);
    clearSessionCookie(c);
    return c.body(null, 204);
  })
  .get('/me', requireUser, (c) => c.json(c.var.user))
  .patch(
    '/password',
    requireUser,
    zValidator('json', changePasswordBodySchema, validationHook),
    async (c) => {
      const { currentPassword, newPassword } = c.req.valid('json');
      const { db } = c.var.deps;
      const { id } = c.var.user;
      const [user] = await db.select().from(users).where(eq(users.id, id));
      if (!user || !(await verifyPassword(user.passwordHash, currentPassword))) {
        throw new HttpError(401, 'unauthorized', 'Current password is incorrect');
      }

      await db
        .update(users)
        .set({ passwordHash: await hashPassword(newPassword) })
        .where(eq(users.id, id));
      await deleteOtherSessions(db, id, c.var.sessionId);
      return c.body(null, 204);
    },
  );
