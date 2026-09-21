/**
 * Backup expiry check worker handler.
 *
 * Scans the `backup_deletion_manifest` for users whose backup purge deadline
 * has passed but whose backups have not been verified as purged. An entry is
 * only marked `purged_at` after a real inventory of the configured backup
 * object store proves that no snapshot taken before `erased_at` still exists
 * — backup dumps are whole-database artifacts, so any pre-erasure snapshot
 * may contain the user's data.
 *
 * Entries that cannot be confirmed are stamped `purge_verification =
 * 'purge_failed'` (with `purged_at` left NULL) and surfaced via error logs —
 * the manifest must never claim a purge that was not observed.
 *
 * Backup store configuration (separate from the media bucket):
 *   S3_BACKUP_BUCKET            — required; when unset, nothing is marked purged
 *   S3_BACKUP_PREFIX            — object prefix (default: db-backups)
 *   S3_BACKUP_ENDPOINT          — optional S3-compatible endpoint (MinIO etc.)
 *   S3_BACKUP_REGION            — defaults to the platform S3 region
 *   S3_BACKUP_ACCESS_KEY_ID /
 *   S3_BACKUP_SECRET_ACCESS_KEY — default to the platform S3 credentials
 *
 * @packageDocumentation
 */

import { ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import type { Pool } from 'pg';
import { db } from '../../db/pool.js';
import { config } from '../../config.js';
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

interface BackupStore {
  client: S3Client;
  bucket: string;
  prefix: string;
}

interface BackupObject {
  key: string;
  lastModified: Date | undefined;
}

/**
 * Cap on objects inventoried per run. A truncated listing cannot prove the
 * absence of pre-erasure snapshots, so hitting the cap must fail closed
 * (purge_failed) rather than silently verifying nothing.
 */
const MAX_INVENTORY_OBJECTS = 100_000;

function backupStore(): BackupStore | null {
  const bucket = process.env.S3_BACKUP_BUCKET?.trim();
  if (!bucket) {
    return null;
  }
  const prefix = process.env.S3_BACKUP_PREFIX?.trim() || 'db-backups';
  const endpoint = process.env.S3_BACKUP_ENDPOINT?.trim() || undefined;
  const client = new S3Client({
    region: process.env.S3_BACKUP_REGION?.trim() || config.s3Region,
    endpoint,
    // Path-style addressing is only meaningful for S3-compatible endpoints;
    // AWS S3 uses virtual-hosted addressing by default.
    forcePathStyle: Boolean(endpoint),
    credentials: {
      accessKeyId: process.env.S3_BACKUP_ACCESS_KEY_ID?.trim() || config.s3AccessKey,
      secretAccessKey: process.env.S3_BACKUP_SECRET_ACCESS_KEY?.trim() || config.s3SecretKey,
    },
  });
  return { client, bucket, prefix };
}

/**
 * Full listing of backup objects under the configured prefix. Returns null
 * when the inventory is truncated beyond {@link MAX_INVENTORY_OBJECTS} —
 * a partial listing cannot prove absence.
 */
async function listBackupObjects(store: BackupStore): Promise<BackupObject[] | null> {
  const objects: BackupObject[] = [];
  let continuationToken: string | undefined;
  do {
    const page = await store.client.send(
      new ListObjectsV2Command({
        Bucket: store.bucket,
        Prefix: `${store.prefix}/`,
        ContinuationToken: continuationToken,
      }),
    );
    for (const obj of page.Contents ?? []) {
      if (obj.Key) {
        objects.push({ key: obj.Key, lastModified: obj.LastModified });
      }
    }
    if (objects.length > MAX_INVENTORY_OBJECTS) {
      return null;
    }
    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (continuationToken);
  return objects;
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

    const store = backupStore();
    if (!store) {
      // Without a configured backup store there is no way to prove purge —
      // mark the overdue rows purge_failed and surface loudly instead of
      // letting the manifest claim a purge that never happened.
      logger.error(
        { reason, overdueCount: overdue.rows.length },
        'backupExpiry.storeUnconfigured',
      );
      await pool.query(
        `
          UPDATE backup_deletion_manifest
          SET purge_verification = 'purge_failed'
          WHERE purged_at IS NULL
            AND purge_deadline < NOW()
        `,
      );
      return;
    }

    let objects: BackupObject[] | null;
    try {
      objects = await listBackupObjects(store);
    } catch (err) {
      logger.error(
        { reason, err: err instanceof Error ? err.message : String(err), bucket: store.bucket },
        'backupExpiry.inventoryFailed',
      );
      await pool.query(
        `
          UPDATE backup_deletion_manifest
          SET purge_verification = 'purge_failed'
          WHERE purged_at IS NULL
            AND purge_deadline < NOW()
        `,
      );
      return;
    }

    if (objects === null) {
      logger.error(
        { reason, bucket: store.bucket, cap: MAX_INVENTORY_OBJECTS },
        'backupExpiry.inventoryTruncated',
      );
      await pool.query(
        `
          UPDATE backup_deletion_manifest
          SET purge_verification = 'purge_failed'
          WHERE purged_at IS NULL
            AND purge_deadline < NOW()
        `,
      );
      return;
    }

    // A pre-erasure snapshot is any backup object whose LastModified predates
    // (or coincides with) the erasure timestamp — it may contain the user's
    // data. Purge is confirmed only when none remain.
    const confirmedIds: string[] = [];
    const failedIds: string[] = [];
    for (const row of overdue.rows) {
      const erasedAt = row.erased_at instanceof Date ? row.erased_at : new Date(row.erased_at);
      const hasPreErasureSnapshot = objects.some(
        (o) => o.lastModified !== undefined && o.lastModified.getTime() <= erasedAt.getTime(),
      );
      if (hasPreErasureSnapshot) {
        failedIds.push(row.id);
      } else {
        confirmedIds.push(row.id);
      }
    }

    if (confirmedIds.length > 0) {
      await pool.query(
        `
          UPDATE backup_deletion_manifest
          SET purged_at = NOW(),
              purge_verification = 'store_inventory_verified'
          WHERE id = ANY($1::text[])
            AND purged_at IS NULL
        `,
        [confirmedIds],
      );
      logger.info(
        { reason, confirmedCount: confirmedIds.length, bucket: store.bucket },
        'backupExpiry.storeInventoryVerified',
      );
    }

    if (failedIds.length > 0) {
      await pool.query(
        `
          UPDATE backup_deletion_manifest
          SET purge_verification = 'purge_failed'
          WHERE id = ANY($1::text[])
            AND purged_at IS NULL
        `,
        [failedIds],
      );
      logger.error(
        {
          reason,
          purgeFailedCount: failedIds.length,
          bucket: store.bucket,
          userIds: overdue.rows
            .filter((r) => failedIds.includes(r.id))
            .map((r) => r.user_id),
        },
        'backupExpiry.purgeFailed',
      );
    }

    logger.info(
      {
        reason,
        overdue: overdue.rows.length,
        confirmed: confirmedIds.length,
        purgeFailed: failedIds.length,
      },
      'backupExpiry.complete',
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(
      { reason, err: message },
      'backupExpiry.failed',
    );
    throw err;
  }
}
