/**
 * Multipart session expiry sweep.
 *
 * `upload_multipart_sessions` rows carry a 7-day `expires_at`, and every
 * endpoint already rejects an expired session — but nothing ever moves the
 * row out of 'active' or aborts the S3 multipart upload behind it, so
 * abandoned sessions keep their uploaded parts in storage (and their S3
 * uploadId open) indefinitely.
 *
 * The sweep runs in two steps:
 *   1. Claim: atomically mark expired-'active' rows 'expired' under
 *      FOR UPDATE SKIP LOCKED (plus rows already 'expired' whose S3 abort
 *      failed on a previous sweep — they re-claim for retry).
 *   2. Abort: call AbortMultipartUpload outside the transaction so S3
 *      latency never holds row locks. Success and NoSuchUpload (S3 already
 *      terminated the session) both converge the row to 'aborted'; any
 *      other error leaves it 'expired' for the next sweep to retry.
 */

import { db } from '../../db/pool.js';
import { logger } from '../../lib/logger.js';
import { abortMultipartUpload, listMultipartUploads } from '../../lib/s3.js';
import type { MultipartSessionSweepJobData } from '../../lib/queues.js';

const MAX_SESSIONS_PER_SWEEP = 100;
/**
 * Grace window before an S3 multipart upload with no session row is
 * treated as orphaned. The initiate route calls S3 `CreateMultipartUpload`
 * before inserting the session row, so a freshly created upload briefly
 * has no row — aborting inside that window would kill live initiations.
 * One hour is far beyond the create→insert gap and far below the 7-day
 * session TTL.
 */
const ORPHAN_GRACE_MS = 60 * 60 * 1000;
const MAX_ORPHAN_LISTING = 500;

export async function expireStaleMultipartSessions(
  reason: MultipartSessionSweepJobData['reason'] = 'scheduled',
): Promise<number> {
  const claimed = await db.query<{ id: string; object_key: string; upload_id: string; bucket: string }>(
    `WITH picked AS (
       SELECT id
       FROM upload_multipart_sessions
       WHERE (status = 'active' AND expires_at < NOW())
          OR status = 'expired'
       ORDER BY expires_at
       LIMIT $1
       FOR UPDATE SKIP LOCKED
     )
     UPDATE upload_multipart_sessions s
     SET status = 'expired'
     FROM picked
     WHERE s.id = picked.id
     RETURNING s.id, s.object_key, s.upload_id, s.bucket`,
    [MAX_SESSIONS_PER_SWEEP],
  );

  let aborted = 0;
  for (const session of claimed.rows) {
    try {
      await abortMultipartUpload(session.object_key, session.upload_id, session.bucket);
    } catch (error) {
      // NoSuchUpload: S3 already terminated the session (completed or
      // previously aborted) — converge to the terminal state anyway.
      if (!(error instanceof Error) || error.name !== 'NoSuchUpload') {
        logger.warn(
          { err: error, sessionId: session.id, objectKey: session.object_key },
          '[multipartSweep] S3 abort failed — row stays expired for retry',
        );
        continue;
      }
    }
    const done = await db.query(
      `UPDATE upload_multipart_sessions
       SET status = 'aborted', completed_at = NOW()
       WHERE id = $1 AND status = 'expired'`,
      [session.id],
    );
    aborted += done.rowCount ?? 0;
  }

  if (claimed.rowCount) {
    logger.info(
      { reason, claimed: claimed.rowCount, aborted },
      '[multipartSweep] expired multipart sessions swept',
    );
  }

  const orphans = await abortOrphanedS3Uploads();
  return aborted + orphans;
}

/**
 * Abort S3 multipart uploads that have no `upload_multipart_sessions`
 * row at all. The initiate route creates the S3 upload *before* the row
 * insert, so a crash between the two leaves an upload invisible to the
 * DB-driven sweep above — this pass is the only thing that reclaims it.
 *
 * Rows that exist in any status are skipped (the DB pass owns their
 * lifecycle); only uploads older than {@link ORPHAN_GRACE_MS} are aborted
 * so an in-flight initiation can never be killed mid-insert.
 */
async function abortOrphanedS3Uploads(): Promise<number> {
  let uploads;
  try {
    uploads = await listMultipartUploads(MAX_ORPHAN_LISTING);
  } catch (error) {
    // Listing is best-effort — a ListMultipartUploads permission gap or
    // transient S3 failure must not fail the whole sweep.
    logger.warn({ err: error }, '[multipartSweep] orphan listing failed — skipping S3-side pass');
    return 0;
  }
  if (uploads.length === 0) return 0;

  const cutoff = Date.now() - ORPHAN_GRACE_MS;
  let aborted = 0;
  for (const upload of uploads) {
    if (!upload.initiated || upload.initiated.getTime() > cutoff) continue;
    const row = await db.query(
      `SELECT 1 FROM upload_multipart_sessions WHERE upload_id = $1 LIMIT 1`,
      [upload.uploadId],
    );
    if (row.rowCount) continue;
    try {
      await abortMultipartUpload(upload.key, upload.uploadId);
      aborted += 1;
    } catch (error) {
      if (!(error instanceof Error) || error.name !== 'NoSuchUpload') {
        logger.warn(
          { err: error, objectKey: upload.key, uploadId: upload.uploadId },
          '[multipartSweep] orphan abort failed',
        );
      }
    }
  }
  if (aborted > 0) {
    logger.info({ aborted }, '[multipartSweep] orphaned S3 multipart uploads aborted');
  }
  return aborted;
}
