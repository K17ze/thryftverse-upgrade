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
 * Purge-proof semantics (audit 4.8 / Appendix D blocker 2):
 *   - Content time, not upload time: the snapshot boundary is read from the
 *     artifact key (thryftverse_<snapshot-start-UTC>...), so a dump started
 *     before erasure but uploaded after it still counts as pre-erasure.
 *   - Versioned inventory: noncurrent versions are inventoried via
 *     ListObjectVersions; a denied/failed/truncated version listing fails
 *     closed rather than asserting purge.
 *   - Provenance cross-check: key timestamps are operator-forgeable
 *     (`s3 cp` an old dump to a fresh-named key), so content artifacts must
 *     carry `snapshot-started-at` object metadata agreeing with the key.
 *     Missing/disagreeing metadata → unknown boundary → fail closed.
 *   - In-progress uploads: multipart uploads under the prefix are
 *     uninspectable — any present at inventory time fail the proof.
 *   - Fail closed on unknowns: any object whose snapshot boundary cannot be
 *     established is treated as potentially retained — unknown ≠ purged.
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

import {
  HeadObjectCommand,
  ListMultipartUploadsCommand,
  ListObjectsV2Command,
  ListObjectVersionsCommand,
  S3Client,
} from '@aws-sdk/client-s3';
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
  /** S3 write/upload time — metadata about when the OBJECT was stored. */
  lastModified: Date | undefined;
  /**
   * Snapshot-boundary (content) time: when the pg_dump snapshot was STARTED,
   * which is what the dump actually contains. Distinct from lastModified —
   * a dump started before an erasure can finish encrypting and upload after
   * it, so upload time alone can never prove the erased user is absent.
   * Undefined means the boundary cannot be established → fail closed.
   */
  snapshotStartedAt: Date | undefined;
  /** True for retained noncurrent versions on a versioned bucket. */
  noncurrent: boolean;
  /** Present only for noncurrent versions — required for per-version HEAD. */
  versionId?: string;
}

/**
 * Cap on objects inventoried per run. A truncated listing cannot prove the
 * absence of pre-erasure snapshots, so hitting the cap must fail closed
 * (purge_failed) rather than silently verifying nothing.
 */
const MAX_INVENTORY_OBJECTS = 100_000;

/**
 * Backup artifacts are named `thryftverse_YYYY-MM-DDTHH-MM-SSZ.dump[.enc]`
 * (plus `.sha256` sidecars) where the embedded UTC timestamp is captured by
 * automated-backup.sh BEFORE pg_dump starts — i.e. it is the snapshot-start
 * (content) boundary, not the upload time. `S3_BACKUP_PREFIX` is reserved for
 * these artifacts; any key under it that does not carry a parseable snapshot
 * boundary has unknown content time and must fail closed — an unknown object
 * is never proof of purge.
 */
const SNAPSHOT_KEY_TIMESTAMP =
  /thryftverse_(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})Z/;

function snapshotStartFromKey(key: string): Date | undefined {
  const match = SNAPSHOT_KEY_TIMESTAMP.exec(key);
  if (!match) {
    return undefined;
  }
  const [, y, mo, d, h, mi, s] = match;
  const ms = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s));
  const parsed = new Date(ms);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

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
        objects.push({
          key: obj.Key,
          lastModified: obj.LastModified,
          snapshotStartedAt: snapshotStartFromKey(obj.Key),
          noncurrent: false,
        });
      }
    }
    if (objects.length > MAX_INVENTORY_OBJECTS) {
      return null;
    }
    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (continuationToken);
  return objects;
}

/**
 * Inventory of NONCURRENT object versions under the backup prefix.
 * ListObjectsV2 only sees the current version — on a versioned (or
 * previously-versioned, or PITR-enabled) bucket a "deleted" backup keeps its
 * older versions, and a pre-erasure snapshot can survive underneath a
 * post-erasure overwrite. Purge cannot be asserted without inventorying
 * these.
 *
 * Returns:
 *  - BackupObject[]  — retained noncurrent versions (delete markers are
 *    markers, not retained bytes; they are skipped because any surviving
 *    version underneath is listed separately).
 *  - 'unsupported'   — the store does not implement object versions at all
 *    (e.g. a non-versioned S3-compatible endpoint): no noncurrent versions
 *    can exist, so the current listing is complete.
 *  - null            — listing failed/denied or was truncated: fail closed.
 */
async function listNoncurrentVersions(
  store: BackupStore,
): Promise<BackupObject[] | 'unsupported' | null> {
  const versions: BackupObject[] = [];
  let keyMarker: string | undefined;
  let versionIdMarker: string | undefined;
  try {
    do {
      const page = await store.client.send(
        new ListObjectVersionsCommand({
          Bucket: store.bucket,
          Prefix: `${store.prefix}/`,
          KeyMarker: keyMarker,
          VersionIdMarker: versionIdMarker,
        }),
      );
      for (const version of page.Versions ?? []) {
        if (version.Key && version.IsLatest !== true) {
          versions.push({
            key: version.Key,
            lastModified: version.LastModified,
            snapshotStartedAt: snapshotStartFromKey(version.Key),
            noncurrent: true,
            versionId: version.VersionId,
          });
        }
      }
      if (versions.length > MAX_INVENTORY_OBJECTS) {
        return null;
      }
      if (page.IsTruncated) {
        keyMarker = page.NextKeyMarker;
        versionIdMarker = page.NextVersionIdMarker;
      } else {
        keyMarker = undefined;
      }
    } while (keyMarker);
    return versions;
  } catch (err) {
    const name = err instanceof Error ? err.name : '';
    // A store that does not implement versioning cannot retain noncurrent
    // versions — the current-object listing is the complete inventory.
    if (name === 'NotImplemented') {
      return 'unsupported';
    }
    logger.warn(
      { err: err instanceof Error ? err.message : String(err), bucket: store.bucket },
      'backupExpiry.versionInventoryUnavailable',
    );
    return null;
  }
}

/**
 * In-progress multipart uploads under the backup prefix. A partial upload's
 * content boundary cannot be established — the finished object may carry a
 * fresh key over pre-erasure bytes — so any present upload must fail the
 * proof rather than be ignored.
 *
 * Returns the count, 'unsupported' when the store lacks multipart uploads,
 * or null when the listing failed (fail closed).
 */
async function listInProgressUploads(
  store: BackupStore,
): Promise<number | 'unsupported' | null> {
  let count = 0;
  let keyMarker: string | undefined;
  let uploadIdMarker: string | undefined;
  try {
    do {
      const page = await store.client.send(
        new ListMultipartUploadsCommand({
          Bucket: store.bucket,
          Prefix: `${store.prefix}/`,
          KeyMarker: keyMarker,
          UploadIdMarker: uploadIdMarker,
        }),
      );
      count += page.Uploads?.length ?? 0;
      if (page.IsTruncated) {
        keyMarker = page.NextKeyMarker;
        uploadIdMarker = page.NextUploadIdMarker;
      } else {
        keyMarker = undefined;
      }
    } while (keyMarker);
    return count;
  } catch (err) {
    const name = err instanceof Error ? err.name : '';
    if (name === 'NotImplemented') {
      return 'unsupported';
    }
    logger.warn(
      { err: err instanceof Error ? err.message : String(err), bucket: store.bucket },
      'backupExpiry.multipartInventoryUnavailable',
    );
    return null;
  }
}

// Content-bearing artifacts — the only objects whose bytes can contain the
// erased user. Sidecars (.sha256) hold no user data.
const CONTENT_ARTIFACT = /\.dump(\.enc)?$/;

// `snapshot-started-at` metadata is stamped by the backup pipelines in the
// same compact UTC form embedded in the key (YYYY-MM-DDTHH-MM-SSZ); ISO
// is accepted too since aws cli normalizes metadata values verbatim.
const METADATA_TIMESTAMP =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2})[:-](\d{2})[:-](\d{2})(?:\.\d+)?Z$/;

function parseMetadataTimestamp(raw: string | undefined): Date | undefined {
  if (!raw) return undefined;
  const m = METADATA_TIMESTAMP.exec(raw);
  if (!m) return undefined;
  const [, y, mo, d, h, mi, s] = m;
  const parsed = new Date(
    Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s)),
  );
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

/**
 * Provenance cross-check for content artifacts. The key-embedded timestamp is
 * forgeable — `s3 cp` an old dump under a fresh timestamped name and the key
 * lies while the bytes still contain the erased user. Both backup pipelines
 * stamp `snapshot-started-at` object metadata; a plain copy preserves user
 * metadata, so a renamed forgery surfaces as a metadata/key disagreement.
 *
 * For every content artifact the metadata MUST be present and equal the key
 * boundary — absent or disagreeing metadata demotes the object to an unknown
 * boundary (fail closed). Artifacts created before metadata stamping existed
 * therefore block purge until they age out or are deleted; that is the
 * honest posture — provenance that cannot be verified is not proof.
 */
async function verifyArtifactProvenance(
  store: BackupStore,
  objects: BackupObject[],
): Promise<void> {
  for (const obj of objects) {
    if (!CONTENT_ARTIFACT.test(obj.key)) continue;
    let metaTime: Date | undefined;
    try {
      const head = await store.client.send(
        new HeadObjectCommand({
          Bucket: store.bucket,
          Key: obj.key,
          // A noncurrent version's metadata lives on that version — heading
          // the key alone would read the latest version's metadata and miss
          // a forged/renamed retained version.
          VersionId: obj.versionId,
        }),
      );
      metaTime = parseMetadataTimestamp(head.Metadata?.['snapshot-started-at']);
    } catch {
      metaTime = undefined;
    }
    if (
      metaTime === undefined ||
      obj.snapshotStartedAt === undefined ||
      metaTime.getTime() !== obj.snapshotStartedAt.getTime()
    ) {
      obj.snapshotStartedAt = undefined;
    }
  }
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

    // Noncurrent-version inventory: a current-object listing alone cannot
    // prove purge on a versioned/PITR bucket — deleted pre-erasure snapshots
    // can survive as older versions under a delete marker or a post-erasure
    // overwrite. Denied/unavailable version listing fails closed rather than
    // asserting purge on a partial inventory.
    const noncurrent = await listNoncurrentVersions(store);
    if (noncurrent === null) {
      logger.error(
        { reason, bucket: store.bucket },
        'backupExpiry.versionInventoryFailed',
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
    const inventory: BackupObject[] =
      noncurrent === 'unsupported' ? objects : [...objects, ...noncurrent];

    // In-progress multipart uploads under the prefix cannot be inspected —
    // a completed upload may surface later with a fresh key over pre-erasure
    // bytes. Any present (or an unavailable listing) fails the proof closed.
    const inProgress = await listInProgressUploads(store);
    if (inProgress === null || (inProgress !== 'unsupported' && inProgress > 0)) {
      logger.error(
        { reason, bucket: store.bucket, inProgressUploads: inProgress },
        'backupExpiry.inProgressUploadsPresent',
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

    // Provenance cross-check: key timestamps are forgeable via s3 cp — a
    // content artifact must carry `snapshot-started-at` metadata agreeing
    // with its key, else it is demoted to an unknown boundary below.
    await verifyArtifactProvenance(store, inventory);

    // Purge proof uses SNAPSHOT-BOUNDARY (content) time, not upload time.
    // automated-backup.sh stamps each artifact key with the pg_dump START
    // time (thryftverse_YYYY-MM-DDTHH-MM-SSZ...), so the key embeds when the
    // snapshot was taken — a dump started before erasure but uploaded after
    // still carries its true content boundary. There is no backup-manifest
    // table/object-metadata contract in the repo today, so the key
    // convention is the boundary source of truth.
    //
    // An object is a retained pre-erasure snapshot for a row when its
    // content boundary predates (or coincides with) erased_at. Any object
    // whose boundary CANNOT be established — unparseable key, missing
    // metadata — is unknown, and unknown is never proof of purge:
    // fail closed instead of confirming on a partial picture.
    const unknownBoundaryCount = inventory.filter(
      (o) => o.snapshotStartedAt === undefined,
    ).length;
    if (unknownBoundaryCount > 0) {
      logger.warn(
        {
          reason,
          bucket: store.bucket,
          unknownBoundaryCount,
          inventoryCount: inventory.length,
        },
        'backupExpiry.unknownSnapshotBoundaries',
      );
    }

    const confirmedIds: string[] = [];
    const failedIds: string[] = [];
    for (const row of overdue.rows) {
      const erasedAt = row.erased_at instanceof Date ? row.erased_at : new Date(row.erased_at);
      const hasPreErasureSnapshot = inventory.some(
        (o) =>
          // Unknown content boundary → cannot prove this object does not
          // contain the erased user → fail closed (unknown ≠ purged).
          o.snapshotStartedAt === undefined ||
          o.snapshotStartedAt.getTime() <= erasedAt.getTime(),
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
