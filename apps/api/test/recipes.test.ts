import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Recipe, RecipeSummary } from '@bonappetit/shared';
import { recipes } from '../src/db/schema.js';
import { makeTestApp, req, signupAs, truncateAll } from './helpers.js';

const { app, db, close } = await makeTestApp();

beforeEach(() => truncateAll(db));
afterAll(() => close());

const create = (cookie: string, title: string, ingredients: string[] = [], steps: string[] = []) =>
  req(app, 'POST', '/api/recipes', { cookie, body: { title, ingredients, steps } });
const list = async (cookie: string, query = ''): Promise<RecipeSummary[]> =>
  (await req(app, 'GET', `/api/recipes${query}`, { cookie })).json();
const titles = async (cookie: string, q: string) =>
  (await list(cookie, `?q=${encodeURIComponent(q)}`)).map((r) => r.title);

describe('auth middleware', () => {
  it('validates the session once per recipe request', async () => {
    const { cookie } = await signupAs(app);
    const spy = vi.spyOn(db, 'select');
    await list(cookie);
    // 1 session lookup + 2 db.select calls in the list query; a duplicated requireUser makes it 4
    expect(spy).toHaveBeenCalledTimes(3);
    spy.mockRestore();
  });
});

describe('recipes CRUD', () => {
  it('creates with trimmed title and ordered arrays, then reads it back', async () => {
    const { cookie } = await signupAs(app);
    const res = await create(cookie, '  Soup  ', ['b', 'a'], ['one', 'two']);
    expect(res.status).toBe(201);
    const made = (await res.json()) as Recipe;
    expect(made).toMatchObject({ title: 'Soup', ingredients: ['b', 'a'], steps: ['one', 'two'] });

    const got = (await (
      await req(app, 'GET', `/api/recipes/${made.id}`, { cookie })
    ).json()) as Recipe;
    expect(got).toMatchObject({ listIds: [], isFavorite: false, hasPhoto: false });
    expect(got.updatedAt).toMatch(/Z$/);
  });

  it('lists newest first with counts', async () => {
    const { cookie } = await signupAs(app);
    await create(cookie, 'Old', ['a'], []);
    await create(cookie, 'New', ['a', 'b'], ['x', 'y', 'z']);
    const rows = await list(cookie);
    expect(rows.map((r) => r.title)).toEqual(['New', 'Old']);
    expect(rows[0]).toMatchObject({
      ingredientCount: 2,
      stepCount: 3,
      hasPhoto: false,
      isFavorite: false,
    });
  });

  it('PUT replaces fields and bumps updatedAt; DELETE removes', async () => {
    const { cookie } = await signupAs(app);
    const made = (await (await create(cookie, 'A', ['i'], ['s'])).json()) as Recipe;
    await db
      .update(recipes)
      .set({ updatedAt: new Date(Date.now() - 60_000) })
      .where(eq(recipes.id, made.id));

    const res = await req(app, 'PUT', `/api/recipes/${made.id}`, {
      cookie,
      body: { title: 'B', ingredients: [], steps: ['t'] },
    });
    expect(res.status).toBe(200);
    const put = (await res.json()) as Recipe;
    expect(put).toMatchObject({ title: 'B', ingredients: [], steps: ['t'] });
    expect(new Date(put.updatedAt).getTime()).toBeGreaterThan(Date.now() - 30_000);

    expect((await req(app, 'DELETE', `/api/recipes/${made.id}`, { cookie })).status).toBe(204);
    expect((await req(app, 'GET', `/api/recipes/${made.id}`, { cookie })).status).toBe(404);
  });

  it('rejects a whitespace title and a non-uuid id', async () => {
    const { cookie } = await signupAs(app);
    expect((await create(cookie, '   ')).status).toBe(400);
    for (const method of ['GET', 'DELETE']) {
      expect((await req(app, method, '/api/recipes/not-a-uuid', { cookie })).status).toBe(404);
    }
    const put = await req(app, 'PUT', '/api/recipes/not-a-uuid', {
      cookie,
      body: { title: 'x', ingredients: [], steps: [] },
    });
    expect(put.status).toBe(404);
  });

  it('requires a session', async () => {
    expect((await req(app, 'GET', '/api/recipes')).status).toBe(401);
  });
});

describe('recipe search', () => {
  it('is accent- and case-insensitive', async () => {
    const { cookie } = await signupAs(app);
    await create(cookie, 'Puré de papas');
    await create(cookie, 'Pasta');
    expect(await titles(cookie, 'pure')).toEqual(['Puré de papas']);
    expect(await titles(cookie, 'PAST')).toEqual(['Pasta']);
  });

  it('treats %, _ and \\ literally', async () => {
    const { cookie } = await signupAs(app);
    for (const t of ['100% rye', '1000 rye', 'a_b', 'axb', 'c\\d', 'cxd']) await create(cookie, t);
    expect(await titles(cookie, '100%')).toEqual(['100% rye']);
    expect(await titles(cookie, 'a_b')).toEqual(['a_b']);
    expect(await titles(cookie, 'c\\d')).toEqual(['c\\d']);
  });
});

describe('isFavorite and listId', () => {
  it('reflects list membership', async () => {
    const { cookie, user } = await signupAs(app);
    const made = (await (await create(cookie, 'Fav')).json()) as Recipe;
    await create(cookie, 'Other');
    const { lists, listRecipes } = await import('../src/db/schema.js');
    const [fav] = await db.select().from(lists).where(eq(lists.userId, user.id));
    await db.insert(listRecipes).values({ listId: fav.id, recipeId: made.id });

    const got = (await (
      await req(app, 'GET', `/api/recipes/${made.id}`, { cookie })
    ).json()) as Recipe;
    expect(got).toMatchObject({ isFavorite: true, listIds: [fav.id] });
    const rows = await list(cookie);
    expect(rows.find((r) => r.id === made.id)?.isFavorite).toBe(true);
    expect((await list(cookie, `?listId=${fav.id}`)).map((r) => r.title)).toEqual(['Fav']);
  });

  it('404s for a list that is not the user', async () => {
    const a = await signupAs(app, 'a@example.com');
    const b = await signupAs(app, 'b@example.com');
    const { lists } = await import('../src/db/schema.js');
    const [aList] = await db.select().from(lists).where(eq(lists.userId, a.user.id));
    expect(
      (await req(app, 'GET', `/api/recipes?listId=${aList.id}`, { cookie: b.cookie })).status,
    ).toBe(404);
  });

  it('404s for a malformed listId instead of 400', async () => {
    const { cookie } = await signupAs(app);
    expect((await req(app, 'GET', '/api/recipes?listId=abc', { cookie })).status).toBe(404);
  });
});

describe('api edges', () => {
  it('answers unknown /api paths with the JSON error shape', async () => {
    const res = await req(app, 'GET', '/api/nope');
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: { code: 'not_found' } });
  });

  it('rejects an oversized JSON body with 413', async () => {
    const { cookie } = await signupAs(app);
    const res = await create(
      cookie,
      'x',
      ['a'.repeat(200)].concat(Array(1500).fill('a'.repeat(200))),
    );
    expect(res.status).toBe(413);
  });
});

describe('isolation', () => {
  it('hides other users recipes with 404', async () => {
    const a = await signupAs(app, 'a@example.com');
    const b = await signupAs(app, 'b@example.com');
    const made = (await (await create(a.cookie, 'Secret', ['i'], ['s'])).json()) as Recipe;
    const path = `/api/recipes/${made.id}`;

    expect((await req(app, 'GET', path, { cookie: b.cookie })).status).toBe(404);
    const put = await req(app, 'PUT', path, {
      cookie: b.cookie,
      body: { title: 'Hacked', ingredients: [], steps: [] },
    });
    expect(put.status).toBe(404);
    expect((await req(app, 'DELETE', path, { cookie: b.cookie })).status).toBe(404);

    expect(await list(b.cookie)).toEqual([]);
    const still = (await (await req(app, 'GET', path, { cookie: a.cookie })).json()) as Recipe;
    expect(still).toMatchObject({ title: 'Secret', ingredients: ['i'], steps: ['s'] });
  });
});
