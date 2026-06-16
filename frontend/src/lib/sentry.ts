/**
 * Sentry SDK shim.
 *
 * `@sentry/react-native` requires native modules that are NOT available in
 * Expo Go SDK 54+. To keep the app running in Expo Go we expose a transparent
 * no-op proxy here. When you switch to a development build / EAS build that
 * does include the native module, you can swap this stub for a real Sentry
 * initialisation behind a runtime guard.
 */

type SentryLike = {
  init?: (...args: unknown[]) => unknown;
  captureException?: (...args: unknown[]) => unknown;
  captureMessage?: (...args: unknown[]) => unknown;
  addBreadcrumb?: (...args: unknown[]) => unknown;
  setTag?: (...args: unknown[]) => unknown;
  setUser?: (...args: unknown[]) => unknown;
  setContext?: (...args: unknown[]) => unknown;
  withScope?: (...args: unknown[]) => unknown;
  [key: string]: unknown;
};

const noop = () => undefined;

const SentryStub: SentryLike = new Proxy({}, {
  get: () => noop,
});

export const Sentry: SentryLike = SentryStub;