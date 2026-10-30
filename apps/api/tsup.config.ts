import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { server: 'src/server.ts', migrate: 'src/db/migrate.ts', seed: 'src/db/seed.ts' },
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  // Bundle the workspace package; it ships TypeScript source only.
  noExternal: ['@claims/shared'],
});
