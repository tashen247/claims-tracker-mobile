import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { loadConfig } from '../config';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Resolves the migrations folder for both `tsx src/db/migrate.ts` and the bundled `dist/migrate.js`. */
export function migrationsFolder(): string {
  return (
    process.env.MIGRATIONS_DIR ??
    path.resolve(here, here.endsWith('dist') ? '../drizzle' : '../../drizzle')
  );
}

/** Arbitrary constant identifying the migration lock. */
const MIGRATION_LOCK_ID = 727_274_001;

/**
 * Applies pending migrations while holding a Postgres advisory lock, so several API tasks
 * starting at once (e.g. an ECS rolling deploy) apply them exactly once.
 */
export async function runMigrations(databaseUrl: string, ssl = false): Promise<void> {
  const client = new pg.Client({
    connectionString: databaseUrl,
    ssl: ssl ? { rejectUnauthorized: false } : undefined,
  });
  await client.connect();
  try {
    await client.query('select pg_advisory_lock($1)', [MIGRATION_LOCK_ID]);
    await migrate(drizzle(client), { migrationsFolder: migrationsFolder() });
  } finally {
    await client.query('select pg_advisory_unlock($1)', [MIGRATION_LOCK_ID]).catch(() => undefined);
    await client.end();
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
