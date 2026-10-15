import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { ListSummary, Recipe, RecipeSummary } from '@bonappetit/shared';
import { lists } from '../src/db/schema.js';
import { makeTestApp, req, signupAs, truncateAll } from './helpers.js';

const { app, db, close } = await makeTestApp();

beforeEach(() => truncateAll(db));
afterAll(() => close());

const getLists = async (cookie: string): Promise<ListSummary[]> =>
  (await req(app, 'GET', '/api/lists', { cookie })).json();
const createList = (cookie: string, name: string) =>
  req(app, 'POST', '/api/lists', { cookie, body: { name } });
const createRecipe = async (cookie: string, title: string) =>
  (await (
    await req(app, 'POST', '/api/recipes', { cookie, body: { title, ingredients: [], steps: [] } })
  ).json()) as Recipe;
const favoritesId = async (userId: string) =>
  (await db.select().from(lists).where(eq(lists.userId, userId))).find((l) => l.isFavorites)!.id;
const membership = (cookie: string, listId: string, recipeId: string, method = 'PUT') =>
  req(app, method, `/api/lists/${listId}/recipes/${recipeId}`, { cookie });

describe('lists CRUD', () => {
  it('a new user has only Favorites', async () => {
    const { cookie } = await signupAs(app);
    expect(await getLists(cookie)).toEqual([
      { id: expect.any(String), name: 'Favorites', isFavorites: true, recipeCount: 0 },
    ]);
  });

  it('creates, rejects a case-insensitive duplicate, and renames', async () => {
    const { cookie } = await signupAs(app);
    const made = await createList(cookie, 'Weeknight');
    expect(made.status).toBe(201);
    expect(await made.json()).toMatchObject({
      name: 'Weeknight',
      isFavorites: false,
      recipeCount: 0,
    });

    const dup = await createList(cookie, 'weeknight');
    expect(dup.status).toBe(409);
    expect((await dup.json()).error).toMatchObject({
      code: 'conflict',
      message: 'You already have a list with that name',
    });

    const { id } = (await getLists(cookie)).find((l) => l.name === 'Weeknight')!;
    const renamed = await req(app, 'PATCH', `/api/lists/${id}`, {
      cookie,
      body: { name: 'Baking' },
    });
    expect(renamed.status).toBe(200);
    expect(await renamed.json()).toMatchObject({ id, name: 'Baking' });
  });

  it('orders Favorites first, then by name', async () => {
    const { cookie } = await signupAs(app);
    await createList(cookie, 'zeta');
    await createList(cookie, 'Alpha');
    expect((await getLists(cookie)).map((l) => l.name)).toEqual(['Favorites', 'Alpha', 'zeta']);
  });

  it('refuses to rename or delete Favorites with 409', async () => {
    const { cookie, user } = await signupAs(app);
    const fav = await favoritesId(user.id);
    const patch = await req(app, 'PATCH', `/api/lists/${fav}`, { cookie, body: { name: 'Mine' } });
    expect(patch.status).toBe(409);
    expect((await patch.json()).error.message).toBe("Favorites can't be renamed or deleted");
    const del = await req(app, 'DELETE', `/api/lists/${fav}`, { cookie });
    expect(del.status).toBe(409);
    expect((await del.json()).error.message).toBe("Favorites can't be renamed or deleted");
  });

  it('deletes a custom list and keeps its recipes', async () => {
    const { cookie } = await signupAs(app);
    const recipe = await createRecipe(cookie, 'Soup');
    const { id } = (await (await createList(cookie, 'Tmp')).json()) as ListSummary;
    await membership(cookie, id, recipe.id);
    expect((await req(app, 'DELETE', `/api/lists/${id}`, { cookie })).status).toBe(204);
    expect((await getLists(cookie)).map((l) => l.name)).toEqual(['Favorites']);
    expect((await req(app, 'GET', `/api/recipes/${recipe.id}`, { cookie })).status).toBe(200);
  });
});

describe('list membership', () => {
  it('adds idempotently and reflects in counts, filters and recipe fields', async () => {
    const { cookie, user } = await signupAs(app);
    const recipe = await createRecipe(cookie, 'Soup');
    const { id } = (await (await createList(cookie, 'Weeknight')).json()) as ListSummary;

    expect((await membership(cookie, id, recipe.id)).status).toBe(204);
    expect((await membership(cookie, id, recipe.id)).status).toBe(204);
    expect((await getLists(cookie)).find((l) => l.id === id)?.recipeCount).toBe(1);

    const filtered = (await (
      await req(app, 'GET', `/api/recipes?listId=${id}`, { cookie })
    ).json()) as RecipeSummary[];
    expect(filtered.map((r) => r.id)).toEqual([recipe.id]);

    const got = (await (
      await req(app, 'GET', `/api/recipes/${recipe.id}`, { cookie })
    ).json()) as Recipe;
    expect(got).toMatchObject({ listIds: [id], isFavorite: false });

    const fav = await favoritesId(user.id);
    await membership(cookie, fav, recipe.id);
    const withFav = (await (
      await req(app, 'GET', `/api/recipes/${recipe.id}`, { cookie })
    ).json()) as Recipe;
    expect(withFav.isFavorite).toBe(true);
  });

  it('removes idempotently', async () => {
    const { cookie } = await signupAs(app);
    const recipe = await createRecipe(cookie, 'Soup');
    const { id } = (await (await createList(cookie, 'Weeknight')).json()) as ListSummary;
    await membership(cookie, id, recipe.id);
    expect((await membership(cookie, id, recipe.id, 'DELETE')).status).toBe(204);
    expect((await membership(cookie, id, recipe.id, 'DELETE')).status).toBe(204);
    expect((await getLists(cookie)).find((l) => l.id === id)?.recipeCount).toBe(0);
  });

  it('deleting a recipe drops it from every list count', async () => {
    const { cookie } = await signupAs(app);
    const recipe = await createRecipe(cookie, 'Soup');
    const { id } = (await (await createList(cookie, 'Weeknight')).json()) as ListSummary;
    await membership(cookie, id, recipe.id);
    await req(app, 'DELETE', `/api/recipes/${recipe.id}`, { cookie });
    expect((await getLists(cookie)).find((l) => l.id === id)?.recipeCount).toBe(0);
  });

  it('rejects non-uuid ids with 404', async () => {
    const { cookie } = await signupAs(app);
    expect(
      (await req(app, 'PATCH', '/api/lists/nope', { cookie, body: { name: 'x' } })).status,
    ).toBe(404);
    expect((await req(app, 'DELETE', '/api/lists/nope', { cookie })).status).toBe(404);
    expect((await membership(cookie, 'nope', 'nope')).status).toBe(404);
  });

  it('requires a session', async () => {
    expect((await req(app, 'GET', '/api/lists')).status).toBe(401);
  });
});

describe('list isolation', () => {
  it('another user gets 404 for lists and membership, never 403', async () => {
    const a = await signupAs(app, 'a@example.com');
    const b = await signupAs(app, 'b@example.com');
    const aList = (await (await createList(a.cookie, 'Secret')).json()) as ListSummary;
    const aRecipe = await createRecipe(a.cookie, 'A recipe');
    const bRecipe = await createRecipe(b.cookie, 'B recipe');
    const bList = (await (await createList(b.cookie, 'Mine')).json()) as ListSummary;

    expect(
      (await req(app, 'PATCH', `/api/lists/${aList.id}`, { cookie: b.cookie, body: { name: 'x' } }))
        .status,
    ).toBe(404);
    expect((await req(app, 'DELETE', `/api/lists/${aList.id}`, { cookie: b.cookie })).status).toBe(
      404,
    );
    expect((await membership(b.cookie, aList.id, bRecipe.id)).status).toBe(404);
    expect((await membership(b.cookie, bList.id, aRecipe.id)).status).toBe(404);
    expect((await membership(b.cookie, aList.id, aRecipe.id, 'DELETE')).status).toBe(404);
    expect(
      (await req(app, 'GET', `/api/recipes?listId=${aList.id}`, { cookie: b.cookie })).status,
    ).toBe(404);

    expect((await getLists(a.cookie)).find((l) => l.id === aList.id)).toMatchObject({
      name: 'Secret',
      recipeCount: 0,
    });
  });
});
