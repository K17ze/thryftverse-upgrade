'use client';

/**
 * Payout queries — the live-mode data path for the wallet payout rail.
 * Fixture mode is owned by the local overlay store in
 * components/wallet/withdraw/usePayoutAccounts.ts; these queries only
 * fire when DATA_MODE === 'live' and a real session user exists, so a
 * guest (or the demo build) never hits the authed endpoints.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DATA_MODE } from '@/lib/api/client';
import * as payoutsService from '@/lib/api/services/payouts';
import { useSession } from '@/lib/session/SessionProvider';

export const payoutKeys = {
  accounts: (userId?: string | null) => ['payout-accounts', userId ?? 'guest'] as const,
  requests: (userId?: string | null) => ['payout-requests', userId ?? 'guest'] as const,
};

export function usePayoutAccountsQuery() {
  const { user, isGuest } = useSession();
  const userId = user?.id;
  return useQuery({
    queryKey: payoutKeys.accounts(userId),
    enabled: DATA_MODE === 'live' && !!userId && !isGuest,
    queryFn: ({ signal }) => payoutsService.listPayoutAccounts(userId as string, signal),
  });
}

export function usePayoutRequestsQuery(limit = 60) {
  const { user, isGuest } = useSession();
  const userId = user?.id;
  return useQuery({
    queryKey: payoutKeys.requests(userId),
    enabled: DATA_MODE === 'live' && !!userId && !isGuest,
    queryFn: ({ signal }) =>
      payoutsService.listPayoutRequests(userId as string, { limit }, signal),
  });
}

/**
 * Stripe Connect payout setup — the web port of mobile's
 * usePayoutAccountConnection. One mutation drives the whole sequence
 * (status → create → onboarding link / resolve active account); the sheet
 * re-runs it when the user returns from the Stripe tab.
 */
export function useConnectStripePayout() {
  const queryClient = useQueryClient();
  const { user } = useSession();
  return useMutation({
    mutationFn: async (): Promise<payoutsService.PayoutSetupOutcome> => {
      if (!user?.id) throw new Error('Sign in to set up payouts.');
      return payoutsService.connectStripePayout(user.id);
    },
    onSuccess: (outcome) => {
      if (outcome.kind === 'ready') {
        void queryClient.invalidateQueries({
          queryKey: payoutKeys.accounts(user?.id),
        });
      }
    },
  });
}
