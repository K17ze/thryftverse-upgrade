import { Platform } from 'react-native';

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

let sentryInstance: SentryLike = SentryStub;

export function initSentry(dsn?: string): void {
  if (!dsn) return;
  try {
    const realSentry = require('@sentry/react-native');
    realSentry.init({
      dsn,
      enableInExpoDevelopment: false,
      debug: __DEV__,
      environment: __DEV__ ? 'development' : 'production',
    });
    sentryInstance = realSentry as SentryLike;
  } catch {
    sentryInstance = SentryStub;
  }
}

export const Sentry: SentryLike = new Proxy({}, {
  get: (_target, prop: string) => {
    return (sentryInstance as any)[prop] ?? noop;
  },
});

export type { SentryLike };
