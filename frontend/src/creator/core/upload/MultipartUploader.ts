/**
 * S3 multipart upload — frontend implementation.
 *
 * Implements the client side of the S3 multipart upload protocol:
 *
 *   1. Initiate → obtain an `uploadId` + `sessionId` from the backend
 *   2. Upload each part → PUT to a per-part presigned URL, capture ETag
 *   3. Complete → send the ETag list to the backend, receive final URL +
 *      finalizationId
 *   4. Abort → cancel an in-progress multipart upload
 *   5. Resume → skip parts that already have an ETag, upload the rest
 *
 * ## Backend endpoint contract
 *
 * The backend (`backend/api/src/routes/uploads.ts`) exposes:
 *
 * ```
 * POST /uploads/multipart/initiate
 *   body: { fileName, contentType, sizeBytes, partSize, folder }
 *   → { sessionId, uploadId, objectKey, bucket, publicUrl,
 *       partSize, partCount, presignedParts, expiresAt }
 *
 * POST /uploads/multipart/:id/parts
 *   body: { partNumbers: number[] }
 *   → { presignedParts: [{ url, partNumber, expiresInSeconds }] }
 *
 * POST /uploads/multipart/:id/complete
 *   body: { parts: [{ partNumber, etag }] }
 *   → { finalizationId, objectKey, publicUrl, sizeBytes, contentType }
 *
 * POST /uploads/multipart/:id/abort
 *   → { ok: true }
 * ```
 *
 * The initiate endpoint returns presigned URLs for the first batch of
 * parts (up to 100) so the client can start uploading immediately. For
 * files with more than 100 parts, additional presigned URLs are fetched
 * via the `/parts` endpoint.
 *
 * ## File chunking
 *
 * Parts are read from the local file using `expo-file-system`'s
 * `readAsStringAsync` with `position` + `length` options, which reads only
 * the chunk's byte range into JS memory as a base64 string — not the entire
 * file. The base64 chunk is converted to a Blob for the XHR PUT. For URI
 * schemes that `expo-file-system` cannot read with position/length (e.g.
 * `ph://`, `content://`), the code falls back to a single full-file Blob
 * fetch + slice.
 */

import * as FileSystem from 'expo-file-system/legacy';
import { fetchJson } from '../../../lib/apiClient';
import type { UploadSession, UploadPart } from './UploadTypes';
import { DEFAULT_PART_SIZE } from './UploadTypes';

/** Per-part XHR upload timeout (ms). S3 PUTs for 5 MB chunks should finish
 *  well within 2 minutes on any reasonable connection; if they don't, the
 *  request is stale and the retry loop takes over. */
const CHUNK_TIMEOUT_MS = 120_000;

/** Response shape from `POST /uploads/multipart/initiate`. */
interface InitiateResponse {
  ok: boolean;
  error?: string;
  sessionId: string;
  uploadId: string;
  objectKey: string;
  bucket: string;
  publicUrl: string;
  partSize: number;
  partCount: number;
  presignedParts: Array<{ url: string; partNumber: number; expiresInSeconds: number }>;
  expiresAt: string;
}

/** Response shape from `POST /uploads/multipart/:id/parts`. */
interface PartsResponse {
  ok: boolean;
  error?: string;
  presignedParts: Array<{ url: string; partNumber: number; expiresInSeconds: number }>;
}

/** Response shape from `POST /uploads/multipart/:id/complete`. */
interface CompleteResponse {
  ok: boolean;
  error?: string;
  finalizationId: string;
  objectKey: string;
  publicUrl: string;
  sizeBytes: number;
  contentType: string;
  duplicate?: boolean;
  mediaAsset?: {
    id: string;
    status: string;
    mediaKind: 'image' | 'video' | 'audio' | 'document';
    canonicalUrl: string | null;
    publishable: boolean;
    processingRequired: boolean;
  } | null;
}

/** Result of completing a multipart upload — the final URL plus the
 *  finalization and media-asset evidence the caller needs to converge
 *  with the single-PUT path. */
export interface MultipartCompleteResult {
  publicUrl: string;
  finalizationId: string;
  mediaAssetId?: string;
}

/** Part ETag entry sent to the complete endpoint. */
interface CompletedPart {
  partNumber: number;
  etag: string;
}

/** Options for the multipart uploader. */
export interface MultipartUploaderOptions {
  /** Part size in bytes. Defaults to `DEFAULT_PART_SIZE` (5 MB). */
  partSize?: number;
  /** Maximum retries per part. */
  maxPartRetries?: number;
}

/**
 * S3 multipart upload client.
 *
 * Stateless between calls — all session state lives in the `UploadSession`
 * object, which the caller persists via `UploadJobStore`. This makes
 * resume trivial: load the session, call `resume()`, and only parts
 * without an ETag are re-uploaded.
 */
export class MultipartUploader {
  private partSize: number;
  private maxPartRetries: number;
  /** Cached full-file Blob — used only as a fallback for URI schemes that
   *  `expo-file-system` cannot read with `position`/`length` (e.g. `ph://`,
   *  `content://`). For `file://` URIs the chunk-read path is used instead,
   *  which reads only the chunk's byte range into memory. Cleared on
   *  `complete()` / `abort()` so memory is released as soon as the upload
   *  finishes. */
  private cachedBlob: Blob | null = null;
  private cachedBlobPath: string | null = null;

  constructor(options?: MultipartUploaderOptions) {
    this.partSize = options?.partSize ?? DEFAULT_PART_SIZE;
    this.maxPartRetries = options?.maxPartRetries ?? 3;
  }

  /**
   * Initiate a multipart upload. Creates the `UploadSession` with all
   * parts pre-computed (byte ranges + status `pending`). The backend
   * returns presigned URLs for the first batch of parts, which are
   * stored in the session so `uploadPart` can use them without a
   * second round-trip.
   */
  async initiate(
    filePath: string,
    mimeType: string,
    sizeBytes: number,
    assetId: string,
    folder: string,
  ): Promise<UploadSession> {
    const parts = this.computeParts(sizeBytes);
    const fileName = filePath.split('/').pop() ?? assetId;

    const response = await fetchJson<InitiateResponse>(
      '/uploads/multipart/initiate',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName,
          contentType: mimeType,
          sizeBytes,
          partSize: this.partSize,
          folder,
        }),
      },
    );

    if (!response.ok) throw new Error(response.error ?? 'Upload initiate request failed');

    // Map the presigned URLs from the initiate response to a plain object
    // so the first batch can be uploaded without fetching URLs. A plain
    // object (not Map) survives JSON serialisation in AsyncStorage.
    const presignedUrls: Record<number, string> = {};
    for (const p of response.presignedParts) {
      presignedUrls[p.partNumber] = p.url;
      // Track per-URL expiry from the initial batch too, so the stale-URL
      // guard in `uploadPart` works for the first batch without a /parts
      // round-trip.
      const part = parts.find((pt) => pt.partNumber === p.partNumber);
      if (part) {
        part.presignedUrlExpiresAt = Date.now() + p.expiresInSeconds * 1000;
      }
    }

    const now = Date.now();
    const expiresAtMs = new Date(response.expiresAt).getTime();
    return {
      uploadId: response.uploadId,
      key: response.objectKey,
      sessionId: response.sessionId,
      presignedUrls,
      parts,
      totalBytes: sizeBytes,
      uploadedBytes: 0,
      initiatedAt: now,
      expiresAt: Number.isFinite(expiresAtMs) ? expiresAtMs : now + 7 * 24 * 60 * 60 * 1000,
      mimeType,
      assetId,
    };
  }

  /**
   * Upload a single part. Reads the byte range from the local file,
   * PUTs it to the presigned URL, and stores the returned ETag.
   *
   * If the part's presigned URL is already in the session (from the
   * initiate response), it is used directly. Otherwise, a batch of
   * presigned URLs is fetched from the backend.
   *
   * Reports real byte progress via `onProgress`.
   */
  async uploadPart(
    session: UploadSession,
    part: UploadPart,
    filePath: string,
    onProgress: (bytes: number) => void,
    signal: AbortSignal,
  ): Promise<void> {
    part.status = 'uploading';

    // Guard against expired presigned URLs. The session carries an
    // `expiresAt` timestamp (ms epoch). If it has passed, every cached URL
    // is stale — uploading to one would silently fail with a 403 from S3
    // after wasting bandwidth. Instead of throwing a hard failure, refresh
    // the presigned URLs for all remaining parts via the /parts endpoint.
    // If the underlying S3 session is truly gone, the /parts call itself
    // will fail and surface a clear error.
    if (session.expiresAt && Date.now() > session.expiresAt) {
      await this.refreshSessionUrls(session);
    }

    // Use the cached presigned URL if available; otherwise fetch it.
    let presignedUrl = session.presignedUrls?.[part.partNumber];
    if (presignedUrl && part.presignedUrlExpiresAt && Date.now() >= part.presignedUrlExpiresAt) {
      delete session.presignedUrls?.[part.partNumber];
      part.presignedUrlExpiresAt = undefined;
      presignedUrl = undefined;
    }
    if (!presignedUrl) {
      const partUrlRes = await fetchJson<PartsResponse>(
        `/uploads/multipart/${encodeURIComponent(session.sessionId!)}/parts`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            partNumbers: [part.partNumber],
          }),
        },
      );
      const fetched = partUrlRes.presignedParts[0];
      presignedUrl = fetched?.url;
      if (!presignedUrl) {
        throw new Error(`Backend returned no presigned URL for part ${part.partNumber}`);
      }
      // Cache for potential retry.
      if (!session.presignedUrls) {
        session.presignedUrls = {};
      }
      session.presignedUrls[part.partNumber] = presignedUrl;
      part.presignedUrlExpiresAt = Date.now() + fetched.expiresInSeconds * 1000;
    }

    // Read the chunk from the local file.
    const chunk = await this.readChunk(filePath, part.startByte, part.endByte, session.mimeType);

    // Upload the chunk to S3 via XHR for real byte progress.
    const etag = await this.xhrPutChunk(
      presignedUrl,
      chunk,
      session.mimeType,
      onProgress,
      signal,
      session,
      part,
    );

    part.etag = etag;
    part.status = 'completed';
  }

  /**
   * Complete the multipart upload. Sends the ETag list to the backend,
   * which tells S3 to assemble the parts into the final object and
   * creates an `upload_finalizations` record + `media_assets` row.
   *
   * Returns the public URL of the assembled object, the finalization ID,
   * and the media asset ID (when the backend creates one). The caller is
   * responsible for waiting for the asset to reach a publishable state
   * before treating the upload as complete — identical to the single-PUT
   * path's `finalizePresignedMedia` contract.
   */
  async complete(session: UploadSession): Promise<MultipartCompleteResult> {
    const completedParts: CompletedPart[] = session.parts
      .filter((p) => p.status === 'completed' && p.etag)
      .map((p) => ({ partNumber: p.partNumber, etag: p.etag! }));

    if (completedParts.length !== session.parts.length) {
      throw new Error(
        `Cannot complete: ${completedParts.length}/${session.parts.length} parts uploaded`,
      );
    }

    // S3 requires parts sorted by part number.
    completedParts.sort((a, b) => a.partNumber - b.partNumber);

    const response = await fetchJson<CompleteResponse>(
      `/uploads/multipart/${encodeURIComponent(session.sessionId!)}/complete`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parts: completedParts,
        }),
      },
    );

    if (!response.ok) throw new Error(response.error ?? 'Upload complete request failed');

    // Store the finalizationId on the session so the caller can use it.
    session.finalizationId = response.finalizationId;

    // Release the cached full-file Blob now that all parts are uploaded.
    this.clearBlobCache();

    return {
      publicUrl: response.publicUrl,
      finalizationId: response.finalizationId,
      mediaAssetId: response.mediaAsset?.id,
    };
  }

  /** Abort an in-progress multipart upload, freeing S3 part storage. */
  async abort(session: UploadSession): Promise<void> {
    // Release the cached full-file Blob — no more parts will be uploaded.
    this.clearBlobCache();
    if (!session.sessionId) return;
    try {
      await fetchJson<{ ok: boolean }>(
        `/uploads/multipart/${encodeURIComponent(session.sessionId)}/abort`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        },
      );
    } catch {
      // Best-effort: if the abort call fails (e.g. network), the S3
      // lifecycle policy will eventually clean up orphaned parts.
    }
  }

  /**
   * Resume an interrupted multipart upload. Skips parts that already
   * have an ETag (status `completed`), uploads the remaining parts,
   * and completes the upload.
   *
   * Returns the completion result (public URL + finalization/asset IDs).
   */
  async resume(
    session: UploadSession,
    filePath: string,
    onProgress: (uploadedBytes: number) => void,
    signal: AbortSignal,
    onPartComplete?: (part: UploadPart) => void,
  ): Promise<MultipartCompleteResult> {
    // Recompute uploadedBytes from completed parts.
    let uploadedBytes = 0;
    for (const part of session.parts) {
      if (part.status === 'completed' && part.etag) {
        uploadedBytes += part.sizeBytes;
      }
    }

    // Upload remaining parts.
    for (const part of session.parts) {
      if (signal.aborted) throw new Error('Aborted');
      if (part.status === 'completed' && part.etag) continue;

      await this.uploadPartWithRetry(session, part, filePath, (partBytes) => {
        uploadedBytes += partBytes;
        onProgress(uploadedBytes);
      }, signal);
      onPartComplete?.(part);
    }

    return this.complete(session);
  }

  // ── Internals ───────────────────────────────────────────────────

  /** Upload a part with retry on transient failures. */
  private async uploadPartWithRetry(
    session: UploadSession,
    part: UploadPart,
    filePath: string,
    onProgress: (bytes: number) => void,
    signal: AbortSignal,
  ): Promise<void> {
    let lastError: Error | undefined;
    // Track bytes reported for the current attempt so we can undo them
    // when a retry starts from zero. Without this, a failed attempt that
    // reported 3 MB of progress followed by a successful retry that
    // reports 5 MB would double-count to 8 MB for a 5 MB part.
    let attemptBytes = 0;
    for (let attempt = 0; attempt <= this.maxPartRetries; attempt++) {
      if (signal.aborted) throw new Error('Aborted');
      // Reset the per-attempt counter at the start of each retry.
      attemptBytes = 0;
      try {
        part.retries = attempt;
        await this.uploadPart(session, part, filePath, (delta) => {
          attemptBytes += delta;
          onProgress(delta);
        }, signal);
        return;
      } catch (err) {
        if (signal.aborted) throw err;
        // Undo the progress reported during the failed attempt so the
        // running total is accurate when the retry starts from zero.
        if (attemptBytes > 0) {
          onProgress(-attemptBytes);
        }
        lastError = err instanceof Error ? err : new Error(String(err));
        part.status = 'failed';
        if (attempt < this.maxPartRetries) {
          const delay = Math.min(10_000, 1000 * Math.pow(2, attempt));
          await this.sleep(delay, signal);
        }
      }
    }
    throw lastError ?? new Error(`Part ${part.partNumber} failed after retries`);
  }

  /** Compute the parts array for a given total size. */
  private computeParts(totalBytes: number): UploadPart[] {
    const parts: UploadPart[] = [];
    let offset = 0;
    let partNumber = 1;
    while (offset < totalBytes) {
      const endByte = Math.min(offset + this.partSize, totalBytes) - 1;
      parts.push({
        partNumber,
        startByte: offset,
        endByte,
        sizeBytes: endByte - offset + 1,
        status: 'pending',
        retries: 0,
      });
      offset = endByte + 1;
      partNumber++;
    }
    // S3 requires at least 1 part. If the file is empty, create a
    // single zero-byte part (edge case, but prevents crashes).
    if (parts.length === 0) {
      parts.push({
        partNumber: 1,
        startByte: 0,
        endByte: 0,
        sizeBytes: 0,
        status: 'pending',
        retries: 0,
      });
    }
    return parts;
  }

  /**
   * Read a byte range from a local file as a Blob.
   *
   * Uses `expo-file-system`'s `readAsStringAsync` with `position` + `length`
   * to read only the chunk's byte range into JS memory as a base64 string,
   * then converts it to a Blob. This avoids loading the entire file into
   * memory — for a 100 MB video with 20 parts, only one ~5 MB chunk is
   * resident at a time instead of the full 100 MB.
   *
   * For URI schemes that `expo-file-system` cannot read with `position`/
   * `length` (e.g. `ph://`, `content://`), falls back to a single full-file
   * Blob fetch + slice. The fallback cache is cleared by `clearBlobCache()`.
   */
  private async readChunk(
    filePath: string,
    startByte: number,
    endByte: number,
    _mimeType: string,
  ): Promise<Blob> {
    const length = endByte - startByte + 1;
    try {
      const base64 = await FileSystem.readAsStringAsync(filePath, {
        position: startByte,
        length,
        encoding: FileSystem.EncodingType.Base64,
      });
      // Convert the base64 chunk to a Blob via a data URI. The MIME type
      // in the data URI is irrelevant — the actual Content-Type header is
      // set on the XHR separately.
      const blob = await fetch(`data:application/octet-stream;base64,${base64}`).then((r) =>
        r.blob(),
      );
      return blob;
    } catch {
      // Fallback for URIs that don't support position/length reads
      // (e.g. ph://, content://). This loads the full file into memory
      // but only for these exotic URI schemes.
    }

    if (this.cachedBlobPath !== filePath || !this.cachedBlob) {
      this.cachedBlob = await fetch(filePath).then((r) => r.blob());
      this.cachedBlobPath = filePath;
    }
    if (!this.cachedBlob) {
      throw new Error('Blob cache was not populated');
    }
    return this.cachedBlob.slice(startByte, endByte + 1);
  }

  /** Release the cached full-file Blob. Called after `complete()` or
   *  `abort()` so the file's bytes are not held in memory once the upload
   *  is done. */
  clearBlobCache(): void {
    this.cachedBlob = null;
    this.cachedBlobPath = null;
  }

  /**
   * Refresh presigned URLs for all remaining (non-completed) parts by
   * calling the backend `/parts` endpoint. Used when the session's
   * `expiresAt` has passed — instead of throwing a hard failure, the
   * upload continues with fresh URLs. If the underlying S3 session is
   * truly gone, the `/parts` call itself will fail and surface a clear
   * error.
   */
  private async refreshSessionUrls(session: UploadSession): Promise<void> {
    if (!session.sessionId) throw new Error('Upload session has no session ID');
    const remainingPartNumbers = session.parts
      .filter((p) => p.status !== 'completed')
      .map((p) => p.partNumber);
    if (remainingPartNumbers.length === 0) return;

    const response = await fetchJson<PartsResponse>(
      `/uploads/multipart/${encodeURIComponent(session.sessionId)}/parts`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partNumbers: remainingPartNumbers }),
      },
    );
    if (!response.ok) throw new Error(response.error ?? 'Failed to refresh upload session URLs');

    if (!session.presignedUrls) session.presignedUrls = {};
    for (const p of response.presignedParts) {
      session.presignedUrls[p.partNumber] = p.url;
      const part = session.parts.find((pt) => pt.partNumber === p.partNumber);
      if (part) {
        part.presignedUrlExpiresAt = Date.now() + p.expiresInSeconds * 1000;
      }
    }
    // Optimistically extend the session expiry so we don't re-refresh on
    // every subsequent part. The presigned URLs carry their own per-URL
    // expiry; the session expiry is a coarse guard.
    session.expiresAt = Date.now() + 60 * 60 * 1000;
  }

  /**
   * PUT a Blob chunk to a presigned S3 URL via XMLHttpRequest.
   * Returns the ETag from the S3 response header.
   *
   * Uses XHR (not fetch) to get real `upload.onprogress` byte events.
   */
  private xhrPutChunk(
    url: string,
    chunk: Blob,
    mimeType: string,
    onProgress: (bytes: number) => void,
    signal: AbortSignal,
    session: UploadSession,
    part: UploadPart,
  ): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', url);
      xhr.timeout = CHUNK_TIMEOUT_MS;
      xhr.setRequestHeader('Content-Type', mimeType);

      // Track lastLoaded per XHR so we report the delta (bytes sent since
      // the last event) rather than the cumulative loaded count. The
      // caller accumulates deltas; on retry, the failed attempt's deltas
      // are undone by `uploadPartWithRetry` before the new XHR starts.
      let lastLoaded = 0;
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const delta = event.loaded - lastLoaded;
          lastLoaded = event.loaded;
          if (delta > 0) {
            onProgress(delta);
          }
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          const etag = xhr.getResponseHeader('ETag');
          if (etag) {
            // S3 returns ETag wrapped in quotes; strip them.
            resolve(etag.replace(/^"|"$/g, ''));
          } else {
            reject(new Error('S3 part response missing ETag header'));
          }
        } else {
          if (xhr.status === 403) {
            delete session.presignedUrls?.[part.partNumber];
            part.presignedUrlExpiresAt = undefined;
          }
          reject(new Error(`Part upload failed: HTTP ${xhr.status}`));
        }
      };

      xhr.onerror = () => reject(new Error('Network error during part upload'));
      xhr.ontimeout = () => reject(new Error('Part upload timed out'));

      const onAbort = () => {
        xhr.abort();
        reject(new Error('Aborted'));
      };
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener('abort', onAbort, { once: true });

      xhr.send(chunk);
    });
  }

  /** Promise-based sleep that rejects early if the signal aborts. */
  private sleep(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (signal.aborted) {
        reject(new Error('Aborted'));
        return;
      }
      const timer = setTimeout(() => {
        signal.removeEventListener('abort', onAbort);
        resolve();
      }, ms);
      const onAbort = () => {
        clearTimeout(timer);
        reject(new Error('Aborted'));
      };
      signal.addEventListener('abort', onAbort, { once: true });
    });
  }
}
