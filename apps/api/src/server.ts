import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { env } from './env.js';
import { createDb } from './db/client.js';

const { db } = createDb(env.DATABASE_URL);
const app = createApp({
  db,
  storage: undefined,
  inviteCode: env.SIGNUP_INVITE_CODE,
  appOrigin: env.APP_ORIGIN,
  secureCookies: env.NODE_ENV === 'production',
});

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`API listening on http://localhost:${info.port}`);
});
