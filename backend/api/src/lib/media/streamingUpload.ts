/**
 * StreamingMultipartUpload — pushes a byte stream (e.g. FFmpeg's `pipe:1`
 * transcode output) into S3 as multipart parts WHILE the producer is still
 * running, overlapping encode and upload instead of serialising them.
 *
 * The stream must be append-only once written (fragmented MP4 with
 * `frag_keyframe+empty_moov` qualifies; a classic `+faststart` MP4 does not
 * — the moov relocation rewrites earlier bytes after parts were sent).
 *
 * Behaviour:
 *   - Parts are cut at {@link PART_SIZE} (≥ S3's 5MB floor).
 *   - If the whole stream finishes under one part, a plain PutObject is
 *     issued instead — no multipart overhead for small renders.
 *   - Part uploads are sequential (the caller's async pump backpressures
 *     the producer during an S3 round-trip, bounding memory to one part).
 *   - {@link abort} releases a partial session; `push`/`finish` throw after
 *     abort so the producer can't keep appending to a dead upload.
 *
 * @packageDocumentation
 */

import { Buffer } from 'node:buffer';
import {
  abortMultipartUpload,
  completeMultipartUpload,
  createMultipartUpload,
  putBinaryObject,
  uploadPartObject,
} from '../s3.js';
import { logger } from '../logger.js';

/** Part size above S3's 5MB floor (8MB keeps part counts low: max 10k). */
export const STREAM_PART_SIZE = 8 * 1024 * 1024;

export class StreamingMultipartUpload {
  private uploadId: string | null = null;
  private readonly parts: Array<{ partNumber: number; etag: string }> = [];
  private pending: Buffer[] = [];
  private pendingBytes = 0;
  private totalBytes = 0;
  private partCount = 0;
  private aborted = false;

  constructor(
    private readonly key: string,
    private readonly contentType: string,
    private readonly cacheControl?: string,
  ) {}

  get sizeBytes(): number {
    return this.totalBytes;
  }

  /** Append stream bytes; flushes a part to S3 when a full part is buffered. */
  async push(chunk: Buffer): Promise<void> {
    if (this.aborted) throw new Error('S3_STREAM_UPLOAD_ABORTED');
    this.pending.push(chunk);
    this.pendingBytes += chunk.length;
    this.totalBytes += chunk.length;
    if (this.pendingBytes >= STREAM_PART_SIZE) {
      await this.flushPart();
    }
  }

  private async flushPart(): Promise<void> {
    if (this.pendingBytes === 0) return;
    const body = Buffer.concat(this.pending);
    this.pending = [];
    this.pendingBytes = 0;

    if (!this.uploadId) {
      const session = await createMultipartUpload(this.key, this.contentType, {
        cacheControl: this.cacheControl,
      });
      this.uploadId = session.uploadId;
    }
    const partNumber = ++this.partCount;
    const { etag } = await uploadPartObject(this.key, this.uploadId, partNumber, body);
    this.parts.push({ partNumber, etag });
    logger.debug(
      { key: this.key, partNumber, partBytes: body.length },
      '[streamingUpload] part uploaded',
    );
  }

  /**
   * Flush the trailing bytes (the final part may be any size) and complete
   * the multipart session. Streams under one part never opened a session —
   * they complete as a plain PutObject. Returns the canonical object URL.
   */
  async finish(): Promise<{ url: string; sizeBytes: number }> {
    if (this.aborted) throw new Error('S3_STREAM_UPLOAD_ABORTED');
    if (!this.uploadId) {
      const body = Buffer.concat(this.pending);
      this.pending = [];
      this.pendingBytes = 0;
      const url = await putBinaryObject(this.key, body, this.contentType, {
        cacheControl: this.cacheControl,
      });
      return { url, sizeBytes: body.length };
    }
    await this.flushPart();
    const { location } = await completeMultipartUpload(this.key, this.uploadId, this.parts);
    logger.info(
      { key: this.key, parts: this.parts.length, sizeBytes: this.totalBytes },
      '[streamingUpload] multipart upload completed',
    );
    return { url: location, sizeBytes: this.totalBytes };
  }

  /** Abort a partial session — releases uploaded parts on S3. Idempotent. */
  async abort(): Promise<void> {
    if (this.aborted) return;
    this.aborted = true;
    if (this.uploadId) {
      try {
        await abortMultipartUpload(this.key, this.uploadId);
      } catch (error) {
        logger.warn(
          { key: this.key, error: String(error) },
          '[streamingUpload] abort failed — session may leak until lifecycle expiry',
        );
      }
    }
  }
}
