/**
 * Push notification receipt reconciliation handler.
 *
 * After Expo accepts a push payload (ticket status=ok), the event is marked
 * 'ticketed'. This handler fetches the actual push receipts from Expo to
 * determine whether APNs/FCM accepted the notification.
 *
 * Per Expo docs (August 2026):
 * - A push ticket with status=ok means Expo received the payload, NOT that
 *   the device received it.
 * - A push receipt tells you whether APNs/FCM accepted it.
 * - Receipts are available for at least 24 hours after sending.
 * - DeviceNotRegistered in a receipt means the token must be revoked.
 *
 * This handler transitions events:
 *   ticketed → sent      (receipt status=ok, provider accepted)
 *   ticketed → failed    (receipt status=error)
 *   ticketed → failed    (no receipt after 24h — expired)
 *
 * It also revokes DeviceNotRegistered tokens found in receipts.
 */
import { config } from '../../config.js';
import { db } from '../../db/pool.js';
import { recordPushDelivery } from '../../lib/metrics.js';
import { toJsonString } from '../../lib/workerHelpers.js';

const EXPO_RECEIPT_API_URL = 'https://exp.host/--/api/v2/push/getReceipts';
const MAX_RECEIPTS_PER_REQUEST = 1000;
const RECEIPT_EXPIRY_HOURS = 24;
// Expo recommends checking receipts ~15 minutes after sending. Receipts may
// not be available immediately — checking too early returns no data.
const RECEIPT_MIN_AGE_MINUTES = 15;

interface ExpoReceiptResponse {
  data?: Record<string, {
    status: 'ok' | 'error';
    message?: string;
    details?: { error?: string };
  }>;
  errors?: Array<{ code: string; message: string }>;
}

export async function processPushReceiptReconciliation(): Promise<{
  checked: number;
  confirmed: number;
  failed: number;
  expired: number;
  tokensRevoked: number;
}> {
  // Find ticketed events whose receipts haven't been checked yet.
  // We check receipts that are at least 15 seconds old (give Expo time to
  // deliver to APNs/FCM) and not older than 24 hours (receipts expire).
  const eventsResult = await db.query<{
    id: string;
    user_id: string;
    provider_ticket_ids: unknown;
    created_at: Date;
  }>(
    `
      SELECT id, user_id, provider_ticket_ids, created_at
      FROM notification_events
      WHERE status = 'ticketed'
        AND receipt_checked_at IS NULL
        AND created_at > NOW() - INTERVAL '${RECEIPT_EXPIRY_HOURS} hours'
        AND created_at < NOW() - INTERVAL '${RECEIPT_MIN_AGE_MINUTES} minutes'
      ORDER BY created_at ASC
      LIMIT 100
    `
  );

  if (!eventsResult.rowCount) {
    return { checked: 0, confirmed: 0, failed: 0, expired: 0, tokensRevoked: 0 };
  }

  // Collect all ticket IDs to check, mapped back to their events AND tokens.
  // The provider_ticket_ids JSONB stores [{ticketId, token}] pairs so the
  // receipt handler can revoke the exact token that failed — not just the
  // "most recent" device for the user.
  const ticketToInfo = new Map<string, { eventId: string; userId: string; token: string | null }>();
  const allTicketIds: string[] = [];

  for (const event of eventsResult.rows) {
    const raw = event.provider_ticket_ids;
    // Support both new format [{ticketId, token}] and legacy format [string]
    const pairs = Array.isArray(raw) ? raw : [];
    for (const pair of pairs) {
      if (typeof pair === 'string' && pair.length > 0) {
        // Legacy format: bare ticket ID string
        ticketToInfo.set(pair, { eventId: event.id, userId: event.user_id, token: null });
        allTicketIds.push(pair);
      } else if (pair && typeof pair === 'object') {
        const p = pair as { ticketId?: string; token?: string };
        if (p.ticketId && p.ticketId.length > 0) {
          ticketToInfo.set(p.ticketId, { eventId: event.id, userId: event.user_id, token: p.token ?? null });
          allTicketIds.push(p.ticketId);
        }
      }
    }
  }

  let confirmed = 0;
  let failed = 0;
  let tokensRevoked = 0;
  const tokensToRevoke: string[] = [];

  // Fetch receipts in batches of 1000
  for (let i = 0; i < allTicketIds.length; i += MAX_RECEIPTS_PER_REQUEST) {
    const batch = allTicketIds.slice(i, i + MAX_RECEIPTS_PER_REQUEST);

    try {
      const response = await fetch(EXPO_RECEIPT_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: toJsonString({ ids: batch }),
      });

      if (!response.ok) {
        // HTTP error — skip this batch, will retry on next reconciliation cycle
        continue;
      }

      const payload = (await response.json()) as ExpoReceiptResponse;
      const receipts = payload.data ?? {};

      for (const [receiptId, receipt] of Object.entries(receipts)) {
        const info = ticketToInfo.get(receiptId);
        if (!info) continue;

        if (receipt.status === 'ok') {
          // Provider (APNs/FCM) accepted the notification
          await db.query(
            `UPDATE notification_events
             SET status = 'sent', receipt_status = 'ok', receipt_checked_at = NOW()
             WHERE id = $1`,
            [info.eventId]
          );
          confirmed += 1;
        } else {
          // Receipt error — delivery failed at the provider level
          const errorCode = receipt.details?.error ?? 'unknown';
          await db.query(
            `UPDATE notification_events
             SET status = 'failed', receipt_status = 'error',
                 receipt_checked_at = NOW(),
                 provider_error = $2,
                 metadata = metadata || $3::jsonb
             WHERE id = $1`,
            [
              info.eventId,
              errorCode,
              toJsonString({ receiptMessage: receipt.message ?? null }),
            ]
          );
          failed += 1;

          if (errorCode === 'DeviceNotRegistered') {
            // P0 FIX: Revoke the EXACT token that failed, not just "most recent".
            // The token is stored alongside the ticketId in provider_ticket_ids.
            if (info.token) {
              tokensToRevoke.push(info.token);
            } else {
              // Legacy fallback: no token stored with ticket — query by user
              const deviceResult = await db.query<{ token: string }>(
                `SELECT token FROM notification_devices
                 WHERE user_id = $1 AND is_active = TRUE
                 ORDER BY last_seen_at DESC LIMIT 1`,
                [info.userId]
              );
              if (deviceResult.rows[0]) {
                tokensToRevoke.push(deviceResult.rows[0].token);
              }
            }
          }
        }
      }
    } catch {
      // Network error — skip this batch, will retry next cycle
      continue;
    }
  }

  // Revoke DeviceNotRegistered tokens
  if (tokensToRevoke.length > 0) {
    const revokeResult = await db.query(
      `UPDATE notification_devices
       SET is_active = FALSE, token_status = 'not_registered', last_seen_at = NOW()
       WHERE token = ANY($1::text[])`,
      [tokensToRevoke]
    );
    tokensRevoked = revokeResult.rowCount ?? 0;
  }

  // Mark events with no receipt found as expired (older than 24h)
  const expiredResult = await db.query(
    `UPDATE notification_events
     SET status = 'failed', receipt_status = 'expired',
         receipt_checked_at = NOW(),
         provider_error = 'receipt_expired'
     WHERE status = 'ticketed'
       AND receipt_checked_at IS NULL
       AND created_at < NOW() - INTERVAL '${RECEIPT_EXPIRY_HOURS} hours'`
  );
  const expired = expiredResult.rowCount ?? 0;

  const checked = confirmed + failed + expired;

  if (confirmed > 0) {
    recordPushDelivery({ provider: 'expo', status: 'sent' });
  }
  if (failed + expired > 0) {
    recordPushDelivery({ provider: 'expo', status: 'failed' });
  }

  return { checked, confirmed, failed, expired, tokensRevoked };
}
