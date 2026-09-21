/**
 * Remote Media Importer — SSRF-safe fetch pipeline.
 *
 * This module is a CRITICAL security boundary. It fetches remote media URLs
 * referenced by imported catalogue items and validates them before they enter
 * the media processing pipeline.
 *
 * SSRF prevention follows OWASP guidance:
 * - HTTPS-only (reject http://).
 * - DNS resolution is checked against blocklists: loopback, private, link-
 *   local, multicast, and cloud-metadata endpoints.
 * - Redirects are revalidated at every hop (scheme + DNS).
 * - Content-Length is capped; the response is streamed into a bounded buffer.
 * - Content-Type is sniffed from magic bytes, never trusted from headers.
 * - Host allowlists are supported for per-source restriction.
 * - Full URLs are never logged — only host and path components.
 */

import crypto from 'node:crypto';
import { logger } from '../logger.js';
import {
  fetchPinnedRemoteMedia,
  type PinnedFetchFailureCode,
} from '../safeRemoteMediaFetch.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RemoteFetchOptions {
  url: string;
  maxBytes: number;
  maxRedirects: number;
  connectTimeoutMs: number;
  readTimeoutMs: number;
  allowedHosts?: string[];
}

export interface RemoteFetchResult {
  buffer: Buffer;
  statusCode: number;
  contentType: string;
  contentLength: number;
  finalUrl: string;
}

export interface ImageValidationResult {
  valid: boolean;
  mimeType: string | null;
  width: number | null;
  height: number | null;
  reason: string | null;
}

export interface IngestRemoteMediaInput {
  url: string;
  allowedHosts?: string[];
  importMediaId: string;
}

export interface IngestRemoteMediaResult {
  sha256: string;
  mimeType: string;
  byteSize: number;
  width: number | null;
  height: number | null;
  buffer: Buffer;
}

// ---------------------------------------------------------------------------
// IP classification
// ---------------------------------------------------------------------------
//
// The canonical blocklist predicates live in the shared SSRF transport
// (lib/safeRemoteMediaFetch.ts) so every remote-fetch surface classifies
// addresses identically. Re-exported here for existing importers
// (routes/bots.ts).

export { isLoopbackIp, isPrivateIp } from '../safeRemoteMediaFetch.js';

// ---------------------------------------------------------------------------
// URL validation
// ---------------------------------------------------------------------------

interface ValidatedUrl {
  url: URL;
  host: string;
}

/**
 * Validate that a URL is HTTPS and (optionally) that its host is in the
 * allowlist. Does NOT perform DNS resolution — DNS validation + connection
 * pinning is owned by the shared transport so there is no
 * validate-then-re-resolve TOCTOU window (B3).
 */
function validateUrlScheme(rawUrl: string, allowedHosts?: string[]): ValidatedUrl {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('SSRF_BLOCKED: invalid URL');
  }

  if (parsed.protocol !== 'https:') {
    throw new Error(`SSRF_BLOCKED: non-HTTPS scheme (${parsed.protocol})`);
  }

  const host = parsed.hostname.toLowerCase();
  if (!host) {
    throw new Error('SSRF_BLOCKED: empty hostname');
  }

  if (allowedHosts && allowedHosts.length > 0) {
    const allowed = allowedHosts.map((h) => h.toLowerCase());
    if (!allowed.includes(host)) {
      throw new Error(`SSRF_BLOCKED: host ${host} not in allowlist`);
    }
  }

  // Reject userinfo (credentials in URL) — unexpected for media fetches.
  if (parsed.username || parsed.password) {
    throw new Error('SSRF_BLOCKED: URL must not contain credentials');
  }

  return { url: parsed, host };
}

// ---------------------------------------------------------------------------
// MIME sniffing
// ---------------------------------------------------------------------------

/**
 * Sniff the MIME type from the first bytes of a buffer. Returns null if the
 * magic bytes do not match a supported image format.
 *
 * Supported: JPEG, PNG, GIF, WebP, HEIC.
 */
export function sniffMimeType(buffer: Buffer): string | null {
  if (buffer.length < 12) {
    return null;
  }

  // JPEG: FF D8
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    return 'image/jpeg';
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png';
  }

  // GIF: 47 49 46 38 (GIF8)
  if (
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x38
  ) {
    return 'image/gif';
  }

  // WebP: RIFF....WEBP
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return 'image/webp';
  }

  // HEIC: ftyp box at offset 4, brand heic/heix/heim/mif1
  if (
    buffer[4] === 0x66 &&
    buffer[5] === 0x74 &&
    buffer[6] === 0x79 &&
    buffer[7] === 0x70
  ) {
    const brand = buffer.subarray(8, 12).toString('ascii');
    if (brand === 'heic' || brand === 'heix' || brand === 'heim' || brand === 'mif1') {
      return 'image/heic';
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Image dimension parsing
// ---------------------------------------------------------------------------

/**
 * Extract width and height from a JPEG buffer by scanning for SOF0/SOF2
 * markers. Returns nulls if the dimensions cannot be determined.
 */
function jpegDimensions(buffer: Buffer): { width: number | null; height: number | null } {
  let offset = 2; // Skip SOI marker (FF D8).
  while (offset < buffer.length - 1) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1];
    if (marker === undefined) {
      break;
    }

    // SOF0 (0xC0) and SOF2 (0xC2) carry the dimensions.
    if (marker === 0xc0 || marker === 0xc2) {
      if (offset + 9 > buffer.length) {
        return { width: null, height: null };
      }
      const height = buffer.readUInt16BE(offset + 5);
      const width = buffer.readUInt16BE(offset + 7);
      return { width, height };
    }

    // Skip to the next marker. Segments after SOI are length-prefixed.
    if (marker === 0xd8 || marker === 0xd9) {
      // SOI/EOI have no length.
      offset += 2;
      continue;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      // RSTn / TEM markers have no length.
      offset += 2;
      continue;
    }
    if (offset + 4 > buffer.length) {
      break;
    }
    const segmentLength = buffer.readUInt16BE(offset + 2);
    offset += 2 + segmentLength;
  }
  return { width: null, height: null };
}

/**
 * Extract width and height from a PNG IHDR chunk.
 */
function pngDimensions(buffer: Buffer): { width: number | null; height: number | null } {
  // IHDR starts at byte 16 (8-byte signature + 4-byte length + 4-byte type).
  if (buffer.length < 24) {
    return { width: null, height: null };
  }
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  return { width, height };
}

/**
 * Extract dimensions from a GIF Logical Screen Descriptor.
 */
function gifDimensions(buffer: Buffer): { width: number | null; height: number | null } {
  // LSD starts at byte 6 (6-byte signature).
  if (buffer.length < 10) {
    return { width: null, height: null };
  }
  const width = buffer.readUInt16LE(6);
  const height = buffer.readUInt16LE(8);
  return { width, height };
}

/**
 * Extract dimensions from a WebP VP8/VP8L/VP8X chunk.
 */
function webpDimensions(buffer: Buffer): { width: number | null; height: number | null } {
  // RIFF header (12 bytes) + VP8 chunk. The chunk type is at offset 12-15.
  if (buffer.length < 30) {
    return { width: null, height: null };
  }
  const fourcc = buffer.subarray(12, 16).toString('ascii');
  if (fourcc === 'VP8 ') {
    // Lossy: width/height are 16-bit LE at offset 26 and 28.
    if (buffer.length < 30) {
      return { width: null, height: null };
    }
    const width = buffer.readUInt16LE(26) & 0x3fff;
    const height = buffer.readUInt16LE(28) & 0x3fff;
    return { width, height };
  }
  if (fourcc === 'VP8L') {
    // Lossless: width/height are packed at offset 21.
    if (buffer.length < 25) {
      return { width: null, height: null };
    }
    const b0 = buffer[21] ?? 0;
    const b1 = buffer[22] ?? 0;
    const b2 = buffer[23] ?? 0;
    const b3 = buffer[24] ?? 0;
    const width = 1 + (((b0 & 0x3f) << 8) | b1);
    const height = 1 + (((b2 & 0x0f) << 10) | (b3 << 2) | ((b2 & 0xc0) >> 6));
    return { width, height };
  }
  if (fourcc === 'VP8X') {
    // Extended: canvas width/height are 24-bit LE at offset 24 and 27.
    if (buffer.length < 30) {
      return { width: null, height: null };
    }
    const width = 1 + (buffer[24]! | (buffer[25]! << 8) | (buffer[26]! << 16));
    const height = 1 + (buffer[27]! | (buffer[28]! << 8) | (buffer[29]! << 16));
    return { width, height };
  }
  return { width: null, height: null };
}

// ---------------------------------------------------------------------------
// Image validation
// ---------------------------------------------------------------------------

const MIN_DIMENSION = 200;
const MAX_DIMENSION = 10000;

/**
 * Validate that a buffer is a real, reasonably-sized image. Parses dimensions
 * from the binary header (no external image library required).
 */
export async function validateImageBuffer(
  buffer: Buffer,
  mimeType: string,
): Promise<ImageValidationResult> {
  if (buffer.length === 0) {
    return { valid: false, mimeType, width: null, height: null, reason: 'Empty buffer' };
  }

  let dimensions: { width: number | null; height: number | null };
  switch (mimeType) {
    case 'image/jpeg':
      dimensions = jpegDimensions(buffer);
      break;
    case 'image/png':
      dimensions = pngDimensions(buffer);
      break;
    case 'image/gif':
      dimensions = gifDimensions(buffer);
      break;
    case 'image/webp':
      dimensions = webpDimensions(buffer);
      break;
    case 'image/heic':
      // HEIC dimension parsing requires a full ISOBMFF box walk. Defer to the
      // media pipeline's sharp/ffmpeg stage for authoritative dimensions. We
      // accept the buffer here as long as the magic bytes matched.
      return {
        valid: true,
        mimeType,
        width: null,
        height: null,
        reason: null,
      };
    default:
      return {
        valid: false,
        mimeType,
        width: null,
        height: null,
        reason: `Unsupported MIME type: ${mimeType}`,
      };
  }

  const { width, height } = dimensions;
  if (width === null || height === null) {
    return {
      valid: false,
      mimeType,
      width: null,
      height: null,
      reason: 'Could not parse image dimensions from header',
    };
  }

  if (width < MIN_DIMENSION || height < MIN_DIMENSION) {
    return {
      valid: false,
      mimeType,
      width,
      height,
      reason: `Image too small: ${width}x${height}, minimum is ${MIN_DIMENSION}x${MIN_DIMENSION}`,
    };
  }

  if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
    return {
      valid: false,
      mimeType,
      width,
      height,
      reason: `Image too large: ${width}x${height}, maximum is ${MAX_DIMENSION}x${MAX_DIMENSION}`,
    };
  }

  return { valid: true, mimeType, width, height, reason: null };
}

// ---------------------------------------------------------------------------
// Remote fetch
// ---------------------------------------------------------------------------

/**
 * Map a shared-transport failure code to this module's error vocabulary.
 * SSRF policy violations carry the `SSRF_BLOCKED` prefix — the catalogue
 * import handler quarantines on it without retry. Everything else is a
 * transport failure (`REMOTE_FETCH_FAILED`) and is retryable.
 */
const SSRF_FAILURE_CODES: ReadonlySet<PinnedFetchFailureCode> = new Set([
  'invalid_url',
  'blocked_scheme',
  'host_not_allowed',
  'url_credentials',
  'ssrf_blocked',
  'dns_unresolved',
  'too_many_redirects',
  'redirect_without_location',
]);

/**
 * Fetch a remote media URL with SSRF protections. The response body is
 * streamed into a bounded buffer; redirects are revalidated at every hop.
 *
 * Transport is delegated to the shared pinned implementation
 * (`fetchPinnedRemoteMedia`): DNS is resolved once, blocklist-checked, and
 * the connection is pinned to the validated address set so a re-resolution
 * at connect time cannot reopen the SSRF window (B3). A single whole-request
 * deadline covers DNS, every redirect hop, the header wait AND the body
 * stream — a mid-body stall aborts and discards the partial buffer (B4).
 *
 * Never logs the full URL — only the host and path.
 */
export async function fetchRemoteMedia(
  options: RemoteFetchOptions,
): Promise<RemoteFetchResult> {
  const { maxBytes, maxRedirects, connectTimeoutMs, readTimeoutMs, allowedHosts } = options;

  // Early scheme/host validation preserves the pre-flight SSRF_BLOCKED error
  // shape for callers that distinguish it before any network activity.
  const { url, host } = validateUrlScheme(options.url, allowedHosts);

  logger.debug(
    { host, path: url.pathname },
    'remoteImport.fetch.start',
  );

  const result = await fetchPinnedRemoteMedia({
    url: options.url,
    maxBytes,
    maxRedirects,
    // The legacy split budgets collapse into one whole-request deadline:
    // connect-time + read-time together bound the entire pipeline including
    // DNS, redirects and body streaming.
    timeoutMs: connectTimeoutMs + readTimeoutMs,
    allowHttp: false,
    allowedHosts,
    headers: {
      // Some CDNs require a UA; use a descriptive one.
      'User-Agent': 'ThryftVerse-Catalog-Importer/1.0',
      Accept: 'image/*',
    },
  });

  if (!result.ok) {
    const prefix = SSRF_FAILURE_CODES.has(result.code)
      ? 'SSRF_BLOCKED'
      : 'REMOTE_FETCH_FAILED';
    throw new Error(`${prefix}: ${result.message}`);
  }

  return {
    buffer: result.buffer,
    statusCode: result.statusCode,
    contentType: result.contentTypeHeader,
    contentLength: result.contentLength,
    finalUrl: result.finalUrl,
  };
}

// ---------------------------------------------------------------------------
// Full ingest pipeline
// ---------------------------------------------------------------------------

const DEFAULT_MAX_BYTES = 50 * 1024 * 1024; // 50 MB
const DEFAULT_MAX_REDIRECTS = 3;
const DEFAULT_CONNECT_TIMEOUT_MS = 5_000;
const DEFAULT_READ_TIMEOUT_MS = 30_000;

/**
 * Full remote-media ingest pipeline: fetch -> sniff -> validate -> hash.
 *
 * This is the entry point the media worker calls. It never trusts the
 * response Content-Type header; it sniffs the format from magic bytes and
 * validates dimensions before returning the buffer for further processing.
 */
export async function ingestRemoteMedia(
  input: IngestRemoteMediaInput,
): Promise<IngestRemoteMediaResult> {
  const { url, allowedHosts, importMediaId } = input;

  // Validate scheme + host allowlist before any network call, for a clean
  // error without DNS overhead.
  const { host } = validateUrlScheme(url, allowedHosts);

  logger.info(
    { importMediaId, host },
    'remoteImport.ingest.start',
  );

  const fetchResult = await fetchRemoteMedia({
    url,
    maxBytes: DEFAULT_MAX_BYTES,
    maxRedirects: DEFAULT_MAX_REDIRECTS,
    connectTimeoutMs: DEFAULT_CONNECT_TIMEOUT_MS,
    readTimeoutMs: DEFAULT_READ_TIMEOUT_MS,
    allowedHosts,
  });

  const sniffed = sniffMimeType(fetchResult.buffer);
  if (!sniffed) {
    logger.warn(
      { importMediaId, host, byteSize: fetchResult.buffer.length },
      'remoteImport.ingest.unsupported_type',
    );
    throw new Error(
      `REMOTE_FETCH_FAILED: ${host} returned unsupported or unrecognised image format`,
    );
  }

  const validation = await validateImageBuffer(fetchResult.buffer, sniffed);
  if (!validation.valid) {
    logger.warn(
      {
        importMediaId,
        host,
        mimeType: sniffed,
        width: validation.width,
        height: validation.height,
        reason: validation.reason,
      },
      'remoteImport.ingest.validation_failed',
    );
    throw new Error(
      `REMOTE_FETCH_FAILED: ${host} image validation failed: ${validation.reason}`,
    );
  }

  const sha256 = crypto.createHash('sha256').update(fetchResult.buffer).digest('hex');

  logger.info(
    {
      importMediaId,
      host,
      mimeType: sniffed,
      byteSize: fetchResult.buffer.length,
      width: validation.width,
      height: validation.height,
      sha256: sha256.slice(0, 12),
    },
    'remoteImport.ingest.complete',
  );

  return {
    sha256,
    mimeType: sniffed,
    byteSize: fetchResult.buffer.length,
    width: validation.width,
    height: validation.height,
    buffer: fetchResult.buffer,
  };
}
