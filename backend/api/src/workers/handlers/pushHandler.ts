/**
 * Push notification queue job handler.
 *
 * Extracted verbatim from `src/index.ts` (`processPushQueueJob`). Uses the
 * shared `db` pool singleton and lib modules directly so it is self-contained
 * and does not reference any `src/index.ts` local variables.
 */
import { config } from '../../config.js';
import { db } from '../../db/pool.js';
import { recordPushDelivery } from '../../lib/metrics.js';
import { publishRealtimeEvent } from '../../lib/realtime.js';
import { toJsonString } from '../../lib/workerHelpers.js';
import type { PushJobData } from '../../lib/queues.js';

export type PushHandlerDeps = {
  /** Injected for symmetry with the other handlers; push delivery uses the shared db singleton. */
};

export async function processPushQueueJob(job: PushJobData): Promise<void> {
  const devicesResult = await db.query<{
    token: string;
    provider: string;
    platform: string;
  }>(
    `
      SELECT token, provider, platform
      FROM notification_devices
      WHERE user_id = $1
        AND is_active = TRUE
      ORDER BY last_seen_at DESC
    `,
    [job.userId]
  );

  if (!devicesResult.rowCount) {
    await db.query(
      `
        UPDATE notification_events
        SET
          status = 'failed',
          provider_error = $2,
          metadata = metadata || $3::jsonb
        WHERE id = $1
      `,
      [job.eventId, 'no_active_device', toJsonString({ reason: 'No active device token' })]
    );

    recordPushDelivery({ provider: 'expo', status: 'failed' });
    return;
  }

  const expoResponses: Array<Record<string, unknown>> = [];
  let deliveredCount = 0;

  for (const device of devicesResult.rows) {
    try {
      const response = await fetch(config.expoPushApiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: toJsonString({
          to: device.token,
          title: job.title,
          body: job.body,
          channelId: config.pushDefaultChannel,
          data: {
            ...(job.payload ?? {}),
            eventId: job.eventId,
            eventType: job.eventType ?? 'generic',
            actorUserId: job.actorUserId ?? null,
            route: job.route ?? null,
          },
        }),
      });

      const payload = response.ok
        ? (await response.json() as Record<string, unknown>)
        : { error: `http_${response.status}` };

      expoResponses.push({
        token: device.token,
        provider: device.provider,
        platform: device.platform,
        response: payload,
        ok: response.ok,
      });

      if (response.ok) {
        deliveredCount += 1;
      }
    } catch (error) {
      expoResponses.push({
        token: device.token,
        provider: device.provider,
        platform: device.platform,
        ok: false,
        error: (error as Error).message,
      });
    }
  }

  const status = deliveredCount > 0 ? 'sent' : 'failed';

  await db.query(
    `
      UPDATE notification_events
      SET
        status = $2,
        sent_at = CASE WHEN $2 = 'sent' THEN NOW() ELSE sent_at END,
        provider_message_id = COALESCE(provider_message_id, $3),
        provider_error = CASE WHEN $2 = 'failed' THEN $4 ELSE NULL END,
        metadata = metadata || $5::jsonb
      WHERE id = $1
    `,
    [
      job.eventId,
      status,
      deliveredCount > 0 ? `expo:${job.eventId}` : null,
      deliveredCount > 0 ? null : 'delivery_failed',
      toJsonString({
        providerResponses: expoResponses,
      }),
    ]
  );

  recordPushDelivery({
    provider: 'expo',
    status: deliveredCount > 0 ? 'sent' : 'failed',
  });

  publishRealtimeEvent({
    topic: `notifications.user:${job.userId}`,
    type: deliveredCount > 0 ? 'notification.sent' : 'notification.failed',
    userId: job.userId,
    payload: {
      id: job.eventId,
      title: job.title,
      body: job.body,
      deliveredCount,
    },
  });
}
