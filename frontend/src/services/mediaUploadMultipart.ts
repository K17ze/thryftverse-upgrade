import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { fetchJson } from '../lib/apiClient';
import {
  xhrPutFile,
  isAbortError,
  createAbortError,
} from '../platform/media/xhrUploadTransport';

/**
 * S3 multipart (resumable) upload client.
 *
 * The backend exposes four endpoints that together implement resumable
 * uploads for large files:
 *
 *   POST /uploads/multipart/initiate        — create the session, presign the
 *                                              first batch of parts (up to 100)
 *   POST /uploads/multipart/:id/parts       — presign additional parts
 *   POST /uploads/multipart/:id/complete     — assemble the object + finalise
 *   POST /uploads/multipart/:id/abort       — cancel the session
 *
 * This module orchestrates that flow: it splits the file into parts, uploads
 * each part directly to S3 via a presigned PUT (with per-part retry on
 * transient failures), collects the ETags and completes the session. On any
 * failure or cancellation the session is aborted so orphaned parts do not
 * accumulate in S3.
 *
 * The public surface mirrors `mediaUpload.ts`'s single-PUT helpers so the
 * upload queue can choose the transport based on file size without the caller
 * knowing which path was used.
 */

/** Files at or above this size use the multipart path. */
export const MULTIPART_THRESHOLD_BYTES = 10 * 1024 * 1024;
/** Size of each S3 part. S3 requires a minimum of 5MB for all but the last. */
export const PART_SIZE_BYTES = 5 * 1024 * 1024;
/** Maximum PUT attempts (including the first) per part before giving up. */
const PART_MAX_RETRIES = 3;
/** Base delay (ms) for exponential backoff between part retries. */
const PART_BASE_BACKOFF_MS = 1000;
/** Upper bound (ms) for exponential backoff between part retries. */
const PART_MAX_BACKOFF_MS = 30_000;

export interface MultipartPresignedPart {
  url: string;
  partNumber: number;
  expiresInSeconds: number;
}

export interface MultipartInitiateResponse {
  ok: boolean;
  sessionId: string;
  uploadId: string;
  objectKey: string;
  bucket: string;
  publicUrl: string;
  partSize: number;
  partCount: number;
  presignedParts: MultipartPresignedPart[];
  expiresAt: string;
}

export interface MultipartPartResult {
  partNumber: number;
  etag: string;
}

export interface MultipartCompleteResponse {
  ok: boolean;
  finalizationId: string;
  objectKey: string;
  publicUrl: string;
  sizeBytes: number;
  contentType: string;
}

export interface MultipartUploadOptions {
  signal?: AbortSignal;
  onProgress?: (loadedBytes: number, totalBytes: number) => void;
}

export interface MultipartUploadResult {
  finalizationId: string;
  objectKey: string;
  publicUrl: string;
  sizeBytes: number;
  contentType: string;
}

/* ── backend API wrappers ── */

export async function initiateMultipartUpload(
  fileName: string,
  contentType: string,
  folder: string,
  sizeBytes: number,
  partSize: number,
  signal?: AbortSignal,
): Promise<MultipartInitiateResponse> {
  return fetchJson<MultipartInitiateResponse>('/uploads/multipart/initiate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileName, contentType, folder, sizeBytes, partSize }),
    signal,
  });
}

export async function presignMultipartParts(
  sessionId: string,
  partNumbers: number[],
  signal?: AbortSignal,
): Promise<MultipartPresignedPart[]> {
  const payload = await fetchJson<{ ok: boolean; presignedParts: MultipartPresignedPart[] }>(
    `/uploads/multipart/${encodeURIComponent(sessionId)}/parts`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ partNumbers }),
      signal,
    },
  );
  return payload.presignedParts;
}

export async function completeMultipartUpload(
  sessionId: string,
  parts: MultipartPartResult[],
  signal?: AbortSignal,
): Promise<MultipartCompleteResponse> {
  return fetchJson<MultipartCompleteResponse>(
    `/uploads/multipart/${encodeURIComponent(sessionId)}/complete`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parts }),
      signal,
    },
  );
}

/**
 * Abort a multipart session. Best-effort: never throws — a failed abort
 * leaves orphaned parts in S3 (reclaimed by the bucket lifecycle) but must
 * not mask the original upload error.
 */
export async function abortMultipartUploadSession(
  sessionId: string,
  signal?: AbortSignal,
): Promise<void> {
  try {
    await fetchJson<{ ok: boolean }>(
      `/uploads/multipart/${encodeURIComponent(sessionId)}/abort`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
        signal,
      },
    );
  } catch {
    // Swallow — the caller's original error/cancellation is what matters.
  }
}

/* ── part byte resolution ── */

/**
 * Decode a base64 string to a `Uint8Array`. Uses the platform `atob` when
 * available (React Native + web both ship it) and falls back to a small
 * polyfill for runtimes that lack it.
 */
function base64ToUint8Array(base64: string): Uint8Array {
  const clean = base64.replace(/[^A-Za-z0-9+/=]/g, '');
  const binary =
    typeof atob === 'function' ? atob(clean) : atobPolyfill(clean);
  const len = binary.length;
  // Construct over an explicit ArrayBuffer so the result satisfies the
  // `BlobPart`/`ArrayBufferView<ArrayBuffer>` contract used by `new Blob(...)`.
  const buffer = new ArrayBuffer(len);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function atobPolyfill(input: string): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let str = input.replace(/=+$/, '');
  let output = '';
  for (let bc = 0, bs = 0, buffer = 0, i = 0; i < str.length; i++) {
    const idx = chars.indexOf(str.charAt(i));
    if (idx === -1) continue;
    buffer = (buffer << 6) | idx;
    bs += 6;
    if (bs >= 8) {
      output += String.fromCharCode((buffer >> (bs - 8)) & 0xff);
      bs -= 8;
    }
  }
  return output;
}

/**
 * Read a byte range of the file as a `Blob` suitable for a single part PUT.
 *
 * - Web: slice the already-resolved whole-file `Blob` (the queue reads one for
 *   size probing), avoiding a second fetch.
 * - Native: `expo-file-system` reads the byte range as base64 with
 *   `position`/`length`, which is decoded into a `Blob`. Only one part is
 *   held in JS memory at a time, so a 100MB video never loads fully.
 */
async function readPartBlob(
  fileUri: string,
  wholeBlob: Blob | undefined,
  mimeType: string,
  start: number,
  end: number,
  signal?: AbortSignal,
): Promise<Blob> {
  if (signal?.aborted) throw createAbortError();

  if (wholeBlob) {
    return wholeBlob.slice(start, end, mimeType);
  }

  if (Platform.OS === 'web') {
    // No pre-resolved blob on web: fetch the file then slice.
    const blob = await fetch(fileUri, { signal }).then((response) => response.blob());
    return blob.slice(start, end, mimeType);
  }

  // Native: read the byte range as base64 and decode to a Blob. expo-file-system
  // supports `position`/`length` on `file://` URIs (the scheme the image picker
  // returns by default when copyToCacheDirectory is true).
  const length = end - start;
  const base64 = await FileSystem.readAsStringAsync(fileUri, {
    encoding: 'base64',
    position: start,
    length,
  });
  const bytes = base64ToUint8Array(base64);
  // `bytes.buffer` is an ArrayBuffer (allocated in base64ToUint8Array); cast
  // satisfies the `BlobPart` contract which requires ArrayBuffer, not
  // ArrayBufferLike (SharedArrayBuffer is excluded).
  return new Blob([bytes.buffer as ArrayBuffer], { type: mimeType });
}

/* ── per-part retry ── */

/** Exponential backoff with +25% jitter, mirroring the single-PUT transport. */
function computePartBackoff(attempt: number): number {
  const exp = PART_BASE_BACKOFF_MS * Math.pow(2, attempt);
  const capped = Math.min(PART_MAX_BACKOFF_MS, exp);
  return Math.round(capped + Math.random() * capped * 0.25);
}

function partSleep(ms: number, signal?: AbortSignal): Promise<void> {
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

/**
 * PUT a single part with retry on transient (5xx / network) failures.
 * 4xx errors are deterministic and never retried; cancellation rethrows
 * immediately. Returns the part's S3 ETag.
 */
async function putPartWithRetry(
  presignedUrl: string,
  fileUri: string,
  mimeType: string,
  partBlob: Blob,
  opts: MultipartUploadOptions,
): Promise<string> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt < PART_MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      await partSleep(computePartBackoff(attempt - 1), opts.signal);
    }
    try {
      const etag = await xhrPutFile(presignedUrl, fileUri, mimeType, {
        signal: opts.signal,
        onProgress: opts.onProgress,
        blob: partBlob,
      });
      if (!etag) {
        throw new Error('S3 did not return an ETag for the uploaded part');
      }
      return etag;
    } catch (err) {
      // Cancellation is never retried — rethrow immediately.
      if (isAbortError(err)) throw err;
      const status = (err as { status?: number }).status;
      // 4xx are deterministic failures; only 5xx and network errors retry.
      if (typeof status === 'number' && status < 500) {
        throw err;
      }
      lastError = err instanceof Error ? err : new Error('Part upload failed');
      if (attempt < PART_MAX_RETRIES - 1) {
        continue;
      }
      throw lastError;
    }
  }
  throw lastError ?? new Error('Part upload failed after retries.');
}

/* ── orchestrator ── */

export interface UploadMultipartInput {
  fileUri: string;
  fileName: string;
  contentType: string;
  folder: string;
  sizeBytes: number;
  /** Pre-resolved whole-file blob (web). Omit on native to stream ranges. */
  wholeBlob?: Blob;
  signal?: AbortSignal;
  onProgress?: (loadedBytes: number, totalBytes: number) => void;
}

/**
 * Upload a large file via the S3 multipart flow.
 *
 * Splits the file into `PART_SIZE_BYTES` parts, PUTs each directly to S3 via a
 * presigned URL (with per-part retry on transient failures), then completes
 * the session so the backend assembles the object and creates the final
 * finalization record. Progress is aggregated across all parts.
 *
 * On any failure or cancellation the multipart session is aborted (best
 * effort) so orphaned parts do not accumulate in S3, and the original error is
 * rethrown for the caller to surface.
 */
export async function uploadMultipart(
  input: UploadMultipartInput,
): Promise<MultipartUploadResult> {
  const { fileUri, fileName, contentType, folder, sizeBytes, wholeBlob, signal, onProgress } = input;
  const partSize = PART_SIZE_BYTES;
  const partCount = Math.max(1, Math.ceil(sizeBytes / partSize));

  const initiated = await initiateMultipartUpload(
    fileName,
    contentType,
    folder,
    sizeBytes,
    partSize,
    signal,
  );

  try {
    // Index the first batch of presigned URLs by part number. The backend
    // presigns up to 100 parts at initiation; for larger files additional
    // parts are presigned on demand via the parts endpoint.
    const presignedByPart = new Map<number, string>();
    for (const part of initiated.presignedParts) {
      presignedByPart.set(part.partNumber, part.url);
    }

    const completedParts: MultipartPartResult[] = [];
    let cumulativeLoaded = 0;

    for (let partNumber = 1; partNumber <= partCount; partNumber++) {
      if (signal?.aborted) throw createAbortError();

      let presignedUrl = presignedByPart.get(partNumber);
      if (!presignedUrl) {
        const extra = await presignMultipartParts(initiated.sessionId, [partNumber], signal);
        presignedUrl = extra[0]?.url;
        if (!presignedUrl) {
          throw new Error(`Failed to presign part ${partNumber}`);
        }
      }

      const start = (partNumber - 1) * partSize;
      const end = Math.min(start + partSize, sizeBytes);
      const partBlob = await readPartBlob(fileUri, wholeBlob, contentType, start, end, signal);

      // Aggregate progress: each part's onProgress reports bytes uploaded for
      // that part, offset by the cumulative total of completed parts.
      const partBase = cumulativeLoaded;
      const partBytes = end - start;
      const etag = await putPartWithRetry(presignedUrl, fileUri, contentType, partBlob, {
        signal,
        onProgress: (loaded) => {
          const total = partBase + Math.min(loaded, partBytes);
          onProgress?.(Math.min(total, sizeBytes), sizeBytes);
        },
      });

      completedParts.push({ partNumber, etag });
      cumulativeLoaded = partBase + partBytes;
      onProgress?.(Math.min(cumulativeLoaded, sizeBytes), sizeBytes);
    }

    const completed = await completeMultipartUpload(
      initiated.sessionId,
      completedParts,
      signal,
    );

    return {
      finalizationId: completed.finalizationId,
      objectKey: completed.objectKey,
      publicUrl: completed.publicUrl,
      sizeBytes: completed.sizeBytes,
      contentType: completed.contentType,
    };
  } catch (err) {
    // Abort the session on failure or cancellation so orphaned parts are
    // freed. The abort call is best-effort and never throws; the original
    // error is rethrown so the caller can surface it.
    await abortMultipartUploadSession(initiated.sessionId);
    throw err;
  }
}
