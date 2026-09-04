import { fetchJson } from './apiClient';
import { sanitizeValue } from '../analytics/piiSanitizer';

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

// ──────────────────────────────────────────────────────────────────────────
// Session ID — generated once per app launch, stored module-level.
// ──────────────────────────────────────────────────────────────────────────

function generateSessionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex: string[] = [];
    for (let i = 0; i < bytes.length; i++) {
      hex.push(bytes[i].toString(16).padStart(2, '0'));
    }
    return (
      hex.slice(0, 4).join('') + '-' +
      hex.slice(4, 6).join('') + '-' +
      hex.slice(6, 8).join('') + '-' +
      hex.slice(8, 10).join('') + '-' +
      hex.slice(10, 16).join('')
    );
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

let sessionId: string = generateSessionId();

// ──────────────────────────────────────────────────────────────────────────
// Event buffer — batches events for flush every 10s or when 20 events
// are collected. If the POST fails, events remain in the buffer and are
// retried on the next flush.
//
// Limitation: events in the buffer are lost if the app is killed before
// a flush completes. This is an acceptable trade-off for analytics — the
// PostHog SDK has its own offline queue for events routed through the
// handler, and the backend endpoint is best-effort.
// ──────────────────────────────────────────────────────────────────────────

interface BufferedEvent {
  event: string;
  session_id: string;
  timestamp: string;
  payload: TelemetryPayload;
}

const FLUSH_INTERVAL_MS = 10_000;
const FLUSH_BATCH_SIZE = 20;
const DEDUP_WINDOW_MS = 500;

let eventBuffer: BufferedEvent[] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;
const recentEventKeys: Map<string, number> = new Map();

function hashPayload(payload: TelemetryPayload): string {
  try {
    return JSON.stringify(payload, Object.keys(payload).sort());
  } catch {
    return JSON.stringify(payload);
  }
}

function isDuplicate(eventName: string, payload: TelemetryPayload): boolean {
  const now = Date.now();
  const dedupKey = `${eventName}:${hashPayload(payload)}`;

  for (const [key, timestamp] of recentEventKeys) {
    if (now - timestamp > DEDUP_WINDOW_MS) {
      recentEventKeys.delete(key);
    }
  }

  if (recentEventKeys.has(dedupKey)) {
    return true;
  }

  recentEventKeys.set(dedupKey, now);
  return false;
}

function ensureFlushTimer(): void {
  if (flushTimer !== null) return;
  flushTimer = setInterval(() => {
    void flushTelemetryBuffer();
  }, FLUSH_INTERVAL_MS);
}

async function flushTelemetryBuffer(): Promise<void> {
  if (eventBuffer.length === 0) return;

  const batch = eventBuffer.splice(0, FLUSH_BATCH_SIZE);

  try {
    await fetchJson('/analytics/events/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events: batch }),
    });
  } catch {
    // POST failed — requeue the batch for the next flush (offline queue).
    eventBuffer.unshift(...batch);
  }
}

export function trackTelemetryEvent(eventName: string, payload: TelemetryPayload = {}) {
  // Respect the user's analytics opt-out preference — no event is
  // dispatched or transmitted when opt-out is active.
  if (analyticsOptOut) {
    return;
  }

  const safePayload = sanitizeValue(scrubPII(payload)) as TelemetryPayload;

  // Value-based PII sanitization — catches PII that leaks into arbitrary
  // string values (e.g. a user typing their email into a search box that
  // gets tracked as `query`). Complements the key-based scrubbing above.
  const sanitizedPayload = sanitizeValue(safePayload) as TelemetryPayload;

  // Dedup: drop duplicate events within a 500ms window.
  if (isDuplicate(eventName, sanitizedPayload)) {
    return;
  }

  const enrichedPayload: TelemetryPayload = {
    ...sanitizedPayload,
    session_id: sessionId,
    timestamp: new Date().toISOString(),
  };

  if (telemetryHandler) {
    try {
      telemetryHandler(eventName, enrichedPayload);
    } catch (error) {
      if (__DEV__) {
        console.warn('[telemetry] handler_failed', { eventName, error });
      }
    }
  }

  if (__DEV__) {
    console.info(`[telemetry] ${eventName}`, enrichedPayload);
  }

  eventBuffer.push({
    event: eventName,
    session_id: sessionId,
    timestamp: new Date().toISOString(),
    payload: sanitizedPayload,
  });

  ensureFlushTimer();

  if (eventBuffer.length >= FLUSH_BATCH_SIZE) {
    void flushTelemetryBuffer();
  }
}

/**
 * Flushes any pending buffered events immediately. Call this on app
 * backgrounding or before a deliberate shutdown to minimise event loss.
 */
export async function flushTelemetry(): Promise<void> {
  await flushTelemetryBuffer();
}

/**
 * Resets the session ID — call on logout so the next session gets a
 * fresh identifier.
 */
export function resetTelemetrySession(): void {
  sessionId = generateSessionId();
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
