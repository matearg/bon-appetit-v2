import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { lists, sessions } from '../src/db/schema.js';
import { makeTestApp, req, sessionCookie, signupAs, truncateAll } from './helpers.js';

const { app, db, close } = await makeTestApp();

const DAY = 24 * 60 * 60 * 1000;

const signup = (email: string, inviteCode = 'test-invite', password = 'password123') =>
  req(app, 'POST', '/api/auth/signup', { body: { email, password, inviteCode } });
const login = (email: string, password = 'password123') =>
  req(app, 'POST', '/api/auth/login', { body: { email, password } });
const me = (cookie: string) => req(app, 'GET', '/api/auth/me', { cookie });

beforeEach(() => truncateAll(db));
afterAll(() => close());

describe('POST /api/auth/signup', () => {
  it('creates the user, a Favorites list, and a session cookie', async () => {
    const res = await signup('cook@example.com');
    expect(res.status).toBe(201);
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('sid=');
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Lax');
    expect(setCookie).toContain('Path=/');
    const body = await res.json();
    expect(body).toEqual({ id: expect.any(String), email: 'cook@example.com' });

    const userLists = await db.select().from(lists).where(eq(lists.userId, body.id));
    expect(userLists).toHaveLength(1);
    expect(userLists[0].isFavorites).toBe(true);
  });

  it('rejects a wrong invite code with 403', async () => {
    const res = await signup('cook@example.com', 'nope');
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe('forbidden');
  });

  it('is disabled when no invite code is configured', async () => {
    const disabled = await makeTestApp({ inviteCode: '' });
    try {
      const res = await req(disabled.app, 'POST', '/api/auth/signup', {
        body: { email: 'cook@example.com', password: 'password123', inviteCode: 'test-invite' },
      });
      expect(res.status).toBe(403);
    } finally {
      await disabled.close();
    }
  });

  it('checks the invite code before the email, so a taken email is not revealed', async () => {
    await signupAs(app, 'cook@example.com');
    const res = await signup('cook@example.com', 'nope');
    expect(res.status).toBe(403);
  });

  it('gives exactly one 201 and one 409 for two simultaneous signups with one email', async () => {
    const results = await Promise.all([signup('race@example.com'), signup('race@example.com')]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    const conflict = results.find((r) => r.status === 409)!;
    expect(await conflict.json()).toEqual({
      error: { code: 'conflict', message: 'Email already registered' },
    });
  });

  it('treats emails case-insensitively', async () => {
    expect((await signup('Cook@X.com')).status).toBe(201);
    const res = await login('cook@x.com');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ email: 'cook@x.com' });
    expect((await signup('COOK@x.com')).status).toBe(409);
  });

  it('rejects a short password with a field error', async () => {
    const res = await signup('cook@example.com', 'test-invite', '1234567');
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('validation');
    expect(body.error.fields.password).toBeDefined();
  });
});

describe('POST /api/auth/login', () => {
  it('logs in and sets a session cookie', async () => {
    const { user } = await signupAs(app);
    const res = await login('cook@example.com');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(user);
    expect((await me(sessionCookie(res))).status).toBe(200);
  });

  it('gives the same 401 for a wrong password and an unknown email', async () => {
    await signupAs(app);
    const wrongPassword = await login('cook@example.com', 'wrong-password');
    const unknownEmail = await login('nobody@example.com');
    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    const expected = { error: { code: 'unauthorized', message: 'Invalid email or password' } };
    expect(await wrongPassword.json()).toEqual(expected);
    expect(await unknownEmail.json()).toEqual(expected);
  });
});

describe('sessions', () => {
  it('GET /me returns the user, and logout invalidates the cookie', async () => {
    const { cookie, user } = await signupAs(app);
    const res = await me(cookie);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(user);

    const logout = await req(app, 'POST', '/api/auth/logout', { cookie });
    expect(logout.status).toBe(204);
    expect(logout.headers.get('set-cookie')).toMatch(/sid=;/);
    expect((await me(cookie)).status).toBe(401);
  });

  it('returns 401 without a cookie or with a garbage cookie', async () => {
    expect((await req(app, 'GET', '/api/auth/me')).status).toBe(401);
    const res = await me('sid=garbage');
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe('unauthorized');
  });

  it('rejects an expired session and deletes its row', async () => {
    const { cookie, user } = await signupAs(app);
    await db
      .update(sessions)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(sessions.userId, user.id));
    expect((await me(cookie)).status).toBe(401);
    expect(await db.select().from(sessions).where(eq(sessions.userId, user.id))).toHaveLength(0);
  });

  it('slides the expiry to 30 days when fewer than 15 remain', async () => {
    const { cookie, user } = await signupAs(app);
    await db
      .update(sessions)
      .set({ expiresAt: new Date(Date.now() + 10 * DAY) })
      .where(eq(sessions.userId, user.id));
    const res = await me(cookie);
    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toContain('sid=');
    const [row] = await db.select().from(sessions).where(eq(sessions.userId, user.id));
    expect(row.expiresAt.getTime()).toBeGreaterThan(Date.now() + 29 * DAY);
  });
});

describe('PATCH /api/auth/password', () => {
  const changePassword = (cookie: string, currentPassword: string, newPassword: string) =>
    req(app, 'PATCH', '/api/auth/password', { cookie, body: { currentPassword, newPassword } });

  it('rejects a wrong current password', async () => {
    const { cookie } = await signupAs(app);
    expect((await changePassword(cookie, 'wrong-password', 'new-password')).status).toBe(401);
  });

  it('changes the password and ends the other sessions only', async () => {
    const { cookie } = await signupAs(app);
    const other = sessionCookie(await login('cook@example.com'));

    expect((await changePassword(cookie, 'password123', 'new-password')).status).toBe(204);
    expect((await login('cook@example.com')).status).toBe(401);
    expect((await login('cook@example.com', 'new-password')).status).toBe(200);
    expect((await me(other)).status).toBe(401);
    expect((await me(cookie)).status).toBe(200);
  });
});

describe('CSRF', () => {
  it('rejects a form-like POST from another origin with 403', async () => {
    const res = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'text/plain', origin: 'https://evil.example' },
      body: JSON.stringify({ email: 'cook@example.com', password: 'password123' }),
    });
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe('forbidden');
  });
});

describe('malformed JSON', () => {
  it('gets 400 validation, not 500', async () => {
    const res = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not json',
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('validation');
  });
});
