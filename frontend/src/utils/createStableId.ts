/**
 * Central stable-ID helper for the Poster creator.
 *
 * Uses `crypto.getRandomValues` (available in React Native's JS runtime)
 * to generate cryptographically random bytes, then formats them as a
 * RFC-4122 v4 UUID.  Falls back to `crypto.randomUUID` when available.
 *
 * No `Math.random()` or `Date.now()` is used for the random portion.
 */

function bytesToUuid(bytes: Uint8Array): string {
  const hex: string[] = [];
  for (let i = 0; i < bytes.length; i++) {
    hex.push(bytes[i].toString(16).padStart(2, '0'));
  }
  // 16 bytes → 32 hex chars → insert dashes at 8-4-4-4-12
  return (
    hex.slice(0, 4).join('') +
    '-' +
    hex.slice(4, 6).join('') +
    '-' +
    hex.slice(6, 8).join('') +
    '-' +
    hex.slice(8, 10).join('') +
    '-' +
    hex.slice(10, 16).join('')
  );
}

function secureUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    // Set version (4) and variant (10xx) bits per RFC 4122
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    return bytesToUuid(bytes);
  }

  // Last-resort fallback — still no Math.random for persistent IDs.
  // This branch should never execute in React Native, but if it does
  // we throw so the caller knows the environment is unsupported.
  throw new Error('No secure random source available for createStableId');
}

export function createStableId(prefix?: string): string {
  const uuid = secureUUID();
  return prefix ? `${prefix}_${uuid}` : uuid;
}
