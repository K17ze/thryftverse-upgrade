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
 * Parts are read from the local file using `fetch(uri).then(r => r.blob())`
 * followed by `Blob.slice(startByte, endByte)`. This loads the chunk into
 * JS memory. For very large videos this is heavier than a native streaming
 * solution, but it works without adding native dependencies (per project
 * constraints). A future native module could stream byte ranges directly.
 */

import { fetchJson } from '../../../lib/apiClient';
import type { UploadSession, UploadPart } from './UploadTypes';
import { DEFAULT_PART_SIZE } from './UploadTypes';

/** Response shape from `POST /uploads/multipart/initiate`. */
interface InitiateResponse {
  ok: boolean;
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
  presignedParts: Array<{ url: string; partNumber: number; expiresInSeconds: number }>;
}

/** Response shape from `POST /uploads/multipart/:id/complete`. */
interface CompleteResponse {
  ok: boolean;
  finalizationId: string;
  objectKey: string;
  publicUrl: string;
  sizeBytes: number;
  contentType: string;
  duplicate?: boolean;
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

    // Map the presigned URLs from the initiate response to a plain object
    // so the first batch can be uploaded without fetching URLs. A plain
    // object (not Map) survives JSON serialisation in AsyncStorage.
    const presignedUrls: Record<number, string> = {};
    for (const p of response.presignedParts) {
      presignedUrls[p.partNumber] = p.url;
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

    // Use the cached presigned URL if available; otherwise fetch it.
    let presignedUrl = session.presignedUrls?.[part.partNumber];
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
      presignedUrl = partUrlRes.presignedParts[0]?.url;
      if (!presignedUrl) {
        throw new Error(`Backend returned no presigned URL for part ${part.partNumber}`);
      }
      // Cache for potential retry.
      if (!session.presignedUrls) {
        session.presignedUrls = {};
      }
      session.presignedUrls[part.partNumber] = presignedUrl;
    }

    // Read the chunk from the local file.
    const chunk = await this.readChunk(filePath, part.startByte, part.endByte);

    // Upload the chunk to S3 via XHR for real byte progress.
    const etag = await this.xhrPutChunk(
      presignedUrl,
      chunk,
      session.mimeType,
      onProgress,
      signal,
    );

    part.etag = etag;
    part.status = 'completed';
  }

  /**
   * Complete the multipart upload. Sends the ETag list to the backend,
   * which tells S3 to assemble the parts into the final object and
   * creates an `upload_finalizations` record.
   *
   * Returns the public URL of the assembled object. The `finalizationId`
   * is stored on the session so the caller can pass it to downstream
   * consumers (listing publication, media assets).
   */
  async complete(session: UploadSession): Promise<string> {
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

    // Store the finalizationId on the session so the caller can use it.
    session.finalizationId = response.finalizationId;

    return response.publicUrl;
  }

  /** Abort an in-progress multipart upload, freeing S3 part storage. */
  async abort(session: UploadSession): Promise<void> {
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
   * Returns the final public URL.
   */
  async resume(
    session: UploadSession,
    filePath: string,
    onProgress: (uploadedBytes: number) => void,
    signal: AbortSignal,
  ): Promise<string> {
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
    for (let attempt = 0; attempt <= this.maxPartRetries; attempt++) {
      if (signal.aborted) throw new Error('Aborted');
      try {
        part.retries = attempt;
        await this.uploadPart(session, part, filePath, onProgress, signal);
        return;
      } catch (err) {
        if (signal.aborted) throw err;
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
   * Uses `fetch(uri).then(r => r.blob())` to load the file, then
   * `Blob.slice()` to extract the chunk. This loads the full file into
   * memory — acceptable for images and short videos. For very large
   * files, a native streaming reader would be more efficient.
   */
  private async readChunk(
    filePath: string,
    startByte: number,
    endByte: number,
  ): Promise<Blob> {
    const blob = await fetch(filePath).then((r) => r.blob());
    return blob.slice(startByte, endByte + 1);
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
  ): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', url);
      xhr.setRequestHeader('Content-Type', mimeType);

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          onProgress(event.loaded);
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
