import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import reactHooks from 'eslint-plugin-react-hooks';
import rnA11y from 'eslint-plugin-react-native-a11y';

/**
 * ESLint 9 flat configuration. Hook correctness remains blocking; legacy
 * hygiene debt is reported as warnings so it can be reduced incrementally.
 */
export default [
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      '.expo/**',
      'coverage/**',
      '*.config.js',
      'babel.config.js',
      'metro.config.js',
      'scripts/**',
      'polyfills/**',
    ],
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      'react-hooks': reactHooks,
      'react-native-a11y': rnA11y,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      '@typescript-eslint/ban-types': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      'no-console': 'off',
      'react-native-a11y/has-accessibility-props': 'error',
      'react-native-a11y/has-accessibility-hint': 'error',
      'react-native-a11y/no-nested-touchables': 'error',
      'react-native-a11y/has-valid-accessibility-role': 'error',
      'react-native-a11y/has-valid-accessibility-state': 'error',
    },
  },
];
