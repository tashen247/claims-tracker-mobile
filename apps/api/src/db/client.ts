import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema';

export type Database = NodePgDatabase<typeof schema>;

export interface DatabaseHandle {
  db: Database;
  pool: pg.Pool;
  close: () => Promise<void>;
}

// Return bigint columns (amounts in cents) as JS numbers; values stay well within 2^53.
pg.types.setTypeParser(pg.types.builtins.INT8, (value) => Number(value));

export function createDatabase(
  url: string,
  options: { ssl?: boolean; max?: number } = {},
): DatabaseHandle {
  const pool = new pg.Pool({
    connectionString: url,
    max: options.max ?? 10,
    ssl: options.ssl ? { rejectUnauthorized: false } : undefined,
  });
  const db = drizzle(pool, { schema });
  return { db, pool, close: () => pool.end() };
}
