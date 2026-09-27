'use client';

/**
 * Wallet data hook — fixture-mode query mirroring the mobile
 * hooks/wallet/useWalletData surface. Live mode reads the shared
 * `/wallets/:userId/snapshot` + `/users/:id/transactions` endpoints, plus
 * `/wallet/1ze/:id/position` for the 1ZE pocket.
 * Carries the fiat pocket (balance + commerce activity) and the 1ZE pocket
 * (Co-Own settlement units) so convert mutations update one cache entry.
 */

import { useQuery } from '@tanstack/react-query';
import { TRANSACTIONS, WALLET_BALANCE } from '@/lib/data/fixtures';
import { IZE_POCKET_SEED } from './convertViewModel';
import { DATA_MODE } from '@/lib/api/client';
import { fetchJson } from '@/lib/api/http';
import type { UserTransactionApi } from '@/lib/api/mappers';
import * as commerceService from '@/lib/api/services/commerce';
import { useSession } from '@/lib/session/SessionProvider';
import type { WalletLedgerEntry, WalletLedgerTransaction } from './ledgerViewModel';
import { walletKeys } from './walletKeys';

/** 1ZE pocket — settled/pending/reserved units. Null when the position
 *  endpoint can't be read: absent beats fabricated, so every consumer
 *  must handle the missing pocket rather than invent a balance. */
export interface IzePocket {
  settled: number;
  pending: number;
  reserved: number;
}

export interface WalletData {
  available: number;
  pending: number;
  currency: string;
  /**
   * Ledger rows in the live wire shape (unsigned amount + direction,
   * source_type/line_type, 'posted' status). Live mode carries the real
   * GET /users/:id/transactions rows; fixture mode carries the commerce
   * seed projected into the same shape.
   */
  transactions: WalletLedgerTransaction[];
  /** Session-recorded ledger entries (conversions) — empty until one lands. */
  session: WalletLedgerEntry[];
  /** 1ZE pocket — null in live mode when the position endpoint fails. */
  ize: IzePocket | null;
}

const tick = (ms = 320) => new Promise((r) => setTimeout(r, ms));

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Wire shape of GET /wallet/1ze/:userId/position — the same canonical
 *  position read the mobile wallet consumes (wallets table + live holds:
 *  order reservations, in-flight redemptions, unsettled proceeds). */
interface IzePositionApi {
  ok?: boolean;
  balances?: {
    userIze?: number;
    availableIze?: number;
    reservedForOrders?: number;
    redemptionInProgress?: number;
    unsettledSaleProceeds?: number;
    pendingDeposit?: number;
    withdrawable?: number;
  };
}

/**
 * The real 1ZE pocket. Returns null on any failure (missing tables, 4xx,
 * network) — callers render the pocket as absent rather than showing a
 * fabricated or zeroed balance.
 */
async function fetchIzePocket(
  userId: string,
  signal?: AbortSignal,
): Promise<IzePocket | null> {
  try {
    const payload = await fetchJson<IzePositionApi>(
      `/wallet/1ze/${encodeURIComponent(userId)}/position?fiatCurrency=GBP`,
      undefined,
      { signal },
    );
    const b = payload.balances;
    if (!b || typeof b.userIze !== 'number') return null;
    return {
      settled: b.userIze,
      pending: round2((b.unsettledSaleProceeds ?? 0) + (b.pendingDeposit ?? 0)),
      reserved: b.reservedForOrders ?? 0,
    };
  } catch {
    return null;
  }
}

/**
 * Live wallet ledger rows — read straight off the wire rather than via
 * the domain Transaction service projection, which drops `direction`,
 * `lineType` and `currency` and would render unsigned debits as
 * positive amounts. The fiat pocket is a GBP ledger, so non-GBP rows
 * (1ZE movements carry no amount_gbp and would read £0.00) stay out of
 * the projection; the 1ZE pocket renders separately.
 */
async function fetchUserLedgerTransactions(
  userId: string,
  signal?: AbortSignal,
): Promise<WalletLedgerTransaction[]> {
  const payload = await fetchJson<{ ok: true; total: number; items: UserTransactionApi[] }>(
    `/users/${encodeURIComponent(userId)}/transactions?limit=50&offset=0`,
    undefined,
    { signal },
  );
  return (payload.items ?? [])
    .filter((t) => (t.currency ?? 'GBP').toUpperCase() === 'GBP')
    .map((t) => ({
      id: t.id,
      sourceType: t.type,
      lineType: t.lineType ?? '',
      amount: t.amount,
      currency: (t.currency ?? 'GBP').toUpperCase(),
      direction: t.direction === 'credit' ? 'credit' : 'debit',
      status: t.status,
      createdAt: t.createdAt,
      description: t.description ?? null,
    }));
}

/** Exported for write-path consumers (e.g. syndicate settlement) that
 *  must seed the wallet cache before debiting — never fabricates funds:
 *  the returned data is the same projection useWalletData reads. */
export async function fetchWallet(userId?: string): Promise<WalletData> {
  if (DATA_MODE === 'live' && userId) {
    const [snapshot, transactions, ize] = await Promise.all([
      commerceService.fetchWalletSnapshot(userId),
      fetchUserLedgerTransactions(userId),
      fetchIzePocket(userId),
    ]);
    return {
      available: snapshot?.availableGbp ?? 0,
      pending: snapshot?.pendingGbp ?? 0,
      currency: snapshot?.currency ?? 'GBP',
      transactions,
      session: [],
      // Real position read — never the fixture seed. A failed read stays
      // null so the pocket renders absent rather than as demo funds.
      ize,
    };
  }
  await tick();
  const transactions = [...TRANSACTIONS]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .map(
      (t): WalletLedgerTransaction => ({
        id: t.id,
        sourceType: t.type,
        lineType: t.type,
        amount: Math.abs(t.amount),
        currency: WALLET_BALANCE.currency,
        direction: t.amount >= 0 ? 'credit' : 'debit',
        status: t.status,
        createdAt: t.date,
        description: t.description,
      }),
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
    queryKey: walletKeys.all(user?.id),
    queryFn: () => fetchWallet(user?.id),
    staleTime: DATA_MODE === 'live' ? undefined : Infinity,
    gcTime: DATA_MODE === 'live' ? undefined : Infinity,
  });
}
