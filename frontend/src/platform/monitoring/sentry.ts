import { Platform } from 'react-native';
import Constants from 'expo-constants';

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
let sentryInitialised = false;

export interface SentryInitOptions {
  dsn?: string;
  environment?: 'development' | 'preview' | 'production';
  release?: string;
  dist?: string;
}

export function initSentry(opts?: SentryInitOptions): void {
  if (sentryInitialised) return;

  const dsn = opts?.dsn ?? Constants?.expoConfig?.extra?.sentryDsn;

  if (!dsn) return;

  sentryInitialised = true;

  try {
    const realSentry = require('@sentry/react-native');
    const environment = opts?.environment ?? (__DEV__ ? 'development' : 'production');
    const release = opts?.release ?? Constants?.expoConfig?.version;
    const dist = opts?.dist;

    realSentry.init({
      dsn,
      enableInExpoDevelopment: false,
      debug: __DEV__,
      environment,
      release,
      ...(dist ? { dist } : {}),
      beforeSend(event: any) {
        if (!event) return event;
        if (event.request) {
          delete event.request.headers;
          delete event.request.cookies;
          delete event.request.data;
        }
        if (event.breadcrumbs) {
          event.breadcrumbs = event.breadcrumbs.filter((bc: any) => {
            const cat = bc?.category ?? '';
            if (cat === 'auth' || cat === 'payment' || cat === 'chat' || cat === 'profile') {
              return false;
            }
            return true;
          });
        }
        return event;
      },
    });

    realSentry.setTag('platform', Platform.OS);

    sentryInstance = realSentry as SentryLike;
  } catch {
    sentryInstance = SentryStub;
  }
}

export function isSentryInitialised(): boolean {
  return sentryInitialised;
}

export function resetSentryForTesting(): void {
  sentryInstance = SentryStub;
  sentryInitialised = false;
}

export const Sentry: SentryLike = new Proxy({}, {
  get: (_target, prop: string) => {
    return (sentryInstance as any)[prop] ?? noop;
  },
});

export type { SentryLike };
