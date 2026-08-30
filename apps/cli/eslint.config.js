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
        ...globals.node,
        ...globals.jest,
      },
    },
  },
  {
    ignores: ['eslint.config.js', 'jest.config.cjs'],
  },
];
