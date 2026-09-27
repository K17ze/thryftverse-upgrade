'use client';

/**
 * Payout accounts + withdrawal request history — one hook, two truths:
 *
 *  - live: the server is truth. Destinations come from
 *    GET /users/:id/payout-accounts, history from GET /payout-requests —
 *    fixture seeds are never merged into a real user's rail, and no local
 *    write path pretends to move money.
 *  - fixture: the demo overlay store below. Seeds live in
 *    PAYOUT_ACCOUNTS / PAYOUT_REQUESTS; the store carries session-created
 *    accounts (masked to last4 — the full account number never persists),
 *    seed-removal overrides, the resolved default and session requests,
 *    all under the 'thryftverse.web.payouts' localStorage key.
 */

import { useMemo } from 'react';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import {
  PAYOUT_ACCOUNTS,
  PAYOUT_REQUESTS,
  type PayoutAccount,
  type PayoutRequest,
} from '@/lib/data/fixtures';
import { DATA_MODE } from '@/lib/api/client';
import type { PayoutAccountPayload } from '@/lib/api/services/payouts';
import { usePayoutAccountsQuery, usePayoutRequestsQuery } from '@/lib/hooks/payout-queries';
import { useSession } from '@/lib/session/SessionProvider';
import { useHydrated } from '@/lib/store/useStore';
import {
  accountNumberDigits,
  fixtureDestination,
  formatSortCode,
  liveDestination,
  requestFromApi,
  type PayoutDestination,
} from './withdrawViewModel';

const IS_LIVE = DATA_MODE === 'live';

export interface NewPayoutAccountInput {
  holderName: string;
  /** Optional — falls back to a neutral label when not provided. */
  bankName?: string;
  sortCode: string;
  /** Full 8-digit account number — reduced to last4 before persisting. */
  accountNumber: string;
}

export type RemoveAccountResult =
  | { ok: true; promotedToDefault?: string }
  | { ok: false; reason: 'only_account' | 'not_found' | 'unsupported' };

// ── Fixture-mode overlay store (demo build only) ──────────────────────

interface PayoutsState {
  extraAccounts: PayoutAccount[];
  /** Seed ids the user removed — keeps deletions honest across reloads. */
  removedSeedIds: string[];
  /** Explicit default pick; null resolves to the fixture default / first. */
  defaultOverride: string | null;
  sessionRequests: PayoutRequest[];
  addAccount: (input: NewPayoutAccountInput) => PayoutAccount;
  removeAccount: (id: string) => RemoveAccountResult;
  setDefault: (id: string) => void;
  recordRequest: (request: PayoutRequest) => void;
}

let seq = 0;
const nextId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(seq++).toString(36)}`;

/** Merge seeds + extras and resolve exactly one default. */
function resolveAccounts(state: Pick<PayoutsState, 'extraAccounts' | 'removedSeedIds' | 'defaultOverride'>): PayoutAccount[] {
  const merged = [
    ...PAYOUT_ACCOUNTS.filter((a) => !state.removedSeedIds.includes(a.id)),
    ...state.extraAccounts,
  ];
  const resolvedDefaultId =
    state.defaultOverride && merged.some((a) => a.id === state.defaultOverride)
      ? state.defaultOverride
      : (merged.find((a) => a.isDefault)?.id ?? merged[0]?.id ?? null);
  return merged.map((a) => ({ ...a, isDefault: a.id === resolvedDefaultId }));
}

export const usePayoutStore = create<PayoutsState>()(
  persist(
    (set, get) => ({
      extraAccounts: [],
      removedSeedIds: [],
      defaultOverride: null,
      sessionRequests: [],

      addAccount: (input) => {
        const account: PayoutAccount = {
          id: nextId('pa'),
          holderName: input.holderName.trim(),
          bankName: input.bankName?.trim() || 'Bank account',
          sortCode: formatSortCode(input.sortCode),
          last4: accountNumberDigits(input.accountNumber).slice(-4),
          currency: 'GBP',
          isDefault: false,
          createdAt: new Date().toISOString(),
        };
        set((s) => ({ extraAccounts: [...s.extraAccounts, account] }));
        return account;
      },

      removeAccount: (id) => {
        const merged = resolveAccounts(get());
        const target = merged.find((a) => a.id === id);
        if (!target) return { ok: false, reason: 'not_found' };
        if (merged.length === 1) return { ok: false, reason: 'only_account' };

        const remaining = merged.filter((a) => a.id !== id);
        // Removing the default promotes the oldest remaining account —
        // a deterministic handoff, never a dangling default.
        const promoted = target.isDefault ? remaining[0]?.id : undefined;

        set((s) => ({
          removedSeedIds: PAYOUT_ACCOUNTS.some((seed) => seed.id === id)
            ? [...s.removedSeedIds, id]
            : s.removedSeedIds,
          extraAccounts: s.extraAccounts.filter((a) => a.id !== id),
          defaultOverride: promoted ?? (s.defaultOverride === id ? null : s.defaultOverride),
        }));
        return { ok: true, promotedToDefault: promoted };
      },

      setDefault: (id) => set({ defaultOverride: id }),

      recordRequest: (request) =>
        set((s) => ({ sessionRequests: [request, ...s.sessionRequests] })),
    }),
    {
      name: 'thryftverse.web.payouts',
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

// ── Hook ──────────────────────────────────────────────────────────────

export interface PayoutAccountsData {
  mode: 'live' | 'fixture';
  /** Loading the payout rail (live) — fixture resolves synchronously. */
  isLoading: boolean;
  /** The destinations read failed (live only) — show an honest retry. */
  isError: boolean;
  /** The history read failed (live only) — destinations may still load. */
  requestsError: boolean;
  refetch: () => void;
  /** Every destination, any status — the rail renders pending/disabled
   *  rows disabled rather than hiding them. */
  destinations: PayoutDestination[];
  /** Destinations a payout can target right now (status 'active'). */
  selectableDestinations: PayoutDestination[];
  /** Default pick: the explicit override (fixture) or first active (live). */
  defaultDestination: PayoutDestination | null;
  /** Newest-first withdrawal history — server truth in live mode. */
  requests: PayoutRequest[];
  /** Raw fixture accounts — feeds the add-sheet duplicate check. Empty
   *  in live mode, where the bank-detail form never renders. */
  fixtureAccounts: PayoutAccount[];
  /** Fixture-mode local write — throws in live mode; views gate on mode
   *  and open the Stripe setup sheet instead. */
  addAccount: (input: NewPayoutAccountInput) => PayoutAccount;
  /** Fixture-mode only — there is no payout-account delete endpoint. */
  removeAccount: (id: string) => RemoveAccountResult;
  /** Fixture-mode only — the live rail has no client-settable default. */
  setDefault: (id: string) => void;
  /** Fixture-mode only — live requests come back through the server. */
  recordRequest: (request: PayoutRequest) => void;
}

export function usePayoutAccounts(): PayoutAccountsData {
  const { user, isGuest } = useSession();
  // Persisted reads gate behind hydration — SSR and the first client
  // render resolve the seed set; localStorage truth lands after mount.
  const hydrated = useHydrated();
  const extraAccounts = usePayoutStore((s) => s.extraAccounts);
  const removedSeedIds = usePayoutStore((s) => s.removedSeedIds);
  const defaultOverride = usePayoutStore((s) => s.defaultOverride);
  const sessionRequests = usePayoutStore((s) => s.sessionRequests);
  const storeAddAccount = usePayoutStore((s) => s.addAccount);
  const storeRemoveAccount = usePayoutStore((s) => s.removeAccount);
  const storeSetDefault = usePayoutStore((s) => s.setDefault);
  const storeRecordRequest = usePayoutStore((s) => s.recordRequest);

  // Live rail — disabled-gated inside the query hooks (guests and fixture
  // builds never fire them).
  const {
    data: liveAccounts,
    isLoading: accountsLoading,
    isError: accountsError,
    refetch: refetchAccounts,
  } = usePayoutAccountsQuery();
  const {
    data: liveRequests,
    isError: liveRequestsError,
    refetch: refetchRequests,
  } = usePayoutRequestsQuery();

  const fixtureAccounts = useMemo(
    () =>
      resolveAccounts(
        hydrated
          ? { extraAccounts, removedSeedIds, defaultOverride }
          : { extraAccounts: [], removedSeedIds: [], defaultOverride: null },
      ),
    [hydrated, extraAccounts, removedSeedIds, defaultOverride],
  );

  return useMemo<PayoutAccountsData>(() => {
    if (IS_LIVE) {
      // Live mode NEVER merges fixture seeds — a signed-out or
      // unresolved session resolves to an empty rail, not the demo
      // identity's bank accounts.
      const liveAccountsList = user && !isGuest ? (liveAccounts ?? []) : [];
      const accountById = new Map<number, PayoutAccountPayload>(
        liveAccountsList.map((a) => [a.id, a]),
      );
      const firstActiveId = liveAccountsList.find((a) => a.status === 'active')?.id ?? null;
      const destinations = liveAccountsList.map((a) =>
        liveDestination(a, a.id === firstActiveId),
      );
      const requests = (liveRequests ?? []).map((r) =>
        requestFromApi(r, accountById.get(r.payoutAccountId)),
      );
      return {
        mode: 'live',
        isLoading: accountsLoading,
        isError: accountsError,
        requestsError: liveRequestsError,
        refetch: () => {
          void refetchAccounts();
          void refetchRequests();
        },
        destinations,
        selectableDestinations: destinations.filter((d) => d.status === 'active'),
        defaultDestination:
          destinations.find((d) => d.isDefault) ?? destinations[0] ?? null,
        requests,
        fixtureAccounts: [],
        addAccount: () => {
          throw new Error('Payout methods are set up through Stripe in live mode.');
        },
        removeAccount: () => ({ ok: false, reason: 'unsupported' }),
        setDefault: () => undefined,
        recordRequest: () => undefined,
      };
    }

    const destinations = fixtureAccounts.map(fixtureDestination);
    const requests = [...(hydrated ? sessionRequests : []), ...PAYOUT_REQUESTS].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    return {
      mode: 'fixture',
      isLoading: false,
      isError: false,
      requestsError: false,
      refetch: () => undefined,
      destinations,
      selectableDestinations: destinations,
      defaultDestination: destinations.find((d) => d.isDefault) ?? null,
      requests,
      fixtureAccounts,
      addAccount: storeAddAccount,
      removeAccount: storeRemoveAccount,
      setDefault: storeSetDefault,
      recordRequest: storeRecordRequest,
    };
  }, [
    user,
    isGuest,
    hydrated,
    fixtureAccounts,
    sessionRequests,
    liveAccounts,
    accountsLoading,
    accountsError,
    refetchAccounts,
    liveRequests,
    liveRequestsError,
    refetchRequests,
    storeAddAccount,
    storeRemoveAccount,
    storeSetDefault,
    storeRecordRequest,
  ]);
}
