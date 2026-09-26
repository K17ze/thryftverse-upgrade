'use client';

/**
 * Wallet data hook — fixture-mode query mirroring the mobile
 * hooks/wallet/useWalletData surface. Live mode reads the shared
 * `/wallets/:userId/snapshot` + `/users/:id/transactions` endpoints.
 * Carries the fiat pocket (balance + commerce activity) and the 1ZE pocket
 * (Co-Own settlement units) so convert mutations update one cache entry.
 */

import { useQuery } from '@tanstack/react-query';
import type { Transaction } from '@/lib/contracts/domain';
import { TRANSACTIONS, WALLET_BALANCE } from '@/lib/data/fixtures';
import { IZE_POCKET_SEED } from './convertViewModel';
import { DATA_MODE } from '@/lib/api/client';
import * as commerceService from '@/lib/api/services/commerce';
import * as usersService from '@/lib/api/services/users';
import { useSession } from '@/lib/session/SessionProvider';

export interface WalletData {
  available: number;
  pending: number;
  currency: string;
  transactions: Transaction[];
  /** Session-recorded ledger entries (conversions) — empty until one lands. */
  session: import('./ledgerViewModel').WalletLedgerEntry[];
  /** 1ZE pocket — settled/pending/reserved units. */
  ize: { settled: number; pending: number; reserved: number };
}

const tick = (ms = 320) => new Promise((r) => setTimeout(r, ms));

async function fetchWallet(userId?: string): Promise<WalletData> {
  if (DATA_MODE === 'live' && userId) {
    const [snapshot, transactions] = await Promise.all([
      commerceService.fetchWalletSnapshot(userId),
      usersService.fetchUserTransactions(userId),
    ]);
    return {
      available: snapshot?.availableGbp ?? 0,
      pending: snapshot?.pendingGbp ?? 0,
      currency: snapshot?.currency ?? 'GBP',
      transactions: transactions.sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
      ),
      session: [],
      ize: { ...IZE_POCKET_SEED },
    };
  }
  await tick();
  const transactions = [...TRANSACTIONS].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );
  return {
    available: WALLET_BALANCE.available,
    pending: WALLET_BALANCE.pending,
    currency: WALLET_BALANCE.currency,
    transactions,
    session: [],
    ize: { ...IZE_POCKET_SEED },
  };
}

/**
 * Wallet state — fixture mode keeps staleTime/gcTime Infinity so the
 * session ledger survives navigation; live mode re-reads on focus.
 */
export function useWalletData() {
  const { user } = useSession();
  return useQuery({
    queryKey: ['wallet', user?.id ?? 'guest'],
    queryFn: () => fetchWallet(user?.id),
    staleTime: DATA_MODE === 'live' ? undefined : Infinity,
    gcTime: DATA_MODE === 'live' ? undefined : Infinity,
  });
}
