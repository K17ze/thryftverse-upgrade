import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Redis } from 'ioredis';
import type { Pool } from 'pg';
import { z } from 'zod';

type AnalyticsRouteDependencies = {
  app: FastifyInstance;
  db: Pool;
  redis: Redis;
  createApiError: (code: string, message: string, details?: Record<string, unknown>) => Error;
  resolveAuthenticatedUserId: (request: FastifyRequest, requestedUserId?: string) => string;
};

const ANALYTICS_ENVELOPE_VERSION = '1.0';

const PII_KEY_FRAGMENTS = [
  'email', 'phone', 'address', 'name', 'username', 'password',
  'token', 'avatar', 'bio', 'dob', 'birthdate', 'ssn', 'national',
  'passport', 'device', 'ip', 'lat', 'lon', 'latitude', 'longitude',
];

function scrubPIIServerSide(properties: Record<string, unknown>): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {};
  for (const key of Object.keys(properties)) {
    const lowerKey = key.toLowerCase();
    if (PII_KEY_FRAGMENTS.some((fragment) => lowerKey.includes(fragment))) {
      continue;
    }
    cleaned[key] = properties[key];
  }
  return cleaned;
}

const KNOWN_EVENT_NAMES = new Set([
  'screen_view', 'item_viewed', 'item_favorited', 'item_shared',
  'search_performed', 'search_result_tapped', 'filter_applied',
  'auction_bid_placed', 'auction_viewed', 'order_placed', 'order_completed',
  'checkout_started', 'checkout_abandoned', 'purchase_completed',
  'listing_created', 'listing_published', 'offer_submitted',
  'user_signed_up', 'user_logged_in', 'user_logged_out', 'profile_viewed',
  'seller_dashboard_viewed', 'follow_toggled', 'message_sent',
  'voice_message_sent', 'wallet_viewed', 'withdrawal_initiated',
  'biometric_login_attempted', 'biometric_login_success', 'biometric_login_cancelled',
  'onboarding_completed', 'age_verification_completed',
  'push_notification_tapped', 'push_notification_received', 'deep_link_opened',
  'feature_flag_evaluated', 'flag_killed', 'share_initiated', 'share_completed',
  'live_stream_viewed', 'live_stream_joined', 'live_bid_placed',
  'look_created', 'look_viewed', 'moodboard_created', 'collection_created',
  'review_written', 'report_submitted', 'screenshot_taken',
  'funnel_step', 'feature_usage', 'button_tap',
]);

const batchSchema = z.object({
  events: z.array(
    z.object({
      event: z.string().min(1).max(100),
      session_id: z.string().max(160).optional(),
      timestamp: z.string().max(40).optional(),
      payload: z.record(z.unknown()).default({}),
    }),
  ).min(1).max(100),
});

function ensureAdmin(
  request: FastifyRequest,
  createApiError: AnalyticsRouteDependencies['createApiError'],
): void {
  if (!request.authUser || request.authUser.role !== 'admin') {
    throw createApiError('FORBIDDEN', 'Admin access required');
  }
}

export const registerAnalyticsRoutes = ({
  app,
  db,
  redis,
  createApiError,
  resolveAuthenticatedUserId,
}: AnalyticsRouteDependencies) => {
  app.post('/analytics/events/batch', async (request, reply) => {
    const payload = batchSchema.parse(request.body);
    const userId = request.authUser?.userId ?? null;
    const eventTime = new Date().toISOString();
    let accepted = 0;

    const redisPipeline = redis.multi();
    for (const evt of payload.events) {
      if (!KNOWN_EVENT_NAMES.has(evt.event)) {
        request.log.warn({ event: evt.event }, 'Unknown analytics event name received in batch — forwarding for compatibility');
      }
      const safePayload = scrubPIIServerSide(evt.payload);
      const eventKey = `analytics:${evt.event}`;
      redisPipeline.lpush(eventKey, JSON.stringify({ ...safePayload, userId, ts: eventTime }));
      redisPipeline.ltrim(eventKey, 0, 999);
      accepted++;
    }
    try {
      await redisPipeline.exec();
    } catch (error) {
      request.log.warn(
        { err: error },
        'Analytics batch Redis write failed — continuing with Postgres durable write',
      );
    }

    const durableWrites = payload.events.map((evt) => {
      const safePayload = scrubPIIServerSide(evt.payload);
      const properties: Record<string, unknown> = { ...safePayload };
      if (evt.session_id) properties.session_id = evt.session_id;
      return db
        .query(
          `INSERT INTO analytics_events (
             event_name, schema_version, event_time, actor_user_id,
             session_id, request_id, surface, properties
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
          [
            evt.event,
            ANALYTICS_ENVELOPE_VERSION,
            evt.timestamp ?? eventTime,
            userId,
            evt.session_id ?? null,
            request.id,
            typeof safePayload.surface === 'string' ? safePayload.surface : null,
            JSON.stringify(properties),
          ],
        )
        .catch((error) => {
          request.log.error(
            { err: error, event: evt.event, userId },
            'Analytics durable write (Postgres analytics_events) failed — non-fatal, event may be lost',
          );
        });
    });
    void Promise.allSettled(durableWrites);

    reply.code(202);
    return { ok: true, accepted };
  });

  app.delete('/analytics/events/user/:userId', async (request, reply) => {
    ensureAdmin(request, createApiError);
    const paramsSchema = z.object({ userId: z.string().min(2) });
    const { userId } = paramsSchema.parse(request.params);

    const result = await db.query(
      'DELETE FROM analytics_events WHERE actor_user_id = $1',
      [userId],
    );

    try {
      const keys = await redis.keys('analytics:*');
      if (keys.length > 0) {
        for (const key of keys) {
          const entries = await redis.lrange(key, 0, -1);
          const filtered = entries.filter((entry) => {
            try {
              const parsed = JSON.parse(entry) as { userId?: string };
              return parsed.userId !== userId;
            } catch {
              return true;
            }
          });
          if (filtered.length !== entries.length) {
            await redis.del(key);
            if (filtered.length > 0) {
              await redis.rpush(key, ...filtered);
            }
          }
        }
      }
    } catch (error) {
      request.log.warn(
        { err: error, userId },
        'Analytics Redis cleanup for user deletion failed — non-fatal',
      );
    }

    request.log.info(
      { userId, deletedCount: result.rowCount, adminId: request.authUser?.userId },
      'Analytics events deleted for user (GDPR)',
    );

    return { ok: true, deleted_count: result.rowCount ?? 0 };
  });

  app.post('/analytics/events/retention/sweep', async (request, reply) => {
    ensureAdmin(request, createApiError);
    resolveAuthenticatedUserId(request);

    const policy = await db.query<{
      retention_days: number;
      last_swept_at: string | null;
    }>(
      `SELECT retention_days, last_swept_at FROM analytics_event_retention
       WHERE policy_name = 'analytics_events' AND enabled = true`,
    );

    if (policy.rows.length === 0) {
      return { ok: true, dropped_partitions: [], next_due: null };
    }

    const retentionDays = policy.rows[0].retention_days;
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    const droppedPartitions: string[] = [];

    const partitions = await db.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables
       WHERE tablename LIKE 'analytics_events_20%'
       ORDER BY tablename`,
    );

    for (const row of partitions.rows) {
      const match = row.tablename.match(/^analytics_events_(\d{4})_(\d{2})$/);
      if (!match) continue;
      const partitionDate = new Date(`${match[1]}-${match[2]}-01T00:00:00Z`);
      if (partitionDate < cutoff) {
        await db.query(`DROP TABLE IF EXISTS ${row.tablename}`);
        droppedPartitions.push(row.tablename);
      }
    }

    await db.query(
      `UPDATE analytics_event_retention SET last_swept_at = NOW() WHERE policy_name = 'analytics_events'`,
    );

    const nextDue = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    request.log.info(
      { droppedPartitions, retentionDays, cutoff: cutoff.toISOString() },
      'Analytics retention sweep completed',
    );

    return { ok: true, dropped_partitions: droppedPartitions, next_due: nextDue };
  });

  app.get('/analytics/events/retention/policy', async (request) => {
    ensureAdmin(request, createApiError);
    resolveAuthenticatedUserId(request);

    const result = await db.query(
      `SELECT policy_name, retention_days, last_swept_at, enabled
       FROM analytics_event_retention ORDER BY policy_name`,
    );

    return { ok: true, policies: result.rows };
  });
};
