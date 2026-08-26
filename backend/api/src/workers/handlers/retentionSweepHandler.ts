/**
 * Retention Sweep Worker Handler
 *
 * Runs the daily proactive retention sweep: enforces TTL-based purge or
 * anonymisation of old data across all data classes, then runs media
 * garbage collection to delete S3 objects for orphaned/deleted media
 * assets that no longer have active bindings, and cleans up expired DSAR
 * export bundles from S3.
 *
 * @packageDocumentation
 */

import type { Pool } from 'pg';
import { db } from '../../db/pool.js';
import { logger } from '../../lib/logger.js';
import { runRetentionSweep } from '../../lib/retentionEngine.js';
import { runMediaGarbageCollection } from '../../lib/mediaGc.js';
import { cleanupExpiredDsarExports } from './dsarExportHandler.js';

export interface RetentionSweepJobData {
  reason: 'scheduled' | 'manual';
}

export async function processRetentionSweep(
  data: RetentionSweepJobData,
  pool: Pool = db,
): Promise<void> {
  const { reason } = data;

  logger.info({ reason }, 'retentionSweep.start');

  try {
    const sweepResults = await runRetentionSweep(pool);

    logger.info(
      { reason, sweepResults },
      'retentionSweep.retentionComplete',
    );

    const gcResults = await runMediaGarbageCollection(pool);

    logger.info(
      {
        reason,
        objectsDeleted: gcResults.objectsDeleted,
        bytesFreed: gcResults.bytesFreed,
        assetsProcessed: gcResults.assetsProcessed,
        derivativesDeleted: gcResults.derivativesDeleted,
        errors: gcResults.errors,
      },
      'retentionSweep.mediaGcComplete',
    );

    // Clean up expired DSAR export bundles from S3 (7-day retention
    // after the signed URL expires).
    const dsarCleanup = await cleanupExpiredDsarExports(pool).catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(
        { reason, err: message },
        'retentionSweep.dsarCleanupFailed',
      );
      return { cleaned: 0 };
    });

    if (dsarCleanup.cleaned > 0) {
      logger.info(
        { reason, cleaned: dsarCleanup.cleaned },
        'retentionSweep.dsarCleanupComplete',
      );
    }

    logger.info({ reason }, 'retentionSweep.complete');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(
      { reason, err: message },
      'retentionSweep.failed',
    );
    throw err;
  }
}
