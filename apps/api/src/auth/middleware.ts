import { getCookie } from 'hono/cookie';
import { createMiddleware } from 'hono/factory';
import type { AppEnv } from '../app.js';
import { HttpError } from '../http/errors.js';
import { SESSION_COOKIE, setSessionCookie, validateSession } from './sessions.js';

export type SessionUser = { id: string; email: string };

// Env for routers whose every route sits behind requireUser.
export type AuthedEnv = {
  Variables: AppEnv['Variables'] & { user: SessionUser; sessionId: string };
};

export const requireUser = createMiddleware<AuthedEnv>(async (c, next) => {
  const token = getCookie(c, SESSION_COOKIE);
  const { db, secureCookies } = c.var.deps;
  const session = token ? await validateSession(db, token) : null;
  if (!session) throw new HttpError(401, 'unauthorized', 'Not logged in');

  if (session.renewedUntil) setSessionCookie(c, token!, session.renewedUntil, secureCookies);
  c.set('user', { id: session.userId, email: session.email });
  c.set('sessionId', session.sessionId);
  await next();
});
