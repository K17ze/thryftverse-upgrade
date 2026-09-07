/**
 * User identification for ThryftVerse analytics.
 *
 * These functions bridge the app's auth state with PostHog's identity
 * model. Call `identifyUser()` after a successful login (or app launch
 * with a persisted session) and `resetIdentity()` on logout.
 *
 * Both functions no-op when PostHog is not configured (dev mode), so they
 * are safe to call unconditionally from auth flows without null checks.
 *
 * @example
 * // On login success:
 * identifyUser({ id: user.id, email: user.email, username: user.username, plan: user.plan });
 *
 * // On logout:
 * resetIdentity();
 * resetScreenTracking(); // also clear the previous-screen tracker
 */

import { getPostHogClient, getDeviceInfo, getPlatform } from './PostHogProvider';
import { isAnalyticsEnabled } from './analyticsGate';
import type { UserIdentity } from './types';

// ──────────────────────────────────────────────────────────────────────────
// PostHog property type — mirrors PostHogEventProperties from @posthog/core.
// ──────────────────────────────────────────────────────────────────────────

/**
 * PostHog's event property shape. See `track.ts` for the rationale behind
 * defining this locally rather than importing from `@posthog/core`.
 */
type PostHogProperties = Record<string, string | number | boolean | null>;

// ──────────────────────────────────────────────────────────────────────────
// identifyUser — associate events with a logged-in user.
// ──────────────────────────────────────────────────────────────────────────

/**
 * Identifies a logged-in user with PostHog and sets persistent super
 * properties that attach to every subsequent event.
 *
 * What this does:
 * 1. Calls `posthog.identify(user.id, { email, username, plan })` — this
 *    creates/updates the person profile and associates all future events
 *    with this distinct ID. Because the provider is configured with
 *    `personProfiles: 'identified_only'`, this is the moment the person
 *    profile is created (anonymous events before this stay anonymous).
 * 2. Calls `posthog.register(...)` to set super properties that are
 *    attached to **every** event going forward: `app_version`, `platform`,
 *    and `device_model`. These provide device/context segmentation without
 *    per-event boilerplate.
 *
 * Super properties persist across sessions (PostHog stores them locally),
 * so they are re-registered on every `identifyUser()` call to stay current
 * after an app update (app_version changes) or device migration.
 *
 * No-op when PostHog is not configured.
 *
 * @param user - The user's identity. Only `id` is required; `email`,
 *   `username`, and `plan` are optional but recommended for enrichment.
 */
export function identifyUser(user: UserIdentity): void {
  if (!isAnalyticsEnabled()) return;
  const client = getPostHogClient();
  if (!client) return;
  if (!isAnalyticsEnabled()) return;

  // Identify the user — creates the person profile and sets person
  // properties (email, username, plan) for segmentation in PostHog.
  // Undefined values are omitted — PostHog's JsonType does not include
  // undefined, and sending undefined keys would be noise.
  const identifyProps: PostHogProperties = {};
  if (user.email !== undefined) identifyProps.email = user.email;
  if (user.username !== undefined) identifyProps.username = user.username;
  if (user.plan !== undefined) identifyProps.plan = user.plan;
  client.identify(user.id, identifyProps);

  // Set super properties — attached to every event until reset().
  // These provide device/context for every event without per-call boilerplate.
  const { appVersion, deviceModel } = getDeviceInfo();
  const superProps: PostHogProperties = {
    app_version: appVersion,
    platform: getPlatform(),
  };
  if (deviceModel !== null) superProps.device_model = deviceModel;
  client.register(superProps);
}

// ──────────────────────────────────────────────────────────────────────────
// resetIdentity — dissociate events on logout.
// ──────────────────────────────────────────────────────────────────────────

/**
 * Resets the PostHog identity on logout.
 *
 * Calls `posthog.reset()` which:
 * - Generates a new anonymous distinct ID so subsequent events are not
 *   associated with the logged-out user.
 * - Clears person properties and super properties set via `register()`.
 * - Clears feature flag overrides tied to the previous identity.
 *
 * App lifecycle properties (install, update, open) are preserved by
 * default — `reset()` only clears user-scoped state.
 *
 * Always call this on logout, **before** navigating to the auth screen,
 * so the very first event of the logged-out session is anonymous.
 *
 * No-op when PostHog is not configured.
 */
export function resetIdentity(): void {
  const client = getPostHogClient();
  if (!client) return;
  client.reset();
}
