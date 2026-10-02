import { DEVICE_PROVIDERS, type DeviceProvider } from './deviceKeyTypes';

// ---------------------------------------------------------------------------
// Validation — format and endpoint checks make no network calls.
// ---------------------------------------------------------------------------

export function maskDeviceKey(key: string): string {
  if (!key) return '';
  if (key.length <= 12) return '••••••••';
  return `${key.slice(0, 6)}••••••••${key.slice(-4)}`;
}

export function validateKeyFormat(provider: DeviceProvider, key: string): boolean {
  const config = DEVICE_PROVIDERS[provider];
  const trimmed = key.trim();
  if (trimmed.length < config.minKeyLength) return false;
  if (config.keyPrefixes.length > 0 && provider !== 'gemini') {
    return config.keyPrefixes.some((prefix) => trimmed.startsWith(prefix));
  }
  return true;
}

export function validateBaseUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed);
    return (
      (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
      !!parsed.hostname
    );
  } catch {
    return false;
  }
}

/** Private/loopback literal hosts — rejected outside development (SSRF
 *  guard, same ranges the mobile validateProviderEndpoint enforces). */
export function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h === '::1') return true;
  const parts = h.split('.');
  if (parts.length === 4 && parts.every((p) => /^\d+$/.test(p))) {
    const [a, b] = parts.map(Number);
    if (a === 0 || a === 10 || a === 127 || a === 255) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
  }
  return false;
}

/**
 * Endpoint transport-safety check. Mirrors mobile: production requires
 * https and rejects private/loopback hosts; in development http and local
 * endpoints (Ollama, LM Studio) are allowed.
 */
export function validateDeviceEndpoint(url: string): true {
  const trimmed = url.trim();
  if (!trimmed) throw new Error('Endpoint URL is required.');
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('Endpoint URL is not a valid URL.');
  }
  if (!parsed.hostname) throw new Error('Endpoint URL must include a host.');

  const isDev = process.env.NODE_ENV !== 'production';
  if (parsed.protocol === 'http:') {
    if (!isDev) throw new Error('Custom endpoints must use HTTPS.');
  } else if (parsed.protocol !== 'https:') {
    throw new Error(`Unsupported endpoint protocol "${parsed.protocol}". Use https://.`);
  }
  if (!isDev && isPrivateHost(parsed.hostname)) {
    throw new Error('Private or loopback endpoints are not allowed.');
  }
  return true;
}
