import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { lists, users } from '../src/db/schema.js';
import { makeTestApp, truncateAll } from './helpers.js';

const { app, db, close } = await makeTestApp();

async function insertUser(email = 'a@example.com') {
  const [user] = await db.insert(users).values({ email, passwordHash: 'x' }).returning();
  return user;
}

beforeEach(() => truncateAll(db));
afterAll(() => close());

describe('database schema', () => {
  it('migrations create one-favorites-per-user constraint', async () => {
    const user = await insertUser();
    await db.insert(lists).values({ userId: user.id, name: 'Favorites', isFavorites: true });
    await expect(
      db.insert(lists).values({ userId: user.id, name: 'Other', isFavorites: true }),
    ).rejects.toThrow();
  });

  it('list names are unique ignoring case and accents', async () => {
    const user = await insertUser();
    await db.insert(lists).values({ userId: user.id, name: 'Puré' });
    await expect(db.insert(lists).values({ userId: user.id, name: 'PURE' })).rejects.toThrow();
  });
});

describe('GET /api/health', () => {
  it('returns 200 with ok:true', async () => {
    const res = await app.request('/api/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
