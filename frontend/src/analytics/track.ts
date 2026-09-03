/**
 * Typed analytics tracking for ThryftVerse.
 *
 * This module is the **only** entry point for sending events to PostHog.
 * Always import `track` from here — never import PostHog directly.
 *
 * ```ts
 * // ✅ Correct — typed, graceful degradation, single source of truth.
 * import { track } from '@/analytics/track';
 * track('item_viewed', { listing_id: 'abc123' });
 *
 * // ❌ Wrong — bypasses typing, no dev-mode no-op, couples to SDK.
 * import { getPostHogClient } from '@/analytics/PostHogProvider';
 * getPostHogClient()?.capture('item_viewed', { listing_id: 'abc123' });
 * ```
 *
 * Why centralise?
 * - **Type safety.** `track()` is overloaded on `EventName`, so the
 *   compiler checks that `screen_view` gets `ScreenViewProperties`, etc.
 * - **Graceful degradation.** When PostHog is not configured (dev mode
 *   without an API key), `track()` is a no-op — no null checks at call
 *   sites.
 * - **Consistent behaviour.** Future cross-cutting concerns (PII
 *   scrubbing, sampling, debug logging) live in one place.
 */

import { getPostHogClient } from './PostHogProvider';
import { isAnalyticsEnabled } from './analyticsGate';
import { sanitizeEvent } from './piiSanitizer';
import { trackTelemetryEvent } from '../lib/telemetry';
import type { EventName, EventProperties } from './types';

// ──────────────────────────────────────────────────────────────────────────
// PostHog property type — mirrors PostHogEventProperties from @posthog/core.
// ──────────────────────────────────────────────────────────────────────────

/**
 * PostHog's event property shape: a record of string keys to JSON-serialisable
 * values. This mirrors `PostHogEventProperties` from `@posthog/core` (which is
 * not directly re-exported by `posthog-react-native`). We define it locally to
 * avoid importing from a transitive dependency.
 */
type PostHogProperties = Record<string, string | number | boolean | null>;

// ──────────────────────────────────────────────────────────────────────────
// track — typed capture for known event names.
// ──────────────────────────────────────────────────────────────────────────

/**
 * The base property value type, re-declared locally to keep this module
 * self-contained for type inference. Mirrors the definition in `types.ts`.
 */
type EventPropertyValue = string | number | boolean | null | undefined;

/**
 * Resolves the properties type for a given event name. If the event is
 * listed in `EventProperties`, that specific type is used; otherwise the
 * default `Record<string, EventPropertyValue>` applies.
 */
type PropertiesFor<E extends EventName> = E extends keyof EventProperties
  ? EventProperties[E]
  : Record<string, EventPropertyValue>;

/**
 * Captures an analytics event with PostHog.
 *
 * The function is overloaded so that events with a specific properties
 * shape (e.g. `screen_view` → `ScreenViewProperties`) get compile-time
 * validation, while all other events accept the default property bag.
 *
 * **No-op when PostHog is not configured** — in dev mode without an API
 * key, or before the client has finished initialising, the call silently
 * returns. This means call sites never need null checks.
 *
 * @param event - A known event name from the `EventName` union.
 * @param properties - Optional properties matching the event's shape.
 *
 * @example
 * track('item_viewed', { listing_id: 'abc', seller_id: 'def', price: 29.99 });
 * track('screen_view', { screen: 'Home', previous_screen: null, params: {} });
 * track('user_logged_in'); // no properties needed
 */
export function track<E extends EventName>(
  event: E,
  properties?: PropertiesFor<E>,
): void {
  if (!isAnalyticsEnabled()) return;
  const sanitized = sanitizeEvent(
    event,
    properties as Record<string, unknown> | undefined,
  );
  // Send to PostHog (if configured).
  const client = getPostHogClient();
  if (client) {
    client.capture(
      sanitized.eventName,
      sanitized.properties as PostHogProperties | undefined,
    );
  }
  // Also persist to the backend durable store so analytics data is
  // available in the app's own database, not only in PostHog.
  trackTelemetryEvent(sanitized.eventName, sanitized.properties as Record<string, unknown>);
}

// ──────────────────────────────────────────────────────────────────────────
// trackRaw — escape hatch for dynamic event names.
// ──────────────────────────────────────────────────────────────────────────

/**
 * Captures an analytics event with a dynamic (non-`EventName`) name.
 *
 * This is the escape hatch for events whose names are constructed at
 * runtime — e.g. server-driven event names from a remote config, or
 * A/B test arms that emit differently-named events. It trades type safety
 * for flexibility.
 *
 * Prefer `track()` whenever the event name is known at compile time.
 * Use `trackRaw()` only when the event name is genuinely dynamic and
 * cannot be added to the `EventName` union.
 *
 * No-op when PostHog is not configured.
 *
 * @param event - Any string event name.
 * @param properties - Optional properties (default bag, no per-event typing).
 *
 * @example
 * trackRaw(`experiment_${arm}`, { experiment_id: 'exp_42' });
 */
export function trackRaw(
  event: string,
  properties?: Record<string, EventPropertyValue>,
): void {
  if (!isAnalyticsEnabled()) return;
  const sanitized = sanitizeEvent(event, properties as Record<string, unknown> | undefined);
  const client = getPostHogClient();
  if (client) {
    client.capture(
      sanitized.eventName,
      sanitized.properties as PostHogProperties | undefined,
    );
  }
  trackTelemetryEvent(sanitized.eventName, sanitized.properties as Record<string, unknown>);
}

// ──────────────────────────────────────────────────────────────────────────
// trackFunnelStep — funnel progression tracking.
// ──────────────────────────────────────────────────────────────────────────

/**
 * Captures a funnel step event for PostHog funnel analysis.
 *
 * Funnel steps are emitted as their own named events (e.g.
 * `signup_started`, `checkout_completed`) so they can be assembled into
 * PostHog funnels directly. The `funnel` property groups the steps that
 * belong to the same funnel so dashboards can filter by funnel name.
 *
 * Unlike `track()`, the step name is a free-form string — funnel step
 * names are not part of the core `EventName` taxonomy because they are
 * analysis constructs rather than product events. This keeps the
 * `EventName` union focused on user-facing actions.
 *
 * No-op when PostHog is not configured (dev mode), so call sites never
 * need null checks.
 *
 * @param funnel - The funnel identifier (e.g. `'signup'`, `'checkout'`).
 * @param step - The step name (e.g. `'signup_started'`, `'purchase_completed'`).
 * @param properties - Optional extra properties for this step.
 *
 * @example
 * trackFunnelStep('signup', 'signup_started', { method: 'email' });
 * trackFunnelStep('checkout', 'purchase_completed', { order_id: 'abc' });
 */
export function trackFunnelStep(
  funnel: string,
  step: string,
  properties?: Record<string, EventPropertyValue>,
): void {
  if (!isAnalyticsEnabled()) return;
  const sanitized = sanitizeEvent(step, {
    funnel,
    ...(properties as Record<string, unknown> | undefined),
  });
  const client = getPostHogClient();
  if (client) {
    client.capture(
      sanitized.eventName,
      sanitized.properties as PostHogProperties | undefined,
    );
  }
  trackTelemetryEvent(sanitized.eventName, sanitized.properties as Record<string, unknown>);
}
