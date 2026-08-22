/**
 * Automatic screen tracking for ThryftVerse via React Navigation.
 *
 * React Navigation v7 removed automatic screen autocapture, so screen views
 * must be captured manually. This module provides two integration patterns:
 *
 * 1. `useScreenTracking()` — a hook for screen components that captures a
 *    `screen_view` event on focus. Use this inside individual screens that
 *    need their own tracking (e.g. with screen-specific properties).
 *
 * 2. `trackScreenChange(currentRoute, previousRoute)` — a standalone
 *    function for the `onStateChange` callback in `NavigationContainer`.
 *    This is the primary integration point — it tracks every navigation
 *    transition from a single place (App.tsx) without per-screen boilerplate.
 *
 * Privacy: route params are sanitised — PII keys (email, phone, token, etc.)
 * are stripped before being sent to PostHog. Only the route name and
 * non-PII params are recorded.
 */

import { useCallback, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { track } from './track';
import type { ScreenViewProperties } from './types';

// ──────────────────────────────────────────────────────────────────────────
// PII sanitisation — defence-in-depth for route params.
// ──────────────────────────────────────────────────────────────────────────

/**
 * Keys that are considered personally identifiable information. Any route
 * param key matching one of these (case-insensitive substring) is stripped
 * before the params are sent to PostHog. This mirrors the PII scrubbing in
 * `src/lib/telemetry.ts` so both pipelines apply the same privacy policy.
 */
const PII_PARAM_FRAGMENTS = [
  'email',
  'phone',
  'address',
  'name',
  'username',
  'password',
  'token',
  'avatar',
  'bio',
  'dob',
  'birthdate',
  'ssn',
  'national',
  'passport',
  'ip',
  'lat',
  'lon',
  'latitude',
  'longitude',
];

/**
 * Sanitises route params by stripping PII keys. Only string and number
 * values are retained — complex objects are dropped to prevent accidental
 * PII leakage through nested structures.
 */
function sanitizeParams(
  params: Record<string, unknown> | undefined,
): Record<string, string | number> {
  if (!params || typeof params !== 'object') return {};

  const cleaned: Record<string, string | number> = {};
  for (const key of Object.keys(params)) {
    const lowerKey = key.toLowerCase();
    if (PII_PARAM_FRAGMENTS.some((fragment) => lowerKey.includes(fragment))) {
      continue;
    }

    const value = params[key];
    if (typeof value === 'string' || typeof value === 'number') {
      cleaned[key] = value;
    }
    // Drop objects, arrays, booleans, null — only primitives are safe.
  }
  return cleaned;
}

// ──────────────────────────────────────────────────────────────────────────
// Route info extraction.
// ──────────────────────────────────────────────────────────────────────────

/** Minimal route shape — avoids coupling to a specific navigation type. */
interface RouteLike {
  name?: string;
  params?: Record<string, unknown>;
}

/**
 * Extracts the screen name and sanitised params from a navigation route.
 * Returns `null` when the route is missing a name (shouldn't happen in
 * practice, but defensive).
 */
function extractRouteInfo(route: RouteLike | null | undefined): {
  name: string;
  params: Record<string, string | number>;
} | null {
  if (!route || !route.name) return null;
  return {
    name: route.name,
    params: sanitizeParams(route.params),
  };
}

// ──────────────────────────────────────────────────────────────────────────
// trackScreenChange — for NavigationContainer onStateChange.
// ──────────────────────────────────────────────────────────────────────────

/**
 * The previous screen name, tracked across navigation state changes so each
 * `screen_view` event includes the screen the user came from. This enables
 * flow analysis (e.g. "what screen do users come from before checkout?").
 */
let previousScreenName: string | null = null;

/**
 * Tracks a screen view when the navigation state changes. Call this from
 * the `NavigationContainer`'s `onStateChange` callback, passing the current
 * route (from `navigationRef.getCurrentRoute()`) and optionally the
 * previous route name.
 *
 * This is the primary integration point — it tracks every screen transition
 * from a single place without per-screen instrumentation.
 *
 * No-op when PostHog is not initialised.
 *
 * @example
 * const onStateChange = () => {
 *   const route = navigationRef.getCurrentRoute();
 *   trackScreenChange(route);
 * };
 */
export function trackScreenChange(
  currentRoute: RouteLike | null | undefined,
  previousRoute?: RouteLike | null | undefined,
): void {
  const current = extractRouteInfo(currentRoute);
  if (!current) return;

  // Determine the previous screen name.
  const prevName = previousRoute?.name ?? previousScreenName;

  // Skip duplicate events when the screen hasn't actually changed
  // (e.g. param-only updates within the same screen).
  if (prevName === current.name && Object.keys(current.params).length === 0) {
    return;
  }

  const properties: ScreenViewProperties = {
    screen: current.name,
    previous_screen: prevName,
    params: current.params,
  };

  track('screen_view', properties);

  // Update the tracked previous screen for the next transition.
  previousScreenName = current.name;
}

/**
 * Resets the internal previous-screen tracker. Call this on logout or when
 * the navigator is remounted (e.g. auth state change in AppNavigator) so
 * the first screen of a new session doesn't record the previous user's
 * last screen as its `previous_screen`.
 */
export function resetScreenTracking(): void {
  previousScreenName = null;
}

// ──────────────────────────────────────────────────────────────────────────
// useScreenTracking — hook for per-screen tracking with extra properties.
// ──────────────────────────────────────────────────────────────────────────

/**
 * Hook that tracks a `screen_view` event every time the calling screen
 * receives focus. Use this inside individual screens that need
 * screen-specific tracking beyond the route name (e.g. a listing detail
 * screen that wants to record the listing ID as a property).
 *
 * The hook uses `useFocusEffect` so it fires on every focus, not just mount
 * — this correctly handles tab switches and modal dismissals.
 *
 * No-op when PostHog is not initialised.
 *
 * @param screenName - The screen's name (typically the route name)
 * @param extraParams - Optional extra properties to attach (sanitised for PII)
 *
 * @example
 * function ItemDetailScreen({ route }) {
 *   useScreenTracking('ItemDetail', { listingId: route.params?.listingId });
 * }
 */
export function useScreenTracking(
  screenName: string,
  extraParams?: Record<string, string | number>,
): void {
  const previousRef = useRef<string | null>(previousScreenName);
  // Stable reference for extraParams so the focus effect doesn't re-run
  // on every render when the caller passes an inline object.
  const extraParamsRef = useRef(extraParams);
  extraParamsRef.current = extraParams;

  useFocusEffect(
    useCallback(() => {
      const params: Record<string, string | number> = {
        ...(extraParamsRef.current ?? {}),
      };

      const properties: ScreenViewProperties = {
        screen: screenName,
        previous_screen: previousRef.current,
        params,
      };

      track('screen_view', properties);

      // Update refs for the next screen's `previous_screen`.
      previousRef.current = screenName;
      previousScreenName = screenName;

      // Cleanup — no-op, but required by useFocusEffect contract.
      return () => undefined;
    }, [screenName]),
  );
}
