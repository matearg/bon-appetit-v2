import { Hono } from 'hono';
import { csrf } from 'hono/csrf';
import { authRoutes } from './auth/routes.js';
import { listRoutes } from './lists/routes.js';
import { recipeRoutes } from './recipes/routes.js';
import type { Db } from './db/client.js';
import { onError } from './http/errors.js';

// Placeholder until photo storage lands (Task 7).
export type PhotoStorage = unknown;

export type AppDeps = {
  db: Db;
  storage: PhotoStorage;
  inviteCode: string;
  appOrigin: string;
  secureCookies: boolean;
};

export type AppEnv = { Variables: { deps: AppDeps } };

export function createApp(deps: AppDeps) {
  const app = new Hono<AppEnv>();
  app.use(async (c, next) => {
    c.set('deps', deps);
    await next();
  });

  app.use('/api/*', csrf({ origin: deps.appOrigin }));

  const api = new Hono<AppEnv>();
  api.get('/health', (c) => c.json({ ok: true }));
  api.route('/auth', authRoutes);
  api.route('/recipes', recipeRoutes);
  api.route('/lists', listRoutes);
  app.route('/api', api);

  app.onError(onError);
  return app;
}
