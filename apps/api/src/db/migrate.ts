import { pathToFileURL } from 'node:url';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

export async function runMigrations(url: string): Promise<void> {
  const client = postgres(url, { max: 1 });
  try {
    await migrate(drizzle(client), {
      migrationsFolder: new URL('../../drizzle', import.meta.url).pathname,
    });
  } finally {
    await client.end();
  }
}

// Script entry: `tsx --env-file=.env src/db/migrate.ts`
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  await runMigrations(url);
  console.log('Migrations applied');
}
