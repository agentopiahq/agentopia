const typescriptConfig = require('@agentopia/eslint-config/typescript.js');
const onlyWarn = require('eslint-plugin-only-warn');
const globals = require('globals');

/** @type {import('eslint').Linter.Config[]} */
module.exports = [
  ...typescriptConfig,
  {
    files: ['**/*.ts', 'scripts/**/*.mjs'],
    plugins: {
      'only-warn': onlyWarn,
    },
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
    },
    rules: {
      // The CLI ships as one esbuild bundle, so every import (workspace packages
      // included) is a build-time devDependency: the published package has none.
      'import-x/no-extraneous-dependencies': ['warn', { devDependencies: true }],
    },
  },
  {
    ignores: ['eslint.config.js', 'jest.config.cjs'],
  },
];
