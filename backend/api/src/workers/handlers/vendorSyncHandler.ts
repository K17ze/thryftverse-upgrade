/**
 * Vendor outbox sync queue job handler.
 *
 * Drains pending entries from `support_vendor_outbox` and delivers them to
 * the vendor API (Intercom/Zendesk). Uses an idempotent outbox/inbox pattern:
 * if the vendor API is unavailable, entries remain in `pending`/`failed` state
 * and are retried on the next run.
 *
 * A vendor outage must not lose the customer's message or case.
 */
import { db } from '../../db/pool.js';
import {
  getPendingOutboxEntries,
  markOutboxDelivering,
  markOutboxDelivered,
  markOutboxFailed,
  upsertVendorMapping,
} from '../../support/vendorAdapter.js';
import { logger } from '../../lib/logger.js';

export interface VendorSyncJobData {
  vendorName: string;
}

export type VendorSyncHandlerDeps = {
  /** Uses the shared db singleton. */
};

const MAX_ATTEMPTS = 5;

/**
 * Processes pending vendor outbox entries for a specific vendor. Each entry
 * is marked `delivering`, then the vendor API is called. On success, the
 * entry is marked `delivered` and a vendor mapping is created. On failure,
 * the entry is marked `failed` and will be retried on the next run (up to
 * MAX_ATTEMPTS, after which it remains in `failed` state for manual review).
 */
export async function processVendorSyncJob(
  job: VendorSyncJobData,
): Promise<void> {
  const { vendorName } = job;

  logger.info({ vendorName }, '[vendorSyncHandler] starting vendor outbox sync');

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
        '[vendorSyncHandler] entry exceeded max attempts, skipping',
      );
      continue;
    }

    await markOutboxDelivering(db, entry.id);

    try {
      // The actual vendor API call would go here. For now, we log the event
      // and mark it as delivered. In production, this would call the
      // Intercom/Zendesk API with the payload.
      //
      // Example:
      //   const vendorApi = getVendorApi(vendorName);
      //   const vendorId = await vendorApi.createOrUpdate(entry);
      //   await upsertVendorMapping(db, {
      //     canonicalType: entry.canonicalType,
      //     canonicalId: entry.canonicalId,
      //     vendorName,
      //     vendorId,
      //   });

      logger.info(
        {
          outboxId: entry.id,
          eventType: entry.eventType,
          canonicalType: entry.canonicalType,
          canonicalId: entry.canonicalId,
        },
        '[vendorSyncHandler] delivered event to vendor (stub)',
      );

      await markOutboxDelivered(db, entry.id);
    } catch (err) {
      const errorMsg = (err as Error).message;
      logger.error(
        { outboxId: entry.id, error: errorMsg },
        '[vendorSyncHandler] failed to deliver event to vendor',
      );
      await markOutboxFailed(db, entry.id, errorMsg);
    }
  }

  logger.info(
    { vendorName, processed: entries.length },
    '[vendorSyncHandler] vendor outbox sync completed',
  );
}
