import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';

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
    // dist: prefer caller-supplied, then OTA updateId for update correlation,
    // then fall back to app version for native builds.
    let dist = opts?.dist;
    if (!dist) {
      try {
        if (Updates.updateId) dist = String(Updates.updateId);
      } catch { /* expo-updates not available */ }
    }
    if (!dist) dist = Constants?.expoConfig?.version;

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

    // expo-updates attribution — tag events with the update context so Sentry
    // can correlate crashes to a specific OTA update, not just the binary release.
    try {
      realSentry.setTag('expo-update-id', Updates.updateId ?? 'embedded');
      realSentry.setTag('expo-is-embedded-update', Updates.isEmbeddedLaunch);
      const updateGroup = Updates.manifest?.id
        ?? (Updates.manifest as any)?.extra?.expoClient?.updateGroup;
      if (typeof updateGroup === 'string') {
        realSentry.setTag('expo-update-group-id', updateGroup);
        if (__DEV__) {
          const owner = (Updates.manifest as any)?.extra?.expoClient?.owner ?? '[account]';
          const slug = (Updates.manifest as any)?.extra?.expoClient?.slug ?? '[project]';
          realSentry.setTag(
            'expo-update-debug-url',
            `https://expo.dev/accounts/${owner}/projects/${slug}/updates/${updateGroup}`,
          );
        }
      }
    } catch { /* expo-updates not available or not initialised */ }

    sentryInstance = realSentry as SentryLike;
  } catch {
    sentryInstance = SentryStub;
  }
}

export function isSentryInitialised(): boolean {
  return sentryInitialised;
}

/**
 * Returns true when a real Sentry client is bound (initialised with a DSN).
 * Used by `setSentryUser` and other helpers to short-circuit when observability
 * is unavailable so they never crash the app.
 */
export function isSentryAvailable(): boolean {
  return sentryInitialised && sentryInstance !== SentryStub;
}

export interface SentryUser {
  id: string;
  email?: string | null;
  username?: string | null;
}

/**
 * Attach (or clear) the Sentry user context so crashes are attributable to a
 * specific authenticated user. Pass `null` on logout to scrub the context.
 *
 * Privacy: only call this for authenticated users. Non-authenticated users
 * must not have PII attached — leave the context unset for them.
 *
 * Observability must never crash the app, so all Sentry calls are guarded.
 */
export function setSentryUser(user: SentryUser | null): void {
  if (!isSentryAvailable()) return;
  try {
    if (user) {
      sentryInstance.setUser?.({
        id: user.id,
        ...(user.email ? { email: user.email } : {}),
        ...(user.username ? { username: user.username } : {}),
      });
      sentryInstance.setTag?.('user.id', user.id);
    } else {
      sentryInstance.setUser?.(null);
    }
  } catch {
    // Observability must never crash the app.
  }
}

export function resetSentryForTesting(): void {
  sentryInstance = SentryStub;
  sentryInitialised = false;
}

export const Sentry: SentryLike = new Proxy({}, {
  get: (_target, prop: string) => {
    return sentryInstance[prop] ?? noop;
  },
});

export type { SentryLike };
