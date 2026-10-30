import type { TestProject } from 'vitest/node';
import { runMigrations } from '../src/db/migrate';

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

/**
 * Starts a throwaway Postgres in Docker (Testcontainers) and applies migrations.
 * Set TEST_DATABASE_URL to use an existing database instead (it will be wiped).
 */
export default async function setup(project: TestProject) {
  let databaseUrl = process.env.TEST_DATABASE_URL;
  let stop: (() => Promise<unknown>) | undefined;

  if (!databaseUrl) {
    const { PostgreSqlContainer } = await import('@testcontainers/postgresql');
    const container = await new PostgreSqlContainer('postgres:16-alpine').start();
    databaseUrl = container.getConnectionUri();
    stop = () => container.stop();
  }

  await runMigrations(databaseUrl);
  project.provide('databaseUrl', databaseUrl);

  return async () => {
    await stop?.();
  };
}
