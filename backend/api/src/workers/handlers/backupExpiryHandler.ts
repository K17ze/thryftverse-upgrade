/**
 * Backup expiry check worker handler.
 *
 * Scans the `backup_deletion_manifest` for users whose backup purge deadline
 * has passed but whose backups have not been verified as purged. Logs
 * outstanding entries for operator follow-up and marks entries as purged
 * when the backup retention period has naturally expired all snapshots
 * containing the user's data.
 *
 * In production, this worker should be paired with an operational runbook
 * that verifies the backup system has rotated past all snapshots containing
 * the erased user's data. The `purge_verification` column records the
 * verification method (e.g. "backup_rotation_confirmed", "manual_purge",
 * "pitr_window_expired").
 *
 * @packageDocumentation
 */

import type { Pool } from 'pg';
import { db } from '../../db/pool.js';
import { logger } from '../../lib/logger.js';

export interface BackupExpiryJobData {
  reason: 'scheduled' | 'manual';
}

interface ManifestRow {
  id: string;
  user_id: string;
  erasure_regime: string;
  erased_at: Date;
  purge_deadline: Date;
}

export async function processBackupExpiryCheck(
  data: BackupExpiryJobData,
  pool: Pool = db,
): Promise<void> {
  const { reason } = data;

  logger.info({ reason }, 'backupExpiry.start');

  try {
    // Find all manifest entries where the purge deadline has passed but
    // the purge has not been verified.
    const overdue = await pool.query<ManifestRow>(
      `
        SELECT id, user_id, erasure_regime, erased_at, purge_deadline
        FROM backup_deletion_manifest
        WHERE purged_at IS NULL
          AND purge_deadline < NOW()
        ORDER BY purge_deadline ASC
      `,
    );

    if (overdue.rows.length === 0) {
      logger.info({ reason }, 'backupExpiry.noOverdueEntries');
      return;
    }

    logger.warn(
      {
        reason,
        overdueCount: overdue.rows.length,
        entries: overdue.rows.map((r) => ({
          userId: r.user_id,
          regime: r.erasure_regime,
          erasedAt: r.erased_at,
          purgeDeadline: r.purge_deadline,
        })),
      },
      'backupExpiry.overdueEntries',
    );

    // For entries where the erased_at + 90 days has passed AND the
    // backup retention period (assumed 30 days) has also expired, we can
    // mark them as purged — all backups containing the user's data have
    // naturally rotated out.
    const naturalExpiryResult = await pool.query<{ count: number }>(
      `
        WITH expired AS (
          UPDATE backup_deletion_manifest
          SET purged_at = NOW(),
              purge_verification = 'backup_rotation_expired'
          WHERE purged_at IS NULL
            AND purge_deadline < NOW()
            AND erased_at < NOW() - INTERVAL '120 days'
          RETURNING id
        )
        SELECT COUNT(*) AS count FROM expired
      `,
    );

    const naturallyExpired = Number(naturalExpiryResult.rows[0]?.count ?? 0);

    if (naturallyExpired > 0) {
      logger.info(
        { reason, naturallyExpired },
        'backupExpiry.naturalExpiryMarked',
      );
    }

    const stillOverdue = overdue.rows.length - naturallyExpired;

    if (stillOverdue > 0) {
      logger.warn(
        { reason, stillOverdue },
        'backupExpiry.manualInterventionRequired',
      );
    }

    logger.info({ reason }, 'backupExpiry.complete');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(
      { reason, err: message },
      'backupExpiry.failed',
    );
    throw err;
  }
}
