'use client';

/**
 * Payout accounts + withdrawal request history — persisted session store,
 * mirroring lib/store/userPaymentData.ts conventions. Fixture seeds live in
 * PAYOUT_ACCOUNTS / PAYOUT_REQUESTS; the store carries session-created
 * accounts (masked to last4 — the full account number never persists),
 * seed-removal overrides, the resolved default and payout requests made
 * in-session, so /wallet/payouts and /wallet/withdraw share one truth.
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
import { accountNumberDigits, formatSortCode } from './withdrawViewModel';

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
  | { ok: false; reason: 'only_account' | 'not_found' };

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

export interface PayoutAccountsData {
  /** Merged accounts with exactly one resolved default. */
  accounts: PayoutAccount[];
  defaultAccount: PayoutAccount | null;
  /** Newest-first request history: session entries, then fixture seeds. */
  requests: PayoutRequest[];
  addAccount: (input: NewPayoutAccountInput) => PayoutAccount;
  removeAccount: (id: string) => RemoveAccountResult;
  setDefault: (id: string) => void;
  recordRequest: (request: PayoutRequest) => void;
}

export function usePayoutAccounts(): PayoutAccountsData {
  const extraAccounts = usePayoutStore((s) => s.extraAccounts);
  const removedSeedIds = usePayoutStore((s) => s.removedSeedIds);
  const defaultOverride = usePayoutStore((s) => s.defaultOverride);
  const sessionRequests = usePayoutStore((s) => s.sessionRequests);
  const addAccount = usePayoutStore((s) => s.addAccount);
  const removeAccount = usePayoutStore((s) => s.removeAccount);
  const setDefault = usePayoutStore((s) => s.setDefault);
  const recordRequest = usePayoutStore((s) => s.recordRequest);

  // Memoised so effect deps downstream don't fire on every render.
  const accounts = useMemo(
    () => resolveAccounts({ extraAccounts, removedSeedIds, defaultOverride }),
    [extraAccounts, removedSeedIds, defaultOverride],
  );
  const requests = useMemo(
    () =>
      [...sessionRequests, ...PAYOUT_REQUESTS].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    [sessionRequests],
  );

  return {
    accounts,
    defaultAccount: accounts.find((a) => a.isDefault) ?? null,
    requests,
    addAccount,
    removeAccount,
    setDefault,
    recordRequest,
  };
}
