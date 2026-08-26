import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import reactHooks from 'eslint-plugin-react-hooks';
import rnA11y from 'eslint-plugin-react-native-a11y';
import i18nextPlugin from 'eslint-plugin-i18next';

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
      'max-lines': ['warn', { max: 800, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': ['warn', { max: 400, skipBlankLines: true, skipComments: true, IIFEs: true }],
    },
  },
  // ── i18next no-literal-string ─────────────────────────────────────
  // Surface untranslated user-facing strings in JSX so they can be
  // extracted via i18next-parser. Scoped to screens/ and components/
  // only; test files are excluded. Uses eslint-plugin-i18next which
  // provides the no-literal-string rule with ESLint 9 flat-config
  // support. (eslint-plugin-react-i18next is installed as a devDep but
  // only carries no-parent-prop / require-namespace rules — it does not
  // ship no-literal-string, so eslint-plugin-i18next is used here.)
  {
    files: ['src/screens/**/*.{ts,tsx}', 'src/components/**/*.{ts,tsx}'],
    ignores: ['**/__tests__/**', '**/*.test.*'],
    plugins: {
      i18next: i18nextPlugin,
    },
    rules: {
      'i18next/no-literal-string': [
        'warn',
        {
          mode: 'jsx-only',
          // JSX attributes whose string values are non-user-facing
          // (styling, a11y, test hooks, icon names, media sources).
          'jsx-attributes': {
            exclude: [
              // plugin defaults
              'className',
              'styleName',
              'style',
              'type',
              'key',
              'id',
              'width',
              'height',
              // accessibility props
              'accessibilityLabel',
              'accessibilityHint',
              'accessibilityRole',
              'accessibilityValue',
              // media / test / icon props
              'source',
              'testID',
              'name',
            ],
          },
          // String-content exclusions: numbers, punctuation, uppercase
          // identifiers, HTML entities, emojis (defaults) plus URLs and
          // file-extension paths.
          words: {
            exclude: [
              '[0-9!-/:-@[-`{-~]+',
              '[A-Z_-]+',
              '&[a-zA-Z]+;',
              /^\p{Emoji}+$/u,
              'https?://\\S+',
              '\\S+\\.(png|jpe?g|gif|svg|webp|mp4|mov|pdf|json|ts|tsx|js|jsx|mjs|css|html)',
            ],
          },
        },
      ],
    },
  },
];
