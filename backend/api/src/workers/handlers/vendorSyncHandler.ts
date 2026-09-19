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
  getPendingOutboxEntries,
  markOutboxDelivering,
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

export interface VendorSyncJobData {
  vendorName: string;
}

export interface VendorSyncHandlerDeps {
  /** Injectable for tests; defaults to env-configured resolution. */
  vendorClient?: VendorClient | null;
  /** Injectable for tests; defaults to the shared pool. */
  db?: Pool;
}

const MAX_ATTEMPTS = 5;

/**
 * Processes pending vendor outbox entries for a specific vendor.
 *
 * State transitions per entry:
 *   configured client + delivery success   → 'delivered' + vendor mapping
 *   configured client + transient failure  → 'failed' (retryable, attempts++)
 *   configured client + permanent failure  → 'skipped' (dead-lettered)
 *   no client configured                   → stays 'pending' — an outbox
 *     entry is never marked delivered when no vendor call actually happened.
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
  const entries = await getPendingOutboxEntries(db, vendorName, 50);

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

    await markOutboxDelivering(db, entry.id);

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
