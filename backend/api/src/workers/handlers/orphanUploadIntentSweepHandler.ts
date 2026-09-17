/**
 * Orphaned upload-intent sweep.
 *
 * Single-PUT uploads create an `upload_intents` row before the client PUTs
 * to S3. If the client dies before finalize, the intent expires unfinalized
 * and its S3 object is an orphan — the `/internal/media/orphans/cleanup`
 * route existed for this but had no in-process caller (it silently depended
 * on an external cron + service token). This handler drives the same claim-
 * and-delete logic on a schedule so orphan collection happens by default.
 */

import { db } from '../../db/pool.js';
import { logger } from '../../lib/logger.js';
import type { OrphanUploadIntentSweepJobData } from '../../lib/queues.js';
import { cleanupOrphanedUploadIntents } from '../../routes/mediaAssets.js';

const ORPHAN_SWEEP_LIMIT = 50;

export async function sweepOrphanedUploadIntents(
  reason: OrphanUploadIntentSweepJobData['reason'] = 'scheduled',
): Promise<number> {
  const result = await cleanupOrphanedUploadIntents(
    db,
    `orphan-sweep-${reason}`,
    ORPHAN_SWEEP_LIMIT,
  );

  if (result.claimedCount > 0 || result.failures.length > 0) {
    logger.info(
      { reason, claimed: result.claimedCount, cleaned: result.cleanedIds.length, failed: result.failures.length },
      '[orphanIntentSweep] orphaned upload intents swept',
    );
  }
  return result.cleanedIds.length;
}
