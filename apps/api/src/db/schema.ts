import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

const createdAt = timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt,
});

export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt,
});

export const recipes = pgTable(
  'recipes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    ingredients: text('ingredients')
      .array()
      .notNull()
      .default(sql`'{}'`),
    steps: text('steps')
      .array()
      .notNull()
      .default(sql`'{}'`),
    photoKey: text('photo_key'),
    createdAt,
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('recipes_user_title_idx').on(t.userId, sql`f_unaccent(lower(${t.title}))`)],
);

export const lists = pgTable(
  'lists',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    isFavorites: boolean('is_favorites').notNull().default(false),
    createdAt,
  },
  (t) => [
    uniqueIndex('lists_user_name_uq').on(t.userId, sql`f_unaccent(lower(${t.name}))`),
    uniqueIndex('lists_one_favorites_uq')
      .on(t.userId)
      .where(sql`is_favorites`),
  ],
);

export const listRecipes = pgTable(
  'list_recipes',
  {
    listId: uuid('list_id')
      .notNull()
      .references(() => lists.id, { onDelete: 'cascade' }),
    recipeId: uuid('recipe_id')
      .notNull()
      .references(() => recipes.id, { onDelete: 'cascade' }),
    addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.listId, t.recipeId] })],
);
