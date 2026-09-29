'use client';

/**
 * useWithdrawData — web port of mobile hooks/withdraw/useWithdrawData.
 * Owns the withdraw surface's ledger truth and capability reads:
 *
 *  - balances: GET /users/:id/wallet/balances — the ledger-backed
 *    available/pending/reserve numbers the composer must gate on. The
 *    /wallets/:id/snapshot read accepts a client-asserted blob, so it
 *    can never be the source for money UI (native hydrateBalance).
 *  - capabilities: GET /users/:id/capabilities — the resolved country
 *    policy profile; `payouts.gatewayPriority` decides whether the
 *    Stripe rail is even offered (native usePayoutAccountConnection).
 *  - connectStatus: GET /users/:id/stripe-connect/status —
 *    payoutsEnabled / requirementsCurrentlyDue / payoutPolicySupported
 *    drive the onboarding gate vocabulary.
 *
 * All three are live-mode authed reads — fixture builds and guests never
 * fire them, and the fixture surface keeps reading its demo wallet.
 */

import { useQuery } from '@tanstack/react-query';
import { DATA_MODE } from '@/lib/api/client';
import * as payoutsService from '@/lib/api/services/payouts';
import { useSession } from '@/lib/session/SessionProvider';

export const withdrawKeys = {
  balances: (userId?: string | null) => ['wallet-balances', userId ?? 'guest'] as const,
  capabilities: (userId?: string | null) => ['user-capabilities', userId ?? 'guest'] as const,
  connectStatus: (userId?: string | null) => ['stripe-connect-status', userId ?? 'guest'] as const,
};

export interface WithdrawData {
  /** Ledger-backed balances — null until the live read resolves, or the
   *  read failed, or in fixture mode where the demo wallet owns the
   *  numbers. */
  balances: payoutsService.WalletBalances | null;
  /** True while the first ledger read is in flight. */
  isHydratingBalance: boolean;
  /** Honest failure string (native grammar) — a failed read never
   *  degrades to a fabricated £0, which would hide real seller funds. */
  balanceError: string | null;
  reloadBalance: () => void;
  /** Resolved country policy profile — null while unresolved. */
  capabilities: payoutsService.UserCountryCapabilities | null;
  /** Stripe Connect status — null while unresolved. */
  connectStatus: payoutsService.StripeConnectStatusPayload | null;
}

export function useWithdrawData(): WithdrawData {
  const { user, isGuest } = useSession();
  const userId = user?.id;
  const enabled = DATA_MODE === 'live' && Boolean(userId) && !isGuest;

  const balancesQuery = useQuery({
    queryKey: withdrawKeys.balances(userId),
    enabled,
    queryFn: ({ signal }) => payoutsService.fetchWalletBalances(userId as string, signal),
  });
  const capabilitiesQuery = useQuery({
    queryKey: withdrawKeys.capabilities(userId),
    enabled,
    queryFn: ({ signal }) =>
      payoutsService.getUserCountryCapabilities(userId as string, signal),
  });
  const connectStatusQuery = useQuery({
    queryKey: withdrawKeys.connectStatus(userId),
    enabled,
    queryFn: () => payoutsService.getStripeConnectStatus(userId as string),
  });

  return {
    balances: balancesQuery.data ?? null,
    isHydratingBalance: enabled && balancesQuery.isLoading,
    balanceError: balancesQuery.isError
      ? 'We could not load your available balance.'
      : null,
    reloadBalance: () => void balancesQuery.refetch(),
    capabilities: capabilitiesQuery.data ?? null,
    connectStatus: connectStatusQuery.data ?? null,
  };
}
