import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { loadConfig } from '../config';
import { createDatabase } from './client';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Resolves the migrations folder for both `tsx src/db/migrate.ts` and the bundled `dist/migrate.js`. */
export function migrationsFolder(): string {
  return (
    process.env.MIGRATIONS_DIR ??
    path.resolve(here, here.endsWith('dist') ? '../drizzle' : '../../drizzle')
  );
}

export async function runMigrations(databaseUrl: string, ssl = false): Promise<void> {
  const handle = createDatabase(databaseUrl, { ssl, max: 1 });
  try {
    await migrate(handle.db, { migrationsFolder: migrationsFolder() });
  } finally {
    await handle.close();
  }
}

const isEntrypoint =
  process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isEntrypoint) {
  const config = loadConfig();
  runMigrations(config.DATABASE_URL, config.DATABASE_SSL)
    .then(() => {
      console.log('Migrations applied');
    })
    .catch((error: unknown) => {
      console.error('Migration failed', error);
      process.exit(1);
    });
}
