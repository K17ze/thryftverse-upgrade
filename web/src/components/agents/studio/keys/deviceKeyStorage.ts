import {
  DEVICE_PROVIDER_ORDER,
  DEVICE_PROVIDERS,
  type DeviceKeyTestResult,
  type DeviceProvider,
  type DiscoveredModel,
  type StoredDeviceKey,
} from './deviceKeyTypes';
import { validateDeviceEndpoint, validateKeyFormat } from './deviceKeyValidation';
import { probeProvider } from './deviceKeyProbe';

// ---------------------------------------------------------------------------
// Storage — localStorage, prefixed. Everything here is this device only.
// ---------------------------------------------------------------------------

const KEY_PREFIX = 'thryftverse:agent-device-key/';
const DISCOVERY_PREFIX = 'thryftverse:agent-device-discovery/';
const DISCOVERY_TTL_MS = 1000 * 60 * 60 * 6; // 6 hours, same as mobile

interface StoredDeviceKeyPayload {
  apiKey: string;
  baseUrl?: string;
  savedAt: string;
}

function readPayload(provider: DeviceProvider): StoredDeviceKeyPayload | null {
  try {
    const raw = window.localStorage.getItem(`${KEY_PREFIX}${provider}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredDeviceKeyPayload>;
    if (typeof parsed.apiKey !== 'string' || parsed.apiKey.length === 0) return null;
    return {
      apiKey: parsed.apiKey,
      ...(typeof parsed.baseUrl === 'string' && parsed.baseUrl
        ? { baseUrl: parsed.baseUrl }
        : {}),
      savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : new Date(0).toISOString(),
    };
  } catch {
    return null;
  }
}

/** Every provider with a stored key, in canonical order. */
export function getStoredDeviceKeys(): StoredDeviceKey[] {
  if (typeof window === 'undefined') return [];
  const out: StoredDeviceKey[] = [];
  for (const provider of DEVICE_PROVIDER_ORDER) {
    const payload = readPayload(provider);
    if (payload) {
      out.push({
        provider,
        apiKey: payload.apiKey,
        ...(payload.baseUrl ? { baseUrl: payload.baseUrl } : {}),
        storageClass: 'browser',
        savedAt: payload.savedAt,
      });
    }
  }
  return out;
}

export function getDeviceKey(provider: DeviceProvider): StoredDeviceKey | null {
  if (typeof window === 'undefined') return null;
  const payload = readPayload(provider);
  return payload
    ? {
        provider,
        apiKey: payload.apiKey,
        ...(payload.baseUrl ? { baseUrl: payload.baseUrl } : {}),
        storageClass: 'browser',
        savedAt: payload.savedAt,
      }
    : null;
}

export function saveDeviceKey(
  provider: DeviceProvider,
  apiKey: string,
  baseUrl?: string,
): StoredDeviceKey {
  const payload: StoredDeviceKeyPayload = {
    apiKey: apiKey.trim(),
    ...(baseUrl?.trim() ? { baseUrl: baseUrl.trim() } : {}),
    savedAt: new Date().toISOString(),
  };
  window.localStorage.setItem(`${KEY_PREFIX}${provider}`, JSON.stringify(payload));
  return {
    provider,
    apiKey: payload.apiKey,
    ...(payload.baseUrl ? { baseUrl: payload.baseUrl } : {}),
    storageClass: 'browser',
    savedAt: payload.savedAt,
  };
}

export function removeDeviceKey(provider: DeviceProvider): void {
  try {
    window.localStorage.removeItem(`${KEY_PREFIX}${provider}`);
    // Clear cached discovery so a stale model list can't outlive the key.
    window.localStorage.removeItem(`${DISCOVERY_PREFIX}${provider}`);
  } catch {
    // Non-fatal.
  }
}

/**
 * Test a key against the provider, persisting to localStorage only after
 * the provider confirms it. Same contract as mobile's testApiKey.
 */
export async function testDeviceKey(
  provider: DeviceProvider,
  apiKey: string,
  baseUrl?: string,
): Promise<DeviceKeyTestResult> {
  const config = DEVICE_PROVIDERS[provider];
  const trimmedKey = apiKey.trim();
  const trimmedBase = baseUrl?.trim() || undefined;

  if (config.supportsBaseUrl && trimmedBase) {
    try {
      validateDeviceEndpoint(trimmedBase);
    } catch (err) {
      return {
        status: 'invalid',
        message: err instanceof Error ? err.message : 'Base URL is not valid.',
      };
    }
  }

  if (!validateKeyFormat(provider, trimmedKey)) {
    if (config.keyPrefixes.length > 0 && provider !== 'gemini') {
      return {
        status: 'invalid',
        message: `Key must start with "${config.keyPrefixes[0]}" and be at least ${config.minKeyLength} characters.`,
      };
    }
    return {
      status: 'invalid',
      message: `Key must be at least ${config.minKeyLength} characters.`,
    };
  }

  const probe = await probeProvider(provider, trimmedKey, trimmedBase);
  if (!probe.ok) return { status: 'invalid', message: probe.message };

  saveDeviceKey(provider, trimmedKey, trimmedBase);
  if (probe.models && probe.models.length > 0) {
    try {
      window.localStorage.setItem(
        `${DISCOVERY_PREFIX}${provider}`,
        JSON.stringify({ models: probe.models, discoveredAt: new Date().toISOString() }),
      );
    } catch {
      // Cache failure is non-fatal.
    }
  }
  return { status: 'valid', message: probe.message, models: probe.models };
}

/**
 * Provider-authoritative model list for a stored key — cached locally for
 * 6h (same TTL as mobile), empty when the probe can't run.
 */
export async function discoverDeviceModels(
  provider: DeviceProvider,
): Promise<DiscoveredModel[]> {
  try {
    const raw = window.localStorage.getItem(`${DISCOVERY_PREFIX}${provider}`);
    if (raw) {
      const cached = JSON.parse(raw) as { models?: DiscoveredModel[]; discoveredAt?: string };
      const age = Date.now() - new Date(cached.discoveredAt ?? 0).getTime();
      if (Array.isArray(cached.models) && cached.models.length > 0 && age < DISCOVERY_TTL_MS) {
        return cached.models;
      }
    }
  } catch {
    // Fall through to a live probe.
  }

  const stored = getDeviceKey(provider);
  if (!stored?.apiKey) return [];
  const probe = await probeProvider(provider, stored.apiKey, stored.baseUrl);
  if (!probe.ok || !probe.models || probe.models.length === 0) return [];
  try {
    window.localStorage.setItem(
      `${DISCOVERY_PREFIX}${provider}`,
      JSON.stringify({ models: probe.models, discoveredAt: new Date().toISOString() }),
    );
  } catch {
    // Non-fatal.
  }
  return probe.models;
}
