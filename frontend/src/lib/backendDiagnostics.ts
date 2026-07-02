import { getApiBaseUrl } from './apiClient';

/**
 * Dev-only backend connection diagnostics.
 *
 * Surfaces the resolved API base URL, backend reachability, last response
 * count, and last sync error so engineers can diagnose Docker/backend
 * connectivity at runtime. NEVER exposed to production users — every entry
 * point is gated on `__DEV__`.
 */

export interface BackendDiagnosticsState {
  apiBaseUrl: string;
  lastSyncAt: number | null;
  lastResponseCount: number | null;
  lastError: string | null;
  isReachable: boolean | null;
  reachabilityCheckedAt: number | null;
}

const initialState: BackendDiagnosticsState = {
  apiBaseUrl: '',
  lastSyncAt: null,
  lastResponseCount: null,
  lastError: null,
  isReachable: null,
  reachabilityCheckedAt: null,
};

let state: BackendDiagnosticsState = {
  ...initialState,
  apiBaseUrl: getApiBaseUrl(),
};

const listeners = new Set<(s: BackendDiagnosticsState) => void>();

export function getBackendDiagnostics(): BackendDiagnosticsState {
  return state;
}

export function subscribeToBackendDiagnostics(
  listener: (s: BackendDiagnosticsState) => void
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function setState(patch: Partial<BackendDiagnosticsState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l(state));
}

/**
 * Record the outcome of a listings sync. Called by BackendDataProvider.
 */
export function recordListingsSync(
  responseCount: number,
  error: string | null
) {
  setState({
    lastSyncAt: Date.now(),
    lastResponseCount: responseCount,
    lastError: error,
  });
  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.info(
      `[backendDiagnostics] sync — count=${responseCount} error=${error ?? 'none'} baseUrl=${state.apiBaseUrl}`
    );
  }
}

/**
 * Probe backend reachability with a lightweight HEAD request.
 * Only invoked in dev from the diagnostics overlay.
 */
export async function probeBackendReachability(): Promise<boolean> {
  const baseUrl = getApiBaseUrl();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(`${baseUrl}/health`, {
      method: 'GET',
      signal: controller as any,
    });
    clearTimeout(timeout);
    const reachable = res.ok || res.status < 500;
    setState({
      isReachable: reachable,
      reachabilityCheckedAt: Date.now(),
      apiBaseUrl: baseUrl,
    });
    return reachable;
  } catch (error) {
    setState({
      isReachable: false,
      reachabilityCheckedAt: Date.now(),
      apiBaseUrl: baseUrl,
      lastError: (error as Error).message,
    });
    return false;
  }
}

export function resetBackendDiagnostics() {
  setState({ ...initialState, apiBaseUrl: getApiBaseUrl() });
}
