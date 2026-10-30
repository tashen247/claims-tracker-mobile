import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/.expo/**',
      'infra/cdk.out/**',
      'apps/api/drizzle/**',
      'apps/mobile/babel.config.js',
      'apps/mobile/metro.config.js',
      'apps/mobile/jest.setup.js',
      'apps/mobile/expo-env.d.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    files: [
      'apps/api/src/db/migrate.ts',
      'apps/api/src/db/seed.ts',
      'apps/api/scripts/**',
      'infra/**',
    ],
    rules: { 'no-console': 'off' },
  },
  {
    files: ['apps/mobile/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
  },
  prettier,
);
