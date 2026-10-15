import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import type { Hono } from 'hono';
import type { User } from '@bonappetit/shared';
import { createLocalStorage } from '../src/photos/storage.js';
import { createApp, type AppDeps, type AppEnv } from '../src/app.js';
import { createDb, type Db } from '../src/db/client.js';

export const TEST_ORIGIN = 'http://localhost:4200';

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/bonappetit_test';

export async function makeTestApp(
  overrides: Partial<AppDeps> = {},
): Promise<{ app: Hono<AppEnv>; db: Db; photoDir: string; close: () => Promise<void> }> {
  const { db, close } = createDb(TEST_DATABASE_URL);
  const photoDir = await mkdtemp(join(tmpdir(), 'bonappetit-photos-'));
  const app = createApp({
    db,
    storage: createLocalStorage(photoDir),
    inviteCode: 'test-invite',
    appOrigin: TEST_ORIGIN,
    secureCookies: false,
    ...overrides,
  });
  return { app, db, photoDir, close };
}

export async function truncateAll(db: Db): Promise<void> {
  await db.execute(sql`TRUNCATE users, sessions, recipes, lists, list_recipes CASCADE`);
}

// Sends like the browser app would: JSON body, our Origin (so CSRF passes), optional session cookie.
export function req(
  app: Hono<AppEnv>,
  method: string,
  path: string,
  { body, cookie }: { body?: unknown; cookie?: string } = {},
): Promise<Response> {
  const headers: Record<string, string> = { origin: TEST_ORIGIN };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (cookie) headers.cookie = cookie;
  return Promise.resolve(
    app.request(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
}

// Multipart upload with our Origin by default (override to test CSRF).
export function uploadPhoto(
  app: Hono<AppEnv>,
  path: string,
  cookie: string,
  bytes: Uint8Array | string,
  origin = TEST_ORIGIN,
): Promise<Response> {
  const form = new FormData();
  form.set('photo', new Blob([bytes as BlobPart]), 'photo.jpg');
  return Promise.resolve(
    app.request(path, { method: 'PUT', headers: { origin, cookie }, body: form }),
  );
}

// "sid=<token>" from a response's Set-Cookie, ready to send back as a Cookie header.
export function sessionCookie(res: Response): string {
  const match = /sid=[^;]*/.exec(res.headers.get('set-cookie') ?? '');
  if (!match) throw new Error('response did not set a sid cookie');
  return match[0];
}

export async function signupAs(
  app: Hono<AppEnv>,
  email = 'cook@example.com',
): Promise<{ cookie: string; user: User }> {
  const res = await req(app, 'POST', '/api/auth/signup', {
    body: { email, password: 'password123', inviteCode: 'test-invite' },
  });
  if (res.status !== 201) throw new Error(`signupAs failed: ${res.status} ${await res.text()}`);
  return { cookie: sessionCookie(res), user: (await res.json()) as User };
}
