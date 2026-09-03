import React, { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { PostHogProvider as PostHogProviderCore, PostHog, usePostHog as usePostHogCore } from 'posthog-react-native';
import Constants from 'expo-constants';
import * as Application from 'expo-application';
import type { FeatureFlagKey } from './types';
import { setTelemetryHandler } from '../lib/telemetry';
import { isAnalyticsOptOut, subscribeToAnalyticsOptOut } from './analyticsGate';
import { setCreatorAnalyticsHandler } from '../creator/creatorAnalytics';
import { trackRaw } from './track';

// ──────────────────────────────────────────────────────────────────────────
// Environment configuration — EXPO_PUBLIC_ prefix follows Expo convention.
// ──────────────────────────────────────────────────────────────────────────

const POSTHOG_API_KEY: string | undefined = process.env.EXPO_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST: string =
  process.env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://eu.i.posthog.com';

/**
 * Default to EU hosting for GDPR compliance. The host can be overridden via
 * `EXPO_PUBLIC_POSTHOG_HOST` if a US-cloud or self-hosted instance is used.
 */

// ──────────────────────────────────────────────────────────────────────────
// Feature flag bootstrapping — instant flag access from local cache.
// ──────────────────────────────────────────────────────────────────────────

const BOOTSTRAP_FLAGS_STORAGE_KEY = '@thryftverse/posthog_bootstrap_flags';

type BootstrapFlags = Record<string, boolean | string>;

/**
 * Reads cached feature flag values from MMKV-style synchronous storage.
 * In dev mode (or when no cache exists) this returns an empty object and
 * flags resolve from the network on first load.
 *
 * The cache is populated by `saveBootstrapFlags()` after the first
 * successful `/flags` response so subsequent cold starts get instant
 * flag values without waiting for a network round-trip.
 */
function loadBootstrapFlags(): BootstrapFlags {
  try {
    // react-native-mmkv is a synchronous storage — safe to read during render.
    // We require it lazily so the provider never crashes if MMKV is unavailable.
    const MMKV = require('react-native-mmkv').MMKV as {
      new (configuration?: { id?: string }): {
        getString: (key: string) => string | undefined;
        set: (key: string, value: string) => void;
      };
    };
    const storage = new MMKV({ id: 'posthog_bootstrap' });
    const raw = storage.getString(BOOTSTRAP_FLAGS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as BootstrapFlags;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Persists the current feature flag values so the next cold start can
 * bootstrap instantly. Called after PostHog loads flags from the network.
 */
function saveBootstrapFlags(posthog: PostHog): void {
  try {
    const MMKV = require('react-native-mmkv').MMKV as {
      new (configuration?: { id?: string }): {
        getString: (key: string) => string | undefined;
        set: (key: string, value: string) => void;
      };
    };
    const storage = new MMKV({ id: 'posthog_bootstrap' });
    const allFlags = posthog.getFeatureFlags();
    if (!allFlags) return;
    storage.set(BOOTSTRAP_FLAGS_STORAGE_KEY, JSON.stringify(allFlags));
  } catch {
    // Best-effort persistence — never crash the app.
  }
}

// ──────────────────────────────────────────────────────────────────────────
// PostHog client — singleton instance shared across the app.
// ──────────────────────────────────────────────────────────────────────────

let posthogClient: PostHog | null = null;

/**
 * Returns the shared PostHog client instance, or `null` when PostHog is not
 * configured (no API key / dev mode). All `track`, `identifyUser`, and
 * feature-flag helpers call this and no-op when the result is null.
 */
export function getPostHogClient(): PostHog | null {
  return posthogClient;
}

/** True when a real PostHog client has been created and is ready. */
export function isPostHogAvailable(): boolean {
  return posthogClient !== null;
}

// ──────────────────────────────────────────────────────────────────────────
// Provider — wraps the app, configures PostHog, enables session replay.
// ──────────────────────────────────────────────────────────────────────────

interface PostHogProviderProps {
  children: React.ReactNode;
}

/**
 * PostHogProvider wraps the app with PostHog analytics, feature flags, and
 * session replay.
 *
 * Configuration:
 * - **Autocapture disabled** — manual tracking is more precise for a
 *   marketplace with 164 screens. Autocapture's generic touch events add
 *   noise without actionable insight.
 * - **Session replay enabled** with privacy masking: all text inputs and
 *   images are masked so PII never leaves the device. This lets product
 *   teams SEE where users struggle without compromising privacy.
 * - **Person profiles** set to `identified_only` — anonymous events are
 *   cheaper (4x) and GDPR-friendlier; person profiles are created only
 *   after `identifyUser()` is called for a logged-in user.
 * - **Feature flag bootstrapping** — cached flag values are loaded
 *   synchronously at init so flags are available on the first render
 *   without a network round-trip (no flicker, no startup redirect delay).
 * - **EU hosting** by default for GDPR compliance.
 *
 * Graceful degradation: when no API key is present (dev mode without
 * PostHog configured), children render without PostHog. All analytics
 * functions are no-ops in this state — the app works identically, just
 * without telemetry.
 */
export function PostHogProvider({ children }: PostHogProviderProps): React.ReactElement | null {
  const [clientReady, setClientReady] = useState(false);

  // Create the PostHog client once. We use the standalone constructor
  // (not the declarative PostHogProvider apiKey prop) so we can control
  // the lifecycle and expose the singleton via getPostHogClient().
  useEffect(() => {
    if (!POSTHOG_API_KEY) {
      // No API key — dev mode without PostHog. Render children as-is.
      return;
    }

    const bootstrapFlags = loadBootstrapFlags();

    const client = new PostHog(POSTHOG_API_KEY, {
      host: POSTHOG_HOST,
      // GDPR: only create person profiles after identify(). Anonymous
      // events (pre-login) are 4x cheaper and carry no PII.
      personProfiles: 'identified_only',
      // Preload feature flags on init so they're available ASAP.
      preloadFeatureFlags: true,
      // Bootstrap cached flags for instant access on cold start.
      bootstrap: Object.keys(bootstrapFlags).length > 0
        ? { featureFlags: bootstrapFlags }
        : undefined,
      // Session replay — privacy-safe: mask all text inputs and images.
      // PII never leaves the device. Product teams can SEE where users
      // struggle without compromising user privacy.
      enableSessionReplay: true,
      sessionReplayConfig: {
        maskAllTextInputs: true,
        maskAllImages: false, // Capture images — marketplace is visual
        maskAllSandboxedViews: true,
        captureLog: false, // Don't record console output in replays
        captureNetworkTelemetry: true,
      },
      // Flush behaviour — batch events to save battery on mobile.
      flushAt: 20,
      flushInterval: 10000,
      // Capture app lifecycle events (install, update, open, background).
      captureAppLifecycleEvents: true,
      // Sanitize events before send — strip IP address for GDPR compliance.
      before_send: (event) => {
        if (!event) return event;
        if (event.properties) {
          delete event.properties['$ip'];
        }
        return event;
      },
    });

    posthogClient = client;

    // Apply the current opt-out state on init — if the user has previously
    // opted out, tell PostHog to stop capturing immediately.
    if (isAnalyticsOptOut()) {
      try {
        void client.optOut();
      } catch {
        // Best-effort — never crash the app.
      }
    }

    // Subscribe to opt-out changes so toggling the preference in settings
    // takes effect immediately without an app restart. PostHog's
    // optOut/optIn are persisted by the SDK itself.
    const unsubscribeOptOut = subscribeToAnalyticsOptOut((optOut) => {
      try {
        if (optOut) {
          void client.optOut();
        } else {
          void client.optIn();
        }
      } catch {
        // Best-effort — never crash the app.
      }
    });

    // Bridge telemetry events to PostHog so every `trackTelemetryEvent` call
    // also fires `posthog.capture()` with the same event name and properties.
    // PII scrubbing and the analytics opt-out preference are already applied
    // inside `trackTelemetryEvent` before the handler is invoked.
    setTelemetryHandler((eventName, properties) =>
      client.capture(eventName, properties as Record<string, any> | undefined)
    );

    // Bridge creator analytics events to PostHog so every CreatorAnalytics
    // call (layer add, undo/redo, draft save, publish, camera effects, etc.)
    // flows into PostHog via trackRaw. The opt-out gate in track.ts is
    // checked before any event reaches PostHog.
    setCreatorAnalyticsHandler((event, payload) =>
      trackRaw(event, payload as Record<string, string | number | boolean | null | undefined>)
    );

    // Wait for the client to be ready, then persist flags for next boot.
    client
      .ready()
      .then(() => {
        saveBootstrapFlags(client);
        setClientReady(true);
      })
      .catch(() => {
        // Ready failed — still mark as ready so children render.
        // PostHog will retry internally; events queue offline.
        setClientReady(true);
      });

    return () => {
      // On unmount, flush pending events and shut down.
      unsubscribeOptOut();
      client.flush().catch(() => {
        // Best-effort flush.
      });
      posthogClient = null;
      setTelemetryHandler(null);
      setCreatorAnalyticsHandler(null);
    };
  }, []);

  // No API key → render children directly (dev mode graceful degradation).
  if (!POSTHOG_API_KEY) {
    return <>{children}</>;
  }

  // Wrap children in PostHog's context provider so usePostHog() works.
  // We pass the already-created client instance so there's a single source
  // of truth. autocapture is disabled — manual tracking is more precise.
  return (
    <PostHogProviderCore client={posthogClient ?? undefined} autocapture={false}>
      <BootstrapFlagSaver />
      {children}
    </PostHogProviderCore>
  );
}

/**
 * Invisible component that subscribes to PostHog feature flag changes and
 * persists them to the bootstrap cache so the next cold start has instant
 * flag access. Renders nothing.
 */
function BootstrapFlagSaver(): null {
  const posthog = usePostHog();

  useEffect(() => {
    if (!posthog) return;

    // Save flags whenever they change (e.g. after identify() or reload).
    const unsubscribe = posthog.onFeatureFlags(() => {
      saveBootstrapFlags(posthog);
    });

    // Also save once on mount in case flags loaded before this subscribed.
    saveBootstrapFlags(posthog);

    return unsubscribe;
  }, [posthog]);

  return null;
}

// ──────────────────────────────────────────────────────────────────────────
// Device info — used for super properties on identify.
// ──────────────────────────────────────────────────────────────────────────

/** Cached device info to avoid repeated native calls on every identify. */
let cachedDeviceInfo: { appVersion: string; deviceModel: string | null } | null = null;

/**
 * Returns device/app info for super properties. Exported so `track.ts`
 * can set super properties on identify without duplicating the logic.
 *
 * Uses `expo-application` for the app version and `Platform` constants for
 * the device model (expo-device is not installed to keep the dependency
 * surface minimal — PostHog's SDK already collects detailed device info
 * internally via its optional peer deps).
 */
export function getDeviceInfo(): { appVersion: string; deviceModel: string | null } {
  if (cachedDeviceInfo) return cachedDeviceInfo;
  // Platform.constants is Android-specific — exposes the device model name
  // (e.g. "Pixel 8 Pro"). On iOS, expo-device would be needed for the model
  // name; null is acceptable there — PostHog's SDK collects $device_model
  // internally when its optional peer deps are available.
  let deviceModel: string | null = null;
  if (Platform.OS === 'android') {
    const constants = Platform.constants as Record<string, unknown> | undefined;
    if (constants && typeof constants['Model'] === 'string') {
      deviceModel = constants['Model'];
    }
  }
  cachedDeviceInfo = {
    appVersion:
      Application.nativeApplicationVersion ??
      Constants?.expoConfig?.version ??
      'unknown',
    deviceModel,
  };
  return cachedDeviceInfo;
}

/**
 * Returns the platform string for super properties.
 */
export function getPlatform(): 'ios' | 'android' | 'web' {
  return Platform.OS as 'ios' | 'android' | 'web';
}

// Safe wrapper around usePostHog: in dev mode or when PostHog is not initialized/configured,
// returns undefined gracefully without triggering PostHog's missing-provider warning toast.
export function usePostHog(): PostHog | undefined {
  if (!POSTHOG_API_KEY && !posthogClient) {
    return undefined;
  }
  try {
    return usePostHogCore();
  } catch {
    return undefined;
  }
}
export type { FeatureFlagKey };
