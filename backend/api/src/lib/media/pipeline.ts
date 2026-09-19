/**
 * Media processing pipeline orchestrator.
 *
 * Drives the full lifecycle for a single media asset:
 *   1. Claim the pending processing job for the asset.
 *   2. Download the source object from S3.
 *   3. Probe the source with ffprobe to determine media kind and dimensions.
 *   4. Generate derivatives (images via sharp, videos via ffmpeg + HLS +
 *      thumbnails).
 *   5. Upload all derivatives to S3.
 *   6. Post the processing results to the internal API endpoint so the
 *      asset's lifecycle state machine advances and derivatives are recorded.
 *
 * The pipeline is designed to run inside the standalone BullMQ worker
 * process. It uses the shared `db` pool singleton for job claiming and the
 * S3 helper functions for object I/O. Results are posted back to the API via
 * the internal service HTTP endpoint so the existing state-machine logic in
 * `mediaAssets.ts` remains the single source of truth for status transitions.
 *
 * @packageDocumentation
 */

import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Pool } from 'pg';
import type { S3Client } from '@aws-sdk/client-s3';
import { config } from '../../config.js';
import { db as defaultDb } from '../../db/pool.js';
import {
  getObject,
  putBinaryObject,
  putJsonObject,
} from '../s3.js';
import { logger } from '../logger.js';
import { probeMedia, type MediaProbeResult } from './ffprobe.js';
import { runFfmpeg, FfmpegError } from './ffmpeg.js';
import { generateImageDerivatives, stripImageExif, type ImageDerivative } from './sharpPipeline.js';
import { buildHlsArgs, HLS_RENDITIONS } from './hlsPackager.js';
import { generateThumbnails } from './thumbnailGenerator.js';
import { buildAssetManifest, type MediaAssetManifest, type ManifestAbr, type ManifestThumbnail } from './mediaManifest.js';

interface MediaAssetRecord {
  id: string;
  bucket: string;
  object_key: string;
  declared_content_type: string;
  declared_size_bytes: string;
  media_kind: 'image' | 'video' | 'document';
  owner_id: string;
  status: string;
  moderation_status: string;
}

interface ProcessingJobRecord {
  id: string;
  status: string;
}

interface InternalProcessingResult {
  jobId: string;
  detectedContentType: string;
  detectedSizeBytes: number;
  scanStatus: 'clean' | 'infected' | 'failed';
  moderationStatus: 'approved' | 'review' | 'rejected' | 'failed';
  processingSucceeded: boolean;
  processorError?: string;
  canonicalUrl?: string;
  width?: number;
  height?: number;
  durationMs?: number;
  blurhash?: string;
  metadata: Record<string, unknown>;
  derivatives: Array<{
    variant: string;
    mediaKind: 'image' | 'video' | 'document';
    bucket: string;
    objectKey: string;
    contentType: string;
    sizeBytes: number;
    width?: number;
    height?: number;
    durationMs?: number;
    checksumSha256?: string;
    canonicalUrl: string;
  }>;
}

const WORKER_ID = `media-worker-${process.pid}`;

// A 'processing' row whose lock is older than this is presumed abandoned
// (worker crash, BullMQ stall). Long enough that a legitimate ffmpeg run
// under the ingest timeout is never mistaken for stale.
const STALE_PROCESSING_LOCK_MS = 30 * 60 * 1000;

// Exported for tests — internal pipeline detail.
export async function claimProcessingJob(db: Pool, assetId: string): Promise<ProcessingJobRecord | null> {
  // The claim and the asset-state advance must commit atomically: the
  // processing-results endpoint enforces the media_assets state machine,
  // and integrity_verified → publishable is illegal. Without this write,
  // every healthy result posts into a 409 and the asset wedges forever.
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query<ProcessingJobRecord>(
      `UPDATE media_processing_jobs
       SET status = 'processing',
           attempt_count = attempt_count + 1,
           locked_at = NOW(),
           locked_by = $2
       WHERE id = (
         SELECT id
         FROM media_processing_jobs
         WHERE media_asset_id = $1
           AND job_type IN ('inspect_scan_process_moderate', 'retry_processing')
           AND attempt_count < max_attempts
           AND (
             (status IN ('pending', 'retry') AND available_at <= NOW())
             OR (status = 'processing' AND locked_at < NOW() - ($3::bigint * INTERVAL '1 millisecond'))
           )
         ORDER BY available_at, created_at
         LIMIT 1
         FOR UPDATE SKIP LOCKED
       )
       RETURNING id, status`,
      [assetId, WORKER_ID, STALE_PROCESSING_LOCK_MS],
    );
    const job = result.rows[0] ?? null;
    if (!job) {
      await client.query('COMMIT');
      return null;
    }

    // Advance the asset into 'processing'. 'processing' is allowed so a
    // stale-lock reclaim (prior attempt crashed after advancing) still
    // succeeds; terminal/unexpected states fail the job permanently.
    const advanced = await client.query(
      `UPDATE media_assets
       SET status = 'processing',
           processing_status = 'processing',
           failure_reason = NULL
       WHERE id = $1
         AND status IN ('integrity_verified', 'scan_pending', 'processing', 'processing_failed')`,
      [assetId],
    );
    if (!advanced.rowCount) {
      await client.query(
        `UPDATE media_processing_jobs
         SET status = 'dead', last_error = $2, completed_at = NOW()
         WHERE id = $1`,
        [job.id, 'Asset is not in a processable state'],
      );
      await client.query('COMMIT');
      return null;
    }

    await client.query('COMMIT');
    return job;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

// A 'pending'/'retry' row older than this is presumed to have lost its
// queue drive — the post-commit enqueue threw, or the BullMQ job record
// was evicted before delivery. Shorter than the enqueue round-trip would
// race a healthy enqueue.
const ORPHANED_PENDING_GRACE_MS = 60 * 1000;

export interface ClaimableIngestJob {
  id: string;
  mediaAssetId: string;
}

/**
 * Lists ingest job rows that are claimable but have no live queue drive:
 * pending/retry rows past the enqueue grace window (post-commit enqueue
 * failed or the BullMQ job was lost), and stale 'processing' locks whose
 * driving worker is gone. The predicate mirrors claimProcessingJob —
 * re-enqueued jobs still arbitrate through the atomic claim, so a row a
 * live worker is legitimately processing is never listed here (fresh
 * lock) and a double-drive is a harmless no-op claim.
 *
 * Rows at max_attempts are excluded: the claim refuses them, so
 * re-enqueueing would be a hot loop of no-op jobs.
 */
export async function listClaimableIngestJobs(db: Pool, limit = 50): Promise<ClaimableIngestJob[]> {
  const result = await db.query<{ id: string; media_asset_id: string }>(
    `SELECT j.id, j.media_asset_id
     FROM media_processing_jobs j
     JOIN media_assets a ON a.id = j.media_asset_id
     WHERE j.job_type IN ('inspect_scan_process_moderate', 'retry_processing')
       AND j.attempt_count < j.max_attempts
       AND (
         (j.status IN ('pending', 'retry')
           AND j.available_at <= NOW() - ($1::bigint * INTERVAL '1 millisecond'))
         OR (j.status = 'processing'
           AND j.locked_at < NOW() - ($2::bigint * INTERVAL '1 millisecond'))
       )
       AND a.status IN ('integrity_verified', 'scan_pending', 'processing', 'processing_failed')
     ORDER BY j.created_at
     LIMIT $3`,
    [ORPHANED_PENDING_GRACE_MS, STALE_PROCESSING_LOCK_MS, limit],
  );
  return result.rows.map((row) => ({ id: row.id, mediaAssetId: row.media_asset_id }));
}

/**
 * Lists 'processing' rows at max_attempts whose lock went stale — the
 * wedge claimProcessingJob can never rescue: the final attempt claimed
 * the row, then the worker died before posting results. Both the claim
 * and `listClaimableIngestJobs` require `attempt_count < max_attempts`,
 * so without this dead-letter pass the job — and the asset it pins in
 * 'processing' — stays wedged forever.
 */
export async function listDeadLetterableIngestJobs(db: Pool, limit = 50): Promise<ClaimableIngestJob[]> {
  const result = await db.query<{ id: string; media_asset_id: string }>(
    `SELECT j.id, j.media_asset_id
     FROM media_processing_jobs j
     JOIN media_assets a ON a.id = j.media_asset_id
     WHERE j.job_type IN ('inspect_scan_process_moderate', 'retry_processing')
       AND j.status = 'processing'
       AND j.attempt_count >= j.max_attempts
       AND j.locked_at < NOW() - ($1::bigint * INTERVAL '1 millisecond')
       AND a.status = 'processing'
     ORDER BY j.locked_at
     LIMIT $2`,
    [STALE_PROCESSING_LOCK_MS, limit],
  );
  return result.rows.map((row) => ({ id: row.id, mediaAssetId: row.media_asset_id }));
}

/**
 * Dead-letters a wedged ingest job and releases its asset: job → 'dead',
 * asset → 'processing_failed' so the creator can retry it explicitly
 * (retry_processing inserts a fresh job row) instead of staring at an
 * asset that never leaves 'processing'. Both updates are guarded on
 * current state so a claim or result-post that raced ahead wins.
 */
export async function deadLetterIngestJob(db: Pool, jobId: string, assetId: string): Promise<boolean> {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const jobResult = await client.query(
      `UPDATE media_processing_jobs
       SET status = 'dead',
           last_error = 'Attempts exhausted with a stale worker lock',
           completed_at = NOW(),
           locked_at = NULL,
           locked_by = NULL
       WHERE id = $1
         AND status = 'processing'
         AND attempt_count >= max_attempts`,
      [jobId],
    );
    if (!jobResult.rowCount) {
      await client.query('COMMIT');
      return false;
    }
    await client.query(
      `UPDATE media_assets
       SET status = 'processing_failed',
           processing_status = 'failed',
           failure_reason = 'Processing attempts exhausted with a stale worker lock'
       WHERE id = $1
         AND status = 'processing'`,
      [assetId],
    );
    await client.query('COMMIT');
    return true;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function fetchAsset(db: Pool, assetId: string): Promise<MediaAssetRecord | null> {
  const result = await db.query<MediaAssetRecord>(
    `SELECT id, bucket, object_key, declared_content_type,
            declared_size_bytes::text, media_kind, owner_id, status,
            moderation_status
     FROM media_assets
     WHERE id = $1
     LIMIT 1`,
    [assetId],
  );
  return result.rows[0] ?? null;
}

async function postProcessingResults(
  assetId: string,
  result: InternalProcessingResult,
): Promise<void> {
  const url = `${config.appUrl.replace(/\/$/, '')}/internal/media/assets/${encodeURIComponent(assetId)}/processing-results`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-service-token': config.apiInternalServiceToken,
    },
    body: JSON.stringify(result),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(
      `Posting processing results failed: HTTP ${response.status} ${body.slice(0, 500)}`,
    );
  }
}

function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

/**
 * Normalises a Content-Type string for equivalence comparison, collapsing
 * common aliases (e.g. `image/jpg` -> `image/jpeg`) so that semantically
 * identical types compare equal regardless of the label used by the client.
 */
function normalizeContentTypeForComparison(contentType: string): string {
  const base = contentType.split(';')[0]?.trim().toLowerCase() ?? '';
  if (base === 'image/jpg') {
    return 'image/jpeg';
  }
  if (base === 'image/heif') {
    return 'image/heic';
  }
  return base;
}

/**
 * Detects the media content type from magic bytes (file signature) rather
 * than trusting the client-declared Content-Type. Returns the canonical MIME
 * type, or null when the signature is not recognised.
 */
function detectContentType(buffer: Buffer): string | null {
  if (buffer.length < 12) {
    return null;
  }

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e &&
    buffer[3] === 0x47 && buffer[4] === 0x0d && buffer[5] === 0x0a &&
    buffer[6] === 0x1a && buffer[7] === 0x0a
  ) {
    return 'image/png';
  }

  // GIF: 47 49 46 38
  if (
    buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 &&
    buffer[3] === 0x38
  ) {
    return 'image/gif';
  }

  // WebP: bytes 8-11 = 57 45 42 50 ("WEBP")
  if (
    buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return 'image/webp';
  }

  // PDF: 25 50 44 46 ("%PDF")
  if (
    buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 &&
    buffer[3] === 0x46
  ) {
    return 'application/pdf';
  }

  // ISO BMFF-based formats (MP4, QuickTime, HEIC): bytes 4-7 = "ftyp"
  if (
    buffer[4] === 0x66 && buffer[5] === 0x74 && buffer[6] === 0x79 &&
    buffer[7] === 0x70
  ) {
    const brand = buffer.subarray(8, 12).toString('latin1');
    // HEIC family
    if (brand === 'heic' || brand === 'heix' || brand === 'mif1') {
      return 'image/heic';
    }
    // QuickTime
    if (brand === 'qt  ') {
      return 'video/quicktime';
    }
    // MP4 family
    if (
      brand === 'mp41' || brand === 'mp42' || brand === 'isom' ||
      brand === 'iso2' || brand === 'iso5' || brand === 'iso6' ||
      brand === 'mmp4' || brand === 'avc1' || brand === 'dash'
    ) {
      return 'video/mp4';
    }
    // Unrecognised ftyp brand — default to MP4.
    return 'video/mp4';
  }

  return null;
}

function derivativeObjectKey(assetId: string, variant: string, ext: string): string {
  return `derivatives/${assetId}/${variant}.${ext}`;
}

/**
 * Upload an FFmpeg HLS output directory (master.m3u8 + per-rendition
 * stream_i/ playlists and fMP4 segments) to S3 under `keyPrefix`
 * (`derivatives/{assetId}` for pipeline assets, `renders/{docId}/{renderId}`
 * for published composition renders). Returns the master playlist URL plus
 * the derivative/manifest records so callers can register them or not.
 */
// Exported for tests — the object-key layout is a contract with the master
// playlist's relative URIs.
export async function uploadHlsOutput(
  hlsOutputDir: string,
  keyPrefix: string,
): Promise<{
  masterPlaylistUrl: string;
  derivatives: InternalProcessingResult['derivatives'];
  manifestDerivatives: MediaAssetManifest['derivatives'];
  abrRenditions: ManifestAbr['renditions'];
}> {
  const derivatives: InternalProcessingResult['derivatives'] = [];
  const manifestDerivatives: MediaAssetManifest['derivatives'] = [];
  const abrRenditions: ManifestAbr['renditions'] = [];
  let masterPlaylistUrl = '';

  // Upload master playlist. A missing master means the entire packaged
  // output is unplayable — surface it as a failure instead of publishing a
  // canonical URL that 404s.
  const masterPath = path.join(hlsOutputDir, 'master.m3u8');
  const masterBuffer = await readFile(masterPath);
  masterPlaylistUrl = await putBinaryObject(
    `${keyPrefix}/hls/master.m3u8`,
    masterBuffer,
    'application/vnd.apple.mpegurl',
    { cacheControl: 'public, max-age=3600' },
  );

  // Upload per-rendition playlists and segments.
  for (let i = 0; i < HLS_RENDITIONS.length; i += 1) {
    const rendition = HLS_RENDITIONS[i];
    const renditionDir = path.join(hlsOutputDir, `stream_${i}`);
    let renditionDirEntries: string[] = [];
    try {
      renditionDirEntries = await readdir(renditionDir);
    } catch {
      continue;
    }

    let playlistUrl = '';

    for (const entry of renditionDirEntries) {
      const entryPath = path.join(renditionDir, entry);
      const entryStat = await stat(entryPath);
      if (!entryStat.isFile()) {
        continue;
      }

      const isPlaylist = entry.endsWith('.m3u8');
      // -hls_segment_type fmp4 emits an init.mp4 per rendition, referenced
      // by the variant playlist via #EXT-X-MAP — it must be uploaded or
      // every variant 404s its init segment.
      const isInitSegment = entry === 'init.mp4';
      const isSegment = entry.endsWith('.m4s') || isInitSegment;
      if (!isPlaylist && !isSegment) {
        continue;
      }

      const data = await readFile(entryPath);
      // ffmpeg writes stream_${i}/ per -var_stream_map index and the master
      // playlist references "stream_${i}/playlist.m3u8" relative to itself —
      // object keys must preserve that directory layout or the master's
      // relative URIs resolve to dead objects.
      const objectKey = `${keyPrefix}/hls/stream_${i}/${entry}`;
      const contentType = isPlaylist
        ? 'application/vnd.apple.mpegurl'
        : isInitSegment
          ? 'video/mp4'
          : 'video/iso.segment';
      const cacheControl = isPlaylist ? 'public, max-age=3600' : 'public, max-age=31536000, immutable';
      const url = await putBinaryObject(objectKey, data, contentType, { cacheControl });

      if (isPlaylist) {
        playlistUrl = url;
      } else {
        derivatives.push({
          variant: `hls_${rendition.name}_${entry.replace(/\.[^.]+$/, '')}`,
          mediaKind: 'video',
          bucket: config.s3Bucket,
          objectKey,
          contentType,
          sizeBytes: data.length,
          checksumSha256: sha256(data),
          canonicalUrl: url,
        });
        manifestDerivatives.push({
          variant: `hls_${rendition.name}_${entry.replace(/\.[^.]+$/, '')}`,
          mediaKind: 'video',
          format: 'fmp4',
          width: rendition.width,
          height: rendition.height,
          contentType,
          sizeBytes: data.length,
          canonicalUrl: url,
          objectKey,
        });
      }
    }

    if (playlistUrl) {
      abrRenditions.push({
        name: rendition.name,
        width: rendition.width,
        height: rendition.height,
        videoBitrate: rendition.videoBitrate,
        audioBitrate: rendition.audioBitrate,
        playlistUrl,
      });
    }
  }

  return { masterPlaylistUrl, derivatives, manifestDerivatives, abrRenditions };
}

/**
 * Generate an HLS rendition ladder for a server-rendered video (e.g. a
 * published composition render) — the same ladder the ingest pipeline
 * produces for uploaded media, keyed under the render's own prefix so it
 * doesn't collide with derivative namespaces. Returns the master playlist
 * URL, or null when packaging produced no renditions.
 */
export async function generateRenderedVideoHls(
  sourceBuffer: Buffer,
  keyPrefix: string,
  durationMs: number,
): Promise<{ masterPlaylistUrl: string | null; posterUrl: string | null }> {
  const workDir = path.join(tmpdir(), `render-hls-${randomUUID()}`);
  await mkdir(workDir, { recursive: true });
  const sourcePath = path.join(workDir, 'source');
  await writeFile(sourcePath, sourceBuffer);
  try {
    const hlsOutputDir = path.join(workDir, 'hls');
    await mkdir(hlsOutputDir, { recursive: true });
    // Probe the render for the audio flag and authoritative duration —
    // `-map 0:a` fails outright on sources without an audio stream.
    const probe = await probeMedia(sourcePath).catch(() => null);
    const effectiveDurationMs = probe?.durationMs ?? durationMs;
    await runFfmpeg(
      buildHlsArgs(sourcePath, hlsOutputDir, { hasAudio: probe?.audioCodec != null }),
      undefined,
      { totalDurationMs: effectiveDurationMs },
    );
    const { masterPlaylistUrl } = await uploadHlsOutput(hlsOutputDir, keyPrefix);

    // Poster frame for cover tiles — m3u8 playlists can't render in an
    // <Image>, so surfaces that show a still need a JPEG. Same 10%-of-
    // duration convention as the ingest pipeline's poster.
    let posterUrl: string | null = null;
    try {
      const posterPath = path.join(workDir, 'poster.jpg');
      const posterSeconds = Math.max(0, Math.floor((effectiveDurationMs / 1000) * 0.1));
      await runFfmpeg(
        [
          '-y',
          '-ss', String(posterSeconds),
          '-i', sourcePath,
          '-frames:v', '1',
          '-vf', 'scale=640:-2',
          '-q:v', '3',
          posterPath,
        ],
        undefined,
        { totalDurationMs: effectiveDurationMs },
      );
      posterUrl = await putBinaryObject(
        `${keyPrefix}/poster.jpg`,
        await readFile(posterPath),
        'image/jpeg',
        { cacheControl: 'public, max-age=31536000, immutable' },
      );
    } catch (posterError) {
      logger.warn(
        { err: posterError, keyPrefix },
        '[mediaPipeline] rendered-video poster generation failed — covers will fall back',
      );
    }

    return { masterPlaylistUrl: masterPlaylistUrl || null, posterUrl };
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function processImageAsset(
  asset: MediaAssetRecord,
  sourceBuffer: Buffer,
  probe: MediaProbeResult,
): Promise<{
  derivatives: InternalProcessingResult['derivatives'];
  manifestDerivatives: MediaAssetManifest['derivatives'];
  lqip: string;
  blurhash: string | null;
  canonicalUrl: string;
  /** Post-EXIF-orientation source geometry — authoritative for the
   *  persisted asset width/height. */
  sourceWidth: number;
  sourceHeight: number;
}> {
  const {
    derivatives: imageDerivatives,
    lqip,
    blurhash,
    sourceWidth,
    sourceHeight,
  } = await generateImageDerivatives(sourceBuffer);

  const uploaded: InternalProcessingResult['derivatives'] = [];
  const manifestDerivatives: MediaAssetManifest['derivatives'] = [];

  // The largest WebP derivative is the canonical delivery URL.
  let canonicalUrl = '';

  for (const derivative of imageDerivatives) {
    const ext = derivative.format === 'jpeg' ? 'jpg' : derivative.format;
    const objectKey = derivativeObjectKey(asset.id, derivative.variant, ext);
    const url = await putBinaryObject(objectKey, derivative.buffer, derivative.contentType);
    const checksum = sha256(derivative.buffer);

    uploaded.push({
      variant: derivative.variant,
      mediaKind: 'image',
      bucket: config.s3Bucket,
      objectKey,
      contentType: derivative.contentType,
      sizeBytes: derivative.buffer.length,
      width: derivative.width,
      height: derivative.height,
      checksumSha256: checksum,
      canonicalUrl: url,
    });

    manifestDerivatives.push({
      variant: derivative.variant,
      mediaKind: 'image',
      format: derivative.format,
      width: derivative.width,
      height: derivative.height,
      contentType: derivative.contentType,
      sizeBytes: derivative.buffer.length,
      canonicalUrl: url,
      objectKey,
    });

    if (derivative.format === 'webp' && (canonicalUrl === '' || derivative.width >= 800)) {
      canonicalUrl = url;
    }
  }

  if (!canonicalUrl && uploaded.length > 0) {
    canonicalUrl = uploaded[0].canonicalUrl;
  }

  return {
    derivatives: uploaded,
    manifestDerivatives,
    lqip,
    blurhash,
    canonicalUrl,
    sourceWidth,
    sourceHeight,
  };
}

async function processVideoAsset(
  asset: MediaAssetRecord,
  sourceBuffer: Buffer,
  probe: MediaProbeResult,
): Promise<{
  derivatives: InternalProcessingResult['derivatives'];
  manifestDerivatives: MediaAssetManifest['derivatives'];
  abr: ManifestAbr | null;
  thumbnails: ManifestThumbnail[];
  posterUrl: string | null;
  canonicalUrl: string;
}> {
  const workDir = path.join(tmpdir(), `media-${asset.id}-${Date.now()}`);
  await mkdir(workDir, { recursive: true });

  const sourcePath = path.join(workDir, 'source');
  await writeFile(sourcePath, sourceBuffer);

  try {
    const hlsOutputDir = path.join(workDir, 'hls');
    await mkdir(hlsOutputDir, { recursive: true });

    const hlsArgs = buildHlsArgs(sourcePath, hlsOutputDir, {
      hasAudio: probe.audioCodec != null,
    });
    await runFfmpeg(hlsArgs, undefined, {
      totalDurationMs: probe.durationMs ?? 0,
    });

    const { thumbnails: thumbnailFiles, posterPath } = await generateThumbnails(
      sourcePath,
      path.join(workDir, 'thumbnails'),
      probe.durationMs ?? 0,
    );

    // Upload HLS segments and playlists (shared helper — also used by
    // published composition renders via generateRenderedVideoHls).
    const {
      masterPlaylistUrl,
      derivatives,
      manifestDerivatives,
      abrRenditions,
    } = await uploadHlsOutput(hlsOutputDir, `derivatives/${asset.id}`);

    const abr: ManifestAbr | null = masterPlaylistUrl && abrRenditions.length > 0
      ? { masterPlaylistUrl, renditions: abrRenditions }
      : null;

    // Upload thumbnails.
    const thumbnails: ManifestThumbnail[] = [];
    for (const thumb of thumbnailFiles) {
      const data = await readFile(thumb.path);
      const objectKey = `derivatives/${asset.id}/thumbnails/${path.basename(thumb.path)}`;
      const url = await putBinaryObject(objectKey, data, 'image/jpeg');
      thumbnails.push({ timeSeconds: thumb.timeSeconds, url });
      derivatives.push({
        variant: `thumb_${thumb.timeSeconds}s`,
        mediaKind: 'image',
        bucket: config.s3Bucket,
        objectKey,
        contentType: 'image/jpeg',
        sizeBytes: data.length,
        checksumSha256: sha256(data),
        canonicalUrl: url,
      });
      manifestDerivatives.push({
        variant: `thumb_${thumb.timeSeconds}s`,
        mediaKind: 'image',
        format: 'jpeg',
        width: null,
        height: null,
        contentType: 'image/jpeg',
        sizeBytes: data.length,
        canonicalUrl: url,
        objectKey,
      });
    }

    // Upload poster.
    let posterUrl: string | null = null;
    try {
      const posterData = await readFile(posterPath);
      const url = await putBinaryObject(
        `derivatives/${asset.id}/poster.jpg`,
        posterData,
        'image/jpeg',
      );
      posterUrl = url;
      derivatives.push({
        variant: 'poster',
        mediaKind: 'image',
        bucket: config.s3Bucket,
        objectKey: `derivatives/${asset.id}/poster.jpg`,
        contentType: 'image/jpeg',
        sizeBytes: posterData.length,
        checksumSha256: sha256(posterData),
        canonicalUrl: url,
      });
      manifestDerivatives.push({
        variant: 'poster',
        mediaKind: 'image',
        format: 'jpeg',
        width: null,
        height: null,
        contentType: 'image/jpeg',
        sizeBytes: posterData.length,
        canonicalUrl: url,
        objectKey: `derivatives/${asset.id}/poster.jpg`,
      });
    } catch {
      posterUrl = null;
    }

    const canonicalUrl = masterPlaylistUrl || (posterUrl ?? '');

    return { derivatives, manifestDerivatives, abr, thumbnails, posterUrl, canonicalUrl };
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Processes a single media asset end-to-end. Designed to be called from the
 * BullMQ media_ingest worker handler.
 *
 * @param assetId - The media asset id to process.
 * @param db - The database pool (defaults to the shared singleton).
 * @param _s3 - Reserved for the S3 client contract; object I/O uses the s3.ts
 *   helpers which encapsulate bucket configuration.
 */
export async function processMediaAsset(
  assetId: string,
  db: Pool = defaultDb,
  _s3?: S3Client,
): Promise<void> {
  logger.info({ assetId, workerId: WORKER_ID }, '[mediaPipeline] starting processing');

  const asset = await fetchAsset(db, assetId);
  if (!asset) {
    logger.warn({ assetId }, '[mediaPipeline] asset not found — skipping');
    return;
  }

  const job = await claimProcessingJob(db, assetId);
  if (!job) {
    logger.info({ assetId }, '[mediaPipeline] no pending processing job — skipping');
    return;
  }

  try {
    // Download the source object.
    const sourceBuffer = await getObject(asset.object_key);
    const detectedChecksum = sha256(sourceBuffer);

    // Probe — write to a temp file for ffprobe.
    const workDir = path.join(tmpdir(), `media-probe-${assetId}-${Date.now()}`);
    await mkdir(workDir, { recursive: true });
    const sourcePath = path.join(workDir, 'source');
    await writeFile(sourcePath, sourceBuffer);

    let probe: MediaProbeResult;
    try {
      probe = await probeMedia(sourcePath);
    } finally {
      await rm(workDir, { recursive: true, force: true }).catch(() => {});
    }

    // Moderation — skip if already done (approved/review/rejected).
    // FAIL-CLOSED: when no external moderation provider has run, default to
    // 'review' (human approval required) instead of 'approved'.  This
    // prevents unmoderated content from being published automatically.
    const moderationStatus: InternalProcessingResult['moderationStatus'] =
      asset.moderation_status === 'approved'
        ? 'approved'
        : asset.moderation_status === 'review'
          ? 'review'
          : asset.moderation_status === 'rejected'
            ? 'rejected'
            : 'review'; // Fail-closed: require human review when moderation has not run.

    // Detect the content type from magic bytes rather than trusting the
    // client-declared value. When the signature disagrees with the declared
    // type (after alias normalisation), surface the detected value so the
    // existing resolveMediaProcessingOutcome logic flags the mismatch as an
    // integrity failure.
    const magicType = detectContentType(sourceBuffer);
    let detectedContentType: string;
    if (magicType !== null) {
      const normalizedDeclared = normalizeContentTypeForComparison(asset.declared_content_type);
      const normalizedDetected = normalizeContentTypeForComparison(magicType);
      if (normalizedDeclared === normalizedDetected) {
        detectedContentType = asset.declared_content_type;
      } else {
        detectedContentType = magicType;
      }
    } else {
      detectedContentType = asset.declared_content_type;
    }
    const detectedSizeBytes = sourceBuffer.length;

    // Integrity check — detected size must match declared size.
    if (detectedSizeBytes !== Number(asset.declared_size_bytes)) {
      const result: InternalProcessingResult = {
        jobId: job.id,
        detectedContentType,
        detectedSizeBytes,
        scanStatus: 'clean',
        moderationStatus,
        processingSucceeded: false,
        processorError: 'Detected size does not match declared size',
        metadata: { detectedChecksum },
        derivatives: [],
      };
      await postProcessingResults(assetId, result);
      return;
    }

    // Strip EXIF metadata (GPS, device serial, timestamps) from the original
    // source object to protect uploader privacy. The public URL serves this
    // cleaned object. Re-encode through sharp (which discards all input
    // metadata by default) and overwrite the source object in place. This is
    // a one-time clean-on-first-process operation. Video metadata is stripped
    // at transcode time via -map_metadata -1 in the HLS packager.
    let processingBuffer = sourceBuffer;
    if (probe.mediaKind === 'image') {
      try {
        const cleanedBuffer = await stripImageExif(sourceBuffer, detectedContentType);
        if (cleanedBuffer !== sourceBuffer) {
          await putBinaryObject(asset.object_key, cleanedBuffer, detectedContentType);
          processingBuffer = cleanedBuffer;
          logger.info({ assetId }, '[mediaPipeline] stripped EXIF from original source object');
        }
      } catch (exifError) {
        logger.warn({ err: exifError, assetId }, '[mediaPipeline] EXIF strip failed — proceeding with original');
      }
    }

    let derivatives: InternalProcessingResult['derivatives'] = [];
    let manifestDerivatives: MediaAssetManifest['derivatives'] = [];
    let abr: ManifestAbr | null = null;
    let thumbnails: ManifestThumbnail[] = [];
    let posterUrl: string | null = null;
    let lqip: string | null = null;
    let blurhash: string | null = null;
    let canonicalUrl = '';
    // Persisted geometry defaults to the ffprobe values; for images the
    // derivative pipeline reports post-EXIF-orientation dims, which are the
    // authoritative ones — orientation tags 5–8 swap width/height relative
    // to the coded stream ffprobe measures.
    let resultWidth = probe.width ?? undefined;
    let resultHeight = probe.height ?? undefined;

    if (probe.mediaKind === 'image') {
      const imageResult = await processImageAsset(asset, processingBuffer, probe);
      derivatives = imageResult.derivatives;
      manifestDerivatives = imageResult.manifestDerivatives;
      lqip = imageResult.lqip;
      blurhash = imageResult.blurhash;
      canonicalUrl = imageResult.canonicalUrl;
      resultWidth = imageResult.sourceWidth;
      resultHeight = imageResult.sourceHeight;
    } else if (probe.mediaKind === 'video') {
      const videoResult = await processVideoAsset(asset, sourceBuffer, probe);
      derivatives = videoResult.derivatives;
      manifestDerivatives = videoResult.manifestDerivatives;
      abr = videoResult.abr;
      thumbnails = videoResult.thumbnails;
      posterUrl = videoResult.posterUrl;
      canonicalUrl = videoResult.canonicalUrl;
    } else {
      // Audio / document — no derivatives generated; the source object is the
      // canonical delivery URL.
      canonicalUrl = `${config.s3CdnBaseUrl.replace(/\/$/, '')}/${asset.bucket}/${asset.object_key}`;
    }

    // Build and persist the manifest.
    const manifest = buildAssetManifest({
      assetId,
      probe,
      derivatives: manifestDerivatives,
      abrManifests: abr,
      thumbnails,
      poster: posterUrl,
      lqip,
      blurhash,
    });
    const manifestKey = `derivatives/${assetId}/manifest.json`;
    await putJsonObject(manifestKey, manifest, {
      cacheControl: 'public, max-age=3600',
      metadata: { 'asset-id': assetId },
    });

    const result: InternalProcessingResult = {
      jobId: job.id,
      detectedContentType,
      detectedSizeBytes,
      scanStatus: 'clean',
      moderationStatus,
      processingSucceeded: true,
      canonicalUrl,
      width: resultWidth,
      height: resultHeight,
      durationMs: probe.durationMs ?? undefined,
      blurhash: blurhash ?? undefined,
      metadata: {
        manifestUrl: `${config.s3CdnBaseUrl.replace(/\/$/, '')}/${config.s3Bucket}/${manifestKey}`,
        detectedChecksum,
        lqip,
        abr: abr,
        thumbnails,
        posterUrl,
      },
      derivatives,
    };

    await postProcessingResults(assetId, result);
    logger.info({ assetId, derivativeCount: derivatives.length }, '[mediaPipeline] processing completed');
  } catch (error) {
    const isFfmpegError = error instanceof FfmpegError;
    const processorError = isFfmpegError
      ? `ffmpeg ${error.category}: ${error.stderr.slice(-500)}`
      : error instanceof Error ? error.message : 'Unknown processing error';

    logger.error({ err: error, assetId, jobId: job.id }, '[mediaPipeline] processing failed');

    const result: InternalProcessingResult = {
      jobId: job.id,
      detectedContentType: asset.declared_content_type,
      detectedSizeBytes: Number(asset.declared_size_bytes),
      scanStatus: 'clean',
      moderationStatus: 'failed',
      processingSucceeded: false,
      processorError,
      metadata: {},
      derivatives: [],
    };

    try {
      await postProcessingResults(assetId, result);
    } catch (postError) {
      logger.error({ err: postError, assetId, jobId: job.id }, '[mediaPipeline] failed to post error results');
    }

    throw error;
  }
}
