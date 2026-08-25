/**
 * Media ingest queue job handler.
 *
 * Delegates to the media processing pipeline which probes the source object,
 * generates derivatives, uploads them to S3, and posts the results back to
 * the internal API endpoint so the asset lifecycle state machine advances.
 *
 * @packageDocumentation
 */

import { db } from '../../db/pool.js';
import { logger } from '../../lib/logger.js';
import { processMediaAsset } from '../../lib/media/pipeline.js';
import type { MediaIngestJobData } from '../../lib/queues.js';

export type MediaIngestHandlerDeps = {
  /** Injected for symmetry with the other handlers; processing uses the shared db singleton. */
};

/**
 * Processes a media ingest BullMQ job. The job data carries the asset id and
 * a human-readable reason for the ingest (e.g. "finalize", "retry").
 */
export async function processMediaIngestJob(data: MediaIngestJobData): Promise<void> {
  logger.info({ assetId: data.assetId, reason: data.reason }, '[mediaIngestHandler] processing job');
  await processMediaAsset(data.assetId, db);
}
