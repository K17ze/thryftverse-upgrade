/**
 * ThryftVerse ESLint configuration
 *
 * Uses the legacy .eslintrc format (not flat config) because the installed
 * plugins (@typescript-eslint v8, eslint-plugin-react-hooks) target the
 * legacy eslintrc format.
 *
 * Rules are deliberately pragmatic: this is a large existing codebase with
 * 131 existing `any` occurrences and extensive use of Expo requires. The
 * config surfaces issues as warnings so they are visible without blocking
 * development, while critical correctness rules (hooks) remain errors.
 */
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  env: {
    node: true,
    es2022: true,
  },
  plugins: ['@typescript-eslint', 'react-hooks'],
  extends: [
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
  ],
  rules: {
    // Pragmatic: 131 existing occurrences — warn so they are visible without
    // blocking development. Targeted for incremental reduction (see
    // docs/CODEBASE_HEALTH.md).
    '@typescript-eslint/no-explicit-any': 'warn',

    // Allow intentionally unused args/vars prefixed with underscore.
    '@typescript-eslint/no-unused-vars': [
      'warn',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],

    // Hooks correctness is non-negotiable.
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn',

    // Too noisy for existing code; revisit after type-escape reduction.
    '@typescript-eslint/ban-types': 'off',

    // Expo and Metro use requires in config and entry points.
    '@typescript-eslint/no-var-requires': 'off',

    // Console is stripped in production by babel-plugin-transform-remove-console.
    'no-console': 'off',
  },
  ignorePatterns: [
    'node_modules/',
    'dist/',
    '.expo/',
    'coverage/',
    '*.config.js',
    'babel.config.js',
    'metro.config.js',
    'scripts/',
    'polyfills/',
  ],
};
