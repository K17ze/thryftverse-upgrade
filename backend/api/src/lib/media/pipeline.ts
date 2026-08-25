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

import { createHash } from 'node:crypto';
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

async function claimProcessingJob(db: Pool, assetId: string): Promise<ProcessingJobRecord | null> {
  const result = await db.query<ProcessingJobRecord>(
    `UPDATE media_processing_jobs
     SET status = 'processing',
         attempt_count = attempt_count + 1,
         locked_at = NOW(),
         locked_by = $2
     WHERE id = (
       SELECT id
       FROM media_processing_jobs
       WHERE media_asset_id = $1
         AND status IN ('pending', 'retry')
         AND available_at <= NOW()
         AND attempt_count < max_attempts
       ORDER BY available_at, created_at
       LIMIT 1
       FOR UPDATE SKIP LOCKED
     )
     RETURNING id, status`,
    [assetId, WORKER_ID],
  );
  return result.rows[0] ?? null;
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

async function processImageAsset(
  asset: MediaAssetRecord,
  sourceBuffer: Buffer,
  probe: MediaProbeResult,
): Promise<{
  derivatives: InternalProcessingResult['derivatives'];
  manifestDerivatives: MediaAssetManifest['derivatives'];
  lqip: string;
  blurhash: string;
  canonicalUrl: string;
}> {
  const { derivatives: imageDerivatives, lqip, blurhash } = await generateImageDerivatives(sourceBuffer);

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

  return { derivatives: uploaded, manifestDerivatives, lqip, blurhash, canonicalUrl };
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

    const hlsArgs = buildHlsArgs(sourcePath, hlsOutputDir);
    await runFfmpeg(hlsArgs, undefined, {
      totalDurationMs: probe.durationMs ?? 0,
    });

    const { thumbnails: thumbnailFiles, posterPath } = await generateThumbnails(
      sourcePath,
      path.join(workDir, 'thumbnails'),
      probe.durationMs ?? 0,
    );

    // Upload HLS segments and playlists.
    const derivatives: InternalProcessingResult['derivatives'] = [];
    const manifestDerivatives: MediaAssetManifest['derivatives'] = [];
    const abrRenditions: ManifestAbr['renditions'] = [];
    let masterPlaylistUrl = '';

    // The master playlist and per-rendition playlists are uploaded as text
    // and segments as binary.
    // Upload master playlist.
    const masterPath = path.join(hlsOutputDir, 'master.m3u8');
    try {
      const masterBuffer = await readFile(masterPath);
      masterPlaylistUrl = await putBinaryObject(
        `derivatives/${asset.id}/hls/master.m3u8`,
        masterBuffer,
        'application/vnd.apple.mpegurl',
        { cacheControl: 'public, max-age=3600' },
      );
    } catch {
      // master.m3u8 may be at a different path depending on ffmpeg version
      masterPlaylistUrl = '';
    }

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
        const isSegment = entry.endsWith('.m4s');
        if (!isPlaylist && !isSegment) {
          continue;
        }

        const data = await readFile(entryPath);
        const objectKey = `derivatives/${asset.id}/hls/${rendition.name}/${entry}`;
        const contentType = isPlaylist ? 'application/vnd.apple.mpegurl' : 'video/iso.segment';
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

    if (probe.mediaKind === 'image') {
      const imageResult = await processImageAsset(asset, processingBuffer, probe);
      derivatives = imageResult.derivatives;
      manifestDerivatives = imageResult.manifestDerivatives;
      lqip = imageResult.lqip;
      blurhash = imageResult.blurhash;
      canonicalUrl = imageResult.canonicalUrl;
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
      width: probe.width ?? undefined,
      height: probe.height ?? undefined,
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
