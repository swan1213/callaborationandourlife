import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  { ignores: ['dist/', 'node_modules/', 'release/', 'desktop/build/'] },
  js.configs.recommended,
  {
    rules: {
      'no-unused-vars': ['error', { args: 'after-used', caughtErrors: 'none', ignoreRestSiblings: true }],
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  // The React app (runs in the browser).
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  // The local server (CommonJS on Node).
  {
    files: ['server/**/*.cjs', 'desktop/**/*.cjs'],
    languageOptions: { sourceType: 'commonjs', globals: globals.node },
  },
  {
    files: ['desktop/**/*.mjs'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['test/**/*.js', '*.config.js'],
    languageOptions: { globals: globals.node },
  },
];
