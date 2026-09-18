import { queryClient } from './queryClient';

/**
 * Centralized session-data purge (F14). Called from `useStore.logout()` so
 * EVERY termination path — settings sign-out, token expiry in apiClient,
 * biometric failure — purges identically.
 *
 * Fail closed on account isolation: prefix-scoped removal proved leaky
 * (co-own holdings, orders, wallet, notifications survived logout and
 * could surface for the next account). `cancelQueries` stops in-flight
 * private fetches; `clear()` removes every cached query and mutation —
 * the next account refetches public data rather than risk seeing account
 * A's private state.
 */
export function clearUserScopedQueryCache(): void {
  queryClient.cancelQueries().catch(() => {});
  queryClient.clear();
  queryClient.setQueryData(['notifications', 'unread-count'], 0);
}
