import { Platform } from 'react-native';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as Network from 'expo-network';
import { Sentry } from './sentry';
import { useOfflineQueue, OFFLINE_WRITE_QUEUED_CODE } from './offlineQueue';

const AUTH_SESSION_STORAGE_KEY = 'thryftverse.auth.session.v1';

/**
 * Raised in production when SecureStore is unavailable or a SecureStore write
 * fails. Auth tokens must never fall back to unencrypted AsyncStorage outside
 * of __DEV__; callers should treat this as a forced re-login condition.
 */
export class AuthSecureStoreUnavailableError extends Error {
  constructor(message = 'AUTH_SECURE_STORE_UNAVAILABLE') {
    super(message);
    this.name = 'AuthSecureStoreUnavailableError';
  }
}

function reportSecureStoreRefusal(reason: string, error?: unknown) {
  // `Sentry` is a runtime Proxy that no-ops when uninitialised, but its
  // `SentryLike` type declares methods as optional. The non-null assertions
  // reflect the Proxy's guaranteed-callable behaviour.
  Sentry.addBreadcrumb!({
    category: 'auth',
    message: `SecureStore refused in production: ${reason}`,
    level: 'error',
  });
  if (error !== undefined) {
    Sentry.captureException!(error);
  } else {
    Sentry.captureException!(new AuthSecureStoreUnavailableError(reason));
  }
}

interface AuthSessionState {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresInSeconds?: number;
  refreshTokenExpiresAt?: string;
}

let authSessionState: AuthSessionState | null = null;
let authSessionLoaded = false;
let refreshInFlight: Promise<string | null> | null = null;
let secureStoreAvailable: boolean | null = null;

async function canUseSecureStore() {
  if (secureStoreAvailable !== null) {
    return secureStoreAvailable;
  }

  try {
    secureStoreAvailable = await SecureStore.isAvailableAsync();
  } catch {
    secureStoreAvailable = false;
  }

  if (secureStoreAvailable === false) {
    if (__DEV__) {
      console.warn('[apiClient] SecureStore unavailable — auth tokens will fall back to unencrypted AsyncStorage');
    } else {
      // Production: never fall back to AsyncStorage. Surface the refusal to
      // Sentry so we have visibility on devices where the keystore is broken.
      reportSecureStoreRefusal('SecureStore.isAvailableAsync() returned false');
    }
  }

  return secureStoreAvailable;
}

async function readStoredAuthSessionRaw() {
  if (await canUseSecureStore()) {
    try {
      return await SecureStore.getItemAsync(AUTH_SESSION_STORAGE_KEY);
    } catch (error) {
      if (__DEV__) {
        // Fall back to AsyncStorage on secure-store read failures in dev.
        return AsyncStorage.getItem(AUTH_SESSION_STORAGE_KEY);
      }
      reportSecureStoreRefusal('SecureStore.getItemAsync threw', error);
      return null;
    }
  }

  if (__DEV__) {
    return AsyncStorage.getItem(AUTH_SESSION_STORAGE_KEY);
  }

  // Production: refuse to read from unencrypted storage. Caller will treat
  // this as no stored session and force re-login.
  return null;
}

async function writeStoredAuthSessionRaw(value: string) {
  if (await canUseSecureStore()) {
    try {
      await SecureStore.setItemAsync(AUTH_SESSION_STORAGE_KEY, value);
      return;
    } catch (error) {
      if (__DEV__) {
        // Fall back to AsyncStorage on secure-store write failures in dev.
        await AsyncStorage.setItem(AUTH_SESSION_STORAGE_KEY, value);
        return;
      }
      reportSecureStoreRefusal('SecureStore.setItemAsync threw', error);
      throw new AuthSecureStoreUnavailableError();
    }
  }

  if (__DEV__) {
    await AsyncStorage.setItem(AUTH_SESSION_STORAGE_KEY, value);
    return;
  }

  // Production: refuse to persist auth tokens to unencrypted storage.
  reportSecureStoreRefusal('SecureStore unavailable before write');
  throw new AuthSecureStoreUnavailableError();
}

async function clearStoredAuthSessionRaw() {
  // Clearing is safe in both dev and production: deleting a token from
  // AsyncStorage is harmless and helps cleanup even when SecureStore is
  // unavailable. Always try SecureStore first, then fall back.
  if (await canUseSecureStore()) {
    try {
      await SecureStore.deleteItemAsync(AUTH_SESSION_STORAGE_KEY);
      return;
    } catch {
      // Fall back to AsyncStorage on secure-store delete failures.
    }
  }

  await AsyncStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
}

function normalizeBaseUrl(url: string) {
  return url.replace(/\/$/, '');
}

function withCanonicalApiVersion(url: string) {
  const normalized = normalizeBaseUrl(url);
  if (/\/api\/v1$/i.test(normalized)) {
    return normalized;
  }
  if (/\/v1$/i.test(normalized)) {
    return normalized.replace(/\/v1$/i, '/api/v1');
  }
  if (/\/api$/i.test(normalized)) {
    return `${normalized}/v1`;
  }
  return `${normalized}/api/v1`;
}

function normalizeConfiguredBaseUrlForPlatform(url: string) {
  const normalized = withCanonicalApiVersion(url);

  // A development .env commonly uses localhost so iOS/web can reach the host
  // service. Android emulators resolve localhost to the emulator itself; use
  // the standard host bridge without making every developer maintain a second
  // environment file. Production HTTPS hosts pass through unchanged.
  if (Platform.OS === 'android' && /^http:\/\/(localhost|127\.0\.0\.1)(?=[:/]|$)/i.test(normalized)) {
    return normalized.replace(/^http:\/\/(localhost|127\.0\.0\.1)/i, 'http://10.0.2.2');
  }

  // On web and iOS, 10.0.2.2 (the Android emulator host bridge) is
  // unreachable. Convert it back to localhost so the browser can reach
  // the dev server running on the host machine.
  if ((Platform.OS === 'web' || Platform.OS === 'ios') && /^http:\/\/10\.0\.2\.2(?=[:/]|$)/i.test(normalized)) {
    return normalized.replace(/^http:\/\/10\.0\.2\.2/i, 'http://localhost');
  }

  return normalized;
}

function extractHost(input: unknown) {
  if (typeof input !== 'string' || input.trim().length === 0) {
    return null;
  }

  const trimmed = input.trim();

  const withoutScheme = trimmed.replace(/^[a-z]+:\/\//i, '');
  const withoutPath = withoutScheme.split('/')[0];
  const withoutPort = withoutPath.split(':')[0];

  if (!withoutPort || withoutPort === 'localhost' || withoutPort === '127.0.0.1') {
    return null;
  }

  return withoutPort;
}

function getExpoDevelopmentHost() {
  const fromExpoConfig = (Constants.expoConfig as { hostUri?: string } | null)?.hostUri;
  const fromManifest2 = (Constants as unknown as { manifest2?: { extra?: { expoClient?: { hostUri?: string } } } })
    .manifest2?.extra?.expoClient?.hostUri;
  const fromLegacyManifest = (Constants as unknown as { manifest?: { debuggerHost?: string } })
    .manifest?.debuggerHost;

  return extractHost(fromExpoConfig) ?? extractHost(fromManifest2) ?? extractHost(fromLegacyManifest);
}

export function getApiBaseUrl() {
  const configured = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  if (configured) {
    return normalizeConfiguredBaseUrlForPlatform(configured);
  }

  const developmentHost = getExpoDevelopmentHost();
  if (developmentHost) {
    return `http://${developmentHost}:4000/api/v1`;
  }

  if (Platform.OS === 'android') {
    // Android emulator localhost bridge.
    return 'http://10.0.2.2:4000/api/v1';
  }

  return 'http://localhost:4000/api/v1';
}

export class ApiRequestError extends Error {
  constructor(
    message: string,
    public status?: number,
    public details?: unknown
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

export interface ParsedApiError {
  message: string;
  code: string | null;
  status: number | undefined;
  isNetworkError: boolean;
  structuredDetails?: {
    buyNowPriceGbp?: number;
    currentBuyNowPriceGbp?: number;
    minimumNextBidGbp?: number;
  } | null;
}

// ---------------------------------------------------------------------------
// Network resilience layer — timeout, retry, error classification
// ---------------------------------------------------------------------------
//
// Per 2026 August React Native networking best practices, every request
// leaving the client is wrapped with:
//   1. An AbortController-backed timeout (default 15s, configurable per call)
//   2. Exponential-backoff retry on transient failures (5xx / network drops)
//   3. Classified network errors so UI layers can render the right state
//
// Retries are intentionally NOT applied to 4xx client errors — those are
// deterministic rejections from the server and retrying would only amplify
// load and latency for the user.

/** Default request timeout in milliseconds. */
const DEFAULT_TIMEOUT_MS = 15000;
/** Default maximum retry attempts for transient (5xx / network) failures. */
const DEFAULT_MAX_RETRIES = 3;
/** Base delay (ms) for exponential backoff: 1s, 2s, 4s for attempts 0–2. */
const RETRY_BASE_DELAY_MS = 1000;
/** Upper bound (ms) for a single backoff sleep, preventing pathological waits. */
const RETRY_MAX_DELAY_MS = 30000;

/**
 * High-level network error categories. UI layers can branch on these to
 * render the correct offline / timeout / server-error / client-error state
 * instead of showing a generic "something went wrong" message.
 */
export type NetworkErrorType =
  | 'timeout'
  | 'offline'
  | 'server_error'
  | 'client_error'
  | 'network';

/**
 * Classifies an error produced by the API client (or a raw fetch error) into
 * a high-level `NetworkErrorType`. This is the single source of truth for
 * network error categorisation — UI and hook layers should call this rather
 * than re-implementing ad-hoc status-code checks.
 */
export function classifyNetworkError(error: unknown): NetworkErrorType {
  // AbortError from AbortController → timeout (or caller-initiated cancel).
  if (error instanceof Error && error.name === 'AbortError') {
    return 'timeout';
  }

  if (error instanceof ApiRequestError) {
    // No HTTP status → the request never reached the server.
    if (error.status === undefined) {
      const details = error.details;
      if (isRecord(details)) {
        const code = typeof details.code === 'string' ? details.code : null;
        if (
          code === 'OFFLINE_WRITE_NOT_SUBMITTED' ||
          code === OFFLINE_WRITE_QUEUED_CODE ||
          code === 'WRITE_RESULT_UNKNOWN'
        ) {
          return 'offline';
        }
      }
      if (error.message.includes('Internet connection is offline')) {
        return 'offline';
      }
      if (error.message.includes('Network request failed')) {
        return 'network';
      }
      return 'network';
    }
    if (error.status >= 500) return 'server_error';
    if (error.status >= 400) return 'client_error';
  }

  if (error instanceof Error) {
    if (error.message.includes('Network request failed')) {
      return 'offline';
    }
  }

  return 'network';
}

/** Returns true when a status code is a transient server error worth retrying. */
function isTransientStatus(status: number): boolean {
  return status >= 500 && status < 600;
}

/** Returns true when an error is a network-level failure worth retrying. */
function isRetryableNetworkError(error: unknown): boolean {
  if (error instanceof Error && error.name === 'AbortError') {
    // A timeout-aborted request is retryable (the server may just be slow).
    return true;
  }
  if (error instanceof Error && error.message.includes('Network request failed')) {
    return true;
  }
  return false;
}

function delay(ms: number, signal?: AbortSignal | null): Promise<void> {
  return new Promise<void>((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const timeoutId = setTimeout(resolve, ms);
    if (signal) {
      const onAbort = () => {
        clearTimeout(timeoutId);
        resolve();
      };
      signal.addEventListener('abort', onAbort, { once: true });
    }
  });
}

function computeBackoffDelay(attempt: number): number {
  const base = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
  // Full jitter: add up to 50% of the base delay as random spread so that
  // concurrent retry storms don't synchronise on the same backoff slot.
  const jitter = base * 0.5 * Math.random();
  return Math.min(base + jitter, RETRY_MAX_DELAY_MS);
}

/**
 * Wraps `fetch` with an AbortController-backed timeout. If the caller
 * provides their own `signal` (e.g. from a component unmount effect), it is
 * composed with the internal timeout controller so that either source can
 * abort the in-flight request.
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const callerSignal = options.signal;
  if (callerSignal) {
    if (callerSignal.aborted) {
      controller.abort();
    } else {
      // Propagate caller cancellation (e.g. unmount) to the fetch.
      callerSignal.addEventListener('abort', () => controller.abort(), { once: true });
    }
  }

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Executes a fetch with exponential-backoff retry on transient failures.
 *
 * Retries are applied for:
 *   - HTTP 5xx server errors
 *   - Network-level failures (connection dropped, DNS failure)
 *   - Timeout aborts (server too slow)
 *
 * Retries are NOT applied for:
 *   - HTTP 4xx client errors (deterministic rejections)
 *   - Caller-initiated cancellation (signal already aborted)
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  maxRetries: number = DEFAULT_MAX_RETRIES,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<Response> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // If the caller has already cancelled, bail out immediately.
    if (options.signal?.aborted) {
      throw new DOMException('The user aborted a request.', 'AbortError');
    }

    try {
      const response = await fetchWithTimeout(url, options, timeoutMs);

      // Retry 429 (Too Many Requests) by honouring the server's
      // Retry-After header (or a default backoff) before retrying. This
      // applies to live requests that aren't routed through the offline
      // queue — the queue handles 429 separately for persisted mutations.
      if (response.status === 429 && attempt < maxRetries) {
        const retryAfterRaw = response.headers.get('Retry-After');
        let waitMs: number;
        if (retryAfterRaw) {
          const parsed = parseInt(retryAfterRaw, 10);
          // Retry-After can be seconds or an HTTP-date; treat numeric as
          // seconds, otherwise fall back to the computed backoff.
          waitMs = Number.isFinite(parsed) && parsed > 0
            ? parsed * 1000
            : computeBackoffDelay(attempt);
        } else {
          waitMs = computeBackoffDelay(attempt);
        }
        await delay(waitMs, options.signal);
        continue;
      }

      // Retry transient server errors (5xx) but return immediately on 4xx.
      if (isTransientStatus(response.status) && attempt < maxRetries) {
        await delay(computeBackoffDelay(attempt), options.signal);
        continue;
      }
      return response;
    } catch (error) {
      lastError = error as Error;

      // Caller-initiated cancellation should not be retried.
      if (options.signal?.aborted) {
        throw error;
      }

      if (attempt < maxRetries && isRetryableNetworkError(error)) {
        await delay(computeBackoffDelay(attempt), options.signal);
        continue;
      }

      throw error;
    }
  }

  // All retries exhausted — surface the last error.
  throw lastError ?? new Error(`Request failed after ${maxRetries + 1} attempts for ${url}`);
}

// ---------------------------------------------------------------------------
// Request identity & deduplication layer
// ---------------------------------------------------------------------------
//
// Every outgoing request is tagged with an `X-Request-Id` (UUID v4) so that
// client-side errors can be correlated with backend logs. When the backend
// echoes its own `X-Request-Id` in the response, that value is preferred for
// log correlation and exposed via `getRequestId()` for support tickets.
//
// Concurrent identical GET requests are deduplicated against a single in-flight
// network call so that fan-out from multiple hooks/components does not multiply
// load on the API. Write methods (POST/PUT/PATCH/DELETE) are never deduplicated.

/**
 * Generates a RFC 4122 §4.4 UUID v4 using the platform CSPRNG when available
 * (Web Crypto / React Native `crypto.getRandomValues`), falling back to
 * `Math.random` on runtimes without a crypto implementation. The fallback is
 * only used in legacy environments — modern React Native ships crypto.
 */
function generateRequestId(): string {
  const bytes = new Uint8Array(16);

  const globalCrypto = (globalThis as unknown as {
    crypto?: { getRandomValues?: (arr: Uint8Array) => Uint8Array };
  }).crypto;

  if (typeof globalCrypto?.getRandomValues === 'function') {
    globalCrypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }

  // Set version (4) and variant (RFC 4122) bits.
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex: string[] = [];
  for (let i = 0; i < 16; i++) {
    hex.push(bytes[i].toString(16).padStart(2, '0'));
  }

  return (
    `${hex[0]}${hex[1]}${hex[2]}${hex[3]}` +
    `-${hex[4]}${hex[5]}` +
    `-${hex[6]}${hex[7]}` +
    `-${hex[8]}${hex[9]}` +
    `-${hex[10]}${hex[11]}${hex[12]}${hex[13]}${hex[14]}${hex[15]}`
  );
}

/**
 * The request ID of the most recently completed request. Updated on every
 * `fetchJson` call to the client-generated UUID, then overridden with the
 * backend's `X-Request-Id` response header when present. Exposed for support
 * ticket correlation via `getRequestId()`.
 */
let lastRequestId: string | null = null;

/**
 * Returns the `X-Request-Id` of the most recently completed request. When the
 * backend echoes its own request ID in the response, that value is returned;
 * otherwise the client-generated UUID is used. Returns `null` before any
 * request has been made. Useful for surfacing in support tickets and error
 * dialogs so issues can be correlated with backend logs.
 */
export function getRequestId(): string | null {
  return lastRequestId;
}

/**
 * In-flight GET requests keyed by `${method}:${url}` (where `url` includes
 * query params). When a second GET arrives for a key already present, the
 * existing promise is reused so only one network call is made. Entries are
 * removed on settlement (success or failure) so subsequent identical requests
 * hit the network again. Write methods are never stored here.
 */
const inflightGetRequests = new Map<string, Promise<Response>>();

/**
 * Deduplicates a GET request against any in-flight request for the same key.
 * Each consumer receives an independent `Response` clone so that body
 * consumption (`.json()` / `.text()`) by one caller does not disturb the
 * other. The cache entry is cleared once the underlying network promise
 * settles, regardless of outcome.
 *
 * @param key   Dedup key in the form `${method}:${url}`.
 * @param run   Factory that performs the actual network request.
 * @returns A `Response` (cloned) for the deduplicated request.
 */
function dedupedGet(key: string, run: () => Promise<Response>): Promise<Response> {
  const existing = inflightGetRequests.get(key);
  if (existing) {
    // Clone so each caller can independently consume the body stream.
    return existing.then((response) => response.clone());
  }

  const promise = run().finally(() => {
    inflightGetRequests.delete(key);
  });
  inflightGetRequests.set(key, promise);

  // The originating caller also receives a clone; the canonical Response is
  // retained only by the stored promise so it remains cloneable for any
  // subsequent callers that arrive before settlement.
  return promise.then((response) => response.clone());
}

/**
 * Per-request options accepted by `fetchJson` in addition to the standard
 * `RequestInit`. These are intentionally optional and backward-compatible —
 * existing two-argument callers are unaffected.
 */
export interface FetchJsonOptions {
  /** Per-request timeout in milliseconds (default 15000). */
  timeoutMs?: number;
  /** Max retry attempts for transient failures (default 3). Set to 0 to disable retry. */
  maxRetries?: number;
  /**
   * When `true`, bypasses GET request deduplication for this call. Use when a
   * caller needs a fresh network round-trip even if an identical GET is
   * already in flight (e.g. explicit cache-busting refresh). Only affects GET
   * requests; writes are never deduplicated.
   */
  skipDedup?: boolean;
  /**
   * Optional `AbortSignal` forwarded to the underlying `fetch()` call. When
   * React Query cancels a query (e.g. component unmount or query becomes
   * inactive), it passes its own signal here so the in-flight request is
   * aborted immediately rather than completing wastefully.
   *
   * If a `signal` is also present in `init.signal`, the caller-provided
   * `init.signal` takes precedence — both are composed by `fetchWithTimeout`.
   */
  signal?: AbortSignal;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function extractStructuredDetails(details: unknown): ParsedApiError['structuredDetails'] {
  if (!isRecord(details)) return null;
  const result: NonNullable<ParsedApiError['structuredDetails']> = {};
  if (typeof details.buyNowPriceGbp === 'number') result.buyNowPriceGbp = details.buyNowPriceGbp;
  if (typeof details.currentBuyNowPriceGbp === 'number') result.currentBuyNowPriceGbp = details.currentBuyNowPriceGbp;
  if (typeof details.minimumNextBidGbp === 'number') result.minimumNextBidGbp = details.minimumNextBidGbp;
  return Object.keys(result).length > 0 ? result : null;
}

export function parseApiError(error: unknown, fallback = 'Request failed'): ParsedApiError {
  if (error instanceof ApiRequestError) {
    const details = error.details;

    if (isRecord(details)) {
      const messageFromPayload = typeof details.error === 'string'
        ? details.error
        : typeof details.message === 'string'
          ? details.message
          : null;
      const codeFromPayload = typeof details.code === 'string' ? details.code : null;

      return {
        message: messageFromPayload ?? error.message ?? fallback,
        code: codeFromPayload,
        status: error.status,
        isNetworkError: error.status === undefined,
        structuredDetails: extractStructuredDetails(details),
      };
    }

    if (typeof details === 'string' && details.trim().length > 0) {
      return {
        message: details,
        code: null,
        status: error.status,
        isNetworkError: error.status === undefined,
        structuredDetails: null,
      };
    }

    return {
      message: error.message || fallback,
      code: null,
      status: error.status,
      isNetworkError: error.status === undefined,
      structuredDetails: null,
    };
  }

  if (error instanceof Error) {
    return {
      message: error.message || fallback,
      code: null,
      status: undefined,
      isNetworkError: false,
    };
  }

  return {
    message: fallback,
    code: null,
    status: undefined,
    isNetworkError: false,
  };
}

function shouldSkipTokenRefresh(path: string) {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return (
    normalized.startsWith('/auth/login') ||
    normalized.startsWith('/auth/signup') ||
    normalized.startsWith('/auth/oauth') ||
    normalized.startsWith('/auth/magic-link') ||
    normalized.startsWith('/auth/otp') ||
    normalized.startsWith('/auth/refresh') ||
    normalized.startsWith('/auth/password-reset')
  );
}

async function hydrateAuthSession() {
  if (authSessionLoaded) {
    return;
  }

  authSessionLoaded = true;

  try {
    const raw = await readStoredAuthSessionRaw();
    if (!raw) {
      authSessionState = null;
      return;
    }

    const parsed = JSON.parse(raw) as Partial<AuthSessionState>;
    if (
      typeof parsed.accessToken === 'string' &&
      typeof parsed.refreshToken === 'string' &&
      parsed.accessToken.length > 0 &&
      parsed.refreshToken.length > 0
    ) {
      authSessionState = {
        accessToken: parsed.accessToken,
        refreshToken: parsed.refreshToken,
        accessTokenExpiresInSeconds:
          typeof parsed.accessTokenExpiresInSeconds === 'number'
            ? parsed.accessTokenExpiresInSeconds
            : undefined,
        refreshTokenExpiresAt:
          typeof parsed.refreshTokenExpiresAt === 'string' ? parsed.refreshTokenExpiresAt : undefined,
      };
      return;
    }

    authSessionState = null;
  } catch {
    authSessionState = null;
  }
}

export async function getAuthSession() {
  await hydrateAuthSession();
  return authSessionState;
}

let authSessionPersistedAtMs: number | null = null;

export async function setAuthSession(nextSession: AuthSessionState) {
  authSessionState = nextSession;
  authSessionLoaded = true;
  authSessionPersistedAtMs = Date.now();
  await writeStoredAuthSessionRaw(JSON.stringify(nextSession));
}

export async function clearAuthSession() {
  authSessionState = null;
  authSessionLoaded = true;
  await clearStoredAuthSessionRaw();
}

async function refreshAccessToken(baseUrl: string): Promise<string | null> {
  await hydrateAuthSession();

  if (!authSessionState?.refreshToken) {
    return null;
  }

  if (refreshInFlight) {
    return refreshInFlight;
  }

  refreshInFlight = (async () => {
    try {
      // Token refresh uses a shorter timeout (10s) and no retry — a hung or
      // failing refresh endpoint should fail fast so the user is sent to
      // re-login rather than waiting through backoff delays.
      const response = await fetchWithTimeout(`${baseUrl}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          refreshToken: authSessionState?.refreshToken,
        }),
      }, 10000);

      if (!response.ok) {
        await clearAuthSession();
        return null;
      }

      const payload = (await response.json()) as {
        ok?: boolean;
        accessToken?: string;
        refreshToken?: string;
        accessTokenExpiresInSeconds?: number;
        refreshTokenExpiresAt?: string;
      };

      if (
        payload.ok !== true ||
        typeof payload.accessToken !== 'string' ||
        typeof payload.refreshToken !== 'string'
      ) {
        await clearAuthSession();
        return null;
      }

      await setAuthSession({
        accessToken: payload.accessToken,
        refreshToken: payload.refreshToken,
        accessTokenExpiresInSeconds: payload.accessTokenExpiresInSeconds,
        refreshTokenExpiresAt: payload.refreshTokenExpiresAt,
      });

      return payload.accessToken;
    } catch {
      await clearAuthSession();
      return null;
    }
  })();

  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}

async function parsePayload(response: Response) {
  const text = await response.text();
  let payload: unknown = null;

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  return payload;
}

export async function fetchJson<T>(
  path: string,
  init?: RequestInit,
  options?: FetchJsonOptions
): Promise<T> {
  await hydrateAuthSession();

  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;

  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRetries = options?.maxRetries ?? DEFAULT_MAX_RETRIES;

  // Merge the caller-provided AbortSignal (e.g. from React Query) into the
  // RequestInit so it is composed with the internal timeout controller inside
  // `fetchWithTimeout`. If `init` already carries a signal, the init signal
  // wins — both are composed by the timeout layer.
  const mergedInit: RequestInit = options?.signal
    ? { ...init, signal: init?.signal ?? options.signal }
    : init ?? {};

  // Assign a client-generated request ID for log correlation. The backend may
  // echo its own `X-Request-Id` in the response; when present, that value is
  // preferred and overwrites `lastRequestId` after the response arrives.
  const requestId = generateRequestId();
  lastRequestId = requestId;

  const method = mergedInit.method?.toUpperCase();
  // Record the outgoing request as a Sentry breadcrumb so client-side errors
  // can be correlated with backend logs via the shared request ID. The Sentry
  // proxy no-ops until initialised, so this is safe during app bootstrap.
  Sentry.addBreadcrumb!({
    category: 'api',
    message: `${method ?? 'GET'} ${path}`,
    level: 'info',
    data: { requestId, url },
  });

  // Proactively check if the refresh token has expired
  if (
    authSessionState?.refreshTokenExpiresAt &&
    !shouldSkipTokenRefresh(path)
  ) {
    const expiresAtMs = new Date(authSessionState.refreshTokenExpiresAt).getTime();
    if (Number.isFinite(expiresAtMs) && expiresAtMs <= Date.now()) {
      await clearAuthSession();
    }
  }

  // Proactively refresh access token if it is close to expiry
  if (
    authSessionState?.accessTokenExpiresInSeconds &&
    authSessionPersistedAtMs &&
    !shouldSkipTokenRefresh(path) &&
    authSessionState.refreshToken
  ) {
    const elapsedSincePersistedSec = (Date.now() - authSessionPersistedAtMs) / 1000;
    const bufferSec = 30;
    if (elapsedSincePersistedSec >= authSessionState.accessTokenExpiresInSeconds - bufferSec) {
      await refreshAccessToken(baseUrl);
    }
  }

  const isWriteMethod =
    mergedInit.method !== undefined &&
    ['POST', 'PUT', 'DELETE', 'PATCH'].includes(mergedInit.method.toUpperCase());

  if (isWriteMethod) {
    const networkState = await Network.getNetworkStateAsync();
    if (networkState.isInternetReachable === false) {
      // Offline before the request even leaves the device: enqueue the write
      // mutation for later replay via the offline queue (WS33) so the user's
      // intent is preserved across connectivity gaps. The thrown error carries
      // `queuedId` and `status: 'queued'` so callers can distinguish a queued
      // write (NOT completed) from a real failure — this prevents the UI from
      // mistaking an offline-queued mutation for a successful submission.
      let queuedId: string | undefined;
      try {
        queuedId = useOfflineQueue.getState().pushToQueue(url, buildQueuedRequestInit(mergedInit));
      } catch {
        // Queue persistence is best-effort — never block the offline signal.
      }
      throw new ApiRequestError(
        'You are offline. This action was saved and will be submitted automatically when you reconnect.',
        undefined,
        { code: OFFLINE_WRITE_QUEUED_CODE, queuedId, status: 'queued' }
      );
    }
  }

  const execute = async (overrideAccessToken?: string): Promise<Response> => {
    const headers = new Headers(mergedInit.headers ?? {});
    const token = overrideAccessToken ?? authSessionState?.accessToken;

    if (token && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    // Tag every outgoing request with an X-Request-Id for client/backend log
    // correlation. Callers may pre-set the header to override the generated ID.
    if (!headers.has('X-Request-Id')) {
      headers.set('X-Request-Id', requestId);
    }

    return fetchWithRetry(
      url,
      { ...mergedInit, headers },
      maxRetries,
      timeoutMs
    );
  };

  // Acquire the response (network call + 401 auth-refresh retry). For GET
  // requests this is deduplicated against any in-flight request for the same
  // URL+params so concurrent callers share a single network round-trip; each
  // caller receives an independent `Response` clone. Write methods bypass
  // dedup entirely.
  const acquireResponse = async (): Promise<Response> => {
    let response: Response;
    try {
      const networkState = await Network.getNetworkStateAsync();
      if (networkState.isInternetReachable === false && !isWriteMethod) {
        throw new ApiRequestError(`Internet connection is offline`);
      }

      response = await execute();
    } catch (error) {
      if (error instanceof ApiRequestError) {
        throw error;
      }
      if (isWriteMethod) {
        // The connection dropped mid-flight before the server confirmed the
        // result. Enqueue the mutation for replay so the user does not lose
        // the action — the offline queue (WS33) will retry with its own
        // exponential backoff once connectivity returns. The thrown error
        // carries `queuedId` and `status: 'queued'` so callers can distinguish
        // a queued write (result unknown, NOT confirmed) from a real failure.
        let queuedId: string | undefined;
        try {
          queuedId = useOfflineQueue.getState().pushToQueue(url, buildQueuedRequestInit(mergedInit));
        } catch {
          // Queue persistence is best-effort.
        }
        throw new ApiRequestError(
          'The connection dropped before the server result was confirmed. Your action was saved offline and will be retried automatically.',
          undefined,
          { code: OFFLINE_WRITE_QUEUED_CODE, queuedId, status: 'queued' }
        );
      }
      const errorType = classifyNetworkError(error);
      const label = errorType === 'timeout' ? 'Request timed out' : 'Network request failed';
      throw new ApiRequestError(`${label} for ${url}: ${(error as Error).message}`);
    }

    if (
      response.status === 401 &&
      !shouldSkipTokenRefresh(path) &&
      authSessionState?.refreshToken
    ) {
      const refreshedAccessToken = await refreshAccessToken(baseUrl);
      if (refreshedAccessToken) {
        try {
          response = await execute(refreshedAccessToken);
        } catch (error) {
          const errorType = classifyNetworkError(error);
          const label = errorType === 'timeout' ? 'Request timed out' : 'Network request failed';
          throw new ApiRequestError(`${label} for ${url}: ${(error as Error).message}`);
        }
      } else {
        // Token refresh failed — session is no longer valid. Trigger a
        // lazy logout so the navigator remounts to AuthLanding instead of
        // leaving the user on a screen with stale auth state.
        try {
          const { useStore } = await import('../store/useStore');
          useStore.getState().logout();
        } catch {
          // Store not available (e.g. during app bootstrap) — safe to ignore.
        }
      }
    }

    return response;
  };

  const isGetRequest = method === undefined || method === 'GET';
  const shouldDedup = isGetRequest && options?.skipDedup !== true;
  const response = shouldDedup
    ? await dedupedGet(`GET:${url}`, acquireResponse)
    : await acquireResponse();

  // Prefer the backend's X-Request-Id (when echoed in the response) for log
  // correlation so support tickets reference the server-side trace, not the
  // client-generated UUID.
  const backendRequestId = response.headers.get('X-Request-Id');
  if (backendRequestId) {
    lastRequestId = backendRequestId;
  }

  const payload = await parsePayload(response);

  if (!response.ok) {
    throw new ApiRequestError(
      `Request failed (${response.status}) for ${url}`,
      response.status,
      payload
    );
  }

  return payload as T;
}

/**
 * Performs an authenticated fetch and returns the raw `Response` without
 * parsing the body or throwing on non-OK status codes.
 *
 * This is the low-level counterpart to `fetchJson`: it shares the same
 * auth-token hydration, proactive refresh, X-Request-Id tagging, timeout,
 * and retry-on-transient-failure behaviour, but hands the caller the
 * `Response` so it can branch on status codes before consuming the body.
 *
 * Use this (instead of `fetchJson`) for endpoints whose contract requires
 * status-code-based branching — e.g. the unknown-result lookup that returns
 * 200 / 202 / 404 with distinct semantics. For the common case where a
 * non-2xx is an error, prefer `fetchJson`.
 *
 * Note: unlike `fetchJson`, this function does NOT deduplicate GET
 * requests, does NOT enqueue writes when offline, and does NOT throw on
 * non-OK responses. Network-level failures still surface as
 * `ApiRequestError` (with `status === undefined`).
 */
export async function fetchWithAuth(
  path: string,
  init?: RequestInit,
  options?: FetchJsonOptions
): Promise<Response> {
  await hydrateAuthSession();

  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;

  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRetries = options?.maxRetries ?? DEFAULT_MAX_RETRIES;

  const mergedInit: RequestInit = options?.signal
    ? { ...init, signal: init?.signal ?? options.signal }
    : init ?? {};

  const requestId = generateRequestId();
  lastRequestId = requestId;

  const method = mergedInit.method?.toUpperCase();
  Sentry.addBreadcrumb!({
    category: 'api',
    message: `${method ?? 'GET'} ${path}`,
    level: 'info',
    data: { requestId, url },
  });

  // Proactively check if the refresh token has expired
  if (
    authSessionState?.refreshTokenExpiresAt &&
    !shouldSkipTokenRefresh(path)
  ) {
    const expiresAtMs = new Date(authSessionState.refreshTokenExpiresAt).getTime();
    if (Number.isFinite(expiresAtMs) && expiresAtMs <= Date.now()) {
      await clearAuthSession();
    }
  }

  // Proactively refresh access token if it is close to expiry
  if (
    authSessionState?.accessTokenExpiresInSeconds &&
    authSessionPersistedAtMs &&
    !shouldSkipTokenRefresh(path) &&
    authSessionState.refreshToken
  ) {
    const elapsedSincePersistedSec = (Date.now() - authSessionPersistedAtMs) / 1000;
    const bufferSec = 30;
    if (elapsedSincePersistedSec >= authSessionState.accessTokenExpiresInSeconds - bufferSec) {
      await refreshAccessToken(baseUrl);
    }
  }

  const execute = async (overrideAccessToken?: string): Promise<Response> => {
    const headers = new Headers(mergedInit.headers ?? {});
    const token = overrideAccessToken ?? authSessionState?.accessToken;

    if (token && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    if (!headers.has('X-Request-Id')) {
      headers.set('X-Request-Id', requestId);
    }

    return fetchWithRetry(
      url,
      { ...mergedInit, headers },
      maxRetries,
      timeoutMs
    );
  };

  let response: Response;
  try {
    response = await execute();
  } catch (error) {
    if (error instanceof ApiRequestError) {
      throw error;
    }
    const errorType = classifyNetworkError(error);
    const label = errorType === 'timeout' ? 'Request timed out' : 'Network request failed';
    throw new ApiRequestError(`${label} for ${url}: ${(error as Error).message}`);
  }

  if (
    response.status === 401 &&
    !shouldSkipTokenRefresh(path) &&
    authSessionState?.refreshToken
  ) {
    const refreshedAccessToken = await refreshAccessToken(baseUrl);
    if (refreshedAccessToken) {
      try {
        response = await execute(refreshedAccessToken);
      } catch (error) {
        const errorType = classifyNetworkError(error);
        const label = errorType === 'timeout' ? 'Request timed out' : 'Network request failed';
        throw new ApiRequestError(`${label} for ${url}: ${(error as Error).message}`);
      }
    } else {
      try {
        const { useStore } = await import('../store/useStore');
        useStore.getState().logout();
      } catch {
        // Store not available (e.g. during app bootstrap) — safe to ignore.
      }
    }
  }

  const backendRequestId = response.headers.get('X-Request-Id');
  if (backendRequestId) {
    lastRequestId = backendRequestId;
  }

  return response;
}

/**
 * Produces a `RequestInit` safe for persisting into the offline queue.
 * Stream-based bodies (which cannot be re-read after the first fetch) are
 * serialised to a string so the queued request can be replayed later.
 */
function buildQueuedRequestInit(init: RequestInit): RequestInit {
  const { body, ...rest } = init;
  if (body == null) {
    return rest;
  }
  if (typeof body === 'string') {
    return { ...rest, body };
  }
  // Non-string bodies (Blob, FormData, ArrayBuffer, ReadableStream) cannot
  // be reliably re-serialised after consumption; attempt a best-effort JSON
  // stringify and fall back to dropping the body so the queue entry is at
  // least replayable for the common JSON case.
  try {
    return { ...rest, body: JSON.stringify(body) };
  } catch {
    return rest;
  }
}
