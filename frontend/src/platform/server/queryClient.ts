import { QueryClient, onlineManager } from '@tanstack/react-query';

const NON_RETRYABLE_STATUS_CODES = new Set([400, 401, 403, 404, 409, 422]);

/**
 * Retry policy (offline-first):
 *  1. Never retry when the device is offline — the request fails immediately
 *     and cached data (if any) is served via `offlineFirst` networkMode.
 *  2. Don't retry more than 2 times.
 *  3. Don't retry on non-retryable HTTP status codes (client errors).
 */
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (!onlineManager.isOnline()) return false;
  if (failureCount >= 2) return false;

  const err = error as { status?: number; statusCode?: number };
  const status = err?.status ?? err?.statusCode;
  if (typeof status === 'number' && NON_RETRYABLE_STATUS_CODES.has(status)) {
    return false;
  }

  return true;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      networkMode: 'offlineFirst',
      staleTime: 1000 * 60 * 5,
      gcTime: 1000 * 60 * 30,
      retry: shouldRetry,
      refetchOnReconnect: true,
      refetchOnWindowFocus: false,
      refetchOnMount: true,
    },
    mutations: {
      retry: 0,
      networkMode: 'offlineFirst',
    },
  },
});
