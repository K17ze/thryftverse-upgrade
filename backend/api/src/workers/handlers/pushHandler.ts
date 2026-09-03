/**
 * Push notification queue job handler.
 *
 * Extracted verbatim from `src/index.ts` (`processPushQueueJob`). Uses the
 * shared `db` pool singleton and lib modules directly so it is self-contained
 * and does not reference any `src/index.ts` local variables.
 */
import { config } from '../../config.js';
import { db } from '../../db/pool.js';
import { recordPushDelivery, recordPushTicketError } from '../../lib/metrics.js';
import { publishRealtimeEvent } from '../../lib/realtime.js';
import { toJsonString, mapEventTypeToChannelId, mapEventTypeToInterruptionLevel, mapEventTypeToRelevanceScore, mapEventToPushCategory } from '../../lib/workerHelpers.js';
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
  const ticketIdTokenPairs: Array<{ ticketId: string; token: string }> = [];
  const tokensToRevoke: string[] = [];
  let ticketedCount = 0;
  let ticketErrorCount = 0;

  // Preview policy enforcement — transform title/body based on user preference.
  // 'full': show actual title and body (default)
  // 'sender_only': show title but replace body with generic text
  // 'hidden': replace both title and body with generic text
  let pushTitle = job.title;
  let pushBody = job.body;
  const previewCategory = mapEventToPushCategory(job.eventType ?? 'generic');
  if (previewCategory) {
    const previewResult = await db.query<{ preview_policy: string }>(
      `SELECT preview_policy FROM notification_preferences WHERE user_id = $1 AND category = $2 LIMIT 1`,
      [job.userId, previewCategory]
    );
    const policy = previewResult.rows[0]?.preview_policy ?? 'full';
    if (policy === 'hidden') {
      pushTitle = 'New notification';
      pushBody = 'Tap to view';
    } else if (policy === 'sender_only') {
      pushBody = 'New message';
    }
  }

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
          title: pushTitle,
          body: pushBody,
          // P0 FIX: Map event type to the correct Android channel ID.
          // Previously all notifications went to 'default', ignoring the
          // per-category channels the user configured on their device.
          channelId: mapEventTypeToChannelId(job.eventType ?? 'generic'),
          // iOS interruption level — timeSensitive breaks through Focus
          interruptionLevel: mapEventTypeToInterruptionLevel(job.eventType ?? 'generic'),
          // iOS relevance score for Notification Summary ranking (0.0–1.0)
          relevanceScore: mapEventTypeToRelevanceScore(job.eventType ?? 'generic'),
          data: {
            ...(job.payload ?? {}),
            eventId: job.eventId,
            eventType: job.eventType ?? 'generic',
            actorUserId: job.actorUserId ?? null,
            route: job.route ?? null,
          },
        }),
      });

      if (!response.ok) {
        // HTTP 4xx/5xx — entire request failed for this device
        expoResponses.push({
          token: device.token,
          provider: device.provider,
          platform: device.platform,
          ok: false,
          error: `http_${response.status}`,
        });
        ticketErrorCount += 1;
        continue;
      }

      const payload = (await response.json()) as Record<string, unknown>;
      // Expo returns { data: [tickets...] } for array sends, or { data: ticket }
      // for single sends. We send one per device, so data is a single ticket
      // or an array with one element.
      const tickets = Array.isArray(payload.data) ? payload.data : [payload.data];

      for (const ticket of tickets) {
        const t = ticket as Record<string, unknown>;
        const ticketStatus = t.status as string;
        const ticketId = t.id as string | undefined;
        const ticketMessage = t.message as string | undefined;
        const ticketDetails = t.details as Record<string, unknown> | undefined;
        const ticketError = ticketDetails?.error as string | undefined;

        expoResponses.push({
          token: device.token,
          provider: device.provider,
          platform: device.platform,
          ticketStatus,
          ticketId: ticketId ?? null,
          message: ticketMessage ?? null,
          error: ticketError ?? null,
          ok: ticketStatus === 'ok',
        });

        if (ticketStatus === 'ok' && ticketId) {
          ticketIdTokenPairs.push({ ticketId, token: device.token });
          ticketedCount += 1;
        } else {
          ticketErrorCount += 1;
          recordPushTicketError({ provider: 'expo', error: ticketError ?? 'unknown' });
          // DeviceNotRegistered — revoke the token immediately
          if (ticketError === 'DeviceNotRegistered') {
            tokensToRevoke.push(device.token);
          }
        }
      }
    } catch (error) {
      expoResponses.push({
        token: device.token,
        provider: device.provider,
        platform: device.platform,
        ok: false,
        error: (error as Error).message,
      });
      ticketErrorCount += 1;
    }
  }

  // Revoke DeviceNotRegistered tokens
  if (tokensToRevoke.length > 0) {
    await db.query(
      `UPDATE notification_devices
       SET is_active = FALSE, token_status = 'not_registered', last_seen_at = NOW()
       WHERE token = ANY($1::text[])`,
      [tokensToRevoke]
    );
  }

  // P0 FIX: Use 'ticketed' instead of 'sent'. A ticket status=ok means Expo
  // accepted the payload, NOT that the device received it. The actual delivery
  // status is only known after checking the push receipt. The event transitions
  // to 'sent' only after the receipt reconciler confirms receipt status=ok.
  const status = ticketedCount > 0 ? 'ticketed' : 'failed';
  const firstTicketId = ticketIdTokenPairs[0]?.ticketId ?? null;

  await db.query(
    `
      UPDATE notification_events
      SET
        status = $2,
        sent_at = CASE WHEN $2 = 'sent' THEN NOW() ELSE sent_at END,
        provider_message_id = COALESCE(provider_message_id, $3),
        provider_ticket_ids = $4::jsonb,
        provider_error = CASE WHEN $2 = 'failed' THEN $5 ELSE NULL END,
        metadata = metadata || $6::jsonb
      WHERE id = $1
    `,
    [
      job.eventId,
      status,
      firstTicketId,
      toJsonString(ticketIdTokenPairs),
      ticketedCount > 0 ? null : 'delivery_failed',
      toJsonString({
        providerResponses: expoResponses,
        ticketedCount,
        ticketErrorCount,
        tokensRevoked: tokensToRevoke.length,
      }),
    ]
  );

  recordPushDelivery({
    provider: 'expo',
    status: ticketedCount > 0 ? 'ticketed' : 'failed',
  });

  publishRealtimeEvent({
    topic: `notifications.user:${job.userId}`,
    type: ticketedCount > 0 ? 'notification.ticketed' : 'notification.failed',
    userId: job.userId,
    payload: {
      id: job.eventId,
      title: job.title,
      body: job.body,
      ticketedCount,
      ticketErrorCount,
    },
  });
}
