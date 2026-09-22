/**
 * Vendor outbox sync queue job handler.
 *
 * Drains pending entries from `support_vendor_outbox` and delivers them to
 * the configured vendor API endpoint. Uses an idempotent outbox/inbox
 * pattern: if the vendor API is unavailable, entries remain in
 * `pending`/`failed` state and are retried on the next run.
 *
 * A vendor outage must not lose the customer's message or case — and an
 * unconfigured vendor must never be reported as delivered (F16).
 */
import { db as sharedDb } from '../../db/pool.js';
import type { Pool } from 'pg';
import {
  claimVendorOutboxBatch,
  markOutboxDelivered,
  markOutboxFailed,
  markOutboxSkipped,
  upsertVendorMapping,
} from '../../support/vendorAdapter.js';
import {
  resolveVendorClient,
  VendorPermanentError,
  type VendorClient,
} from '../../support/vendorClient.js';
import { logger } from '../../lib/logger.js';
import type { VendorSyncJobData } from '../../lib/queues.js';

export type { VendorSyncJobData };

export interface VendorSyncHandlerDeps {
  /** Injectable for tests; defaults to env-configured resolution. */
  vendorClient?: VendorClient | null;
  /** Injectable for tests; defaults to the shared pool. */
  db?: Pool;
}

const MAX_ATTEMPTS = 5;
/**
 * How long a 'delivering' row may sit before it is treated as a crashed
 * claim and returned to 'pending'. Generous — vendor delivery has a 10s
 * client timeout, so 10 minutes is far beyond any live delivery while
 * still bounding crash-stranded rows.
 */
const STALE_DELIVERY_LEASE_MS = 10 * 60 * 1000;

/**
 * Processes pending vendor outbox entries for a specific vendor.
 *
 * State transitions per entry:
 *   configured client + delivery success   → 'delivered' + vendor mapping
 *   configured client + transient failure  → 'failed' (retryable)
 *   configured client + permanent failure  → 'skipped' (dead-lettered)
 *   no client configured                   → stays 'pending' — an outbox
 *     entry is never marked delivered when no vendor call actually happened.
 *
 * Entries are leased via claimVendorOutboxBatch: concurrent drainers can't
 * take the same row (FOR UPDATE SKIP LOCKED), `attempts` counts failed
 * deliveries plus reclaimed stale leases, and a stale 'delivering' row past
 * the lease returns to 'pending' so a crashed worker cannot strand an
 * undelivered event.
 */
export async function processVendorSyncJob(
  job: VendorSyncJobData,
  deps?: VendorSyncHandlerDeps,
): Promise<void> {
  const { vendorName } = job;

  logger.info({ vendorName }, '[vendorSyncHandler] starting vendor outbox sync');

  const client = deps?.vendorClient !== undefined
    ? deps.vendorClient
    : resolveVendorClient(vendorName);

  if (!client) {
    logger.warn(
      { vendorName },
      '[vendorSyncHandler] vendor not configured — outbox entries remain pending',
    );
    return;
  }

  const db = deps?.db ?? sharedDb;
  const entries = await claimVendorOutboxBatch(db, vendorName, 50, {
    staleLeaseMs: STALE_DELIVERY_LEASE_MS,
    maxAttempts: MAX_ATTEMPTS,
  });

  if (entries.length === 0) {
    logger.debug({ vendorName }, '[vendorSyncHandler] no pending outbox entries');
    return;
  }

  logger.info(
    { vendorName, pendingCount: entries.length },
    '[vendorSyncHandler] processing pending outbox entries',
  );

  for (const entry of entries) {
    if (entry.attempts >= MAX_ATTEMPTS) {
      logger.warn(
        { outboxId: entry.id, attempts: entry.attempts },
        '[vendorSyncHandler] entry exceeded max attempts, dead-lettering',
      );
      await markOutboxSkipped(db, entry.id, `exceeded max attempts (${MAX_ATTEMPTS})`);
      continue;
    }

    try {
      const result = await client.deliver(entry);

      await upsertVendorMapping(db, {
        canonicalType: entry.canonicalType,
        canonicalId: entry.canonicalId,
        vendorName,
        vendorId: result.vendorId,
        vendorUrl: result.vendorUrl,
      });
      await markOutboxDelivered(db, entry.id);

      logger.info(
        {
          outboxId: entry.id,
          eventType: entry.eventType,
          canonicalType: entry.canonicalType,
          canonicalId: entry.canonicalId,
          vendorId: result.vendorId,
        },
        '[vendorSyncHandler] delivered event to vendor',
      );
    } catch (err) {
      const errorMsg = (err as Error).message;
      if (err instanceof VendorPermanentError) {
        // Non-retryable (4xx) — dead-letter so it stops churning retries but
        // remains inspectable via last_error.
        logger.error(
          { outboxId: entry.id, status: err.status, error: errorMsg },
          '[vendorSyncHandler] vendor permanently rejected event',
        );
        await markOutboxSkipped(db, entry.id, `permanent: ${errorMsg}`);
      } else {
        logger.error(
          { outboxId: entry.id, error: errorMsg },
          '[vendorSyncHandler] failed to deliver event to vendor (retryable)',
        );
        await markOutboxFailed(db, entry.id, errorMsg);
      }
    }
  }

  logger.info(
    { vendorName, processed: entries.length },
    '[vendorSyncHandler] vendor outbox sync completed',
  );
}
