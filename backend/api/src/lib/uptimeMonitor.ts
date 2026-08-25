/**
 * External uptime monitoring and heartbeat utilities.
 *
 * This module provides:
 *   - checkHealth() — probes all backend dependencies (DB, Redis, Meilisearch)
 *   - getUptimeStats() — aggregates uptime stats from health check results
 *   - sendHeartbeat() — sends a fire-and-forget heartbeat to an external
 *     monitoring service (UptimeRobot, Pingdom, BetterStack, etc.)
 *
 * All operations are non-blocking — failures are logged but never throw
 * into the request flow. The heartbeat URL is read from the UPTIME_MONITOR_URL
 * environment variable; if unset, heartbeats are silently skipped.
 *
 * ── PagerDuty integration ─────────────────────────────────────────────
 *
 * To wire PagerDuty as the alerting destination:
 *
 *   1. Create a PagerDuty service (Events API v2):
 *        PagerDuty → Services → New Service → Events API v2
 *
 *   2. Copy the Integration Key (routing key).
 *
 *   3. Set environment variables:
 *        PAGERDUTY_INTEGRATION_KEY=<routing-key>
 *        UPTIME_MONITOR_URL=https://events.pagerduty.com/v2/enqueue
 *
 *   4. In the health-check GitHub Actions workflow (.github/workflows/
 *      health-check.yml), set ALERT_WEBHOOK_URL to a Slack/Discord webhook
 *      for immediate team notification. PagerDuty handles escalation
 *      policies, on-call schedules, and incident management.
 *
 *   5. For programmatic PagerDuty events from the backend, POST to
 *        https://events.pagerduty.com/v2/enqueue
 *      with body:
 *        {
 *          "routing_key": "<PAGERDUTY_INTEGRATION_KEY>",
 *          "event_action": "trigger",
 *          "payload": {
 *            "summary": "ThryftVerse API health check failed",
 *            "severity": "critical",
 *            "source": "thryftverse-api"
 *          }
 *        }
 *
 *   Alternatively, use BetterStack (betterstack.com) or UptimeRobot
 *   for simpler heartbeat-based monitoring:
 *     - Set UPTIME_MONITOR_URL to the heartbeat URL provided by the service.
 *     - The service alerts if it stops receiving heartbeats within the
 *       configured grace period.
 */

import { db } from '../db/pool.js';
import { redis } from './redis.js';
import { logger } from './logger.js';

interface HealthCheckResult {
  healthy: boolean;
  services: Record<string, boolean>;
}

interface UptimeStats {
  uptime: number;
  lastIncident: Date | null;
  responseTimeP95: number;
}

const UPTIME_MONITOR_URL = process.env.UPTIME_MONITOR_URL?.trim() || null;
const HEALTH_CHECK_TIMEOUT_MS = 5_000;

let lastIncidentAt: Date | null = null;
let totalChecks = 0;
let successfulChecks = 0;
let responseTimes: number[] = [];

/**
 * Check the health of all backend dependencies.
 * Returns a map of service name → healthy boolean.
 * Never throws — failures are caught and reported as unhealthy.
 */
export async function checkHealth(): Promise<HealthCheckResult> {
  const services: Record<string, boolean> = {};
  const start = Date.now();

  try {
    const result = await db.query('SELECT 1');
    services.database = result.rowCount !== null;
  } catch {
    services.database = false;
  }

  try {
    const pong = await redis?.ping();
    services.redis = pong === 'PONG';
  } catch {
    services.redis = false;
  }

  try {
    const meiliUrl = process.env.MEILISEARCH_URL?.trim();
    if (meiliUrl) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT_MS);
      try {
        const response = await fetch(`${meiliUrl}/health`, {
          signal: controller.signal,
        });
        services.meilisearch = response.ok;
      } finally {
        clearTimeout(timeout);
      }
    } else {
      services.meilisearch = true;
    }
  } catch {
    services.meilisearch = false;
  }

  const elapsed = Date.now() - start;
  const healthy = Object.values(services).every((v) => v === true);

  totalChecks += 1;
  responseTimes.push(elapsed);
  if (responseTimes.length > 1000) {
    responseTimes = responseTimes.slice(-1000);
  }

  if (healthy) {
    successfulChecks += 1;
  } else {
    lastIncidentAt = new Date();
  }

  return { healthy, services };
}

/**
 * Get aggregated uptime statistics.
 * Returns uptime percentage, last incident time, and P95 response time.
 */
export async function getUptimeStats(): Promise<UptimeStats> {
  const uptime = totalChecks > 0 ? (successfulChecks / totalChecks) * 100 : 100;

  const sortedTimes = [...responseTimes].sort((a, b) => a - b);
  const p95Index = Math.floor(sortedTimes.length * 0.95);
  const responseTimeP95 = sortedTimes.length > 0
    ? sortedTimes[Math.min(p95Index, sortedTimes.length - 1)]
    : 0;

  return {
    uptime: Math.round(uptime * 100) / 100,
    lastIncident: lastIncidentAt,
    responseTimeP95,
  };
}

/**
 * Send a heartbeat to an external monitoring service.
 * Fire-and-forget — never throws, never blocks the caller.
 * Silently skips if UPTIME_MONITOR_URL is not set.
 */
export async function sendHeartbeat(): Promise<void> {
  if (!UPTIME_MONITOR_URL) {
    return;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT_MS);
    try {
      await fetch(UPTIME_MONITOR_URL, {
        method: 'GET',
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    logger.warn(
      { err: error, url: UPTIME_MONITOR_URL },
      'Failed to send uptime heartbeat to external monitor',
    );
  }
}

let heartbeatInterval: NodeJS.Timeout | null = null;

/**
 * Start periodic heartbeat sending. Call once at server startup.
 * Interval defaults to 60 seconds; override via UPTIME_HEARTBEAT_INTERVAL_MS.
 * No-op if UPTIME_MONITOR_URL is not configured.
 */
export function startHeartbeatLoop(): void {
  if (!UPTIME_MONITOR_URL) {
    return;
  }

  if (heartbeatInterval) {
    return;
  }

  const intervalMs = Number(process.env.UPTIME_HEARTBEAT_INTERVAL_MS) || 60_000;

  heartbeatInterval = setInterval(() => {
    void sendHeartbeat();
  }, intervalMs);

  heartbeatInterval.unref?.();
}

/**
 * Stop the periodic heartbeat loop. Call during graceful shutdown.
 */
export function stopHeartbeatLoop(): void {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
}
