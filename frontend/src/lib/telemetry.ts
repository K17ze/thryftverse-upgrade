import { fetchJson } from './apiClient';

export type TelemetryPayload = Record<string, unknown>;
export type TelemetryHandler = (eventName: string, payload: TelemetryPayload) => void;

/**
 * Keys that are considered personally identifiable information (PII).
 * Any payload key matching one of these (case-insensitive substring) is
 * stripped before the event is dispatched to a handler or sent to the
 * backend. This is a defence-in-depth measure — callers should never
 * intentionally pass PII into a telemetry event.
 */
const PII_KEY_FRAGMENTS = [
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
  'device',
  'ip',
  'lat',
  'lon',
  'latitude',
  'longitude',
];

function scrubPII(payload: TelemetryPayload): TelemetryPayload {
  const cleaned: TelemetryPayload = {};
  for (const key of Object.keys(payload)) {
    const lowerKey = key.toLowerCase();
    if (PII_KEY_FRAGMENTS.some((fragment) => lowerKey.includes(fragment))) {
      // Drop the field entirely — PII must never leave the client.
      continue;
    }
    cleaned[key] = payload[key];
  }
  return cleaned;
}

let telemetryHandler: TelemetryHandler | null = null;

/**
 * Module-level opt-out flag. When true, no telemetry events are dispatched
 * to handlers or sent to the backend. The settings preferences context
 * keeps this in sync with the persisted user preference via
 * `setAnalyticsOptOut`.
 */
let analyticsOptOut = false;

export function setAnalyticsOptOut(optOut: boolean) {
  analyticsOptOut = optOut;
}

export function isAnalyticsOptOutEnabled() {
  return analyticsOptOut;
}

export function setTelemetryHandler(handler: TelemetryHandler | null) {
  telemetryHandler = handler;
}

export function trackTelemetryEvent(eventName: string, payload: TelemetryPayload = {}) {
  // Respect the user's analytics opt-out preference — no event is
  // dispatched or transmitted when opt-out is active.
  if (analyticsOptOut) {
    return;
  }

  const safePayload = scrubPII(payload);

  if (telemetryHandler) {
    try {
      telemetryHandler(eventName, safePayload);
    } catch (error) {
      if (__DEV__) {
        console.warn('[telemetry] handler_failed', { eventName, error });
      }
    }
  }

  if (__DEV__) {
    console.info(`[telemetry] ${eventName}`, safePayload);
  }

  fetchJson('/analytics/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event: eventName, ...safePayload }),
  }).catch(() => {
    // Best-effort — analytics must not crash the app
  });
}

// ──────────────────────────────────────────────────────────────────────────
// Privacy-first user behaviour tracking helpers
//
// These thin wrappers standardise the event names and payload shapes for the
// most common analytics surfaces. They all flow through `trackTelemetryEvent`
// so the opt-out preference and PII scrubbing apply uniformly.
// ──────────────────────────────────────────────────────────────────────────

/**
 * Track a screen view. `params` may include route params, but PII keys are
 * stripped automatically — never rely on passing user-identifying values.
 */
export function trackScreenView(
  screenName: string,
  params?: Record<string, string | number>
): void {
  trackTelemetryEvent('screen_view', { screen: screenName, ...params });
}

/**
 * Track a step within a named funnel. `stepNumber` is 1-based.
 */
export function trackFunnelStep(
  funnelName: string,
  step: string,
  stepNumber: number
): void {
  trackTelemetryEvent('funnel_step', {
    funnel: funnelName,
    step,
    step_number: stepNumber,
  });
}

/**
 * Track feature usage. `action` describes what the user did with the feature
 * (e.g. "opened", "completed", "dismissed").
 */
export function trackFeatureUsage(feature: string, action: string): void {
  trackTelemetryEvent('feature_usage', { feature, action });
}

/**
 * Track a button tap. Use a stable `actionId` that describes the control,
 * not the user. Optional `context` may carry non-PII metadata such as the
 * section the button lives in.
 */
export function trackButtonTap(
  actionId: string,
  context?: Record<string, string | number>
): void {
  trackTelemetryEvent('button_tap', { action: actionId, ...context });
}
