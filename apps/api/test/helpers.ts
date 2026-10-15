import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import type { Hono } from 'hono';
import { createApp, type AppDeps } from '../src/app.js';
import { createDb, type Db } from '../src/db/client.js';

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/bonappetit_test';

export async function makeTestApp(
  overrides: Partial<AppDeps> = {},
): Promise<{ app: Hono; db: Db; close: () => Promise<void> }> {
  const { db, close } = createDb(TEST_DATABASE_URL);
  const photoDir = await mkdtemp(join(tmpdir(), 'bonappetit-photos-'));
  const app = createApp({
    db,
    storage: photoDir,
    inviteCode: 'test-invite',
    appOrigin: 'http://localhost:4200',
    secureCookies: false,
    ...overrides,
  });
  return { app, db, close };
}

export async function truncateAll(db: Db): Promise<void> {
  await db.execute(sql`TRUNCATE users, sessions, recipes, lists, list_recipes CASCADE`);
}
