import { QueryClient } from '@tanstack/react-query';

const NON_RETRYABLE_STATUS_CODES = new Set([400, 401, 403, 404, 409, 422]);

function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= 2) return false;

  const status = (error as any)?.status ?? (error as any)?.statusCode;
  if (typeof status === 'number' && NON_RETRYABLE_STATUS_CODES.has(status)) {
    return false;
  }

  return true;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      gcTime: 1000 * 60 * 30,
      retry: shouldRetry,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
});
