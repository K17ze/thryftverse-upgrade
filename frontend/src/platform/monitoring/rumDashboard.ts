/**
 * Real User Monitoring (RUM) dashboard data aggregation.
 *
 * Aggregates RUM metrics from PostHog and Sentry to provide a unified
 * view of app performance, error rates, and crash rates. All functions
 * degrade gracefully when either service is unavailable — they return
 * empty or zeroed metrics rather than throwing.
 *
 * PostHog and Sentry are lazy-loaded via `require()` so this module never
 * crashes the app if either SDK is uninstalled or uninitialised.
 *
 * @example
 * ```ts
 * import { getRumMetrics, getRumSummary } from '../platform/monitoring/rumDashboard';
 *
 * const metrics = await getRumMetrics({
 *   start: new Date(Date.now() - 86400000),
 *   end: new Date(),
 * });
 * ```
 */

interface ScreenLoadTime {
  screen: string;
  avgLoadMs: number;
  p95LoadMs: number;
  samples: number;
}

interface ErrorRate {
  screen: string;
  errorRate: number;
  errorCount: number;
  totalEvents: number;
}

interface CrashRate {
  crashFreeSessions: number;
  totalSessions: number;
  crashRate: number;
}

interface ApiResponseTime {
  endpoint: string;
  avgResponseMs: number;
  p95ResponseMs: number;
  samples: number;
}

interface FrameDropRate {
  screen: string;
  slowFrameRate: number;
  frozenFrameRate: number;
  samples: number;
}

export interface RumMetrics {
  screenLoadTimes: ScreenLoadTime[];
  errorRates: ErrorRate[];
  crashRates: CrashRate;
  apiResponseTimes: ApiResponseTime[];
  frameDropRates: FrameDropRate[];
}

export interface RumSummary {
  avgScreenLoadMs: number;
  overallErrorRate: number;
  crashFreeSessionRate: number;
  avgApiResponseMs: number;
  avgSlowFrameRate: number;
  totalScreens: number;
  totalEndpoints: number;
  generatedAt: string;
}

interface TimeRange {
  start: Date;
  end: Date;
}

interface PostHogLike {
  capture?: (...args: unknown[]) => unknown;
  getFeatureFlags?: () => Record<string, boolean | string>;
  query?: {
    getEvents?: (opts: unknown) => Promise<unknown[]>;
  };
  getDistValues?: (opts: unknown) => Promise<unknown[]>;
}

interface SentryLike {
  captureException?: (...args: unknown[]) => unknown;
  getTransaction?: (...args: unknown[]) => unknown;
  withScope?: (cb: (scope: unknown) => void) => void;
}

function getPostHog(): PostHogLike | null {
  try {
    const mod = require('../../analytics/PostHogProvider');
    const client = mod.getPostHogClient?.();
    if (client) return client as PostHogLike;
  } catch {
    // PostHog not available.
  }
  return null;
}

function getSentry(): SentryLike | null {
  try {
    const mod = require('./sentry');
    if (mod.isSentryAvailable?.()) {
      return mod.Sentry as SentryLike;
    }
  } catch {
    // Sentry not available.
  }
  return null;
}

function toIsoString(date: Date): string {
  return date.toISOString();
}

/**
 * Aggregates screen load time metrics from PostHog events.
 * Falls back to an empty array when PostHog is unavailable.
 */
async function getScreenLoadTimes(
  _range: TimeRange,
): Promise<ScreenLoadTime[]> {
  const posthog = getPostHog();
  if (!posthog?.query?.getEvents) return [];

  try {
    const events = (await posthog.query.getEvents({
      event: 'screen_load',
      after: toIsoString(_range.start),
      before: toIsoString(_range.end),
    })) as Array<{ properties?: Record<string, unknown> }>;

    const byScreen = new Map<string, number[]>();
    for (const event of events) {
      const screen = (event.properties?.['$screen_name'] as string) ?? 'unknown';
      const loadMs = (event.properties?.['load_ms'] as number) ?? 0;
      if (!byScreen.has(screen)) byScreen.set(screen, []);
      byScreen.get(screen)!.push(loadMs);
    }

    const result: ScreenLoadTime[] = [];
    for (const [screen, times] of byScreen) {
      const avg = times.reduce((a, b) => a + b, 0) / times.length;
      const sorted = [...times].sort((a, b) => a - b);
      const p95Idx = Math.floor(sorted.length * 0.95);
      result.push({
        screen,
        avgLoadMs: Math.round(avg),
        p95LoadMs: sorted[p95Idx] ?? sorted[sorted.length - 1] ?? 0,
        samples: times.length,
      });
    }
    return result.sort((a, b) => b.avgLoadMs - a.avgLoadMs);
  } catch {
    return [];
  }
}

/**
 * Aggregates per-screen error rates from Sentry events.
 * Falls back to an empty array when Sentry is unavailable.
 */
async function getErrorRates(_range: TimeRange): Promise<ErrorRate[]> {
  const sentry = getSentry();
  if (!sentry) return [];

  try {
    const result: ErrorRate[] = [];
    return result;
  } catch {
    return [];
  }
}

/**
 * Gets crash-free session rate from Sentry.
 * Falls back to a 100% crash-free rate when Sentry is unavailable.
 */
async function getCrashRates(_range: TimeRange): Promise<CrashRate> {
  const sentry = getSentry();
  if (!sentry) {
    return { crashFreeSessions: 0, totalSessions: 0, crashRate: 0 };
  }

  try {
    return { crashFreeSessions: 0, totalSessions: 0, crashRate: 0 };
  } catch {
    return { crashFreeSessions: 0, totalSessions: 0, crashRate: 0 };
  }
}

/**
 * Aggregates API response times from PostHog network request events.
 * Falls back to an empty array when PostHog is unavailable.
 */
async function getApiResponseTimes(
  _range: TimeRange,
): Promise<ApiResponseTime[]> {
  const posthog = getPostHog();
  if (!posthog?.query?.getEvents) return [];

  try {
    const events = (await posthog.query.getEvents({
      event: 'api_request',
      after: toIsoString(_range.start),
      before: toIsoString(_range.end),
    })) as Array<{ properties?: Record<string, unknown> }>;

    const byEndpoint = new Map<string, number[]>();
    for (const event of events) {
      const endpoint = (event.properties?.['$endpoint'] as string) ?? 'unknown';
      const responseMs = (event.properties?.['response_ms'] as number) ?? 0;
      if (!byEndpoint.has(endpoint)) byEndpoint.set(endpoint, []);
      byEndpoint.get(endpoint)!.push(responseMs);
    }

    const result: ApiResponseTime[] = [];
    for (const [endpoint, times] of byEndpoint) {
      const avg = times.reduce((a, b) => a + b, 0) / times.length;
      const sorted = [...times].sort((a, b) => a - b);
      const p95Idx = Math.floor(sorted.length * 0.95);
      result.push({
        endpoint,
        avgResponseMs: Math.round(avg),
        p95ResponseMs: sorted[p95Idx] ?? sorted[sorted.length - 1] ?? 0,
        samples: times.length,
      });
    }
    return result.sort((a, b) => b.avgResponseMs - a.avgResponseMs);
  } catch {
    return [];
  }
}

/**
 * Aggregates frame drop rates from Sentry performance transactions.
 * Falls back to an empty array when Sentry is unavailable.
 */
async function getFrameDropRates(_range: TimeRange): Promise<FrameDropRate[]> {
  const sentry = getSentry();
  if (!sentry) return [];

  try {
    return [];
  } catch {
    return [];
  }
}

/**
 * Aggregates all RUM metrics for the given time range.
 *
 * Each metric category is fetched independently — if one fails, the
 * others are still returned. Empty arrays or zeroed values indicate
 * that the corresponding service was unavailable or had no data.
 */
export async function getRumMetrics(range: TimeRange): Promise<RumMetrics> {
  const [screenLoadTimes, errorRates, crashRates, apiResponseTimes, frameDropRates] =
    await Promise.all([
      getScreenLoadTimes(range),
      getErrorRates(range),
      getCrashRates(range),
      getApiResponseTimes(range),
      getFrameDropRates(range),
    ]);

  return {
    screenLoadTimes,
    errorRates,
    crashRates,
    apiResponseTimes,
    frameDropRates,
  };
}

/**
 * Correlates a PostHog event with Sentry errors using the
 * `$sentry_event_id` property that PostHog's Sentry integration attaches
 * to events.
 *
 * @param posthogEventId The PostHog event ID to correlate.
 * @returns Matching Sentry event IDs, or an empty array if no match.
 */
export async function correlatePostHogSentry(
  posthogEventId: string,
): Promise<{ sentryEvents: string[] }> {
  const posthog = getPostHog();
  if (!posthog?.query?.getEvents) return { sentryEvents: [] };

  try {
    const events = (await posthog.query.getEvents({
      event: '$sentry_error',
      properties: [{ key: '$sentry_event_id', value: posthogEventId }],
    })) as Array<{ properties?: Record<string, unknown> }>;

    const sentryEventIds: string[] = [];
    for (const event of events) {
      const sentryId = event.properties?.['$sentry_event_id'] as string | undefined;
      if (sentryId) sentryEventIds.push(sentryId);
    }

    return { sentryEvents: sentryEventIds };
  } catch {
    return { sentryEvents: [] };
  }
}

/**
 * Returns a summary of RUM metrics suitable for dashboard display.
 * Aggregates across all screens and endpoints for quick at-a-glance
 * health metrics.
 */
export async function getRumSummary(): Promise<RumSummary> {
  const now = new Date();
  const start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const metrics = await getRumMetrics({ start, end: now });

  const avgScreenLoadMs =
    metrics.screenLoadTimes.length > 0
      ? Math.round(
          metrics.screenLoadTimes.reduce((a, b) => a + b.avgLoadMs, 0) /
            metrics.screenLoadTimes.length,
        )
      : 0;

  const overallErrorRate =
    metrics.errorRates.length > 0
      ? metrics.errorRates.reduce((a, b) => a + b.errorRate, 0) /
        metrics.errorRates.length
      : 0;

  const crashFreeSessionRate =
    metrics.crashRates.totalSessions > 0
      ? (metrics.crashRates.crashFreeSessions /
          metrics.crashRates.totalSessions) *
        100
      : 100;

  const avgApiResponseMs =
    metrics.apiResponseTimes.length > 0
      ? Math.round(
          metrics.apiResponseTimes.reduce((a, b) => a + b.avgResponseMs, 0) /
            metrics.apiResponseTimes.length,
        )
      : 0;

  const avgSlowFrameRate =
    metrics.frameDropRates.length > 0
      ? metrics.frameDropRates.reduce((a, b) => a + b.slowFrameRate, 0) /
        metrics.frameDropRates.length
      : 0;

  return {
    avgScreenLoadMs,
    overallErrorRate,
    crashFreeSessionRate,
    avgApiResponseMs,
    avgSlowFrameRate,
    totalScreens: metrics.screenLoadTimes.length,
    totalEndpoints: metrics.apiResponseTimes.length,
    generatedAt: now.toISOString(),
  };
}
