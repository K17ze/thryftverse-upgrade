/**
 * UUID v7 generator (RFC 9562).
 *
 * Layout (128 bits total):
 *   bits  0-47  (48 bits) — Unix timestamp in milliseconds
 *   bits 48-51  ( 4 bits) — version, always 0b0111 (7)
 *   bits 52-63  (12 bits) — random
 *   bits 64-65  ( 2 bits) — variant, always 0b10
 *   bits 66-127 (62 bits) — random
 *
 * The result is a lowercase hex string in canonical 8-4-4-4-12 dashed form:
 *   xxxxxxxx-xxxx-7xxx-yxxx-xxxxxxxxxxxx
 *
 * Time-ordered UUIDs produce better B-tree locality than random UUID v4,
 * reducing index fragmentation and write amplification on append-heavy tables.
 *
 * Pure TypeScript, no dependencies. Uses `crypto.getRandomValues` (available
 * in Node 18+ and all modern browsers) for the random portion.
 */

const HEX = '0123456789abcdef';

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  if (
    typeof globalThis !== 'undefined'
    && typeof globalThis.crypto?.getRandomValues === 'function'
  ) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return bytes;
}

/**
 * Generate a UUID v7 string using the current wall-clock time.
 *
 * Returns a lowercase canonical UUID string such as
 * `0190e8c7-7f3a-7abc-9def-0123456789ab`.
 */
export function generateUuidV7(timestampMs: number = Date.now()): string {
  if (!Number.isFinite(timestampMs)) {
    timestampMs = Date.now();
  }

  const ts = Math.floor(timestampMs) % 2 ** 48;
  const rand = randomBytes(10);

  const b: number[] = new Array(16);

  b[0] = Math.floor(ts / 2 ** 40) & 0xff;
  b[1] = Math.floor(ts / 2 ** 32) & 0xff;
  b[2] = Math.floor(ts / 2 ** 24) & 0xff;
  b[3] = Math.floor(ts / 2 ** 16) & 0xff;
  b[4] = Math.floor(ts / 2 ** 8) & 0xff;
  b[5] = ts & 0xff;

  b[6] = ((rand[0] & 0x0f) | 0x70);
  b[7] = rand[1];

  b[8] = ((rand[2] & 0x3f) | 0x80);
  b[9] = rand[3];

  b[10] = rand[4];
  b[11] = rand[5];
  b[12] = rand[6];
  b[13] = rand[7];
  b[14] = rand[8];
  b[15] = rand[9];

  let out = '';
  for (let i = 0; i < 16; i++) {
    out += HEX[(b[i] >>> 4) & 0x0f];
    out += HEX[b[i] & 0x0f];
    if (i === 3 || i === 5 || i === 7 || i === 9) {
      out += '-';
    }
  }
  return out;
}

/**
 * Extract the embedded Unix timestamp (in milliseconds) from a UUID v7 string.
 *
 * Returns `NaN` if the input is not a valid UUID v7 (wrong length, wrong
 * version nibble, or non-hex characters). The variant and random bits are
 * ignored — only the first 48 bits are decoded.
 */
export function uuidV7ToTimestamp(uuid: string): number {
  if (typeof uuid !== 'string') {
    return NaN;
  }
  const stripped = uuid.toLowerCase().replace(/-/g, '');
  if (stripped.length !== 32) {
    return NaN;
  }
  if (!/^[0-9a-f]{32}$/.test(stripped)) {
    return NaN;
  }
  if (stripped[12] !== '7') {
    return NaN;
  }

  const high = parseInt(stripped.slice(0, 8), 16);
  const mid = parseInt(stripped.slice(8, 12), 16);

  return high * 2 ** 16 + mid;
}
