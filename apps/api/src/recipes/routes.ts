import { zValidator } from '@hono/zod-validator';
import { recipeInputSchema, recipeQuerySchema, type Recipe } from '@bonappetit/shared';
import { and, desc, eq, exists, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { requireUser, type AuthedEnv } from '../auth/middleware.js';
import type { Db } from '../db/client.js';
import { listRecipes, lists, recipes } from '../db/schema.js';
import { discardFile } from '../photos/routes.js';
import { HttpError, validationHook } from '../http/errors.js';

type RecipeRow = typeof recipes.$inferSelect;

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const notFound = () => new HttpError(404, 'not_found', 'Recipe not found');

// Shared with lists and photos: the recipe row, or 404 if the id is malformed, missing or not theirs.
export async function loadOwnedRecipe(
  db: Db,
  userId: string,
  recipeId: string,
): Promise<RecipeRow> {
  if (!UUID.test(recipeId)) throw notFound();
  const [row] = await db
    .select()
    .from(recipes)
    .where(and(eq(recipes.id, recipeId), eq(recipes.userId, userId)));
  if (!row) throw notFound();
  return row;
}

export async function toRecipe(db: Db, userId: string, row: RecipeRow): Promise<Recipe> {
  const member = await db
    .select({ id: lists.id, isFavorites: lists.isFavorites })
    .from(listRecipes)
    .innerJoin(lists, eq(lists.id, listRecipes.listId))
    .where(and(eq(listRecipes.recipeId, row.id), eq(lists.userId, userId)));
  return {
    id: row.id,
    title: row.title,
    ingredients: row.ingredients,
    steps: row.steps,
    hasPhoto: row.photoKey !== null,
    isFavorite: member.some((l) => l.isFavorites),
    listIds: member.map((l) => l.id),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const escapeLike = (s: string) =>
  s.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');

export const recipeRoutes = new Hono<AuthedEnv>()
  .use(requireUser)
  .get('/', zValidator('query', recipeQuerySchema, validationHook), async (c) => {
    const { db } = c.var.deps;
    const userId = c.var.user.id;
    const { q, listId } = c.req.valid('query');

    if (listId) {
      const [own] = await db
        .select({ id: lists.id })
        .from(lists)
        .where(and(eq(lists.id, listId), eq(lists.userId, userId)));
      if (!own) throw new HttpError(404, 'not_found', 'List not found');
    }

    const isFavorite = exists(
      db
        .select({ one: sql`1` })
        .from(listRecipes)
        .innerJoin(lists, eq(lists.id, listRecipes.listId))
        .where(
          and(
            eq(listRecipes.recipeId, recipes.id),
            eq(lists.userId, userId),
            eq(lists.isFavorites, true),
          ),
        ),
    );
    const inList = (id: string) =>
      exists(
        db
          .select({ one: sql`1` })
          .from(listRecipes)
          .where(and(eq(listRecipes.recipeId, recipes.id), eq(listRecipes.listId, id))),
      );

    const rows = await db
      .select({
        id: recipes.id,
        title: recipes.title,
        hasPhoto: sql<boolean>`${recipes.photoKey} IS NOT NULL`,
        ingredientCount: sql<number>`cardinality(${recipes.ingredients})::int`,
        stepCount: sql<number>`cardinality(${recipes.steps})::int`,
        isFavorite: sql<boolean>`${isFavorite}`,
        updatedAt: recipes.updatedAt,
      })
      .from(recipes)
      .where(
        and(
          eq(recipes.userId, userId),
          q
            ? sql`f_unaccent(lower(${recipes.title})) LIKE '%' || f_unaccent(lower(${escapeLike(q)})) || '%' ESCAPE '\\'`
            : undefined,
          listId ? inList(listId) : undefined,
        ),
      )
      .orderBy(desc(recipes.updatedAt));

    return c.json(rows.map((r) => ({ ...r, updatedAt: r.updatedAt.toISOString() })));
  })
  .post('/', zValidator('json', recipeInputSchema, validationHook), async (c) => {
    const { db } = c.var.deps;
    const [row] = await db
      .insert(recipes)
      .values({ ...c.req.valid('json'), userId: c.var.user.id })
      .returning();
    return c.json(await toRecipe(db, c.var.user.id, row), 201);
  })
  .get('/:id', async (c) => {
    const { db } = c.var.deps;
    const row = await loadOwnedRecipe(db, c.var.user.id, c.req.param('id'));
    return c.json(await toRecipe(db, c.var.user.id, row));
  })
  .put('/:id', zValidator('json', recipeInputSchema, validationHook), async (c) => {
    const { db } = c.var.deps;
    const userId = c.var.user.id;
    const owned = await loadOwnedRecipe(db, userId, c.req.param('id'));
    const [row] = await db
      .update(recipes)
      .set({ ...c.req.valid('json'), updatedAt: new Date() })
      .where(and(eq(recipes.id, owned.id), eq(recipes.userId, userId)))
      .returning();
    if (!row) throw notFound();
    return c.json(await toRecipe(db, userId, row));
  })
  .delete('/:id', async (c) => {
    const { db } = c.var.deps;
    const userId = c.var.user.id;
    const owned = await loadOwnedRecipe(db, userId, c.req.param('id'));
    await db.delete(recipes).where(and(eq(recipes.id, owned.id), eq(recipes.userId, userId)));
    if (owned.photoKey) await discardFile(c.var.deps.storage, owned.photoKey);
    return c.body(null, 204);
  });
