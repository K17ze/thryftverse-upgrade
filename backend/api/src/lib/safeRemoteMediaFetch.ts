/**
 * Safe Remote Media Fetch — SSRF-hardened fetch wrapper.
 *
 * Provides `safeFetchMediaBuffer`, a null-returning wrapper around the
 * SSRF-safe fetch pipeline. Unlike the lower-level `fetchRemoteMedia` in
 * `media/remoteImport.ts` (which throws on policy violations and is
 * HTTPS-only), this module:
 *
 * - Accepts both `http:` and `https:` URLs (some legacy CDNs are HTTP).
 * - Returns `null` on any error — SSRF block, invalid URL, fetch failure,
 *   oversized body, wrong magic bytes — so callers can treat the result as
 *   a simple nullable without try/catch.
 * - Sniffs the content type from magic bytes rather than trusting the
 *   `Content-Type` response header.
 *
 * SSRF prevention follows OWASP guidance:
 * - Scheme allowlist (http/https only; rejects file://, ftp://, etc.).
 * - DNS resolution is checked against blocklists: loopback, private,
 *   link-local, multicast, and cloud-metadata endpoints.
 * - IP-literal URLs are checked directly without DNS lookup.
 * - Redirects are revalidated at every hop (scheme + DNS + IP).
 * - Content-Length is capped; the response body is streamed into a bounded
 *   buffer with reader cancellation on overflow.
 * - Content-Type is sniffed from magic bytes, never trusted from headers.
 */

import { isIP } from 'node:net';
import { lookup as dnsLookup } from 'node:dns/promises';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SafeFetchOptions {
  /** Maximum response body size in bytes. Default: 50 MB. */
  maxBytes?: number;
  /** Maximum redirect hops. Default: 3. */
  maxRedirects?: number;
}

export interface SafeFetchResult {
  buffer: Buffer;
  /** MIME type sniffed from magic bytes (never from the response header). */
  contentType: string;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_MAX_BYTES = 50 * 1024 * 1024; // 50 MB
const DEFAULT_MAX_REDIRECTS = 3;

// ---------------------------------------------------------------------------
// IP classification
// ---------------------------------------------------------------------------

/**
 * Returns true if the IP address is in the 127.0.0.0/8 loopback range or is
 * the IPv6 loopback address ::1.
 */
function isLoopbackIp(ip: string): boolean {
  if (ip === '::1') {
    return true;
  }
  if (ip.includes('.')) {
    const parts = ip.split('.');
    if (parts[0] === '127') {
      return true;
    }
  }
  // IPv4-mapped IPv6 loopback (::ffff:127.0.0.1).
  if (ip.startsWith('::ffff:')) {
    return isLoopbackIp(ip.slice('::ffff:'.length));
  }
  return false;
}

/**
 * Returns true if the IP address is in a private/reserved range that must
 * never be reachable from a remote-fetch context.
 *
 * Checked ranges:
 * - 10.0.0.0/8
 * - 172.16.0.0/12
 * - 192.168.0.0/16
 * - 169.254.0.0/16 (link-local, includes 169.254.169.254 cloud metadata)
 * - 224.0.0.0/4 (multicast)
 * - 0.0.0.0/8 (current network / unspecified)
 * - fc00::/7 (IPv6 unique-local)
 * - fe80::/10 (IPv6 link-local)
 */
function isPrivateIp(ip: string): boolean {
  // IPv6 unique-local fc00::/7.
  if (ip.startsWith('fc') || ip.startsWith('fd')) {
    return true;
  }
  // IPv6 link-local fe80::/10.
  if (
    ip.startsWith('fe8') ||
    ip.startsWith('fe9') ||
    ip.startsWith('fea') ||
    ip.startsWith('feb')
  ) {
    return true;
  }

  // IPv4-mapped IPv6.
  if (ip.startsWith('::ffff:')) {
    return isPrivateIp(ip.slice('::ffff:'.length));
  }

  if (!ip.includes('.')) {
    return false;
  }

  const parts = ip.split('.').map((p) => {
    const n = Number.parseInt(p, 10);
    return Number.isNaN(n) ? -1 : n;
  });
  if (parts.length !== 4 || parts.some((p) => p < 0 || p > 255)) {
    // Malformed IPv4 — treat as dangerous.
    return true;
  }

  const [a, b] = parts;
  const aVal = a ?? -1;
  const bVal = b ?? -1;

  if (aVal === 10) return true; // 10.0.0.0/8
  if (aVal === 172 && bVal >= 16 && bVal <= 31) return true; // 172.16.0.0/12
  if (aVal === 192 && bVal === 168) return true; // 192.168.0.0/16
  if (aVal === 169 && bVal === 254) return true; // 169.254.0.0/16 (link-local + metadata)
  if (aVal >= 224 && aVal <= 239) return true; // 224.0.0.0/4 (multicast)
  if (aVal === 0) return true; // 0.0.0.0/8 (current network / unspecified)

  return false;
}

/**
 * Returns true if the IP is in any blocked range (loopback, private,
 * link-local, multicast, or cloud-metadata).
 */
function isBlockedIp(ip: string): boolean {
  if (isLoopbackIp(ip)) return true;
  if (isPrivateIp(ip)) return true;
  // Explicit cloud-metadata check (redundant with link-local but explicit).
  if (ip === '169.254.169.254') return true;
  return false;
}

// ---------------------------------------------------------------------------
// Magic byte sniffing
// ---------------------------------------------------------------------------

/**
 * Sniff the MIME type from the first bytes of a buffer. Returns null if the
 * magic bytes do not match a supported image format.
 *
 * Supported: JPEG, PNG, GIF, WebP, HEIC.
 */
function sniffMimeType(buffer: Buffer): string | null {
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
// Host validation
// ---------------------------------------------------------------------------

/**
 * Resolve a hostname and verify that none of the resolved addresses fall in
 * a blocked range. IP-literal hosts are checked directly without DNS.
 *
 * Returns true if the host is safe, false otherwise.
 */
async function isHostAllowed(host: string): Promise<boolean> {
  // IP literal — check directly, no DNS lookup needed.
  if (isIP(host) !== 0) {
    return !isBlockedIp(host);
  }

  // Hostname — resolve via DNS and check all addresses.
  let addresses: { address: string; family: number }[];
  try {
    addresses = await dnsLookup(host, { all: true });
  } catch {
    return false;
  }

  if (addresses.length === 0) {
    return false;
  }

  for (const addr of addresses) {
    if (isBlockedIp(addr.address)) {
      return false;
    }
  }

  return true;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch a remote media URL with full SSRF protections. Returns `null` on any
 * error — SSRF block, invalid URL, non-http(s) scheme, redirect to blocked
 * IP, too many redirects, oversized body, wrong magic bytes, or fetch
 * failure.
 *
 * @param url    The URL to fetch (http or https only).
 * @param options  Optional maxBytes / maxRedirects overrides.
 * @returns `{ buffer, contentType }` on success, or `null`.
 */
export async function safeFetchMediaBuffer(
  url: string,
  options?: SafeFetchOptions,
): Promise<SafeFetchResult | null> {
  const maxBytes = options?.maxBytes ?? DEFAULT_MAX_BYTES;
  const maxRedirects = options?.maxRedirects ?? DEFAULT_MAX_REDIRECTS;

  let currentUrl = url;
  let redirectCount = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    // --- Parse and validate scheme ---
    let parsed: URL;
    try {
      parsed = new URL(currentUrl);
    } catch {
      return null;
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }

    const host = parsed.hostname.toLowerCase();
    if (!host) {
      return null;
    }

    // --- DNS / IP validation ---
    const allowed = await isHostAllowed(host);
    if (!allowed) {
      return null;
    }

    // --- Fetch (manual redirect handling for revalidation) ---
    let response: Response;
    try {
      response = await fetch(parsed, {
        method: 'GET',
        redirect: 'manual',
        headers: {
          'User-Agent': 'ThryftVerse-Catalog-Importer/1.0',
          Accept: 'image/*',
        },
      });
    } catch {
      return null;
    }

    // --- Handle redirects (3xx) with full revalidation ---
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) {
        return null;
      }
      redirectCount += 1;
      if (redirectCount > maxRedirects) {
        return null;
      }
      currentUrl = new URL(location, parsed).toString();
      continue;
    }

    // --- Non-OK status ---
    if (!response.ok) {
      return null;
    }

    // --- Cap Content-Length if declared ---
    const declaredLength = response.headers.get('content-length');
    if (declaredLength !== null) {
      const declared = Number.parseInt(declaredLength, 10);
      if (!Number.isNaN(declared) && declared > maxBytes) {
        return null;
      }
    }

    // --- Stream into bounded buffer ---
    const body = response.body;
    if (!body) {
      return null;
    }

    const reader = body.getReader();
    const chunks: Buffer[] = [];
    let totalBytes = 0;

    try {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        if (value) {
          totalBytes += value.byteLength;
          if (totalBytes > maxBytes) {
            await reader.cancel();
            return null;
          }
          chunks.push(Buffer.from(value));
        }
      }
    } catch {
      return null;
    } finally {
      reader.releaseLock();
    }

    const buffer = Buffer.concat(chunks, totalBytes);
    if (buffer.length === 0) {
      return null;
    }

    // --- Sniff magic bytes (never trust Content-Type header) ---
    const sniffedType = sniffMimeType(buffer);
    if (sniffedType === null) {
      return null;
    }

    return { buffer, contentType: sniffedType };
  }
}
