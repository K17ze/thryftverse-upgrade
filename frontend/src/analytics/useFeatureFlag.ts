/**
 * Feature flag hooks for ThryftVerse.
 *
 * These hooks wrap PostHog's feature flag API with:
 * - **Type-safe keys** — `FeatureFlagKey` union prevents typos at compile time.
 * - **Reactivity** — uses `usePostHog()` from `posthog-react-native` so
 *   components re-render when flags load from the network or change after
 *   `identify()`.
 * - **Graceful degradation** — returns a safe default (`false` / `undefined`)
 *   when PostHog is not configured (dev mode), so the app works identically
 *   without telemetry.
 *
 * @example
 * const showNewFeed = useFeatureFlag('new_home_feed');
 * const variant = useFeatureFlagVariant('conversational_search');
 * const config = useFeatureFlagPayload<SearchConfig>('conversational_search');
 */

import { useEffect, useRef, useState } from 'react';
import { usePostHog } from './PostHogProvider';
import { track } from './track';
import type { FeatureFlagKey } from './types';

// ──────────────────────────────────────────────────────────────────────────
// useFeatureFlag — boolean flag (on/off gate).
// ──────────────────────────────────────────────────────────────────────────

/**
 * Returns `true` when the given boolean feature flag is enabled.
 *
 * PostHog feature flags can return `true`, `false`, a string variant, or
 * `undefined` (not yet loaded). This hook normalises to a boolean:
 * - `true` if `getFeatureFlag(key) === 'true'` (string "true" from bootstrap)
 * - `true` if `isFeatureEnabled(key)` returns `true`
 * - `false` otherwise (including when PostHog is unavailable)
 *
 * The hook is reactive: it subscribes to `onFeatureFlags` so the component
 * re-renders when flags load from the network or change after `identify()`.
 * On first render (before flags load), it returns the bootstrap value or
 * `false` — no flash of incorrect content.
 *
 * @param key - A `FeatureFlagKey` from the typed union.
 * @returns `true` if the flag is enabled, `false` otherwise.
 *
 * @example
 * function HomeScreen() {
 *   const useNewFeed = useFeatureFlag('new_home_feed');
 *   return useNewFeed ? <NewFeed /> : <LegacyFeed />;
 * }
 */
export function useFeatureFlag(key: FeatureFlagKey): boolean {
  const posthog = usePostHog();
  const [enabled, setEnabled] = useState<boolean>(false);
  const exposureLoggedRef = useRef(false);
  const flagsLoadedFromNetworkRef = useRef(false);

  useEffect(() => {
    exposureLoggedRef.current = false;
    flagsLoadedFromNetworkRef.current = false;

    if (!posthog) {
      setEnabled(false);
      return;
    }

    const evaluate = (): void => {
      const flagValue = posthog.getFeatureFlag(key);
      const isEnabled =
        flagValue === 'true' || posthog.isFeatureEnabled(key) === true;
      setEnabled(isEnabled);

      if (!exposureLoggedRef.current) {
        exposureLoggedRef.current = true;
        const reason: 'bootstrap' | 'network' = flagsLoadedFromNetworkRef.current
          ? 'network'
          : 'bootstrap';
        track('feature_flag_evaluated', {
          flag_key: key,
          variant: flagValue,
          enabled: isEnabled,
          reason,
        });
      }
    };

    // Evaluate immediately (uses bootstrap cache if network hasn't loaded).
    evaluate();

    // Re-evaluate when flags are loaded or reloaded.
    const unsubscribe = posthog.onFeatureFlags(() => {
      flagsLoadedFromNetworkRef.current = true;
      evaluate();
    });

    return unsubscribe;
  }, [posthog, key]);

  return enabled;
}

// ──────────────────────────────────────────────────────────────────────────
// useFeatureFlagVariant — string/boolean variant for A/B tests.
// ──────────────────────────────────────────────────────────────────────────

/**
 * Returns the raw feature flag value — a string variant for multivariate
 * A/B tests, a boolean for simple gates, or `undefined` when not loaded.
 *
 * Unlike `useFeatureFlag` (which normalises to boolean), this hook
 * preserves the variant string so callers can branch on experiment arms:
 *
 * ```ts
 * const variant = useFeatureFlagVariant('conversational_search');
 * if (variant === 'control') { ... }
 * if (variant === 'treatment_a') { ... }
 * ```
 *
 * Returns `undefined` when PostHog is not configured or flags haven't
 * loaded yet. Callers should handle `undefined` as the default/control arm.
 *
 * @param key - A `FeatureFlagKey` from the typed union.
 * @returns The flag value (`string | boolean | undefined`).
 */
export function useFeatureFlagVariant(
  key: FeatureFlagKey,
): string | boolean | undefined {
  const posthog = usePostHog();
  const [variant, setVariant] = useState<string | boolean | undefined>(
    undefined,
  );
  const exposureLoggedRef = useRef(false);
  const flagsLoadedFromNetworkRef = useRef(false);

  useEffect(() => {
    exposureLoggedRef.current = false;
    flagsLoadedFromNetworkRef.current = false;

    if (!posthog) {
      setVariant(undefined);
      return;
    }

    const evaluate = (): void => {
      const flagValue = posthog.getFeatureFlag(key);
      setVariant(flagValue);

      if (!exposureLoggedRef.current) {
        exposureLoggedRef.current = true;
        const reason: 'bootstrap' | 'network' = flagsLoadedFromNetworkRef.current
          ? 'network'
          : 'bootstrap';
        track('feature_flag_evaluated', {
          flag_key: key,
          variant: flagValue,
          enabled: flagValue === 'true' || flagValue === true,
          reason,
        });
      }
    };

    evaluate();

    const unsubscribe = posthog.onFeatureFlags(() => {
      flagsLoadedFromNetworkRef.current = true;
      evaluate();
    });

    return unsubscribe;
  }, [posthog, key]);

  return variant;
}

// ──────────────────────────────────────────────────────────────────────────
// useFeatureFlagPayload — typed JSON payload for complex flags.
// ──────────────────────────────────────────────────────────────────────────

/**
 * Returns the JSON payload attached to a feature flag, typed as `T`.
 *
 * PostHog flags can carry arbitrary JSON payloads (configured in the
 * PostHog dashboard). This is useful for complex flags that carry
 * configuration rather than just on/off:
 *
 * ```ts
 * interface SearchConfig {
 *   enabled: boolean;
 *   maxResults: number;
 *   debounceMs: number;
 * }
 *
 * const config = useFeatureFlagPayload<SearchConfig>('conversational_search');
 * if (config?.enabled) {
 *   // use config.maxResults, config.debounceMs
 * }
 * ```
 *
 * Returns `undefined` when PostHog is not configured, flags haven't
 * loaded, or the flag has no payload. The generic `T` is caller-defined —
 * the hook does not validate the payload shape at runtime, so ensure the
 * PostHog dashboard payload matches `T`.
 *
 * @param key - A `FeatureFlagKey` from the typed union.
 * @returns The typed payload, or `undefined`.
 */
export function useFeatureFlagPayload<T>(
  key: FeatureFlagKey,
): T | undefined {
  const posthog = usePostHog();
  const [payload, setPayload] = useState<T | undefined>(undefined);
  const exposureLoggedRef = useRef(false);
  const flagsLoadedFromNetworkRef = useRef(false);

  useEffect(() => {
    exposureLoggedRef.current = false;
    flagsLoadedFromNetworkRef.current = false;

    if (!posthog) {
      setPayload(undefined);
      return;
    }

    const evaluate = (): void => {
      const raw = posthog.getFeatureFlagPayload(key);
      setPayload(raw as T | undefined);

      if (!exposureLoggedRef.current) {
        exposureLoggedRef.current = true;
        const flagValue = posthog.getFeatureFlag(key);
        const reason: 'bootstrap' | 'network' = flagsLoadedFromNetworkRef.current
          ? 'network'
          : 'bootstrap';
        track('feature_flag_evaluated', {
          flag_key: key,
          variant: flagValue,
          enabled: flagValue === 'true' || flagValue === true,
          reason,
        });
      }
    };

    evaluate();

    const unsubscribe = posthog.onFeatureFlags(() => {
      flagsLoadedFromNetworkRef.current = true;
      evaluate();
    });

    return unsubscribe;
  }, [posthog, key]);

  return payload;
}
