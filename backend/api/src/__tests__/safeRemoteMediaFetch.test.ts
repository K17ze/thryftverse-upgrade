import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Buffer } from 'node:buffer';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
//
// `node:dns/promises` is mocked so hostname-based tests can control resolution
// (e.g. resolve a hostname to a public IP for the success path, or to a blocked
// IP for DNS-rebinding-style cases). The mock is created via `vi.hoisted` so the
// factory closure can safely reference it despite vi.mock hoisting.
//
// `globalThis.fetch` is spied per-test so we can inject synthetic responses
// (redirects, oversized bodies, streaming bodies, success payloads).

const dnsMock = vi.hoisted(() => ({
  lookup: vi.fn(),
}));

vi.mock('node:dns/promises', () => ({
  lookup: dnsMock.lookup,
}));

import { safeFetchMediaBuffer } from '../lib/safeRemoteMediaFetch.js';

// A public, non-blocked IP used as the default DNS resolution result for
// hostname-based tests (example.com's well-known address).
const PUBLIC_IP = '93.184.216.34';

// Minimal valid PNG: 8-byte signature + 4-byte IHDR length + "IHDR" = 16 bytes.
// sniffMimeType only inspects the first 8 bytes for PNG, but requires
// buffer.length >= 12, so 16 bytes satisfies both.
const MINIMAL_PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG signature
  0x00, 0x00, 0x00, 0x0d, // IHDR chunk length (13)
  0x49, 0x48, 0x44, 0x52, // "IHDR"
]);

// ---------------------------------------------------------------------------
// Test harness
// ---------------------------------------------------------------------------

describe('safeFetchMediaBuffer — SSRF protection', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Default: hostname resolution returns a public, non-blocked IP.
    dnsMock.lookup.mockResolvedValue([{ address: PUBLIC_IP, family: 4 }]);

    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    dnsMock.lookup.mockReset();
  });

  // -------------------------------------------------------------------------
  // 1. Blocked IP ranges
  // -------------------------------------------------------------------------

  describe('blocked IP ranges', () => {
    const blockedCases: Array<[string, string]> = [
      ['http://127.0.0.1/', 'loopback'],
      ['http://10.0.0.1/', 'RFC1918 10/8'],
      ['http://172.16.0.1/', 'RFC1918 172.16/12'],
      ['http://192.168.1.1/', 'RFC1918 192.168/16'],
      ['http://169.254.169.254/latest/meta-data/', 'cloud metadata'],
      ['http://0.0.0.0/', 'unspecified'],
      ['http://[::1]/', 'IPv6 loopback'],
      ['http://[fe80::1]/', 'IPv6 link-local'],
    ];

    for (const [url, label] of blockedCases) {
      it(`returns null for ${label} (${url})`, async () => {
        // IP-literal URLs are validated directly via isIP() — no DNS lookup,
        // no fetch. The function must reject before any network call.
        const result = await safeFetchMediaBuffer(url);
        expect(result).toBeNull();
        expect(dnsMock.lookup).not.toHaveBeenCalled();
        expect(fetchSpy).not.toHaveBeenCalled();
      });
    }

    it('returns null when a hostname resolves to a blocked IP (DNS rebinding)', async () => {
      // Hostname that resolves to the cloud-metadata endpoint.
      dnsMock.lookup.mockResolvedValue([
        { address: '169.254.169.254', family: 4 },
      ]);

      const result = await safeFetchMediaBuffer('http://internal-proxy.local/img.png');
      expect(result).toBeNull();
      expect(dnsMock.lookup).toHaveBeenCalledWith(
        'internal-proxy.local',
        { all: true },
      );
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // 2. Non-http schemes
  // -------------------------------------------------------------------------

  describe('non-http schemes', () => {
    it('returns null for file:///etc/passwd', async () => {
      const result = await safeFetchMediaBuffer('file:///etc/passwd');
      expect(result).toBeNull();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('returns null for ftp://example.com/file', async () => {
      const result = await safeFetchMediaBuffer('ftp://example.com/file');
      expect(result).toBeNull();
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // 3. Invalid URLs
  // -------------------------------------------------------------------------

  describe('invalid URLs', () => {
    it('returns null for a malformed URL', async () => {
      const result = await safeFetchMediaBuffer('not-a-valid-url');
      expect(result).toBeNull();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('returns null for a URL with no host', async () => {
      const result = await safeFetchMediaBuffer('http://');
      expect(result).toBeNull();
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // 4. Redirect to blocked IP
  // -------------------------------------------------------------------------

  describe('redirect to blocked IP', () => {
    it('returns null when a public URL redirects to a cloud-metadata IP', async () => {
      // First hop: public hostname resolves to a public IP and returns a 302
      // redirect to the cloud-metadata endpoint. The redirect target is an
      // IP literal, so it is revalidated directly via isIP/isBlockedIp without
      // DNS and must be rejected.
      fetchSpy.mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { location: 'http://169.254.169.254/' },
        }),
      );

      const result = await safeFetchMediaBuffer('http://example.com/img.png');
      expect(result).toBeNull();
      // fetch was called once (for the public URL); the redirect target never
      // reaches fetch because the IP-literal check rejects it first.
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // 5. Redirect chain exceeding limit
  // -------------------------------------------------------------------------

  describe('redirect chain exceeding limit', () => {
    it('returns null after exceeding maxRedirects (default 3)', async () => {
      // Four consecutive 302 redirects, all to public hostnames. With
      // maxRedirects defaulting to 3, the 4th redirect (redirectCount=4)
      // exceeds the limit and the function returns null.
      const redirectResponse = () =>
        new Response(null, {
          status: 302,
          headers: { location: 'http://example.com/next' },
        });

      fetchSpy
        .mockResolvedValueOnce(redirectResponse())
        .mockResolvedValueOnce(redirectResponse())
        .mockResolvedValueOnce(redirectResponse())
        .mockResolvedValueOnce(redirectResponse());

      const result = await safeFetchMediaBuffer('http://example.com/img.png');
      expect(result).toBeNull();
      // fetch is invoked once per hop: 4 redirect responses.
      expect(fetchSpy).toHaveBeenCalledTimes(4);
    });
  });

  // -------------------------------------------------------------------------
  // 6. Oversized Content-Length
  // -------------------------------------------------------------------------

  describe('oversized Content-Length', () => {
    it('returns null without reading the body when Content-Length exceeds maxBytes', async () => {
      // A body whose getReader we spy on to prove it is never called — the
      // Content-Length cap short-circuits before streaming begins.
      const body = new ReadableStream({
        start(controller) {
          controller.close();
        },
      });
      const getReaderSpy = vi.spyOn(body, 'getReader');

      fetchSpy.mockResolvedValueOnce(
        new Response(body, {
          status: 200,
          headers: { 'content-length': '999999999' },
        }),
      );

      const result = await safeFetchMediaBuffer('http://example.com/big.png', {
        maxBytes: 1000,
      });

      expect(result).toBeNull();
      expect(getReaderSpy).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // 7. Oversized streaming body
  // -------------------------------------------------------------------------

  describe('oversized streaming body', () => {
    it('returns null and cancels the reader when the stream exceeds maxBytes', async () => {
      let cancelled = false;
      // 10 chunks of 200 bytes = 2000 bytes total, exceeding maxBytes=1000
      // partway through reading.
      const chunk = new Uint8Array(200).fill(0x42);

      const body = new ReadableStream({
        start(controller) {
          for (let i = 0; i < 10; i += 1) {
            controller.enqueue(chunk);
          }
          // Intentionally do NOT close — the reader should be cancelled before
          // reaching the end.
        },
        cancel() {
          cancelled = true;
        },
      });

      fetchSpy.mockResolvedValueOnce(
        new Response(body, {
          status: 200,
          headers: { 'content-type': 'image/png' },
        }),
      );

      const result = await safeFetchMediaBuffer('http://example.com/stream.png', {
        maxBytes: 1000,
      });

      expect(result).toBeNull();
      expect(cancelled).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // 8. Successful fetch
  // -------------------------------------------------------------------------

  describe('successful fetch', () => {
    it('returns the buffer and sniffed content-type for a valid image', async () => {
      // Hostname resolves to a public IP; fetch returns 200 with a small PNG
      // body. The content-type is sniffed from magic bytes (image/png), not
      // from the (deliberately wrong) response header.
      fetchSpy.mockResolvedValueOnce(
        new Response(MINIMAL_PNG, {
          status: 200,
          headers: { 'content-type': 'application/octet-stream' },
        }),
      );

      const result = await safeFetchMediaBuffer('http://example.com/img.png');

      expect(result).not.toBeNull();
      expect(result!.buffer).toStrictEqual(MINIMAL_PNG);
      expect(result!.contentType).toBe('image/png');

      expect(dnsMock.lookup).toHaveBeenCalledWith(
        'example.com',
        { all: true },
      );
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });
  });
});
