/**
 * DSAR (Data Subject Access Request) async export worker.
 *
 * Generates a user's complete data export bundle, uploads it to S3 as a
 * JSON file, generates a time-limited signed URL, and updates the
 * `gdpr_requests` row with the download URL.
 *
 * This worker replaces the synchronous export path for users with large
 * histories that may timeout the request handler. The synchronous endpoint
 * remains available as a fallback for small exports.
 *
 * Art. 12(3) UK-GDPR: The export must be delivered within one month of the
 * request. The signed URL is valid for 24 hours; the S3 object is retained
 * for 7 days and then deleted by S3 lifecycle rules.
 *
 * @packageDocumentation
 */

import type { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { db } from '../../db/pool.js';
import { logger } from '../../lib/logger.js';
import { putBinaryObject, presignGetObject, deleteObject } from '../../lib/s3.js';

export interface DsarExportJobData {
  requestId: string;
  userId: string;
  reason: 'scheduled' | 'manual';
}

const SIGNED_URL_TTL_SECONDS = 24 * 60 * 60; // 24 hours
const EXPORT_CONTENT_TYPE = 'application/json';

interface ExportRow {
  user: unknown;
  addresses: unknown[];
  paymentMethods: unknown[];
  sessions: unknown[];
  interactions: unknown[];
  orders: unknown[];
  auctionBids: unknown[];
  coOwnOrders: unknown[];
  coOwnHoldings: unknown[];
  consents: unknown[];
  complianceProfile: unknown | null;
  kycCases: unknown[];
  amlAlerts: unknown[];
  aiUsageEvents: unknown[];
  gdprHistory: unknown[];
}

async function gatherExportData(
  pool: Pool,
  userId: string,
): Promise<ExportRow> {
  const [
    userResult,
    addresses,
    paymentMethods,
    sessions,
    interactions,
    orders,
    auctionBids,
    coOwnOrders,
    coOwnHoldings,
    consents,
    profile,
    kycCases,
    amlAlerts,
    aiUsageEvents,
    gdprHistory,
  ] = await Promise.all([
    pool.query(
      `SELECT id, username, email, role, email_verified_at::text, created_at::text,
              last_login_at::text, two_factor_enabled, is_erased, erased_at::text
       FROM users WHERE id = $1 LIMIT 1`,
      [userId],
    ),
    pool.query('SELECT * FROM user_addresses WHERE user_id = $1 ORDER BY updated_at DESC', [userId]),
    pool.query('SELECT * FROM user_payment_methods WHERE user_id = $1 ORDER BY updated_at DESC', [userId]),
    pool.query('SELECT id, created_at, last_seen_at, revoked_at, user_agent, ip_address FROM user_sessions WHERE user_id = $1 ORDER BY created_at DESC', [userId]),
    pool.query('SELECT * FROM interactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1000', [userId]),
    pool.query('SELECT * FROM orders WHERE buyer_id = $1 OR seller_id = $1 ORDER BY created_at DESC LIMIT 1000', [userId]),
    pool.query('SELECT * FROM auction_bids WHERE bidder_id = $1 ORDER BY created_at DESC LIMIT 1000', [userId]),
    pool.query('SELECT * FROM coOwn_orders WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1000', [userId]),
    pool.query('SELECT * FROM coOwn_holdings WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 1000', [userId]),
    pool.query('SELECT * FROM user_consents WHERE user_id = $1 ORDER BY accepted_at DESC LIMIT 1000', [userId]),
    pool.query('SELECT * FROM user_compliance_profiles WHERE user_id = $1 LIMIT 1', [userId]),
    pool.query('SELECT * FROM kyc_cases WHERE user_id = $1 ORDER BY created_at DESC LIMIT 500', [userId]),
    pool.query('SELECT * FROM aml_alerts WHERE user_id = $1 ORDER BY created_at DESC LIMIT 500', [userId]),
    pool.query(
      `SELECT id, conversation_id, bot_id, provider, model, status,
              input_tokens, output_tokens, total_tokens,
              estimated_cost_microusd, pricing_version, created_at
       FROM ai_usage_events WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1000`,
      [userId],
    ),
    pool.query('SELECT id, request_type, status, requested_at, completed_at FROM gdpr_requests WHERE user_id = $1 ORDER BY requested_at DESC LIMIT 100', [userId]),
  ]);

  return {
    user: userResult.rows[0] ?? null,
    addresses: addresses.rows,
    paymentMethods: paymentMethods.rows,
    sessions: sessions.rows,
    interactions: interactions.rows,
    orders: orders.rows,
    auctionBids: auctionBids.rows,
    coOwnOrders: coOwnOrders.rows,
    coOwnHoldings: coOwnHoldings.rows,
    consents: consents.rows,
    complianceProfile: profile.rows[0] ?? null,
    kycCases: kycCases.rows,
    amlAlerts: amlAlerts.rows,
    aiUsageEvents: aiUsageEvents.rows,
    gdprHistory: gdprHistory.rows,
  };
}

export async function processDsarExport(
  data: DsarExportJobData,
  pool: Pool = db,
): Promise<void> {
  const { requestId, userId, reason } = data;

  logger.info({ requestId, userId, reason }, 'dsarExport.start');

  try {
    const exportData = await gatherExportData(pool, userId);

    const exportPayload = {
      ...exportData,
      exportedAt: new Date().toISOString(),
      requestId,
    };

    const jsonBuffer = Buffer.from(JSON.stringify(exportPayload, null, 2), 'utf8');
    const objectKey = `dsar-exports/${userId}/${requestId}.json`;

    // Upload the export bundle to S3.
    await putBinaryObject(objectKey, jsonBuffer, EXPORT_CONTENT_TYPE, {
      metadata: {
        'user-id': userId,
        'request-id': requestId,
        'exported-at': new Date().toISOString(),
      },
    });

    // Generate a time-limited signed URL.
    const signedUrl = await presignGetObject(objectKey, SIGNED_URL_TTL_SECONDS);
    const expiresAt = new Date(Date.now() + SIGNED_URL_TTL_SECONDS * 1000);

    // Update the gdpr_requests row with the export URL.
    await pool.query(
      `
        UPDATE gdpr_requests
        SET
          status = 'completed',
          completed_at = NOW(),
          export_url = $2,
          export_expires_at = $3,
          export_object_key = $4,
          payload = payload || $5::jsonb,
          updated_at = NOW()
        WHERE id = $1
      `,
      [
        requestId,
        signedUrl,
        expiresAt,
        objectKey,
        JSON.stringify({
          records: {
            addresses: exportData.addresses.length,
            paymentMethods: exportData.paymentMethods.length,
            sessions: exportData.sessions.length,
            interactions: exportData.interactions.length,
            orders: exportData.orders.length,
            auctionBids: exportData.auctionBids.length,
            coOwnOrders: exportData.coOwnOrders.length,
            coOwnHoldings: exportData.coOwnHoldings.length,
            consents: exportData.consents.length,
            kycCases: exportData.kycCases.length,
            amlAlerts: exportData.amlAlerts.length,
            aiUsageEvents: exportData.aiUsageEvents.length,
          },
          deliveryMethod: 'async_s3_signed_url',
        }),
      ],
    );

    logger.info(
      { requestId, userId, objectKey, expiresAt: expiresAt.toISOString() },
      'dsarExport.complete',
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    logger.error(
      { requestId, userId, err: message },
      'dsarExport.failed',
    );

    // Mark the request as failed.
    await pool.query(
      `
        UPDATE gdpr_requests
        SET status = 'failed', updated_at = NOW()
        WHERE id = $1
      `,
      [requestId],
    ).catch(() => {
      // Best-effort — don't mask the original error.
    });

    throw err;
  }
}

/**
 * Clean up expired DSAR export bundles from S3.
 * Called by the retention sweep or a dedicated cleanup job.
 */
export async function cleanupExpiredDsarExports(
  pool: Pool = db,
): Promise<{ cleaned: number }> {
  const expired = await pool.query<{ id: string; export_object_key: string }>(
    `
      SELECT id, export_object_key
      FROM gdpr_requests
      WHERE export_object_key IS NOT NULL
        AND export_expires_at < NOW() - INTERVAL '7 days'
      LIMIT 50
    `,
  );

  let cleaned = 0;

  for (const row of expired.rows) {
    try {
      await deleteObject(row.export_object_key);

      await pool.query(
        `
          UPDATE gdpr_requests
          SET export_url = NULL,
              export_object_key = NULL
          WHERE id = $1
        `,
        [row.id],
      );

      cleaned++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(
        { requestId: row.id, objectKey: row.export_object_key, err: message },
        'dsarExport.cleanup.failed',
      );
    }
  }

  if (cleaned > 0) {
    logger.info({ cleaned }, 'dsarExport.cleanup.complete');
  }

  return { cleaned };
}
