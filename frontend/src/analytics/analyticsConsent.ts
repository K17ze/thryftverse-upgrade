/**
 * Analytics consent management — 2026 privacy-first standard.
 *
 * 2026 research: Opt-out by default is the standard (GDPR/CCPA compliance).
 * Analytics must not collect data until the user has explicitly granted
 * consent. This module provides the persistence layer for that consent
 * state, separate from the existing `analyticsOptOut` toggle in
 * `settingsPreferences` (which is an opt-out model — tracking on by
 * default).
 *
 * Consent states:
 * - `'pending'` — the user has not yet responded to a consent prompt.
 *   Under the 2026 standard, tracking should be **blocked** in this state.
 * - `'granted'` — the user has explicitly opted in to analytics.
 * - `'denied'` — the user has explicitly opted out of analytics.
 *
 * Integration note: the existing `setAnalyticsOptOut()` in
 * `src/lib/telemetry.ts` and the `analyticsOptOut` setting in
 * `settingsPreferences` remain the active gate for the telemetry backend
 * pipeline. This consent module provides the formal, GDPR-grade consent
 * record that should gate **both** the PostHog path (`track.ts`) and the
 * telemetry path (`telemetry.ts`) once the consent UI is wired in.
 *
 * Until the consent UI is deployed, `hasAnalyticsConsent()` returns
 * `true` for `'pending'` so existing tracking is not broken. When the
 * consent prompt ships, flip `BLOCK_ON_PENDING` to `true` to enforce
 * opt-in-by-default.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const CONSENT_KEY = 'analytics_consent_v1';

/**
 * When `true`, a `'pending'` consent state blocks analytics (opt-in
 * required). When `false` (current), `'pending'` is treated as permissive
 * so existing tracking is not broken before the consent UI is deployed.
 *
 * Flip this to `true` once the consent prompt is live in the app.
 */
const BLOCK_ON_PENDING = false;

export type ConsentState = 'pending' | 'granted' | 'denied';

/**
 * Reads the persisted analytics consent state from AsyncStorage.
 *
 * Returns `'pending'` when no consent record exists (first launch, or
 * the user has not yet been prompted). This is the 2026 default — no
 * analytics until the user explicitly opts in.
 *
 * @returns The current consent state, or `'pending'` if unreadable/unset.
 */
export async function getConsentState(): Promise<ConsentState> {
  try {
    const value = await AsyncStorage.getItem(CONSENT_KEY);
    if (value === 'granted' || value === 'denied') return value;
    return 'pending';
  } catch {
    return 'pending';
  }
}

/**
 * Persists the analytics consent state to AsyncStorage.
 *
 * Call this when the user responds to the consent prompt (grant or deny),
 * or when they change their preference in the privacy settings screen.
 *
 * @param state - The consent state to persist.
 */
export async function setConsentState(state: ConsentState): Promise<void> {
  try {
    await AsyncStorage.setItem(CONSENT_KEY, state);
  } catch {
    // Consent persistence is best-effort — never crash the app.
  }
}

/**
 * Returns `true` when analytics tracking is permitted under the current
 * consent state.
 *
 * - `'granted'` → `true`
 * - `'denied'` → `false`
 * - `'pending'` → `false` when `BLOCK_ON_PENDING` is `true` (opt-in
 *   required), `true` when `false` (permissive — current default until
 *   the consent UI ships).
 *
 * @returns Whether analytics tracking should proceed.
 */
export async function hasAnalyticsConsent(): Promise<boolean> {
  const state = await getConsentState();
  if (state === 'granted') return true;
  if (state === 'denied') return false;
  // state === 'pending'
  return !BLOCK_ON_PENDING;
}

/**
 * Synchronous consent check for code paths that cannot await (e.g. the
 * `track()` function which is called synchronously from UI handlers).
 *
 * This reads from a module-level cache that is populated by
 * `refreshConsentCache()` (called on app launch and whenever the consent
 * state changes). On first launch before the cache is populated, it
 * returns the permissive default so existing tracking is not broken.
 *
 * @returns Whether analytics tracking should proceed, based on the cached
 *   consent state.
 */
let cachedConsent: ConsentState | null = null;

export function hasAnalyticsConsentSync(): boolean {
  if (cachedConsent === null) {
    // Cache not yet populated — permissive until the consent UI ships.
    return !BLOCK_ON_PENDING;
  }
  if (cachedConsent === 'granted') return true;
  if (cachedConsent === 'denied') return false;
  return !BLOCK_ON_PENDING;
}

/**
 * Refreshes the module-level consent cache from AsyncStorage. Call this
 * on app launch (before any tracking calls) and whenever the consent
 * state is updated via `setConsentState()`.
 */
export async function refreshConsentCache(): Promise<void> {
  cachedConsent = await getConsentState();
}

/**
 * Updates the consent cache in-place without a storage round-trip. Call
 * this immediately after `setConsentState()` so synchronous checks
 * reflect the new state without waiting for the next
 * `refreshConsentCache()`.
 *
 * @param state - The new consent state to cache.
 */
export function updateConsentCache(state: ConsentState): void {
  cachedConsent = state;
}
