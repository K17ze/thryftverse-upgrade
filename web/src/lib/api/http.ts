/**
 * Web HTTP transport — a port of the mobile app's `frontend/src/lib/apiClient.ts`
 * so both clients share the same backend contract, auth lifecycle, request-id
 * correlation, timeout/retry policy and error classification.
 *
 * Platform differences from the mobile client:
 *  - Auth session persists in `localStorage` (web has no SecureStore). The
 *    refresh token rotates server-side on every refresh, same as mobile.
 *  - Offline detection uses `navigator.onLine`; there is no offline write
 *    queue — a write attempted while offline fails with a classified
 *    `ApiRequestError` instead of being queued for replay.
 *  - All storage access is SSR-guarded (`typeof window` checks) — the module
 *    is safe to import in server components; auth calls only resolve on the
 *    client.
 *
 * Endpoints are always relative to `{base}/api/v1` — the same versioned
 * namespace the mobile app targets.
 */

export const AUTH_SESSION_STORAGE_KEY = 'thryftverse.auth.session.v1';
/** Emitted on `window` when refresh fails and the session is dropped — the
 *  SessionProvider subscribes and flips to guest state. */
export const SESSION_EXPIRED_EVENT = 'thryftverse:session-expired';

export interface AuthSessionState {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresInSeconds?: number;
  refreshTokenExpiresAt?: string;
  /** Authenticated user id — needed for `/users/:id/*` self-scoped routes. */
  userId?: string;
}

let authSessionState: AuthSessionState | null = null;
let authSessionLoaded = false;
let refreshInFlight: Promise<string | null> | null = null;
let authSessionPersistedAtMs: number | null = null;

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function readStoredAuthSessionRaw(): string | null {
  if (!isBrowser()) return null;
  try {
    return window.localStorage.getItem(AUTH_SESSION_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredAuthSessionRaw(value: string) {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(AUTH_SESSION_STORAGE_KEY, value);
  } catch {
    // Storage full / private mode — the in-memory session still works for
    // this tab; it simply won't survive a reload.
  }
}

function clearStoredAuthSessionRaw() {
  if (!isBrowser()) return;
  try {
    window.localStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
  } catch {
    // best-effort
  }
}

function emitSessionExpired() {
  if (!isBrowser()) return;
  try {
    window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
  } catch {
    // best-effort
  }
}

// ---------------------------------------------------------------------------
// Base URL resolution
// ---------------------------------------------------------------------------

function normalizeBaseUrl(url: string) {
  return url.replace(/\/$/, '');
}

/** Canonicalise any configured base to the `/api/v1` namespace the backend
 *  serves (identical rule set to the mobile client). */
function withCanonicalApiVersion(url: string) {
  const normalized = normalizeBaseUrl(url);
  if (/\/api\/v1$/i.test(normalized)) return normalized;
  if (/\/v1$/i.test(normalized)) return normalized.replace(/\/v1$/i, '/api/v1');
  if (/\/api$/i.test(normalized)) return `${normalized}/v1`;
  return `${normalized}/api/v1`;
}

export function getApiBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  if (configured) {
    const normalized = withCanonicalApiVersion(configured);
    // An Android-emulator host bridge (10.0.2.2) is meaningless in a browser —
    // fold it back to localhost the same way the mobile web path does.
    if (/^http:\/\/10\.0\.2\.2(?=[:/]|$)/i.test(normalized)) {
      return normalized.replace(/^http:\/\/10\.0\.2\.2/i, 'http://localhost');
    }
    return normalized;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'NEXT_PUBLIC_API_BASE_URL is not set. Production builds must define this environment variable — refusing to fall back to localhost.',
    );
  }

  return 'http://localhost:4000/api/v1';
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class ApiRequestError extends Error {
  constructor(
    message: string,
    public status?: number,
    public details?: unknown,
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

export type NetworkErrorType =
  | 'timeout'
  | 'offline'
  | 'server_error'
  | 'client_error'
  | 'network';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function classifyNetworkError(error: unknown): NetworkErrorType {
  if (error instanceof Error && error.name === 'AbortError') {
    return 'timeout';
  }

  if (error instanceof ApiRequestError) {
    if (error.status === undefined) {
      if (isRecord(error.details)) {
        const code = typeof error.details.code === 'string' ? error.details.code : null;
        if (code === 'OFFLINE_WRITE_NOT_SUBMITTED' || code === 'WRITE_RESULT_UNKNOWN') {
          return 'offline';
        }
      }
      if (error.message.includes('Internet connection is offline')) return 'offline';
      return 'network';
    }
    if (error.status >= 500) return 'server_error';
    if (error.status >= 400) return 'client_error';
  }

  if (error instanceof Error) {
    if (error.message === 'Failed to fetch' || error.message.includes('Network request failed')) {
      return 'offline';
    }
  }

  return 'network';
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
      const messageFromPayload =
        typeof details.error === 'string'
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

  return { message: fallback, code: null, status: undefined, isNetworkError: false };
}

// ---------------------------------------------------------------------------
// Network resilience — timeout + retry/backoff (same policy as mobile)
// ---------------------------------------------------------------------------

const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1000;
const RETRY_MAX_DELAY_MS = 30000;

function isTransientStatus(status: number): boolean {
  return status >= 500 && status < 600;
}

function isRetryableNetworkError(error: unknown): boolean {
  if (error instanceof Error && error.name === 'AbortError') return true;
  if (error instanceof TypeError) return true; // fetch network failure
  if (error instanceof Error && /network|failed to fetch/i.test(error.message)) return true;
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
      signal.addEventListener('abort', () => {
        clearTimeout(timeoutId);
        resolve();
      }, { once: true });
    }
  });
}

function computeBackoffDelay(attempt: number): number {
  const base = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
  const jitter = base * 0.5 * Math.random();
  return Math.min(base + jitter, RETRY_MAX_DELAY_MS);
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const callerSignal = options.signal;
  if (callerSignal) {
    if (callerSignal.aborted) {
      controller.abort();
    } else {
      callerSignal.addEventListener('abort', () => controller.abort(), { once: true });
    }
  }

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  maxRetries: number = DEFAULT_MAX_RETRIES,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (options.signal?.aborted) {
      throw new DOMException('The user aborted a request.', 'AbortError');
    }

    try {
      const response = await fetchWithTimeout(url, options, timeoutMs);

      if (response.status === 429 && attempt < maxRetries) {
        const retryAfterRaw = response.headers.get('Retry-After');
        const parsed = retryAfterRaw ? parseInt(retryAfterRaw, 10) : NaN;
        const waitMs = Number.isFinite(parsed) && parsed > 0
          ? parsed * 1000
          : computeBackoffDelay(attempt);
        await delay(waitMs, options.signal);
        continue;
      }

      if (isTransientStatus(response.status) && attempt < maxRetries) {
        await delay(computeBackoffDelay(attempt), options.signal);
        continue;
      }
      return response;
    } catch (error) {
      lastError = error as Error;

      if (options.signal?.aborted) throw error;

      if (attempt < maxRetries && isRetryableNetworkError(error)) {
        await delay(computeBackoffDelay(attempt), options.signal);
        continue;
      }

      throw error;
    }
  }

  throw lastError ?? new Error(`Request failed after ${maxRetries + 1} attempts for ${url}`);
}

// ---------------------------------------------------------------------------
// Request identity & GET deduplication
// ---------------------------------------------------------------------------

function generateRequestId(): string {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0'));
  return `${hex[0]}${hex[1]}${hex[2]}${hex[3]}-${hex[4]}${hex[5]}-${hex[6]}${hex[7]}-${hex[8]}${hex[9]}-${hex.slice(10).join('')}`;
}

let lastRequestId: string | null = null;

export function getRequestId(): string | null {
  return lastRequestId;
}

const inflightGetRequests = new Map<string, Promise<Response>>();

function dedupedGet(key: string, run: () => Promise<Response>): Promise<Response> {
  const existing = inflightGetRequests.get(key);
  if (existing) {
    return existing.then((response) => response.clone());
  }

  const promise = run().finally(() => {
    inflightGetRequests.delete(key);
  });
  inflightGetRequests.set(key, promise);

  return promise.then((response) => response.clone());
}

// ---------------------------------------------------------------------------
// Auth session
// ---------------------------------------------------------------------------

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

function hydrateAuthSession() {
  if (authSessionLoaded) return;
  authSessionLoaded = true;

  const raw = readStoredAuthSessionRaw();
  if (!raw) {
    authSessionState = null;
    return;
  }

  try {
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
  } catch {
    // corrupt payload → treat as no session
  }

  authSessionState = null;
}

export async function getAuthSession(): Promise<AuthSessionState | null> {
  hydrateAuthSession();
  return authSessionState;
}

export async function setAuthSession(nextSession: AuthSessionState) {
  authSessionState = nextSession;
  authSessionLoaded = true;
  authSessionPersistedAtMs = Date.now();
  writeStoredAuthSessionRaw(JSON.stringify(nextSession));
}

export async function clearAuthSession() {
  authSessionState = null;
  authSessionLoaded = true;
  clearStoredAuthSessionRaw();
}

async function refreshAccessToken(baseUrl: string): Promise<string | null> {
  hydrateAuthSession();

  if (!authSessionState?.refreshToken) {
    return null;
  }

  if (refreshInFlight) {
    return refreshInFlight;
  }

  refreshInFlight = (async () => {
    try {
      const response = await fetchWithTimeout(`${baseUrl}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: authSessionState?.refreshToken }),
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

// ---------------------------------------------------------------------------
// fetchJson / fetchWithAuth
// ---------------------------------------------------------------------------

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

export interface FetchJsonOptions {
  timeoutMs?: number;
  maxRetries?: number;
  skipDedup?: boolean;
  signal?: AbortSignal;
}

export async function fetchJson<T>(
  path: string,
  init?: RequestInit,
  options?: FetchJsonOptions,
): Promise<T> {
  hydrateAuthSession();

  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;

  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRetries = options?.maxRetries ?? DEFAULT_MAX_RETRIES;

  const mergedInit: RequestInit = options?.signal
    ? { ...init, signal: init?.signal ?? options.signal }
    : init ?? {};

  const requestId = generateRequestId();
  lastRequestId = requestId;

  // Proactively drop a dead refresh token before the request leaves.
  if (
    authSessionState?.refreshTokenExpiresAt &&
    !shouldSkipTokenRefresh(path)
  ) {
    const expiresAtMs = new Date(authSessionState.refreshTokenExpiresAt).getTime();
    if (Number.isFinite(expiresAtMs) && expiresAtMs <= Date.now()) {
      await clearAuthSession();
    }
  }

  // Proactively refresh an access token that is near expiry.
  if (
    authSessionState?.accessTokenExpiresInSeconds &&
    authSessionPersistedAtMs &&
    !shouldSkipTokenRefresh(path) &&
    authSessionState.refreshToken
  ) {
    const elapsedSec = (Date.now() - authSessionPersistedAtMs) / 1000;
    const bufferSec = 30;
    if (elapsedSec >= authSessionState.accessTokenExpiresInSeconds - bufferSec) {
      await refreshAccessToken(baseUrl);
    }
  }

  const isWriteMethod =
    mergedInit.method !== undefined &&
    ['POST', 'PUT', 'DELETE', 'PATCH'].includes(mergedInit.method.toUpperCase());

  // Web has no offline write queue — a write while offline fails fast with a
  // classified error so the UI can show an honest offline state.
  if (
    isWriteMethod &&
    typeof navigator !== 'undefined' &&
    navigator.onLine === false
  ) {
    throw new ApiRequestError(
      'You are offline. Reconnect and try again.',
      undefined,
      { code: 'OFFLINE_WRITE_NOT_SUBMITTED' },
    );
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

    return fetchWithRetry(url, { ...mergedInit, headers }, maxRetries, timeoutMs);
  };

  const acquireResponse = async (): Promise<Response> => {
    let response: Response;
    try {
      if (!isWriteMethod && typeof navigator !== 'undefined' && navigator.onLine === false) {
        throw new ApiRequestError('Internet connection is offline');
      }

      response = await execute();
    } catch (error) {
      if (error instanceof ApiRequestError) throw error;
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
        // Refresh failed — the session is gone. Emit so SessionProvider can
        // flip to guest instead of leaving the app on stale auth state.
        emitSessionExpired();
      }
    }

    return response;
  };

  const method = mergedInit.method?.toUpperCase();
  const isGetRequest = method === undefined || method === 'GET';
  const shouldDedup = isGetRequest && options?.skipDedup !== true;
  const response = shouldDedup
    ? await dedupedGet(`GET:${url}`, acquireResponse)
    : await acquireResponse();

  const backendRequestId = response.headers.get('X-Request-Id');
  if (backendRequestId) {
    lastRequestId = backendRequestId;
  }

  const payload = await parsePayload(response);

  if (!response.ok) {
    throw new ApiRequestError(
      `Request failed (${response.status}) for ${url}`,
      response.status,
      payload,
    );
  }

  return payload as T;
}

/**
 * Authenticated fetch returning the raw `Response` — for endpoints whose
 * contract requires status-code branching (200/202/404 semantics). No GET
 * dedup, no throw on non-OK.
 */
export async function fetchWithAuth(
  path: string,
  init?: RequestInit,
  options?: FetchJsonOptions,
): Promise<Response> {
  hydrateAuthSession();

  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;

  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRetries = options?.maxRetries ?? DEFAULT_MAX_RETRIES;

  const mergedInit: RequestInit = options?.signal
    ? { ...init, signal: init?.signal ?? options.signal }
    : init ?? {};

  const requestId = generateRequestId();
  lastRequestId = requestId;

  const headers = new Headers(mergedInit.headers ?? {});
  if (authSessionState?.accessToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${authSessionState.accessToken}`);
  }
  if (!headers.has('X-Request-Id')) {
    headers.set('X-Request-Id', requestId);
  }

  try {
    const response = await fetchWithRetry(url, { ...mergedInit, headers }, maxRetries, timeoutMs);
    const backendRequestId = response.headers.get('X-Request-Id');
    if (backendRequestId) lastRequestId = backendRequestId;
    return response;
  } catch (error) {
    const errorType = classifyNetworkError(error);
    const label = errorType === 'timeout' ? 'Request timed out' : 'Network request failed';
    throw new ApiRequestError(`${label} for ${url}: ${(error as Error).message}`);
  }
}
