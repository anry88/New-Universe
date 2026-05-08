import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import js from '@eslint/js';
import globals from 'globals';

export default [
  js.configs.recommended,
  {
    files: ['src/**/*.ts', 'shared/**/*.ts', '../shared/**/*.ts', 'tests/**/*.ts'],

    languageOptions: {
      parser: tsParser,
      globals: {
        ...globals.node,
        ...globals.vitest,
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'off',
      'no-undef': 'off',
    },
  },
  {
    ignores: ['dist/**', 'node_modules/**', 'eslint.config.js', 'drizzle.config.ts'],
  },
];
