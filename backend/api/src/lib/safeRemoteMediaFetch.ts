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
import { Agent } from 'undici';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SafeFetchOptions {
  /** Maximum response body size in bytes. Default: 50 MB. */
  maxBytes?: number;
  /** Maximum redirect hops. Default: 3. */
  maxRedirects?: number;
  /** Overall deadline for the entire fetch pipeline in ms — DNS, all
   *  redirect hops and body streaming share this budget. Default: 15s. */
  timeoutMs?: number;
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
const DEFAULT_TIMEOUT_MS = 15_000;

// ---------------------------------------------------------------------------
// IP classification
// ---------------------------------------------------------------------------

/**
 * Parse a strict dotted-quad IPv4 literal ("a.b.c.d", each octet 0-255
 * decimal). Returns the four octets, or null when invalid.
 */
function parseDottedIpv4(part: string): number[] | null {
  const parts = part.split('.');
  if (parts.length !== 4) {
    return null;
  }
  const out: number[] = [];
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) {
      return null;
    }
    const n = Number(p);
    if (n > 255) {
      return null;
    }
    out.push(n);
  }
  return out;
}

/**
 * Expand an IPv6 literal into its eight 16-bit groups. Handles `::`
 * compression and an embedded dotted-IPv4 tail (`::ffff:127.0.0.1`).
 * Returns null when the string is not a valid IPv6 literal.
 */
function parseIpv6Groups(ip: string): number[] | null {
  let working = ip.toLowerCase();
  let embedded: number[] = [];

  // Embedded dotted IPv4 occupies the final 32 bits (two groups).
  if (working.includes('.')) {
    const idx = working.lastIndexOf(':');
    if (idx === -1) {
      return null;
    }
    const quad = parseDottedIpv4(working.slice(idx + 1));
    if (!quad) {
      return null;
    }
    embedded = [((quad[0]! << 8) | quad[1]!), ((quad[2]! << 8) | quad[3]!)];
    working = working.slice(0, idx);
    if (working.length > 0 && !working.endsWith(':')) {
      working += ':';
    }
  }

  const halves = working.split('::');
  if (halves.length > 2) {
    return null;
  }
  const left = halves[0] ? halves[0].split(':').filter((g) => g !== '') : [];
  const right =
    halves.length === 2
      ? halves[1]!
        ? halves[1]!.split(':').filter((g) => g !== '')
        : []
      : [];
  for (const group of [...left, ...right]) {
    if (!/^[0-9a-f]{1,4}$/.test(group)) {
      return null;
    }
  }
  const explicit = [...left, ...right].map((g) => Number.parseInt(g, 16));
  const total = explicit.length + embedded.length;

  if (halves.length === 2) {
    // `::` compresses one or more zero groups.
    const missing = 8 - total;
    if (missing < 1) {
      return null;
    }
    return [
      ...explicit.slice(0, left.length),
      ...new Array<number>(missing).fill(0),
      ...explicit.slice(left.length),
      ...embedded,
    ];
  }
  if (total !== 8) {
    return null;
  }
  return [...explicit, ...embedded];
}

/** Format two 16-bit groups as a dotted-quad IPv4 string. */
function groupsToDottedIpv4(hi: number, lo: number): string {
  return `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
}

/**
 * Parse inet_aton-style numeric IPv4 host forms that are NOT strict dotted
 * quads: a bare decimal integer (`2130706433`), hex (`0x7f000001`), octal
 * (`0177.0.0.1`) and short dotted forms (`127.1`). URL parsers and
 * getaddrinfo both resolve these as IPv4 — canonicalizing them here keeps
 * the blocklist effective for every caller, including non-URL entry points.
 * Returns the canonical dotted string, or null when the host is not a
 * purely-numeric form (i.e. a real hostname to resolve via DNS).
 */
function parseNumericIpv4(host: string): string | null {
  const parts = host.split('.');
  if (parts.length > 4) {
    return null;
  }
  const values: number[] = [];
  for (const part of parts) {
    if (part === '') {
      return null;
    }
    let n: number;
    if (/^0x[0-9a-f]+$/i.test(part)) {
      n = Number.parseInt(part, 16);
    } else if (part.length > 1 && /^0[0-7]+$/.test(part)) {
      n = Number.parseInt(part, 8);
    } else if (/^\d+$/.test(part)) {
      n = Number.parseInt(part, 10);
    } else {
      return null; // non-numeric — a hostname, not an IPv4 form
    }
    if (!Number.isSafeInteger(n)) {
      return null;
    }
    values.push(n);
  }
  // inet_aton: all parts except the last must fit one octet; the last part
  // occupies the remaining bytes (1 part → 32 bits, 2 → 24, 3 → 16, 4 → 8).
  for (let i = 0; i < values.length - 1; i++) {
    if (values[i]! > 0xff) {
      return null;
    }
  }
  const maxLast =
    parts.length === 4 ? 0xff
      : parts.length === 3 ? 0xffff
        : parts.length === 2 ? 0xffffff
          : 0xffffffff;
  const last = values[values.length - 1]!;
  if (last > maxLast) {
    return null;
  }
  let addr = last;
  for (let i = 0; i < values.length - 1; i++) {
    addr += values[i]! * 2 ** (8 * (3 - i));
  }
  if (addr > 0xffffffff) {
    return null;
  }
  return `${(addr >>> 24) & 0xff}.${(addr >>> 16) & 0xff}.${(addr >>> 8) & 0xff}.${addr & 0xff}`;
}

/**
 * Canonicalize an IP literal host so the blocklist sees the real address.
 *
 * - IPv4 literals pass through unchanged.
 * - IPv6 literals are expanded; IPv4-mapped (`::ffff:a.b.c.d` AND the hex
 *   form `::ffff:7f00:1`), IPv4-compatible (`::7f00:1`), 6to4 (`2002::/16`)
 *   and Teredo (`2001:0000::/32`) addresses are unwrapped to the embedded
 *   IPv4 — every one of those is a tunnelled path to an IPv4 endpoint the
 *   dotted-only blocklist would otherwise miss.
 * - Numeric IPv4 forms (`0x7f000001`, `2130706433`, `0177.0.0.1`, `127.1`)
 *   parse to canonical dotted form.
 * - Returns null for non-IP hosts (real hostnames — resolve via DNS).
 */
export function canonicalizeRemoteIpLiteral(host: string): string | null {
  const version = isIP(host);
  if (version === 4) {
    return host;
  }
  if (version === 6) {
    const groups = parseIpv6Groups(host);
    if (groups) {
      // IPv4-mapped ::ffff:a.b.c.d (0:0:0:0:0:ffff:xxxx:xxxx).
      if (groups.slice(0, 5).every((g) => g === 0) && groups[5] === 0xffff) {
        return groupsToDottedIpv4(groups[6]!, groups[7]!);
      }
      // IPv4-compatible ::a.b.c.d (deprecated, but stacks still map it).
      if (groups.slice(0, 6).every((g) => g === 0)) {
        return groupsToDottedIpv4(groups[6]!, groups[7]!);
      }
      // 6to4 2002:v4hi:v4lo::/48 — embedded IPv4 tunnels the packet.
      if (groups[0] === 0x2002) {
        return groupsToDottedIpv4(groups[1]!, groups[2]!);
      }
      // Teredo 2001:0000::/32 — embedded IPv4 is XOR-complemented.
      if (groups[0] === 0x2001 && groups[1] === 0x0000) {
        return groupsToDottedIpv4(groups[6]! ^ 0xffff, groups[7]! ^ 0xffff);
      }
    }
    return host;
  }
  return parseNumericIpv4(host);
}

/**
 * Returns true if the IP address is in the 127.0.0.0/8 loopback range or is
 * the IPv6 loopback address ::1.
 */
export function isLoopbackIp(ip: string): boolean {
  const target = canonicalizeRemoteIpLiteral(ip) ?? ip;
  if (target === '::1') {
    return true;
  }
  if (target.includes('.')) {
    const parts = target.split('.');
    if (parts[0] === '127') {
      return true;
    }
  }
  // IPv4-mapped IPv6 loopback (::ffff:127.0.0.1).
  if (target.startsWith('::ffff:')) {
    return isLoopbackIp(target.slice('::ffff:'.length));
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
export function isPrivateIp(ip: string): boolean {
  // Canonicalize first — mapped/compatible/6to4/Teredo IPv6 literals and
  // numeric IPv4 forms unwrap to the real IPv4 address (or stay as IPv6).
  const target = canonicalizeRemoteIpLiteral(ip) ?? ip;
  const lowerTarget = target.toLowerCase();

  // IPv6 unique-local fc00::/7.
  if (lowerTarget.startsWith('fc') || lowerTarget.startsWith('fd')) {
    return true;
  }
  // IPv6 link-local fe80::/10.
  if (
    lowerTarget.startsWith('fe8') ||
    lowerTarget.startsWith('fe9') ||
    lowerTarget.startsWith('fea') ||
    lowerTarget.startsWith('feb')
  ) {
    return true;
  }

  // IPv4-mapped IPv6 (dotted tail — non-dotted forms already canonicalized).
  if (lowerTarget.startsWith('::ffff:')) {
    return isPrivateIp(lowerTarget.slice('::ffff:'.length));
  }

  // Any remaining non-dotted form is IPv6 we could not unwrap — not
  // private. (isIP-hosts are canonicalized above; hostnames never reach
  // this predicate from resolveValidatedAddresses.)
  if (!target.includes('.')) {
    return false;
  }

  const parts = target.split('.').map((p) => {
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
  if (aVal === 100 && bVal >= 64 && bVal <= 127) return true; // 100.64.0.0/10 (CGNAT / RFC 6598 shared space)
  if (aVal === 198 && (bVal === 18 || bVal === 19)) return true; // 198.18.0.0/15 (benchmarking / RFC 2544)
  if (aVal >= 224 && aVal <= 239) return true; // 224.0.0.0/4 (multicast)
  if (aVal >= 240) return true; // 240.0.0.0/4 (reserved, includes 255.255.255.255 broadcast)
  if (aVal === 0) return true; // 0.0.0.0/8 (current network / unspecified)

  return false;
}

/**
 * Returns true if the IP is in any blocked range (loopback, private,
 * link-local, multicast, or cloud-metadata).
 */
function isBlockedIp(ip: string): boolean {
  // Canonicalize once up front: mapped/compatible/tunnelled IPv6 and
  // numeric IPv4 forms reduce to the real address before any range test.
  const target = canonicalizeRemoteIpLiteral(ip) ?? ip;
  if (isLoopbackIp(target)) return true;
  if (isPrivateIp(target)) return true;
  // Explicit cloud-metadata check (redundant with link-local but explicit).
  if (target === '169.254.169.254') return true;
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

interface ResolvedAddress {
  address: string;
  family: number;
}

/**
 * Resolve a hostname, verify that none of the resolved addresses fall in a
 * blocked range, and return the validated address set. IP-literal hosts are
 * checked directly without DNS.
 *
 * Returns the addresses to connect to, or null if the host is unsafe /
 * unresolvable. The returned set is what the connection MUST be pinned to —
 * resolving again at connect time would reopen the DNS-rebinding window
 * (F15): an attacker-controlled record could return a private address on the
 * second lookup.
 */
async function resolveValidatedAddresses(host: string): Promise<ResolvedAddress[] | null> {
  // IP literal (including IPv4-mapped/tunnelled IPv6 and numeric IPv4
  // forms) — canonicalize, then check directly, no DNS lookup needed. The
  // pinned connection lands on the canonical address so e.g. ::ffff:8.8.8.8
  // connects as 8.8.8.8, never through an unvalidated mapping.
  const canonical = canonicalizeRemoteIpLiteral(host);
  if (canonical !== null) {
    return isBlockedIp(canonical)
      ? null
      : [{ address: canonical, family: isIP(canonical) }];
  }

  // Hostname — resolve via DNS and check all addresses.
  let addresses: { address: string; family: number }[];
  try {
    addresses = await dnsLookup(host, { all: true });
  } catch {
    return null;
  }

  if (addresses.length === 0) {
    return null;
  }

  const validated: ResolvedAddress[] = [];
  for (const addr of addresses) {
    // Canonicalize resolved addresses too — a resolver answer in an
    // unusual representation must hit the same blocklist.
    const canonicalAddr = canonicalizeRemoteIpLiteral(addr.address) ?? addr.address;
    if (isBlockedIp(canonicalAddr)) {
      return null;
    }
    validated.push({ address: canonicalAddr, family: isIP(canonicalAddr) || addr.family });
  }

  return validated;
}

/**
 * Build an undici Agent whose DNS lookup returns ONLY the pre-validated
 * address set. The TCP connection therefore lands on an address that passed
 * the blocklist check — a DNS change between validation and connection
 * cannot redirect it (F15). The URL keeps its hostname, so TLS SNI and the
 * Host header remain correct.
 */
function pinnedAgent(addresses: ResolvedAddress[]): Agent {
  return new Agent({
    keepAliveTimeout: 1,
    connect: {
      lookup: (_hostname, _options, callback) => {
        callback(null, addresses);
      },
    },
  });
}

// ---------------------------------------------------------------------------
// Pinned fetch core — the single SSRF-safe transport implementation
// ---------------------------------------------------------------------------

/**
 * Machine-readable failure codes for {@link fetchPinnedRemoteMedia}.
 * `ssrf_*` codes are policy violations (never retryable); the rest are
 * transport failures that may be retried by the caller.
 */
export type PinnedFetchFailureCode =
  | 'invalid_url'
  | 'blocked_scheme'
  | 'host_not_allowed'
  | 'url_credentials'
  | 'ssrf_blocked'
  | 'dns_unresolved'
  | 'timeout'
  | 'too_many_redirects'
  | 'redirect_without_location'
  | 'http_error'
  | 'content_too_large'
  | 'empty_body'
  | 'fetch_failed';

export interface PinnedFetchFailure {
  ok: false;
  code: PinnedFetchFailureCode;
  /** Log-safe detail — never contains the full URL, only host/path. */
  message: string;
  statusCode?: number;
}

export interface PinnedFetchSuccess {
  ok: true;
  buffer: Buffer;
  statusCode: number;
  /** Raw Content-Type response header (untrusted — for diagnostics only). */
  contentTypeHeader: string;
  /** MIME type sniffed from magic bytes, or null when unrecognised. */
  sniffedContentType: string | null;
  /** The URL after the final redirect hop. */
  finalUrl: string;
  contentLength: number;
}

export type PinnedFetchResult = PinnedFetchSuccess | PinnedFetchFailure;

export interface PinnedFetchOptions {
  url: string;
  /** Maximum response body size in bytes. Default: 50 MB. */
  maxBytes?: number;
  /** Maximum redirect hops. Default: 3. */
  maxRedirects?: number;
  /** Overall deadline for the entire pipeline in ms — DNS validation, every
   *  redirect hop, header wait AND body streaming share this budget.
   *  Default: 15s. */
  timeoutMs?: number;
  /** When false (default true) only https: URLs are accepted. */
  allowHttp?: boolean;
  /** Optional hostname allowlist (lowercase compare). */
  allowedHosts?: string[];
  /** Extra request headers merged over the defaults. */
  headers?: Record<string, string>;
}

function fail(
  code: PinnedFetchFailureCode,
  message: string,
  statusCode?: number,
): PinnedFetchFailure {
  return { ok: false, code, message, statusCode };
}

/**
 * Fetch a remote media URL with full SSRF protections and return a
 * machine-readable result. This is the shared transport every remote-media
 * ingress must use — it fixes the DNS-validation/connect TOCTOU (B3) and the
 * headers-only read deadline (B4) that the legacy per-caller fetch had:
 *
 * - DNS is resolved once, blocklist-checked, and the TCP connection is
 *   PINNED to the validated address set via an undici Agent `connect.lookup`
 *   override — a re-resolution at connect time (rebinding) cannot redirect
 *   the socket. The URL keeps its hostname so TLS SNI and the Host header
 *   stay correct.
 * - One shared deadline covers DNS, every redirect hop, the header wait and
 *   the streaming body read — a stall at ANY stage aborts the request.
 * - Redirects are revalidated at every hop (scheme + allowlist + DNS + IP).
 * - The body is streamed into a bounded buffer; overflow cancels the reader
 *   and discards the partial data.
 */
export async function fetchPinnedRemoteMedia(
  options: PinnedFetchOptions,
): Promise<PinnedFetchResult> {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const allowHttp = options.allowHttp ?? true;
  const allowedHosts = options.allowedHosts?.map((h) => h.toLowerCase());
  // One shared deadline for the whole pipeline — DNS validation, every
  // redirect hop and the streaming body read all draw from this budget so a
  // stall at any stage cannot hang the worker indefinitely (F15/B4).
  const deadlineAt = Date.now() + timeoutMs;

  let currentUrl = options.url;
  let redirectCount = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    // --- Parse and validate scheme ---
    let parsed: URL;
    try {
      parsed = new URL(currentUrl);
    } catch {
      return fail('invalid_url', 'invalid URL');
    }

    if (parsed.protocol !== 'https:' && !(allowHttp && parsed.protocol === 'http:')) {
      return fail('blocked_scheme', `non-${allowHttp ? 'http(s)' : 'https'} scheme (${parsed.protocol})`);
    }

    // URL.hostname keeps brackets around IPv6 literals ("[::1]") — strip
    // them so isIP() recognises the literal and skips DNS entirely.
    const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (!host) {
      return fail('invalid_url', 'empty hostname');
    }

    // Reject userinfo (credentials in URL) — unexpected for media fetches.
    if (parsed.username || parsed.password) {
      return fail('url_credentials', 'URL must not contain credentials');
    }

    if (allowedHosts && allowedHosts.length > 0 && !allowedHosts.includes(host)) {
      return fail('host_not_allowed', `host ${host} not in allowlist`);
    }

    let remainingMs = deadlineAt - Date.now();
    if (remainingMs <= 0) {
      return fail('timeout', `request exceeded deadline (${timeoutMs}ms)`);
    }

    // --- DNS / IP validation → validated address set ---
    // The lookup itself draws from the shared deadline: a resolver that
    // stalls past the budget yields a timeout rather than hanging.
    const addresses = await Promise.race([
      resolveValidatedAddresses(host),
      new Promise<'__timeout'>((resolve) => {
        setTimeout(() => resolve('__timeout'), remainingMs).unref();
      }),
    ]);
    if (addresses === '__timeout') {
      return fail('timeout', `DNS resolution exceeded deadline for ${host}`);
    }
    if (!addresses) {
      // resolveValidatedAddresses returns null for blocked AND unresolvable
      // hosts; distinguish for callers by re-checking the literal case.
      return fail('ssrf_blocked', `${host} resolves to a blocked address or is unresolvable`);
    }

    remainingMs = deadlineAt - Date.now();
    if (remainingMs <= 0) {
      return fail('timeout', `request exceeded deadline (${timeoutMs}ms)`);
    }

    // --- Fetch pinned to the validated addresses (manual redirects) ---
    const agent = pinnedAgent(addresses);
    // The abort signal stays armed for the header wait AND the body stream
    // below — the whole-request deadline, not a connect-only timer (B4).
    const signal = AbortSignal.timeout(remainingMs);
    let response: Response;
    try {
      response = await fetch(parsed, {
        method: 'GET',
        redirect: 'manual',
        signal,
        // `dispatcher` is an undici extension honoured by Node's global fetch;
        // it pins the TCP connection to the addresses validated above.
        ...({ dispatcher: agent } as object),
        headers: {
          'User-Agent': 'ThryftVerse-Catalog-Importer/1.0',
          Accept: 'image/*',
          ...options.headers,
        },
      });
    } catch (err) {
      const name = err instanceof Error ? err.name : '';
      const timedOut =
        signal.aborted || name === 'TimeoutError' || name === 'AbortError';
      const message = err instanceof Error ? err.message : String(err);
      return fail(
        timedOut ? 'timeout' : 'fetch_failed',
        timedOut
          ? `request to ${host} exceeded deadline (${timeoutMs}ms)`
          : `fetch failed for ${host}: ${message}`,
      );
    } finally {
      // One-shot agent — never leave its keep-alive pool hanging.
      void agent.close().catch(() => undefined);
    }

    // --- Handle redirects (3xx) with full revalidation ---
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) {
        return fail('redirect_without_location', `redirect with no Location header from ${host}`);
      }
      redirectCount += 1;
      if (redirectCount > maxRedirects) {
        return fail('too_many_redirects', `exceeded max redirects (${maxRedirects}) from ${host}`);
      }
      // Resolve relative redirects against the current URL; the loop
      // revalidates scheme, allowlist, credentials and DNS on the next pass.
      try {
        currentUrl = new URL(location, parsed).toString();
      } catch {
        return fail('invalid_url', `invalid redirect target from ${host}`);
      }
      continue;
    }

    // --- Non-OK status ---
    if (!response.ok) {
      return fail('http_error', `${host} returned status ${response.status}`, response.status);
    }

    // --- Cap Content-Length if declared ---
    const declaredLength = response.headers.get('content-length');
    if (declaredLength !== null) {
      const declared = Number.parseInt(declaredLength, 10);
      if (!Number.isNaN(declared) && declared > maxBytes) {
        return fail('content_too_large', `${host} content-length ${declared} exceeds max ${maxBytes}`);
      }
    }

    // --- Stream into bounded buffer ---
    const body = response.body;
    if (!body) {
      return fail('empty_body', `${host} returned no body`);
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
            return fail('content_too_large', `${host} stream exceeded max ${maxBytes} bytes`);
          }
          chunks.push(Buffer.from(value));
        }
      }
    } catch (err) {
      // Mid-body abort/timeout: cancel the reader and drop the partial
      // buffer — no half-downloaded object escapes this pipeline (B4).
      await reader.cancel().catch(() => undefined);
      const timedOut = signal.aborted || Date.now() >= deadlineAt;
      const message = err instanceof Error ? err.message : String(err);
      return fail(
        timedOut ? 'timeout' : 'fetch_failed',
        timedOut
          ? `body read from ${host} exceeded deadline (${timeoutMs}ms)`
          : `body read from ${host} failed: ${message}`,
      );
    } finally {
      reader.releaseLock();
    }

    const buffer = Buffer.concat(chunks, totalBytes);
    if (buffer.length === 0) {
      return fail('empty_body', `${host} returned empty body`);
    }

    return {
      ok: true,
      buffer,
      statusCode: response.status,
      contentTypeHeader: response.headers.get('content-type') ?? '',
      sniffedContentType: sniffMimeType(buffer),
      finalUrl: currentUrl,
      contentLength: buffer.length,
    };
  }
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
 * Thin wrapper over {@link fetchPinnedRemoteMedia} for callers that want a
 * nullable rather than a discriminated result.
 *
 * @param url    The URL to fetch (http or https only).
 * @param options  Optional maxBytes / maxRedirects overrides.
 * @returns `{ buffer, contentType }` on success, or `null`.
 */
export async function safeFetchMediaBuffer(
  url: string,
  options?: SafeFetchOptions,
): Promise<SafeFetchResult | null> {
  const result = await fetchPinnedRemoteMedia({ url, ...options });
  if (!result.ok) {
    return null;
  }
  // Content type is sniffed from magic bytes — an unrecognised payload is
  // not media and must not reach callers.
  if (result.sniffedContentType === null) {
    return null;
  }
  return { buffer: result.buffer, contentType: result.sniffedContentType };
}
