/**
 * Sentry performance monitoring — transaction, measurement and timing helpers.
 *
 * This module wraps the Sentry SDK's performance APIs behind a small, typed,
 * defensive surface that mirrors the resilience strategy of `sentry.ts`:
 *
 *  - Every call is guarded by `isSentryAvailable()` so observability never
 *    crashes the app when the SDK is uninitialised or a method is missing.
 *  - The shared `Sentry` proxy from `sentry.ts` is the only Sentry entry
 *    point — `@sentry/react-native` is never imported directly here, keeping
 *    a single source of truth for initialisation and stub behaviour.
 *  - All functions return `null`/`undefined`/no-op when Sentry is unavailable
 *    so callers can chain unconditionally without null-checking the SDK.
 *
 * The transaction model follows Sentry's tracing semantics: a transaction is
 * the root span of an operation (a screen load, a network call, an image
 * decode). Measurements (TTI, FCP, duration) are attached to the active
 * transaction and surface in Sentry's Performance dashboard.
 */

import { Sentry, isSentryAvailable } from './sentry';

/**
 * A Sentry performance transaction (root span). Only the subset of the SDK's
 * `Transaction` surface used by this module is modelled, so the wrapper stays
 * decoupled from SDK version churn.
 */
export interface SentryTransaction {
  /** Finish the transaction, optionally with a final status. */
  finish: (status?: SentryTransactionStatus) => void;
  /** Update the transaction's status before finishing. */
  setStatus: (status: SentryTransactionStatus) => void;
  /** Attach a named performance measurement to the transaction. */
  setMeasurement: (name: string, value: number, unit: TimeUnit) => void;
  /** Optional transaction name (set at creation). */
  readonly name?: string;
  /** Optional operation identifier (set at creation). */
  readonly op?: string;
}

/**
 * Sentry transaction/span status values. Mirrors the SDK's `SpanStatusType`
 * so callers can finish transactions with a meaningful outcome without
 * importing the SDK directly.
 */
export type SentryTransactionStatus =
  | 'ok'
  | 'deadline_exceeded'
  | 'cancelled'
  | 'unknown'
  | 'unknown_error'
  | 'invalid_argument'
  | 'not_found'
  | 'already_exists'
  | 'permission_denied'
  | 'resource_exhausted'
  | 'failed_precondition'
  | 'aborted'
  | 'out_of_range'
  | 'unimplemented'
  | 'internal_error'
  | 'unavailable'
  | 'data_loss'
  | 'unauthenticated';

/**
 * Measurement units understood by Sentry. Limited to the set used by this
 * module's timing helpers. See Sentry's `MeasurementUnit` for the full list.
 */
export type TimeUnit =
  | 'millisecond'
  | 'second'
  | 'minute'
  | 'hour'
  | 'day'
  | 'week'
  | 'byte'
  | 'kilobyte'
  | 'megabyte'
  | 'gigabyte'
  | 'none'
  | 'ratio'
  | 'percent';

/**
 * Start a Sentry performance transaction for a screen or operation.
 *
 * @param name      Human-readable transaction name (e.g. `'HomeScreen'`).
 * @param operation Sentry operation identifier (e.g. `'screen.load'`,
 *                  `'navigation'`, `'http.client'`).
 * @returns The started transaction, or `null` when Sentry is unavailable.
 */
export function startTransaction(
  name: string,
  operation: string,
): SentryTransaction | null {
  if (!isSentryAvailable()) return null;
  try {
    const fn = (Sentry as Record<string, unknown>).startTransaction;
    if (typeof fn !== 'function') return null;
    const start = fn as (config: { name: string; op: string }) => SentryTransaction;
    const tx = start({ name, op: operation });
    return tx ?? null;
  } catch {
    // Observability must never crash the app.
    return null;
  }
}

/**
 * Finish a transaction with an optional final status. Safe to call with a
 * `null` transaction (e.g. when `startTransaction` returned `null`); the call
 * is a no-op in that case so callers can chain unconditionally.
 *
 * @param transaction The transaction returned by `startTransaction`.
 * @param status      Final status; defaults to `'ok'`.
 */
export function finishTransaction(
  transaction: SentryTransaction | null,
  status: SentryTransactionStatus = 'ok',
): void {
  if (!transaction) return;
  try {
    transaction.setStatus?.(status);
    transaction.finish?.(status);
  } catch {
    // Observability must never crash the app.
  }
}

/**
 * Set a tag on the current Sentry scope. Tags are indexed and searchable in
 * Sentry's issue stream and performance dashboard. No-op when Sentry is
 * unavailable.
 *
 * @param key   Tag key (e.g. `'screen'`, `'api.endpoint'`).
 * @param value Tag value (string or number).
 */
export function setTag(key: string, value: string | number | boolean): void {
  if (!isSentryAvailable()) return;
  try {
    const fn = (Sentry as Record<string, unknown>).setTag;
    if (typeof fn === 'function') {
      (fn as (k: string, v: string | number | boolean) => void)(key, value);
    }
  } catch {
    // Observability must never crash the app.
  }
}

/**
 * Attach a named performance measurement to the currently active transaction
 * on the Sentry hub. Use this to record derived timings (TTI, FCP, duration)
 * that should appear in Sentry's Performance dashboard. No-op when Sentry is
 * unavailable or no transaction is active.
 *
 * @param name  Measurement name (e.g. `'tti'`, `'fcp'`).
 * @param value Numeric value.
 * @param unit  Measurement unit (e.g. `'millisecond'`).
 */
export function setMeasurement(name: string, value: number, unit: TimeUnit): void {
  if (!isSentryAvailable()) return;
  try {
    const fn = (Sentry as Record<string, unknown>).setMeasurement;
    if (typeof fn === 'function') {
      (fn as (n: string, v: number, u: TimeUnit) => void)(name, value, unit);
    }
  } catch {
    // Observability must never crash the app.
  }
}

/**
 * Record a screen load as a Sentry transaction. The returned transaction is
 * left open so the caller can attach measurements (TTI, FCP, duration) and
 * finish it via `finishTransaction` once the screen is interactive.
 *
 * The transaction is tagged with `screen` for searchable attribution and
 * uses the `'screen.load'` operation, which Sentry maps to its screen-load
 * performance view.
 *
 * @param screenName Screen/route name (e.g. `'ProductDetailScreen'`).
 * @returns The started transaction, or `null` when Sentry is unavailable.
 */
export function recordScreenLoad(screenName: string): SentryTransaction | null {
  const tx = startTransaction(screenName, 'screen.load');
  if (tx) {
    setTag('screen', screenName);
  }
  return tx;
}

/**
 * Record a network request's timing as a Sentry breadcrumb and a measurement
 * on the active transaction (if any). The breadcrumb is searchable in the
 * issue stream and lets Sentry correlate slow/failing requests with screen
 * performance. No-op when Sentry is unavailable.
 *
 * @param url      Request URL (query string is preserved; sensitive path
 *                 segments should be redacted by the caller).
 * @param method   HTTP method (e.g. `'GET'`, `'POST'`).
 * @param duration Request duration in milliseconds.
 * @param status   HTTP status code (e.g. `200`, `404`, `500`).
 */
export function recordNetworkRequest(
  url: string,
  method: string,
  duration: number,
  status: number,
): void {
  if (!isSentryAvailable()) return;
  try {
    const addBreadcrumb = (Sentry as Record<string, unknown>).addBreadcrumb;
    if (typeof addBreadcrumb === 'function') {
      (addBreadcrumb as (bc: Record<string, unknown>) => void)({
        category: 'network',
        type: 'http',
        level: status >= 400 ? 'error' : 'info',
        data: {
          url,
          method: method.toUpperCase(),
          status_code: status,
          duration_ms: Math.round(duration),
        },
      });
    }
    // Attach as a measurement on the active transaction so it appears in
    // the performance dashboard alongside screen-load timings.
    setMeasurement('http.request.duration', Math.round(duration), 'millisecond');
  } catch {
    // Observability must never crash the app.
  }
}

/**
 * Record an image load's timing as a Sentry breadcrumb and a measurement on
 * the active transaction (if any). Useful for attributing slow image decodes
 * to screen-load jank. No-op when Sentry is unavailable.
 *
 * @param uri      Image URI (cache key / remote URL).
 * @param duration Load + decode duration in milliseconds.
 */
export function recordImageLoad(uri: string, duration: number): void {
  if (!isSentryAvailable()) return;
  try {
    const addBreadcrumb = (Sentry as Record<string, unknown>).addBreadcrumb;
    if (typeof addBreadcrumb === 'function') {
      (addBreadcrumb as (bc: Record<string, unknown>) => void)({
        category: 'image.load',
        type: 'info',
        level: 'info',
        data: {
          uri,
          duration_ms: Math.round(duration),
        },
      });
    }
    setMeasurement('image.load.duration', Math.round(duration), 'millisecond');
  } catch {
    // Observability must never crash the app.
  }
}

// ---------------------------------------------------------------------------
// Production per-screen performance telemetry (PostHog)
// ---------------------------------------------------------------------------

/**
 * Fraction of production sessions that send performance telemetry.
 * 0.01 = 1% — enough volume for statistical significance without
 * overwhelming PostHog or adding measurable overhead to 99% of sessions.
 */
const PRODUCTION_SAMPLE_RATE = 0.01;

/**
 * Module-level sampling decision — evaluated once per app launch so every
 * screen in the same session uses the same decision. In __DEV__ every
 * session is sampled (console logging). In production, a random 1% of
 * sessions are sampled.
 */
const isPerformanceTelemetrySampled: boolean = __DEV__
  ? true
  : Math.random() < PRODUCTION_SAMPLE_RATE;

/**
 * Whether the current session is sampled for performance telemetry.
 * Use this to gate expensive instrumentation in production.
 */
export function isPerformanceSamplingEnabled(): boolean {
  return isPerformanceTelemetrySampled;
}

/** Metrics collected for a single screen load. */
export interface ScreenPerformanceMetrics {
  /** Time to first render in milliseconds (mount → onReady). */
  screen_load_time: number;
  /** Frame drops (slow + frozen) during the measurement window. */
  frame_drop_count: number;
  /** JS-thread FPS at the end of the measurement window. */
  js_thread_fps: number;
  /** Screen transition duration in milliseconds (mount → first paint). */
  transition_duration: number;
}

/**
 * Send per-screen performance metrics to PostHog (production) or console
 * (dev). In production, the event is only sent when the session is in the
 * 1% sample — `isPerformanceTelemetrySampled`.
 *
 * The PostHog event name is `screen_performance` with properties:
 * `screen_name`, `screen_load_time`, `frame_drop_count`, `js_thread_fps`,
 * `transition_duration`.
 *
 * @param screenName  Screen/route name for attribution.
 * @param metrics     Measured performance metrics for the screen load.
 */
export function reportScreenPerformance(
  screenName: string,
  metrics: ScreenPerformanceMetrics,
): void {
  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.log(
      `[perf:${screenName}] TTFR=${metrics.screen_load_time.toFixed(0)}ms ` +
        `drops=${metrics.frame_drop_count} ` +
        `fps=${metrics.js_thread_fps} ` +
        `transition=${metrics.transition_duration.toFixed(0)}ms`,
    );
    return;
  }

  if (!isPerformanceTelemetrySampled) return;

  try {
    const { getPostHogClient } = require('../../analytics/PostHogProvider');
    const { isAnalyticsEnabled } = require('../../analytics/analyticsGate');
    const client = getPostHogClient();
    if (!client) return;
    if (!isAnalyticsEnabled()) return;
    client.capture('screen_performance', {
      screen_name: screenName,
      screen_load_time: Math.round(metrics.screen_load_time),
      frame_drop_count: metrics.frame_drop_count,
      js_thread_fps: metrics.js_thread_fps,
      transition_duration: Math.round(metrics.transition_duration),
    });
  } catch {
    // Observability must never crash the app.
  }
}
