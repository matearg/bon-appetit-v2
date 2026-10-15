import { z } from 'zod';

export const PHOTO_MAX_BYTES = 4 * 1024 * 1024;
export const PHOTO_MAX_EDGE = 1600;

const id = z.uuid();
const trimmed = (max: number) => z.string().trim().min(1).max(max);

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));
export type Email = z.infer<typeof emailSchema>;

export const signupBodySchema = z.object({
  email: emailSchema,
  password: z.string().min(8).max(128),
  inviteCode: z.string().min(1).max(200),
});
export type SignupBody = z.infer<typeof signupBodySchema>;

export const loginBodySchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
});
export type LoginBody = z.infer<typeof loginBodySchema>;

export const changePasswordBodySchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(8).max(128),
});
export type ChangePasswordBody = z.infer<typeof changePasswordBodySchema>;

export const userSchema = z.object({
  id,
  email: emailSchema,
});
export type User = z.infer<typeof userSchema>;

export const recipeInputSchema = z.object({
  title: trimmed(120),
  ingredients: z.array(trimmed(200)).max(100),
  steps: z.array(trimmed(2000)).max(50),
});
export type RecipeInput = z.infer<typeof recipeInputSchema>;

const isoDate = z.iso.datetime();

export const recipeSummarySchema = z.object({
  id,
  title: z.string(),
  hasPhoto: z.boolean(),
  ingredientCount: z.number().int().nonnegative(),
  stepCount: z.number().int().nonnegative(),
  isFavorite: z.boolean(),
  updatedAt: isoDate,
});
export type RecipeSummary = z.infer<typeof recipeSummarySchema>;

export const recipeSchema = z.object({
  id,
  title: z.string(),
  ingredients: z.array(z.string()),
  steps: z.array(z.string()),
  hasPhoto: z.boolean(),
  isFavorite: z.boolean(),
  listIds: z.array(id),
  createdAt: isoDate,
  updatedAt: isoDate,
});
export type Recipe = z.infer<typeof recipeSchema>;

export const recipeQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  listId: id.optional(),
});
export type RecipeQuery = z.infer<typeof recipeQuerySchema>;

export const listInputSchema = z.object({
  name: trimmed(60),
});
export type ListInput = z.infer<typeof listInputSchema>;

export const listSummarySchema = z.object({
  id,
  name: z.string(),
  isFavorites: z.boolean(),
  recipeCount: z.number().int().nonnegative(),
});
export type ListSummary = z.infer<typeof listSummarySchema>;

export const ERROR_CODES = [
  'validation',
  'unauthorized',
  'forbidden',
  'not_found',
  'conflict',
  'payload_too_large',
  'unsupported_media_type',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export type ApiError = {
  error: {
    code: ErrorCode;
    message: string;
    fields?: Record<string, string[]>;
  };
};
