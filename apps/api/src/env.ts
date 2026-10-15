import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(3000),
  PHOTO_DIR: z.string().default('./photos'),
  SIGNUP_INVITE_CODE: z.string().default(''),
  APP_ORIGIN: z.string().default('http://localhost:4200'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

export const env = envSchema.parse(process.env);
