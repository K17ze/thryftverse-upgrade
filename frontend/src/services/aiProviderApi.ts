/**
 * aiProviderApi — Bring-your-own-key integration for AI providers.
 *
 * Lets the user connect their own API keys for OpenAI, Anthropic Claude,
 * Google Gemini, and any OpenAI-compatible custom endpoint. Keys are stored
 * locally on-device only:
 *  - When `expo-secure-store` (hardware-backed Keychain / Keystore) is
 *    available, keys are stored there encrypted at rest.
 *  - Otherwise keys fall back to AsyncStorage (still on-device, but not
 *    hardware-backed). The caller is told which store was used so the UI can
 *    be truthful about the storage class (AGENTS.md §11).
 *
 * Per AGENTS.md §11 (Truthful UI):
 *  - `testApiKey` validates the key FORMAT only (prefix + length). It does NOT
 *    make a real network call. The result is labelled "Key saved locally" /
 *    "Valid format" — never "Connected to provider" — because no live request
 *    was sent. A real implementation would call the provider's /models
 *    endpoint; that is intentionally out of scope for this demo build.
 *  - We never fabricate a successful provider round-trip.
 *
 * Supported providers: 'openai' | 'anthropic' | 'gemini' | 'custom'.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { secureStorage, isSecureStorageAvailable } from '../utils/security';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AIProvider = 'openai' | 'anthropic' | 'gemini' | 'custom';

export interface ProviderConfig {
  /** Stable provider id. */
  id: AIProvider;
  /** Human-readable provider name. */
  name: string;
  /** Short description shown beneath the name. */
  description: string;
  /** Ionicons glyph name used for the provider row. */
  icon: string;
  /** Expected key prefix(es) used for format validation. Empty = no prefix rule. */
  keyPrefixes: string[];
  /** Minimum acceptable key length (after trimming). */
  minKeyLength: number;
  /** Models available from this provider (informational only). */
  models: string[];
  /** Whether this provider supports a custom base URL. */
  supportsBaseUrl: boolean;
  /** Placeholder text for the key input. */
  keyPlaceholder: string;
}

export interface StoredProviderKey {
  provider: AIProvider;
  /** The API key (masked when displayed). */
  apiKey: string;
  /** Optional custom base URL (custom provider only). */
  baseUrl?: string;
  /** Where the key was actually persisted. */
  storageClass: 'secure' | 'async';
  /** ISO timestamp of when the key was saved. */
  savedAt: string;
}

export type TestResult =
  | { status: 'valid'; message: string }
  | { status: 'invalid'; message: string };

export interface ConnectedProvider extends StoredProviderKey {
  config: ProviderConfig;
}

// ---------------------------------------------------------------------------
// Provider catalogue
// ---------------------------------------------------------------------------

export const PROVIDER_CONFIGS: Record<AIProvider, ProviderConfig> = {
  openai: {
    id: 'openai',
    name: 'OpenAI',
    description: 'GPT-4o, GPT-4 Turbo, GPT-3.5 Turbo and o-series reasoning models.',
    icon: 'cube-outline',
    keyPrefixes: ['sk-'],
    minKeyLength: 20,
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo', 'o1', 'o1-mini', 'o3-mini'],
    supportsBaseUrl: false,
    keyPlaceholder: 'sk-...',
  },
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic Claude',
    description: 'Claude 3.5 Sonnet, Claude 3 Opus and Haiku chat models.',
    icon: 'chatbubbles-outline',
    keyPrefixes: ['sk-ant-'],
    minKeyLength: 40,
    models: ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229', 'claude-3-sonnet-20240229', 'claude-3-haiku-20240307'],
    supportsBaseUrl: false,
    keyPlaceholder: 'sk-ant-...',
  },
  gemini: {
    id: 'gemini',
    name: 'Google Gemini',
    description: 'Gemini 1.5 Pro / Flash and Gemini 2.0 Flash multimodal models.',
    icon: 'sparkles-outline',
    // Google API keys are commonly prefixed with 'AIza' but the platform does
    // not strictly enforce it; we accept the prefix when present and otherwise
    // only enforce length.
    keyPrefixes: ['AIza'],
    minKeyLength: 30,
    models: ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-1.5-flash-8b'],
    supportsBaseUrl: false,
    keyPlaceholder: 'AIza...',
  },
  custom: {
    id: 'custom',
    name: 'Custom endpoint',
    description: 'Any OpenAI-compatible endpoint (LM Studio, Ollama, vLLM, Together, Groq, etc.).',
    icon: 'server-outline',
    keyPrefixes: [],
    minKeyLength: 8,
    models: ['Configured by your endpoint'],
    supportsBaseUrl: true,
    keyPlaceholder: 'API key (optional for local servers)',
  },
};

export const PROVIDER_ORDER: AIProvider[] = ['openai', 'anthropic', 'gemini', 'custom'];

// ---------------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------------

const STORAGE_PREFIX = '@thryftverse_ai_provider/';
const KEY_SUFFIX = '/key';
const BASEURL_SUFFIX = '/baseurl';
const META_SUFFIX = '/meta';

function storageKey(provider: AIProvider): string {
  return `${STORAGE_PREFIX}${provider}${KEY_SUFFIX}`;
}
function baseUrlStorageKey(provider: AIProvider): string {
  return `${STORAGE_PREFIX}${provider}${BASEURL_SUFFIX}`;
}
function metaStorageKey(provider: AIProvider): string {
  return `${STORAGE_PREFIX}${provider}${META_SUFFIX}`;
}

interface ProviderMeta {
  storageClass: 'secure' | 'async';
  savedAt: string;
}

// ---------------------------------------------------------------------------
// Key format validation (no network calls — AGENTS.md §11)
// ---------------------------------------------------------------------------

/**
 * Validate the format of an API key for a provider.
 *
 * This checks structural rules only (prefix + minimum length). It does NOT
 * verify the key against the provider's API. A "valid" result means the key
 * looks like a real key for this provider, not that it is authorised.
 */
export function validateKeyFormat(provider: AIProvider, key: string): boolean {
  const config = PROVIDER_CONFIGS[provider];
  const trimmed = key.trim();
  if (trimmed.length < config.minKeyLength) return false;
  if (config.keyPrefixes.length > 0) {
    // For Gemini the prefix is conventional but not strictly required; accept
    // the key if it matches the prefix OR is long enough to plausibly be a key.
    if (provider === 'gemini') {
      return true;
    }
    return config.keyPrefixes.some((prefix) => trimmed.startsWith(prefix));
  }
  return true;
}

/**
 * Validate a custom base URL. Must be an http(s) URL with a host.
 */
export function validateBaseUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed);
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && !!parsed.hostname;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Save an API key for a provider. Uses hardware-backed SecureStore when
 * available, otherwise falls back to AsyncStorage. The storage class used is
 * recorded so the UI can truthfully report where the key lives.
 */
export async function saveApiKey(
  provider: AIProvider,
  apiKey: string,
  baseUrl?: string,
): Promise<StoredProviderKey> {
  const trimmedKey = apiKey.trim();
  const trimmedBaseUrl = baseUrl?.trim() || undefined;

  const secureAvailable = await isSecureStorageAvailable();
  const storageClass: 'secure' | 'async' = secureAvailable ? 'secure' : 'async';
  const savedAt = new Date().toISOString();

  if (secureAvailable) {
    await secureStorage.setItem(storageKey(provider), trimmedKey);
    if (trimmedBaseUrl) {
      await secureStorage.setItem(baseUrlStorageKey(provider), trimmedBaseUrl);
    } else {
      await secureStorage.deleteItem(baseUrlStorageKey(provider)).catch(() => {});
    }
  } else {
    await AsyncStorage.setItem(storageKey(provider), trimmedKey);
    if (trimmedBaseUrl) {
      await AsyncStorage.setItem(baseUrlStorageKey(provider), trimmedBaseUrl);
    } else {
      await AsyncStorage.removeItem(baseUrlStorageKey(provider)).catch(() => {});
    }
  }

  const meta: ProviderMeta = { storageClass, savedAt };
  await AsyncStorage.setItem(metaStorageKey(provider), JSON.stringify(meta));

  return {
    provider,
    apiKey: trimmedKey,
    baseUrl: trimmedBaseUrl,
    storageClass,
    savedAt,
  };
}

/**
 * Retrieve the stored key (and optional base URL) for a provider, or null if
 * none is stored.
 */
export async function getApiKey(provider: AIProvider): Promise<StoredProviderKey | null> {
  const secureAvailable = await isSecureStorageAvailable();
  let apiKey: string | null = null;
  let baseUrl: string | null = null;

  if (secureAvailable) {
    apiKey = await secureStorage.getItem(storageKey(provider));
    baseUrl = await secureStorage.getItem(baseUrlStorageKey(provider));
  } else {
    apiKey = await AsyncStorage.getItem(storageKey(provider));
    baseUrl = await AsyncStorage.getItem(baseUrlStorageKey(provider));
  }

  if (!apiKey && !baseUrl) return null;

  let meta: ProviderMeta | null = null;
  try {
    const raw = await AsyncStorage.getItem(metaStorageKey(provider));
    if (raw) meta = JSON.parse(raw) as ProviderMeta;
  } catch {
    meta = null;
  }

  return {
    provider,
    apiKey: apiKey ?? '',
    baseUrl: baseUrl ?? undefined,
    storageClass: meta?.storageClass ?? (secureAvailable ? 'secure' : 'async'),
    savedAt: meta?.savedAt ?? new Date(0).toISOString(),
  };
}

/**
 * Remove / revoke a stored key and its base URL.
 */
export async function removeApiKey(provider: AIProvider): Promise<void> {
  const secureAvailable = await isSecureStorageAvailable();
  if (secureAvailable) {
    await secureStorage.deleteItem(storageKey(provider)).catch(() => {});
    await secureStorage.deleteItem(baseUrlStorageKey(provider)).catch(() => {});
  } else {
    await AsyncStorage.removeItem(storageKey(provider)).catch(() => {});
    await AsyncStorage.removeItem(baseUrlStorageKey(provider)).catch(() => {});
  }
  await AsyncStorage.removeItem(metaStorageKey(provider)).catch(() => {});
}

/**
 * Test an API key. Per AGENTS.md §11 this validates the key FORMAT only — it
 * does not make a real network call to the provider. The result message is
 * truthful about what was checked.
 *
 * If `persistOnValid` is true (default), a valid key is saved before returning.
 */
export async function testApiKey(
  provider: AIProvider,
  apiKey: string,
  baseUrl?: string,
  persistOnValid = true,
): Promise<TestResult> {
  const config = PROVIDER_CONFIGS[provider];
  const trimmedKey = apiKey.trim();

  if (config.supportsBaseUrl && baseUrl && !validateBaseUrl(baseUrl)) {
    return { status: 'invalid', message: 'Base URL must be a valid http(s) URL.' };
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

  if (persistOnValid) {
    await saveApiKey(provider, trimmedKey, baseUrl?.trim() || undefined);
  }

  return {
    status: 'valid',
    message: 'Valid format. Key saved locally — no live request was sent.',
  };
}

/**
 * Return all currently connected providers (those with a stored key), in
 * canonical provider order.
 */
export async function getConnectedProviders(): Promise<ConnectedProvider[]> {
  const connected: ConnectedProvider[] = [];
  for (const provider of PROVIDER_ORDER) {
    const stored = await getApiKey(provider);
    if (stored && stored.apiKey) {
      connected.push({ ...stored, config: PROVIDER_CONFIGS[provider] });
    }
  }
  return connected;
}

/**
 * Mask a key for display, showing only the first few and last few characters.
 */
export function maskApiKey(key: string): string {
  if (!key) return '';
  if (key.length <= 12) return '••••••••';
  const head = key.slice(0, 6);
  const tail = key.slice(-4);
  return `${head}••••••••${tail}`;
}
