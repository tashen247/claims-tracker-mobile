import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    globalSetup: ['test/global-setup.ts'],
    // Integration tests share one database and truncate between files.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 120_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/server.ts', 'src/db/migrate.ts'],
      thresholds: { lines: 70, functions: 70, branches: 70, statements: 70 },
    },
  },
});
