import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { fetchJson } from '../lib/apiClient';
import { MediaUploadAsset } from '../utils/mediaUploadAsset';
import {
  xhrPutFile,
  isAbortError,
  createAbortError,
} from '../platform/media/xhrUploadTransport';

/** Optional cancellation + real byte progress for the PUT transport. */
export interface MediaUploadOptions {
  signal?: AbortSignal;
  onProgress?: (loadedBytes: number, totalBytes: number) => void;
}

export interface PresignResponse {
  uploadIntentId: string;
  bucket: string;
  key: string;
  url: string;
  publicUrl: string;
  contentType: string;
  sizeBytes: number;
  maxSizeBytes: number;
  expiresInSeconds: number;
  expiresAt: string;
}

export interface UploadFinalizationInput {
  objectKey: string;
  bucket?: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  publicUrl: string;
  folder?: string;
  scope?:
    | 'general'
    | 'chat_attachment'
    | 'listing_media'
    | 'avatar'
    | 'cover'
    | 'poster'
    | 'look'
    | 'evidence'
    | 'review';
  scopeRefId?: string;
  metadata?: Record<string, unknown>;
  verifyObject?: boolean;
  signal?: AbortSignal;
}

export interface UploadFinalization {
  id: string;
  objectKey: string;
  bucket: string;
  folder: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  publicUrl: string;
  deliveryStatus?: 'unmoderated_source_object';
  publicationGateRequired?: boolean;
  status: 'pending' | 'finalized' | 'failed';
  scope: string;
  scopeRefId: string | null;
  headCheckedAt: string | null;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
  mediaAsset?: MediaAssetReceipt | null;
}

export type MediaAssetReceipt = {
  id: string;
  status:
    | 'integrity_verified'
    | 'scan_pending'
    | 'processing'
    | 'moderation_pending'
    | 'publishable'
    | 'published'
    | 'upload_expired'
    | 'integrity_failed'
    | 'quarantined'
    | 'rejected'
    | 'processing_failed'
    | 'revoked'
    | 'deleted';
  mediaKind: 'image' | 'video' | 'audio' | 'document';
  canonicalUrl: string | null;
  publishable: boolean;
  /** Processor-measured post-orientation geometry — authoritative over
   *  client-declared dims, which flip portrait↔landscape once EXIF
   *  orientation is baked in. */
  width?: number | null;
  height?: number | null;
  durationMs?: number | null;
  /** Decodable BlurHash placeholder computed by the media pipeline. */
  blurhash?: string | null;
  focalX?: number | null;
  focalY?: number | null;
  failureReason?: string | null;
  quarantineReason?: string | null;
};

export async function presignUpload(
  fileName: string,
  contentType: string,
  folder = 'uploads',
  sizeBytes: number,
  signal?: AbortSignal
): Promise<PresignResponse> {
  return fetchJson<PresignResponse>('/uploads/presign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileName, contentType, folder, sizeBytes }),
    signal,
  });
}

/** Maximum PUT attempts (including the first) before giving up. */
const UPLOAD_MAX_RETRIES = 3;
/** Base delay (ms) for exponential backoff between upload retries. */
const UPLOAD_BASE_BACKOFF_MS = 1000;
/** Upper bound (ms) for exponential backoff between upload retries. */
const UPLOAD_MAX_BACKOFF_MS = 30_000;

/** Exponential backoff with +25% jitter, mirroring UploadManager.computeBackoff. */
function computeBackoff(attempt: number): number {
  const exp = UPLOAD_BASE_BACKOFF_MS * Math.pow(2, attempt);
  const capped = Math.min(UPLOAD_MAX_BACKOFF_MS, exp);
  return Math.round(capped + Math.random() * capped * 0.25);
}

/** Map an HTTP status code to a human-friendly error string. */
function httpStatusToMessage(status: number): string {
  if (status === 400) return 'The file format is not supported.';
  if (status === 403) return 'Permission denied. The upload URL may have expired.';
  if (status === 404) return 'The upload destination was not found.';
  if (status === 408) return 'The upload timed out. Try again.';
  if (status === 413) return 'The file is too large.';
  if (status >= 500) return 'The server had a problem. Try again.';
  return `Upload failed (${status}).`;
}

/** Promise-based sleep that rejects early if the signal aborts. */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(createAbortError());
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(createAbortError());
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export async function uploadToPresignedUrl(
  presignedUrl: string,
  fileUri: string,
  contentType: string,
  preparedBlob?: Blob,
  opts?: MediaUploadOptions
): Promise<void> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt < UPLOAD_MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      await sleep(computeBackoff(attempt - 1), opts?.signal);
    }

    try {
      await xhrPutFile(presignedUrl, fileUri, contentType, {
        signal: opts?.signal,
        onProgress: opts?.onProgress,
        blob: preparedBlob,
      });
      return;
    } catch (err) {
      // Cancellation is never retried — rethrow immediately.
      if (isAbortError(err)) throw err;
      const status = (err as { status?: number }).status;
      // 4xx are deterministic failures; only 5xx and network errors retry.
      if (typeof status === 'number' && status < 500) {
        throw new Error(httpStatusToMessage(status));
      }
      const error = typeof status === 'number'
        ? new Error(httpStatusToMessage(status))
        : err instanceof Error
        ? err
        : new Error('Upload failed');
      if (attempt < UPLOAD_MAX_RETRIES) {
        lastError = error;
        continue;
      }
      throw error;
    }
  }

  throw lastError ?? new Error('Upload failed after retries.');
}

/**
 * Finalize an upload with the backend so the object is verified in S3 and
 * recorded durably. Call this after `uploadToPresignedUrl` succeeds.
 *
 * Throws if the finalization fails or the server cannot verify the object.
 * Callers should treat a thrown finalize as "the upload did not land" and
 * surface an honest error — do not silently proceed with the publicUrl.
 */
export async function finalizeUpload(
  input: UploadFinalizationInput
): Promise<UploadFinalization> {
  const payload = await fetchJson<{ ok: true; finalization: UploadFinalization }>(
    '/uploads/finalize',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        objectKey: input.objectKey,
        bucket: input.bucket,
        fileName: input.fileName,
        contentType: input.contentType,
        sizeBytes: input.sizeBytes,
        publicUrl: input.publicUrl,
        folder: input.folder ?? 'uploads',
        scope: input.scope ?? 'general',
        scopeRefId: input.scopeRefId,
        metadata: input.metadata ?? {},
        verifyObject: input.verifyObject ?? true,
      }),
      signal: input.signal,
    }
  );
  return payload.finalization;
}

export interface UploadedMedia {
  publicUrl: string;
  objectKey: string;
  finalizationId: string;
  mediaAssetId?: string;
  sizeBytes: number;
  contentType: string;
  /** Processor-computed BlurHash, when the asset has finished processing. */
  blurhash?: string | null;
  /** Processor-measured post-orientation geometry. */
  width?: number | null;
  height?: number | null;
}

const MEDIA_PROCESSING_TIMEOUT_MS = 90_000;
const MEDIA_PROCESSING_POLL_MS = 1_500;

function waitFor(delayMs: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(createAbortError());
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, delayMs);
    const onAbort = () => {
      clearTimeout(timer);
      reject(createAbortError());
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

async function fetchMediaAsset(assetId: string, signal?: AbortSignal): Promise<MediaAssetReceipt> {
  const payload = await fetchJson<{ ok: true; asset: MediaAssetReceipt }>(
    `/media/assets/${encodeURIComponent(assetId)}`,
    { signal },
  );
  return payload.asset;
}

export async function publishMediaAsset(assetId: string, signal?: AbortSignal): Promise<MediaAssetReceipt> {
  const payload = await fetchJson<{ ok: true; asset: MediaAssetReceipt }>(
    `/media/assets/${encodeURIComponent(assetId)}/publish`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
      signal,
    },
  );
  return payload.asset;
}

/** Map a terminal media-asset status to actionable user-facing copy. */
function terminalStatusMessage(status: MediaAssetReceipt['status']): string {
  switch (status) {
    case 'quarantined':
      return 'This media couldn\'t be verified. Try a different file.';
    case 'processing_failed':
      return 'Processing failed. Please try again.';
    case 'integrity_failed':
      return 'The file appears to be corrupted. Try a different file.';
    case 'rejected':
      return 'This media was rejected. Please try a different file.';
    case 'upload_expired':
      return 'The upload expired. Please try again.';
    case 'revoked':
      return 'This media is no longer available.';
    case 'deleted':
      return 'This media was removed.';
    default:
      return `Media processing ended with status ${status}.`;
  }
}

export async function waitForPublishableMedia(
  assetId: string,
  signal?: AbortSignal,
): Promise<MediaAssetReceipt> {
  const deadline = Date.now() + MEDIA_PROCESSING_TIMEOUT_MS;
  const terminalFailureStatuses = new Set<MediaAssetReceipt['status']>([
    'upload_expired',
    'integrity_failed',
    'quarantined',
    'rejected',
    'revoked',
    'deleted',
    'processing_failed',
  ]);

  while (Date.now() < deadline) {
    if (signal?.aborted) throw createAbortError();
    const asset = await fetchMediaAsset(assetId, signal);
    if (asset.status === 'published') {
      return asset;
    }
    if (asset.status === 'publishable') {
      return publishMediaAsset(assetId, signal);
    }
    if (terminalFailureStatuses.has(asset.status)) {
      throw new Error(
        asset.failureReason
        ?? asset.quarantineReason
        ?? terminalStatusMessage(asset.status),
      );
    }
    await waitFor(MEDIA_PROCESSING_POLL_MS, signal);
  }

  throw new Error(
    'Media is still being checked. Keep this draft and try publishing again shortly.',
  );
}

function creatorScopeForFolder(folder: string): UploadFinalizationInput['scope'] {
  if (folder === 'looks') return 'look';
  if (folder === 'posters') return 'poster';
  if (folder === 'listings') return 'listing_media';
  if (folder === 'avatars') return 'avatar';
  if (folder === 'covers') return 'cover';
  if (folder === 'evidence') return 'evidence';
  if (folder === 'review') return 'review';
  return 'general';
}

export interface FinalizePresignedMediaInput {
  presign: PresignResponse;
  fileName: string;
  folder: string;
  scopeRefId?: string;
  metadata?: Record<string, unknown>;
  signal?: AbortSignal;
}

/**
 * Convert an object-store PUT into a trusted creator asset. A successful PUT
 * is not publication: the backend must verify the object, create the durable
 * media-asset receipt and, when enabled, complete scanning/processing before
 * returning a canonical delivery URL.
 */
export async function finalizePresignedMedia(
  input: FinalizePresignedMediaInput,
): Promise<UploadedMedia> {
  const { presign, fileName, folder, signal } = input;
  const finalization = await finalizeUpload({
    objectKey: presign.key,
    bucket: presign.bucket,
    fileName,
    contentType: presign.contentType,
    sizeBytes: presign.sizeBytes,
    publicUrl: presign.publicUrl,
    folder,
    scope: creatorScopeForFolder(folder),
    scopeRefId: input.scopeRefId,
    metadata: input.metadata,
    signal,
  });

  if (finalization.status !== 'finalized') {
    throw new Error(
      `Upload finalization ${finalization.status}: ${finalization.failureReason ?? 'unknown'}`,
    );
  }

  let resolvedPublicUrl = presign.publicUrl;
  let resolvedAsset = finalization.mediaAsset;
  if (finalization.publicationGateRequired) {
    if (!finalization.mediaAsset?.id) {
      throw new Error('The media processor did not return a canonical asset reference');
    }
    const publishedAsset = await waitForPublishableMedia(finalization.mediaAsset.id, signal);
    if (!publishedAsset.canonicalUrl) {
      throw new Error('The published media asset has no canonical delivery URL');
    }
    resolvedPublicUrl = publishedAsset.canonicalUrl;
    resolvedAsset = publishedAsset;
  }

  return {
    publicUrl: resolvedPublicUrl,
    objectKey: presign.key,
    finalizationId: finalization.id,
    mediaAssetId: resolvedAsset?.id ?? finalization.mediaAsset?.id,
    sizeBytes: presign.sizeBytes,
    contentType: presign.contentType,
    blurhash: resolvedAsset?.blurhash ?? null,
    width: resolvedAsset?.width ?? null,
    height: resolvedAsset?.height ?? null,
  };
}

/** Performance marks are unavailable on some Hermes runtimes — never throw. */
const safeMark = (name: string) => {
  if (typeof performance !== 'undefined' && typeof performance.mark === 'function') {
    performance.mark(name);
  }
};

/**
 * Resolve the real byte size without holding the file in JS memory.
 * Native uploads stream from disk via `send({ uri })`, so only the byte
 * count is needed for presign; web must read a Blob to send one. The Blob
 * is returned when one was read so callers can reuse it as the PUT body.
 */
async function resolveUploadSize(
  fileUri: string,
  knownSizeBytes: number,
  signal?: AbortSignal
): Promise<{ sizeBytes: number; blob?: Blob }> {
  if (Platform.OS === 'web') {
    const blob = await fetch(fileUri, { signal }).then((response) => response.blob());
    return { sizeBytes: blob.size || knownSizeBytes, blob };
  }
  if (knownSizeBytes > 0) return { sizeBytes: knownSizeBytes };
  try {
    const info = await FileSystem.getInfoAsync(fileUri);
    if (info.exists && typeof info.size === 'number' && info.size > 0) {
      return { sizeBytes: info.size };
    }
  } catch {
    // getInfoAsync may not support ph:// or content:// URIs.
  }
  // An upload of unknown-size garbage is worse than a clean failure — the
  // caller's retry/error path surfaces this instead of preloading a Blob.
  throw new Error('Could not determine file size. The file may be inaccessible.');
}

export function uploadMedia(
  fileUri: string,
  folder?: string,
  opts?: MediaUploadOptions
): Promise<UploadedMedia>;
export function uploadMedia(
  asset: MediaUploadAsset,
  folder?: string,
  opts?: MediaUploadOptions
): Promise<UploadedMedia>;

export async function uploadMedia(
  source: string | MediaUploadAsset,
  folder = 'uploads',
  opts?: MediaUploadOptions
): Promise<UploadedMedia> {
  // Performance mark: image/media upload start.
  safeMark('upload:start');

  let fileUri: string;
  let fileName: string;
  let contentType: string;
  let sizeBytes: number;
  let preparedBlob: Blob | undefined;

  if (typeof source === 'string') {
    fileUri = source;
    const ext = fileUri.split('.').pop()?.toLowerCase() ?? 'jpg';
    // Extension-based inference; refined from the actual bytes below when a
    // Blob is read (web, or the native size-probe last resort). Extension
    // detection alone is unreliable for ph:// and content:// URIs (e.g.
    // "ph://EB4F8C9C-.../L/0") which often lack extensions.
    contentType =
      ext === 'png'
        ? 'image/png'
        : ext === 'gif'
        ? 'image/gif'
        : ext === 'webp'
        ? 'image/webp'
        : ext === 'mp4' || ext === 'm4v'
        ? 'video/mp4'
        : ext === 'mov'
        ? 'video/quicktime'
        : ext === 'm4a' || ext === 'aac'
        ? 'audio/m4a'
        : ext === 'ogg' || ext === 'opus'
        ? 'audio/ogg'
        : ext === 'webm'
        ? 'audio/webm'
        : 'image/jpeg';
    fileName = `media_${Date.now()}_${Math.floor(Math.random() * 1_000_000).toString(36)}.${ext}`;

    const resolved = await resolveUploadSize(fileUri, 0, opts?.signal);
    sizeBytes = resolved.sizeBytes;
    preparedBlob = resolved.blob;
    if (resolved.blob?.type && resolved.blob.type.length > 0) {
      contentType = resolved.blob.type;
    }
  } else {
    fileUri = source.uri;
    fileName = source.fileName;
    contentType = source.mimeType;
    const resolved = await resolveUploadSize(fileUri, source.fileSize ?? 0, opts?.signal);
    sizeBytes = resolved.sizeBytes;
    preparedBlob = resolved.blob;
  }

  const presign = await presignUpload(fileName, contentType, folder, sizeBytes, opts?.signal);
  await uploadToPresignedUrl(presign.url, fileUri, contentType, preparedBlob, opts);

  // Finalize with the backend so the object is verified in S3 and recorded
  // durably. If this throws, the caller must surface an honest error — the
  // upload may have landed but the backend cannot vouch for it.
  const uploaded = await finalizePresignedMedia({ presign, fileName, folder, signal: opts?.signal });

  // Performance mark: image/media upload complete (finalized + published).
  safeMark('upload:complete');

  return uploaded;
}
