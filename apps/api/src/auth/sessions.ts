import { createHash, randomBytes } from 'node:crypto';
import { and, eq, lt, ne } from 'drizzle-orm';
import type { Context } from 'hono';
import { deleteCookie, setCookie } from 'hono/cookie';
import type { Db } from '../db/client.js';
import { sessions, users } from '../db/schema.js';

export const SESSION_COOKIE = 'sid';
const DAY = 24 * 60 * 60 * 1000;
const SESSION_TTL = 30 * DAY;
const RENEW_BELOW = 15 * DAY;

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export async function createSession(
  db: Db,
  userId: string,
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_TTL);
  await db.insert(sessions).values({ id: hashToken(token), userId, expiresAt });
  // Abandoned sessions are only otherwise deleted when their cookie comes back.
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
  return { token, expiresAt };
}

// renewedUntil is set when the expiry slid, so the caller can re-send the cookie with it.
export async function validateSession(
  db: Db,
  token: string,
): Promise<{ userId: string; email: string; sessionId: string; renewedUntil?: Date } | null> {
  const sessionId = hashToken(token);
  const [row] = await db
    .select({ userId: sessions.userId, email: users.email, expiresAt: sessions.expiresAt })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.id, sessionId));
  if (!row) return null;

  const now = Date.now();
  const remaining = row.expiresAt.getTime() - now;
  if (remaining <= 0) {
    await deleteSession(db, sessionId);
    return null;
  }
  const session = { userId: row.userId, email: row.email, sessionId };
  if (remaining >= RENEW_BELOW) return session;

  const renewedUntil = new Date(now + SESSION_TTL);
  await db.update(sessions).set({ expiresAt: renewedUntil }).where(eq(sessions.id, sessionId));
  return { ...session, renewedUntil };
}

export async function deleteSession(db: Db, sessionId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, sessionId));
}

export async function deleteOtherSessions(
  db: Db,
  userId: string,
  keepSessionId: string,
): Promise<void> {
  await db.delete(sessions).where(and(eq(sessions.userId, userId), ne(sessions.id, keepSessionId)));
}

export function setSessionCookie(c: Context, token: string, expiresAt: Date, secure: boolean) {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    secure,
    expires: expiresAt,
  });
}

export function clearSessionCookie(c: Context) {
  deleteCookie(c, SESSION_COOKIE, { path: '/' });
}
