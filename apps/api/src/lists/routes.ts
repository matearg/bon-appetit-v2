import { zValidator } from '@hono/zod-validator';
import { listInputSchema, type ListSummary } from '@bonappetit/shared';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { isUniqueViolation } from '../auth/routes.js';
import { requireUser, type AuthedEnv } from '../auth/middleware.js';
import type { Db } from '../db/client.js';
import { listRecipes, lists } from '../db/schema.js';
import { HttpError, validationHook } from '../http/errors.js';
import { loadOwnedRecipe, UUID } from '../recipes/routes.js';

type ListRow = typeof lists.$inferSelect;

const notFound = () => new HttpError(404, 'not_found', 'List not found');
const favoritesLocked = () =>
  new HttpError(409, 'conflict', "Favorites can't be renamed or deleted");
const duplicateName = () =>
  new HttpError(409, 'conflict', 'You already have a list with that name');

// The list row, or 404 if the id is malformed, missing or not theirs.
async function loadOwnedList(db: Db, userId: string, listId: string): Promise<ListRow> {
  if (!UUID.test(listId)) throw notFound();
  const [row] = await db
    .select()
    .from(lists)
    .where(and(eq(lists.id, listId), eq(lists.userId, userId)));
  if (!row) throw notFound();
  return row;
}

async function toSummary(db: Db, row: ListRow): Promise<ListSummary> {
  const [{ recipeCount }] = await db
    .select({ recipeCount: sql<number>`count(*)::int` })
    .from(listRecipes)
    .where(eq(listRecipes.listId, row.id));
  return { id: row.id, name: row.name, isFavorites: row.isFavorites, recipeCount };
}

export const listRoutes = new Hono<AuthedEnv>()
  .use(requireUser)
  .get('/', async (c) => {
    const { db } = c.var.deps;
    const rows = await db
      .select({
        id: lists.id,
        name: lists.name,
        isFavorites: lists.isFavorites,
        recipeCount: sql<number>`count(${listRecipes.recipeId})::int`,
      })
      .from(lists)
      .leftJoin(listRecipes, eq(listRecipes.listId, lists.id))
      .where(eq(lists.userId, c.var.user.id))
      .groupBy(lists.id)
      .orderBy(desc(lists.isFavorites), asc(sql`lower(${lists.name})`));
    return c.json(rows);
  })
  .post('/', zValidator('json', listInputSchema, validationHook), async (c) => {
    const { db } = c.var.deps;
    const { name } = c.req.valid('json');
    try {
      const [row] = await db.insert(lists).values({ userId: c.var.user.id, name }).returning();
      return c.json({ id: row.id, name: row.name, isFavorites: false, recipeCount: 0 }, 201);
    } catch (err) {
      if (isUniqueViolation(err)) throw duplicateName();
      throw err;
    }
  })
  .patch('/:id', zValidator('json', listInputSchema, validationHook), async (c) => {
    const { db } = c.var.deps;
    const userId = c.var.user.id;
    const owned = await loadOwnedList(db, userId, c.req.param('id'));
    if (owned.isFavorites) throw favoritesLocked();
    try {
      const [row] = await db
        .update(lists)
        .set({ name: c.req.valid('json').name })
        .where(and(eq(lists.id, owned.id), eq(lists.userId, userId)))
        .returning();
      if (!row) throw notFound();
      return c.json(await toSummary(db, row));
    } catch (err) {
      if (isUniqueViolation(err)) throw duplicateName();
      throw err;
    }
  })
  .delete('/:id', async (c) => {
    const { db } = c.var.deps;
    const userId = c.var.user.id;
    const owned = await loadOwnedList(db, userId, c.req.param('id'));
    if (owned.isFavorites) throw favoritesLocked();
    await db.delete(lists).where(and(eq(lists.id, owned.id), eq(lists.userId, userId)));
    return c.body(null, 204);
  })
  .put('/:id/recipes/:recipeId', async (c) => {
    const { db } = c.var.deps;
    const userId = c.var.user.id;
    const list = await loadOwnedList(db, userId, c.req.param('id'));
    const recipe = await loadOwnedRecipe(db, userId, c.req.param('recipeId'));
    await db
      .insert(listRecipes)
      .values({ listId: list.id, recipeId: recipe.id })
      .onConflictDoNothing();
    return c.body(null, 204);
  })
  .delete('/:id/recipes/:recipeId', async (c) => {
    const { db } = c.var.deps;
    const userId = c.var.user.id;
    const list = await loadOwnedList(db, userId, c.req.param('id'));
    const recipe = await loadOwnedRecipe(db, userId, c.req.param('recipeId'));
    await db
      .delete(listRecipes)
      .where(and(eq(listRecipes.listId, list.id), eq(listRecipes.recipeId, recipe.id)));
    return c.body(null, 204);
  });
