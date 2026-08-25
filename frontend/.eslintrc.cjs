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
  plugins: ['@typescript-eslint', 'react-hooks', 'react-native-a11y'],
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

    // React Native accessibility — certification gate (WCAG 2.2).
    // has-accessibility-props is the closest available rule to the
    // requested has-accessibility-label (not exported by this plugin
    // version). has-valid-accessibility-state is the closest to the
    // requested no-missing-accessibility-state. accessible-touchable has
    // no equivalent in eslint-plugin-react-native-a11y@3.x.
    'react-native-a11y/has-accessibility-props': 'error',
    'react-native-a11y/has-accessibility-hint': 'error',
    'react-native-a11y/no-nested-touchables': 'error',
    'react-native-a11y/has-valid-accessibility-role': 'error',
    'react-native-a11y/has-valid-accessibility-state': 'error',

    // File/function size guards — warnings so monolith screens surface
    // without blocking development. Upgrade to errors once screens are
    // decomposed below the thresholds (see docs/CODEBASE_HEALTH.md).
    'max-lines': ['warn', { max: 800, skipBlankLines: true, skipComments: true }],
    'max-lines-per-function': ['warn', { max: 400, skipBlankLines: true, skipComments: true, IIFEs: true }],

    // Premium* primitive discouragement — these wrappers duplicate App*
    // primitives and should not be imported in new code. Existing usages
    // are flagged as warnings; migrate to App* equivalents over time.
    // Components already deleted (PremiumActionBar, PremiumInputShell,
    // PremiumFormCard, PremiumActionFooter) are not listed.
    'no-restricted-imports': ['warn', {
      paths: [
        { name: '../components/ui/PremiumStatusPill', message: 'Use AppStatusPill instead. If the dot indicator or tone taxonomy is needed, add a variant prop to AppStatusPill.' },
        { name: '../../components/ui/PremiumStatusPill', message: 'Use AppStatusPill instead. If the dot indicator or tone taxonomy is needed, add a variant prop to AppStatusPill.' },
        { name: '../components/ui/PremiumTextField', message: 'Use AppInput with appearance prop instead.' },
        { name: '../../components/ui/PremiumTextField', message: 'Use AppInput with appearance prop instead.' },
        { name: '../components/ui/PremiumSelectRow', message: 'Use a FlatRow or AppInput with onPress instead.' },
        { name: '../../components/ui/PremiumSelectRow', message: 'Use a FlatRow or AppInput with onPress instead.' },
        { name: '../components/ui/PremiumListSection', message: 'Use a plain View with a section heading instead.' },
        { name: '../../components/ui/PremiumListSection', message: 'Use a plain View with a section heading instead.' },
      ],
    }],
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
