const typescriptConfig = require('@agentopia/eslint-config/typescript.js');
const onlyWarn = require('eslint-plugin-only-warn');
const globals = require('globals');

/** @type {import('eslint').Linter.Config[]} */
module.exports = [
  ...typescriptConfig,
  {
    files: ['**/*.ts'],
    plugins: {
      'only-warn': onlyWarn,
    },
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
  },
  {
    // Build tooling legitimately imports devDependencies.
    files: ['vite.config.ts'],
    rules: {
      'import-x/no-extraneous-dependencies': ['error', { devDependencies: true }],
    },
  },
  {
    files: ['src/**/__tests__/**/*.ts'],
    languageOptions: {
      globals: {
        ...globals.jest,
      },
    },
  },
  {
    ignores: ['eslint.config.cjs', 'jest.config.cjs', 'dist/'],
  },
];
