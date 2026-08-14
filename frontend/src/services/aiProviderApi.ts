/**
 * aiProviderApi — Bring-your-own-key integration for AI providers.
 *
 * Lets the user connect their own API keys for OpenAI, Anthropic Claude,
 * Google Gemini, and any OpenAI-compatible custom endpoint. Keys are stored
 * locally on-device only:
 *  - When `expo-secure-store` (hardware-backed Keychain / Keystore) is
 *    available, keys are stored there encrypted at rest.
 *  - Otherwise keys are held in process-memory only for the current
 *    session. They are NEVER written to AsyncStorage or any other
 *    plaintext app-storage. The caller is told which store was used
 *    ('secure' | 'session') so the UI can be truthful (AGENTS.md §11).
 *
 * Per AGENTS.md §11 (Truthful UI):
 *  - `testApiKey` performs a real provider round-trip (GET /models or
 *    equivalent minimal endpoint) to verify the key is authorised. The
 *    result is labelled "Connected" only after a successful live response.
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
  storageClass: 'secure' | 'session';
  /** ISO timestamp of when the key was saved. */
  savedAt: string;
}

export type TestResult =
  | { status: 'valid'; message: string; models?: DiscoveredModel[] }
  | { status: 'invalid'; message: string };

export interface ConnectedProvider extends StoredProviderKey {
  config: ProviderConfig;
}

// ---------------------------------------------------------------------------
// Dynamic model discovery (provider-authoritative)
// ---------------------------------------------------------------------------

/**
 * A model discovered from the provider's API. The provider is the
 * source-of-truth for which models exist — we do not ship a hardcoded
 * consumer catalogue (spec 04: "Providers change faster than app releases").
 */
export interface DiscoveredModel {
  /** Provider-authoritative model id (e.g. "gpt-4o"). */
  providerModelId: string;
  /** Human-readable display name. Falls back to the id when absent. */
  displayName: string;
  capabilities: {
    text: boolean;
    vision: boolean;
    toolCalling: boolean;
    structuredOutput: boolean;
    reasoning?: boolean;
  };
  /** True when the provider marks the model as deprecated/sunset. */
  deprecated?: boolean;
}

/** Cached discovery result so we don't re-fetch on every render. */
interface CachedDiscovery {
  models: DiscoveredModel[];
  discoveredAt: string;
}

// ---------------------------------------------------------------------------
// Provider catalogue
// ---------------------------------------------------------------------------

export const PROVIDER_CONFIGS: Record<AIProvider, ProviderConfig> = {
  openai: {
    id: 'openai',
    name: 'OpenAI',
    // No hardcoded model catalogue — models are discovered dynamically from
    // the provider's /v1/models endpoint (spec 04: provider-authoritative).
    description: 'OpenAI chat and reasoning models. Available models are discovered from your account.',
    icon: 'cube-outline',
    keyPrefixes: ['sk-'],
    minKeyLength: 20,
    models: [],
    supportsBaseUrl: false,
    keyPlaceholder: 'sk-...',
  },
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic Claude',
    description: 'Anthropic Claude chat models. Available models are discovered from your account.',
    icon: 'chatbubbles-outline',
    keyPrefixes: ['sk-ant-'],
    minKeyLength: 40,
    models: [],
    supportsBaseUrl: false,
    keyPlaceholder: 'sk-ant-...',
  },
  gemini: {
    id: 'gemini',
    name: 'Google Gemini',
    description: 'Google Gemini multimodal models. Available models are discovered from your account.',
    icon: 'globe-outline',
    // Google API keys are commonly prefixed with 'AIza' but the platform does
    // not strictly enforce it; we accept the prefix when present and otherwise
    // only enforce length.
    keyPrefixes: ['AIza'],
    minKeyLength: 30,
    models: [],
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
    models: [],
    supportsBaseUrl: true,
    keyPlaceholder: 'API key (optional for local servers)',
  },
};

export const PROVIDER_ORDER: AIProvider[] = ['openai', 'anthropic', 'gemini', 'custom'];

// ---------------------------------------------------------------------------
// Session-memory fallback (used only when secure storage is unavailable)
// ---------------------------------------------------------------------------

const sessionKeyStore = new Map<AIProvider, string>();
const sessionBaseUrlStore = new Map<AIProvider, string>();

// ---------------------------------------------------------------------------
// Model discovery cache (AsyncStorage — not secret, safe to persist)
// ---------------------------------------------------------------------------

const DISCOVERY_CACHE_PREFIX = '@thryftverse_ai_provider/discovery/';
const DISCOVERY_TTL_MS = 1000 * 60 * 60 * 6; // 6 hours

function discoveryCacheKey(provider: AIProvider): string {
  return `${DISCOVERY_CACHE_PREFIX}${provider}`;
}

async function getCachedDiscovery(provider: AIProvider): Promise<DiscoveredModel[] | null> {
  try {
    const raw = await AsyncStorage.getItem(discoveryCacheKey(provider));
    if (!raw) return null;
    const cached = JSON.parse(raw) as CachedDiscovery;
    const age = Date.now() - new Date(cached.discoveredAt).getTime();
    if (age > DISCOVERY_TTL_MS) return null;
    return cached.models;
  } catch {
    return null;
  }
}

async function setCachedDiscovery(provider: AIProvider, models: DiscoveredModel[]): Promise<void> {
  try {
    const entry: CachedDiscovery = { models, discoveredAt: new Date().toISOString() };
    await AsyncStorage.setItem(discoveryCacheKey(provider), JSON.stringify(entry));
  } catch {
    // Cache failure is non-fatal — discovery still works without cache.
  }
}

export async function clearDiscoveryCache(provider?: AIProvider): Promise<void> {
  try {
    if (provider) {
      await AsyncStorage.removeItem(discoveryCacheKey(provider));
    } else {
      for (const p of PROVIDER_ORDER) {
        await AsyncStorage.removeItem(discoveryCacheKey(p)).catch(() => {});
      }
    }
  } catch {
    // Non-fatal.
  }
}

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
  storageClass: 'secure' | 'session';
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

/**
 * Returns `true` when the host is a private/loopback/reserved address that
 * must not be reachable from a production build (SSRF guard). Hostnames that
 * are not numeric IPs are considered public — only literal IP ranges and
 * the well-known loopback name are blocked.
 */
function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h === '::1') return true;
  const parts = h.split('.');
  if (parts.length === 4 && parts.every((p) => /^\d+$/.test(p))) {
    const [a, b] = parts.map(Number);
    if (a === 0) return true;                       // 0.0.0.0/8
    if (a === 10) return true;                      // 10.0.0.0/8 private
    if (a === 127) return true;                     // 127.0.0.0/8 loopback
    if (a === 169 && b === 254) return true;        // 169.254.0.0/16 link-local
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 private
    if (a === 192 && b === 168) return true;        // 192.168.0.0/16 private
    if (a === 255) return true;                     // 255.255.255.255 broadcast
  }
  return false;
}

/**
 * Validate a custom provider endpoint URL for transport safety and SSRF.
 *
 * - In production (`!__DEV__`), `http://` is rejected — HTTPS is the default.
 * - In `__DEV__`, `http://` is allowed but a warning is logged so local
 *   development servers (Ollama, LM Studio, etc.) keep working.
 * - In production, private/loopback hosts are rejected to prevent SSRF
 *   (`127.x`, `10.x`, `172.16–31.x`, `192.168.x`, `localhost`).
 * - Throws an `Error` on rejection; returns `true` when the URL is acceptable.
 *
 * Exported so the hardening tests can exercise it directly.
 */
export function validateProviderEndpoint(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) {
    throw new Error('Endpoint URL is required.');
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('Endpoint URL is not a valid URL.');
  }
  if (!parsed.hostname) {
    throw new Error('Endpoint URL must include a host.');
  }

  const isDev = typeof __DEV__ !== 'undefined' && __DEV__;

  if (parsed.protocol === 'http:') {
    if (!isDev) {
      throw new Error('Custom endpoints must use HTTPS in production.');
    }
    // Dev only — allow but warn so it is obvious this never ships.
    console.warn(
      '[aiProviderApi] Insecure http:// custom endpoint allowed in dev only:',
      trimmed,
    );
  } else if (parsed.protocol !== 'https:') {
    throw new Error(
      `Unsupported endpoint protocol "${parsed.protocol}". Use https://.`,
    );
  }

  // SSRF guard — only enforced in production. In dev, pointing at a local
  // server (e.g. http://localhost:1234) is the common case.
  if (!isDev && isPrivateHost(parsed.hostname)) {
    throw new Error('Private/loopback endpoints are not allowed in production.');
  }

  return true;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Save an API key for a provider. Uses hardware-backed SecureStore when
 * available. When secure storage is unavailable, the key is held in
 * process-memory only for the current session — NEVER written to
 * AsyncStorage or any plaintext app-storage (Phase 3 P0 security invariant).
 */
export async function saveApiKey(
  provider: AIProvider,
  apiKey: string,
  baseUrl?: string,
): Promise<StoredProviderKey> {
  const trimmedKey = apiKey.trim();
  const trimmedBaseUrl = baseUrl?.trim() || undefined;

  const secureAvailable = await isSecureStorageAvailable();
  const storageClass: 'secure' | 'session' = secureAvailable ? 'secure' : 'session';
  const savedAt = new Date().toISOString();

  if (secureAvailable) {
    await secureStorage.setItem(storageKey(provider), trimmedKey);
    if (trimmedBaseUrl) {
      await secureStorage.setItem(baseUrlStorageKey(provider), trimmedBaseUrl);
    } else {
      await secureStorage.deleteItem(baseUrlStorageKey(provider)).catch(() => {});
    }
  } else {
    // Session-memory fallback: key lives only for the app process lifetime.
    sessionKeyStore.set(provider, trimmedKey);
    if (trimmedBaseUrl) {
      sessionBaseUrlStore.set(provider, trimmedBaseUrl);
    } else {
      sessionBaseUrlStore.delete(provider);
    }
  }

  // Metadata (storage class + timestamp) is not secret — safe in AsyncStorage.
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
    apiKey = sessionKeyStore.get(provider) ?? null;
    baseUrl = sessionBaseUrlStore.get(provider) ?? null;
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
    storageClass: meta?.storageClass ?? (secureAvailable ? 'secure' : 'session'),
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
    sessionKeyStore.delete(provider);
    sessionBaseUrlStore.delete(provider);
  }
  await AsyncStorage.removeItem(metaStorageKey(provider)).catch(() => {});
  // Clear the model discovery cache so stale models don't persist after
  // disconnect (spec 04: model list is provider-authoritative).
  await AsyncStorage.removeItem(discoveryCacheKey(provider)).catch(() => {});
}

/**
 * Probe a provider endpoint to verify the API key is authorised.
 * Makes a minimal real HTTP request (GET /models or equivalent).
 * Returns a structured result so the UI can show truthful status.
 * When the probe succeeds, the response body is parsed to discover the
 * provider-authoritative model list (spec 04: dynamic model discovery).
 */
async function probeProviderConnection(
  provider: AIProvider,
  apiKey: string,
  baseUrl?: string,
): Promise<{ ok: boolean; message: string; models?: DiscoveredModel[] }> {
  const trimmedKey = apiKey.trim();
  const trimmedBase = baseUrl?.trim() || undefined;
  const timeoutMs = 10000;

  try {
    let url: string;
    let headers: Record<string, string>;

    switch (provider) {
      case 'openai':
        url = trimmedBase ?? 'https://api.openai.com/v1/models';
        headers = { Authorization: `Bearer ${trimmedKey}` };
        break;
      case 'anthropic':
        url = trimmedBase ?? 'https://api.anthropic.com/v1/models';
        headers = {
          'x-api-key': trimmedKey,
          'anthropic-version': '2023-06-01',
        };
        break;
      case 'gemini':
        url = trimmedBase
          ? `${trimmedBase.replace(/\/$/, '')}/models`
          : `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(trimmedKey)}`;
        headers = {};
        break;
      case 'custom':
        if (!trimmedBase) {
          return { ok: false, message: 'Custom endpoint requires a base URL.' };
        }
        url = `${trimmedBase.replace(/\/$/, '')}/models`;
        headers = trimmedKey ? { Authorization: `Bearer ${trimmedKey}` } : {};
        break;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(url, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (response.status === 401 || response.status === 403) {
      return { ok: false, message: 'Authentication failed — key rejected by provider.' };
    }
    if (response.status === 429) {
      return { ok: false, message: 'Rate limited — try again in a moment.' };
    }
    if (response.status >= 500) {
      return { ok: false, message: 'Provider unavailable — try again later.' };
    }
    if (!response.ok) {
      return { ok: false, message: `Provider returned HTTP ${response.status}.` };
    }

    // Parse the model list from the provider's response. This is the
    // provider-authoritative source — we do not rely on a hardcoded
    // catalogue (spec 04: dynamic model discovery).
    let models: DiscoveredModel[] = [];
    try {
      const body = await response.json();
      models = parseProviderModels(provider, body);
    } catch {
      // The probe succeeded (HTTP 200) but the body was not JSON or did
      // not contain a recognisable model list. The connection is still
      // valid — we just have no discovered models to report.
    }

    return { ok: true, message: 'Connected — key verified by provider.', models };
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return { ok: false, message: 'Request timed out — check your connection.' };
    }
    return { ok: false, message: 'Endpoint unreachable — check the URL or your network.' };
  }
}

// ---------------------------------------------------------------------------
// Provider model-list parsing — normalises each provider's /models response
// into the common DiscoveredModel shape (spec 04).
// ---------------------------------------------------------------------------

/**
 * Conservative default capability set used when the provider does not
 * expose authoritative per-model capability metadata. We assume MINIMAL
 * capabilities — never infer vision / tool-use / structured-output from
 * the model id, because model IDs are not a reliable capability signal
 * and overclaiming breaks truthful UI (AGENTS.md §11).
 *
 * Only `text` is assumed `true` (a model that cannot produce text is not a
 * chat model). `vision`, `toolCalling`, `structuredOutput` and `reasoning`
 * are all `false` until the provider explicitly says otherwise.
 *
 * Exported so the hardening tests can exercise it directly.
 */
export function defaultCapabilities(): DiscoveredModel['capabilities'] {
  return {
    text: true,
    vision: false,
    toolCalling: false,
    structuredOutput: false,
    reasoning: false,
  };
}

/**
 * Read capability flags from a provider model object when it exposes
 * authoritative per-model capability metadata. Returns `null` when no
 * capability metadata is present — callers then fall back to the safe
 * `defaultCapabilities()`. We never infer capabilities from the model id.
 */
function capabilitiesFromMetadata(m: any): DiscoveredModel['capabilities'] | null {
  if (!m || typeof m !== 'object') return null;
  const caps = m.capabilities ?? m.capability ?? m.supports;
  if (!caps || typeof caps !== 'object') return null;
  const pick = (key: string): boolean | undefined => {
    const v = (caps as any)[key];
    return typeof v === 'boolean' ? v : undefined;
  };
  const text = pick('text') ?? pick('input') ?? pick('completion');
  const vision = pick('vision') ?? pick('image_input') ?? pick('images');
  const toolCalling = pick('toolCalling') ?? pick('tool_use') ?? pick('tools') ?? pick('functionCalling');
  const structuredOutput = pick('structuredOutput') ?? pick('structured_output') ?? pick('json_mode');
  const reasoning = pick('reasoning');
  // Only treat as authoritative if at least one flag was explicitly set.
  if (
    text === undefined &&
    vision === undefined &&
    toolCalling === undefined &&
    structuredOutput === undefined &&
    reasoning === undefined
  ) {
    return null;
  }
  return {
    text: text ?? true,
    vision: vision ?? false,
    toolCalling: toolCalling ?? false,
    structuredOutput: structuredOutput ?? false,
    reasoning: reasoning ?? false,
  };
}

/**
 * Parse a provider's /models response body into a normalised list of
 * DiscoveredModel entries. Each provider uses a slightly different schema,
 * so we handle them individually and fall back gracefully. Capabilities
 * are only set from authoritative provider metadata — never inferred from
 * the model id (AGENTS.md §11 truthful UI).
 */
function parseProviderModels(provider: AIProvider, body: unknown): DiscoveredModel[] {
  if (!body || typeof body !== 'object') return [];

  try {
    switch (provider) {
      case 'openai':
      case 'custom': {
        // OpenAI-compatible: { data: [{ id, ... }] }
        const data = (body as any).data;
        if (!Array.isArray(data)) return [];
        return data
          .map((m: any): DiscoveredModel | null => {
            const id = typeof m?.id === 'string' ? m.id : null;
            if (!id) return null;
            return {
              providerModelId: id,
              displayName: id,
              capabilities: capabilitiesFromMetadata(m) ?? defaultCapabilities(),
              deprecated: m?.deprecated === true,
            };
          })
          .filter((m: DiscoveredModel | null): m is DiscoveredModel => m !== null);
      }
      case 'anthropic': {
        // Anthropic: { data: [{ id, display_name, ... }] } or { models: [...] }
        const data = (body as any).data ?? (body as any).models;
        if (!Array.isArray(data)) return [];
        return data
          .map((m: any): DiscoveredModel | null => {
            const id = typeof m?.id === 'string' ? m.id : null;
            if (!id) return null;
            return {
              providerModelId: id,
              displayName: typeof m?.display_name === 'string' ? m.display_name : id,
              capabilities: capabilitiesFromMetadata(m) ?? defaultCapabilities(),
              deprecated: m?.deprecated === true,
            };
          })
          .filter((m: DiscoveredModel | null): m is DiscoveredModel => m !== null);
      }
      case 'gemini': {
        // Gemini: { models: [{ name: "models/gemini-1.5-pro", supportedGenerationMethods: [...] }] }
        const models = (body as any).models;
        if (!Array.isArray(models)) return [];
        return models
          .map((m: any): DiscoveredModel | null => {
            const rawName = typeof m?.name === 'string' ? m.name : null;
            if (!rawName) return null;
            // Gemini returns "models/gemini-1.5-pro" — strip the prefix.
            const id = rawName.replace(/^models\//, '');
            // `supportedGenerationMethods` is authoritative provider metadata
            // for which generation modes the model supports. We only derive
            // `text` from it (generateContent => text). Vision, tool-calling
            // and structured-output are NOT encoded in this list, so we leave
            // them as safe defaults rather than guessing from the model id.
            const methods: string[] = Array.isArray(m?.supportedGenerationMethods)
              ? m.supportedGenerationMethods
              : [];
            const fromMeta = capabilitiesFromMetadata(m);
            const caps: DiscoveredModel['capabilities'] = fromMeta ?? {
              ...defaultCapabilities(),
              text: methods.length === 0 || methods.includes('generateContent'),
            };
            return {
              providerModelId: id,
              displayName: id,
              capabilities: caps,
            };
          })
          .filter((m: DiscoveredModel | null): m is DiscoveredModel => m !== null);
      }
      default:
        return [];
    }
  } catch {
    return [];
  }
}

/**
 * Discover available models from a connected provider. Uses the cached
 * result when fresh (within TTL), otherwise makes a live request to the
 * provider's /models endpoint. Returns an empty array when the provider
 * is not connected or the request fails — the caller should show a
 * truthful empty state, not a hardcoded fallback list (spec 04).
 */
export async function discoverModels(provider: AIProvider): Promise<DiscoveredModel[]> {
  // Check cache first.
  const cached = await getCachedDiscovery(provider);
  if (cached && cached.length > 0) return cached;

  // Need a stored key to make the request.
  const stored = await getApiKey(provider);
  if (!stored || !stored.apiKey) return [];

  const probe = await probeProviderConnection(provider, stored.apiKey, stored.baseUrl);
  if (!probe.ok || !probe.models || probe.models.length === 0) return [];

  await setCachedDiscovery(provider, probe.models);
  return probe.models;
}

/**
 * Test an API key by performing a real provider round-trip.
 * The key is only saved if the provider confirms it is authorised.
 *
 * If `persistOnValid` is true (default), a verified key is saved before returning.
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

  const probe = await probeProviderConnection(provider, trimmedKey, baseUrl);
  if (!probe.ok) {
    return { status: 'invalid', message: probe.message };
  }

  if (persistOnValid) {
    await saveApiKey(provider, trimmedKey, baseUrl?.trim() || undefined);
  }

  // Cache discovered models so the UI can show the provider-authoritative
  // list without re-fetching on every render (spec 04).
  if (probe.models && probe.models.length > 0) {
    await setCachedDiscovery(provider, probe.models);
  }

  return {
    status: 'valid',
    message: probe.message,
    models: probe.models,
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
