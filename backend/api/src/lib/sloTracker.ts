/**
 * SLO (Service Level Objective) and error budget tracking.
 *
 * Default SLO: 99.9% availability (43.2 minutes downtime per 30-day month).
 * Error budget: 0.1% of requests can fail before the budget is exhausted.
 *
 * Uses Redis for a rolling 30-day window of request/error counts per
 * service. Counts are written into per-day bucket keys
 * (`slo:<service>:<YYYY-MM-DD>:total|errors|latency_sum`, UTC) that each
 * expire after the window — reads sum the trailing 30 day-buckets, so a
 * continuously-hit service reports a true rolling window instead of a
 * lifetime total whose TTL renews on every request. Falls back to in-memory
 * tracking if Redis is unavailable, so the tracker degrades gracefully
 * without crashing the server.
 *
 * Wired in src/index.ts: the `onResponse` hook records every completed
 * request (service = first route segment, e.g. "listings", "payments"),
 * and routes/health.ts exposes `GET /metrics/slo` behind the same
 * `docsAuthHook` admin gate as `/metrics`.
 */

import { redis } from './redis.js';
import { logger } from './logger.js';

const DEFAULT_SLO = 99.9;
const WINDOW_DAYS = 30;
const WINDOW_SECONDS = WINDOW_DAYS * 24 * 60 * 60;
const REDIS_KEY_PREFIX = 'slo:';
const DAY_KEY_SUFFIX = /^(.+):(\d{4}-\d{2}-\d{2}):(total|errors|latency_sum)$/;

function utcDay(offsetDays = 0): string {
  return new Date(Date.now() - offsetDays * 86_400_000).toISOString().slice(0, 10);
}

function trailingWindowDays(count: number): string[] {
  const days: string[] = [];
  for (let i = 0; i < count; i++) {
    days.push(utcDay(i));
  }
  return days;
}

interface ServiceStats {
  totalRequests: number;
  errorCount: number;
  errorRate: number;
  actualAvailability: number;
  budgetRemaining: number;
  slo: number;
}

interface ErrorBudget {
  consumed: number;
  remaining: number;
  percentage: number;
}

interface SloReport {
  slo: number;
  windowDays: number;
  services: Record<string, ServiceStats>;
  errorBudget: ErrorBudget;
  generatedAt: string;
}

interface InMemoryBucket {
  totalRequests: number;
  errorCount: number;
  latencies: number[];
}

class SloTracker {
  private readonly slo: number;
  private readonly windowSeconds: number;
  private readonly inMemory: Map<string, InMemoryBucket> = new Map();
  private redisAvailable = true;

  constructor(slo: number = DEFAULT_SLO, windowSeconds: number = WINDOW_SECONDS) {
    this.slo = slo;
    this.windowSeconds = windowSeconds;
  }

  /**
   * Record a request result for a service.
   * Updates Redis counters (sliding window) or falls back to in-memory.
   * Never throws — tracking failures are logged and swallowed.
   */
  recordRequest(service: string, success: boolean, latencyMs: number): void {
    const normalizedService = service || 'unknown';

    try {
      if (this.redisAvailable) {
        void this.recordRedis(normalizedService, success, latencyMs);
      } else {
        this.recordInMemory(normalizedService, success, latencyMs);
      }
    } catch (error) {
      logger.warn(
        { err: error, service: normalizedService },
        'SLO tracker: failed to record request, falling back to in-memory',
      );
      this.redisAvailable = false;
      this.recordInMemory(normalizedService, success, latencyMs);
    }
  }

  private async recordRedis(service: string, success: boolean, latencyMs: number): Promise<void> {
    try {
      // Per-day bucket keys. The bucket TTL is garbage collection only —
      // the rolling window is defined by which day-buckets are READ, so a
      // renewed TTL on a hot service merely keeps the day's bucket alive a
      // little longer; it can never inflate the reported window.
      const day = utcDay();
      const totalKey = `${REDIS_KEY_PREFIX}${service}:${day}:total`;
      const errorKey = `${REDIS_KEY_PREFIX}${service}:${day}:errors`;
      const latencyKey = `${REDIS_KEY_PREFIX}${service}:${day}:latency_sum`;

      const pipeline = redis.multi();
      const bucketTtl = this.windowSeconds + 24 * 60 * 60;
      pipeline.incr(totalKey);
      pipeline.expire(totalKey, bucketTtl);
      if (!success) {
        pipeline.incr(errorKey);
        pipeline.expire(errorKey, bucketTtl);
      }
      pipeline.incrby(latencyKey, Math.round(latencyMs));
      pipeline.expire(latencyKey, bucketTtl);
      await pipeline.exec();
    } catch (error) {
      logger.warn(
        { err: error, service },
        'SLO tracker: Redis unavailable, switching to in-memory fallback',
      );
      this.redisAvailable = false;
      this.recordInMemory(service, success, latencyMs);
    }
  }

  private recordInMemory(service: string, success: boolean, latencyMs: number): void {
    let bucket = this.inMemory.get(service);
    if (!bucket) {
      bucket = { totalRequests: 0, errorCount: 0, latencies: [] };
      this.inMemory.set(service, bucket);
    }
    bucket.totalRequests += 1;
    if (!success) {
      bucket.errorCount += 1;
    }
    bucket.latencies.push(latencyMs);
    if (bucket.latencies.length > 10_000) {
      bucket.latencies = bucket.latencies.slice(-10_000);
    }
  }

  /**
   * Get the overall error budget status.
   * Returns consumed, remaining, and percentage of budget remaining.
   */
  async getErrorBudget(): Promise<ErrorBudget> {
    const allServices = await this.getAllServiceStats();
    let totalRequests = 0;
    let totalErrors = 0;

    for (const stats of Object.values(allServices)) {
      totalRequests += stats.totalRequests;
      totalErrors += stats.errorCount;
    }

    if (totalRequests === 0) {
      return { consumed: 0, remaining: 1, percentage: 100 };
    }

    const errorRate = totalErrors / totalRequests;
    const allowedErrorRate = (100 - this.slo) / 100;
    const consumed = Math.min(errorRate / allowedErrorRate, 1);
    const remaining = Math.max(1 - consumed, 0);

    return {
      consumed: Math.round(consumed * 10000) / 10000,
      remaining: Math.round(remaining * 10000) / 10000,
      percentage: Math.round(remaining * 10000) / 100,
    };
  }

  /**
   * Get SLO status for a specific service.
   */
  async getSloStatus(service: string): Promise<ServiceStats> {
    return this.getServiceStats(service);
  }

  /**
   * Generate a full SLO report for all tracked services.
   * Suitable for a /metrics/slo endpoint.
   */
  async getReport(): Promise<SloReport> {
    const services = await this.getAllServiceStats();
    const errorBudget = await this.getErrorBudget();

    return {
      slo: this.slo,
      windowDays: WINDOW_DAYS,
      services,
      errorBudget,
      generatedAt: new Date().toISOString(),
    };
  }

  private async getServiceStats(service: string): Promise<ServiceStats> {
    if (this.redisAvailable) {
      try {
        // Sum the trailing day-buckets covering the rolling window.
        const days = trailingWindowDays(Math.max(1, Math.ceil(this.windowSeconds / 86_400)));
        const keys = days.flatMap((day) => [
          `${REDIS_KEY_PREFIX}${service}:${day}:total`,
          `${REDIS_KEY_PREFIX}${service}:${day}:errors`,
        ]);
        const values = await redis.mget(...keys);

        let totalRequests = 0;
        let errorCount = 0;
        for (let i = 0; i < days.length; i++) {
          totalRequests += Number(values[i * 2]) || 0;
          errorCount += Number(values[i * 2 + 1]) || 0;
        }

        return this.computeStats(totalRequests, errorCount);
      } catch (error) {
        logger.warn(
          { err: error, service },
          'SLO tracker: Redis read failed, using in-memory data',
        );
        this.redisAvailable = false;
      }
    }

    const bucket = this.inMemory.get(service);
    if (!bucket) {
      return this.computeStats(0, 0);
    }
    return this.computeStats(bucket.totalRequests, bucket.errorCount);
  }

  private async getAllServiceStats(): Promise<Record<string, ServiceStats>> {
    const services = new Set<string>();

    if (this.redisAvailable) {
      try {
        const keys = await redis.keys(`${REDIS_KEY_PREFIX}*:total`);
        for (const key of keys) {
          // Bucket keys are slo:<service>:<YYYY-MM-DD>:total; also accept a
          // legacy non-bucketed slo:<service>:total so in-flight counters
          // from an older deploy still resolve to their service name.
          const suffix = key.slice(REDIS_KEY_PREFIX.length);
          const bucketMatch = DAY_KEY_SUFFIX.exec(suffix);
          services.add(bucketMatch ? bucketMatch[1] : suffix.replace(/:total$/, ''));
        }
      } catch (error) {
        logger.warn(
          { err: error },
          'SLO tracker: Redis keys scan failed, using in-memory services',
        );
        this.redisAvailable = false;
      }
    }

    for (const service of this.inMemory.keys()) {
      services.add(service);
    }

    const result: Record<string, ServiceStats> = {};
    for (const service of services) {
      result[service] = await this.getServiceStats(service);
    }
    return result;
  }

  private computeStats(totalRequests: number, errorCount: number): ServiceStats {
    const errorRate = totalRequests > 0 ? errorCount / totalRequests : 0;
    const actualAvailability = totalRequests > 0
      ? ((totalRequests - errorCount) / totalRequests) * 100
      : 100;
    const allowedErrorRate = (100 - this.slo) / 100;
    const budgetConsumed = totalRequests > 0
      ? Math.min(errorRate / allowedErrorRate, 1)
      : 0;
    const budgetRemaining = Math.max(1 - budgetConsumed, 0);

    return {
      totalRequests,
      errorCount,
      errorRate: Math.round(errorRate * 10000) / 10000,
      actualAvailability: Math.round(actualAvailability * 10000) / 10000,
      budgetRemaining: Math.round(budgetRemaining * 10000) / 10000,
      slo: this.slo,
    };
  }
}

let trackerInstance: SloTracker | null = null;

/**
 * Get the singleton SLO tracker instance.
 */
export function getSloTracker(): SloTracker {
  if (!trackerInstance) {
    trackerInstance = new SloTracker();
  }
  return trackerInstance;
}

/**
 * Generate a full SLO report for all tracked services.
 * Convenience wrapper around the singleton tracker.
 */
export async function getSloReport(): Promise<SloReport> {
  return getSloTracker().getReport();
}

export { SloTracker };
