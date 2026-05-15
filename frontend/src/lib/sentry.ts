/**
 * Sentry SDK initialisation for React Native / Expo.
 *
 * Import this module as early as possible (before App component registration)
 * so that all unhandled exceptions and promise rejections are captured.
 *
 * The DSN is supplied via `EXPO_PUBLIC_SENTRY_DSN` env var.
 * When the DSN is absent or empty the SDK silently disables itself,
 * keeping local development unaffected.
 */
import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';

const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN ?? '';

/**
 * Initialise Sentry only when a DSN is present.
 * In development the DSN is typically left blank, which keeps the SDK inert.
 */
if (DSN) {
  Sentry.init({
    dsn: DSN,
    environment: __DEV__ ? 'development' : 'production',
    release: Constants.expoConfig?.version
      ? `com.thryftverse.app@${Constants.expoConfig.version}`
      : undefined,

    // --- Tracing -----------------------------------------------------------
    tracesSampleRate: __DEV__ ? 1.0 : 0.15,
    tracePropagationTargets: [
      'localhost',
      /^https:\/\/api\.thryftverse\.app/,
    ],

    // --- Error Monitoring --------------------------------------------------
    sendDefaultPii: false,
    attachStacktrace: true,
    maxBreadcrumbs: 100,

    // --- Debug (only in dev) -----------------------------------------------
    debug: __DEV__,

    // --- Opt-out of sending in Expo Go for safety --------------------------
    enabled: !__DEV__ || !!DSN,
  });
}

export { Sentry };
