import { Hono } from 'hono';
import { csrf } from 'hono/csrf';
import { authRoutes } from './auth/routes.js';
import { listRoutes } from './lists/routes.js';
import { recipeRoutes } from './recipes/routes.js';
import { photoRoutes } from './photos/routes.js';
import type { PhotoStorage } from './photos/storage.js';
import type { Db } from './db/client.js';
import { bodyLimit } from 'hono/body-limit';
import { HttpError, onError } from './http/errors.js';

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
  // JSON bodies are tiny (a max recipe is ~120 KB); photo uploads set their own limit.
  const jsonLimit = bodyLimit({
    maxSize: 256 * 1024,
    onError: () => {
      throw new HttpError(413, 'payload_too_large', 'Request body too large');
    },
  });
  app.use('/api/*', (c, next) =>
    c.req.header('content-type')?.startsWith('application/json') ? jsonLimit(c, next) : next(),
  );

  const api = new Hono<AppEnv>();
  api.get('/health', (c) => c.json({ ok: true }));
  api.route('/auth', authRoutes);
  api.route('/recipes', photoRoutes);
  api.route('/recipes', recipeRoutes);
  api.route('/lists', listRoutes);
  app.route('/api', api);
  app.notFound((c) => onError(new HttpError(404, 'not_found', 'Not found'), c));

  app.onError(onError);
  return app;
}
