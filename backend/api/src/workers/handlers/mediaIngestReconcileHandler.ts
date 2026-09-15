/**
 * Media ingest reconciliation handler.
 *
 * The durable `media_processing_jobs` row commits before the BullMQ
 * enqueue in the upload finalize routes — if that enqueue throws (Redis
 * down, process crash between COMMIT and add), the row is durable but no
 * queue job will ever drive it. BullMQ jobs can also be lost (evicted
 * before delivery) or die holding a stale 'processing' lock (worker
 * crash, exhausted retries retained under `removeOnFail`, which also
 * suppresses same-jobId re-enqueues).
 *
 * This sweep re-drives every claimable ingest row through
 * `enqueueMediaIngestJob` under a reconcile-scoped jobId. Correctness
 * does not depend on queue dedupe: `claimProcessingJob` remains the
 * atomic arbiter, so an asset already being processed by a live job is
 * either unlisted (fresh lock) or a no-op claim on arrival.
 */

import { db } from '../../db/pool.js';
import { logger } from '../../lib/logger.js';
import { listClaimableIngestJobs } from '../../lib/media/pipeline.js';
import { enqueueMediaIngestJob } from '../../lib/queues.js';
import type { MediaIngestReconcileJobData } from '../../lib/queues.js';

const MAX_REENQUEUE_PER_SWEEP = 50;

export async function reconcileMediaIngestJobs(
  reason: MediaIngestReconcileJobData['reason'] = 'scheduled',
): Promise<number> {
  const orphaned = await listClaimableIngestJobs(db, MAX_REENQUEUE_PER_SWEEP);
  if (orphaned.length === 0) {
    return 0;
  }

  // Bucket the reconcile jobId per sweep minute — a retained failed
  // `media_ingest_${assetId}` record would otherwise suppress the
  // re-enqueue, which is exactly the wedge this sweep exists to break.
  const timeBucket = Math.floor(Date.now() / 60_000);
  let reenqueued = 0;
  for (const job of orphaned) {
    try {
      await enqueueMediaIngestJob(
        { assetId: job.mediaAssetId, reason: `reconcile:${reason}` },
        { jobId: `media_ingest_${job.mediaAssetId}_recon_${timeBucket}` },
      );
      reenqueued += 1;
    } catch (error) {
      logger.warn(
        { err: error, jobId: job.id, assetId: job.mediaAssetId },
        '[mediaIngestReconcile] re-enqueue failed — next sweep retries',
      );
    }
  }

  logger.info(
    { reason, orphaned: orphaned.length, reenqueued },
    '[mediaIngestReconcile] re-drove orphaned ingest jobs',
  );
  return reenqueued;
}
