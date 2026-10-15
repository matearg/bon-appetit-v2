import { Hono } from 'hono';
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

export function createApp(deps: AppDeps) {
  const app = new Hono<{ Variables: { deps: AppDeps } }>();
  app.use(async (c, next) => {
    c.set('deps', deps);
    await next();
  });

  const api = new Hono<{ Variables: { deps: AppDeps } }>();
  api.get('/health', (c) => c.json({ ok: true }));
  app.route('/api', api);

  app.onError(onError);
  return app;
}
