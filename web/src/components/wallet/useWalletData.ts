'use client';

/**
 * Wallet data hook — fixture-mode query mirroring the mobile
 * hooks/wallet/useWalletData surface. Live mode reads the ledger-backed
 * `/users/:id/wallet/balances` endpoint (the same source native uses —
 * the `/wallets/:id/snapshot` balance blob is client-asserted and is NOT
 * a money source), `/wallet/1ze/:id/ledger` for the canonical activity
 * ledger (wallet_ledger: FX legs, transfers, 1ZE movements — the GBP
 * accounting ledger behind /users/:id/transactions never sees those),
 * and `/wallet/1ze/:id/position` for the 1ZE pocket.
 * Carries the fiat pocket (balance + commerce activity) and the 1ZE pocket
 * (Co-Own settlement units) so convert mutations update one cache entry.
 */

import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { TRANSACTIONS, WALLET_BALANCE } from '@/lib/data/fixtures';
import { IZE_POCKET_SEED } from './convertViewModel';
import { DATA_MODE } from '@/lib/api/client';
import { fetchJson } from '@/lib/api/http';
import * as commerceService from '@/lib/api/services/commerce';
import {
  fetchWalletLedger,
  WALLET_LEDGER_MAX_LIMIT,
  type WalletLedgerAssetFilter,
  type WalletLedgerItem,
} from '@/lib/api/services/walletLedger';
import { useSession } from '@/lib/session/SessionProvider';
import type { WalletLedgerEntry, WalletLedgerTransaction } from './ledgerViewModel';
import { walletKeys } from './walletKeys';

/**
 * 1ZE pocket — the real position read (same fields the native wallet
 * renders). Null when the position endpoint can't be read: absent beats
 * fabricated, so every consumer must handle the missing pocket rather
 * than invent a balance.
 */
export interface IzePocket {
  /** Total units owned (userIze). */
  settled: number;
  /** Spendable units (availableIze = userIze − reservedForOrders). */
  available: number;
  /** unsettledSaleProceeds + pendingDeposit — kept for legacy consumers. */
  pending: number;
  /** Units held for open orders (1ZE units, never a GBP conversion). */
  reserved: number;
  redemptionInProgress: number;
  otherHolds: number;
  pendingDeposit: number;
  unsettledSaleProceeds: number;
  /** Withdrawable units per the position read. */
  withdrawable: number;
  /** Server-computed fiat value of the pocket — null when unpriced. */
  userFiatValue: number | null;
  /** Wire-backed safeguarding flags — never asserted when absent. */
  safeguarded: boolean;
  safeguardingPartner: string | null;
  safeguardingEvidenceUrl: string | null;
  safeguardingTermsUrl: string | null;
  reconciliationState: string | null;
}

export interface WalletData {
  /** Ledger-backed seller balances (GET /users/:id/wallet/balances). */
  available: number;
  pending: number;
  heldInReserve: number;
  /** Per-order escrow breakdown behind `pending`. */
  pendingBreakdown: commerceService.WalletPendingBalanceItem[];
  /** Server-computed payout summary — null when the read is unavailable.
   *  An in-flight payout is shown only on positive knowledge. */
  pendingWithdrawalGbp: number | null;
  cumulativeWithdrawnGbp: number | null;
  /**
   * True when the ledger-backed balance read failed. Surfaces must render
   * an error + retry state — never £0.00.
   */
  balanceError: boolean;
  currency: string;
  /**
   * Ledger rows in the live wire shape (unsigned amount + direction,
   * ref_type/kind, 'posted' status). Live mode carries the real
   * GET /wallet/1ze/:id/ledger rows — the canonical wallet_ledger
   * movements across all assets; fixture mode carries the commerce
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
 *  order reservations, in-flight redemptions, unsettled proceeds, plus
 *  the backend-backed safeguarding flags). */
interface IzePositionApi {
  ok?: boolean;
  rate?: { ratePerGram?: number } | null;
  balances?: {
    userIze?: number;
    userFiatValue?: number;
    availableIze?: number;
    reservedForOrders?: number;
    redemptionInProgress?: number;
    otherHolds?: number;
    pendingDeposit?: number;
    unsettledSaleProceeds?: number;
    withdrawable?: number;
    safeguarded?: boolean;
    safeguardingPartner?: string | null;
    safeguardingEvidenceUrl?: string | null;
    safeguardingTermsUrl?: string | null;
    reconciliationState?: string | null;
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
    const reservedForOrders = b.reservedForOrders ?? 0;
    return {
      settled: b.userIze,
      available: b.availableIze ?? Math.max(0, b.userIze - reservedForOrders),
      pending: round2((b.unsettledSaleProceeds ?? 0) + (b.pendingDeposit ?? 0)),
      reserved: reservedForOrders,
      redemptionInProgress: b.redemptionInProgress ?? 0,
      otherHolds: b.otherHolds ?? 0,
      pendingDeposit: b.pendingDeposit ?? 0,
      unsettledSaleProceeds: b.unsettledSaleProceeds ?? 0,
      withdrawable: b.withdrawable ?? b.availableIze ?? 0,
      userFiatValue: typeof b.userFiatValue === 'number' ? b.userFiatValue : null,
      safeguarded: b.safeguarded === true,
      safeguardingPartner: b.safeguardingPartner ?? null,
      safeguardingEvidenceUrl: b.safeguardingEvidenceUrl ?? null,
      safeguardingTermsUrl: b.safeguardingTermsUrl ?? null,
      reconciliationState: b.reconciliationState ?? null,
    };
  } catch {
    return null;
  }
}

export const WALLET_TX_PAGE_SIZE = 50;

export interface WalletTransactionsPage {
  items: WalletLedgerTransaction[];
  /** Rows requested this read — the endpoint paginates by limit only. */
  limit: number;
  /** True when the server returned fewer rows than asked for — the only
   *  honest exhaustion signal (the contract carries no total). */
  exhausted: boolean;
}

/**
 * wallet_ledger item → the shared ledger transport. `amount` is the
 * unsigned major-unit value in `currency` (from amountDisplay — feeding
 * the minor-unit `amount` field to a major-unit formatter would render a
 * 100× inflation); direction carries the sign. `currency` is the leg's
 * own code — a EUR FX credit carries EUR, not the wallet fiat_currency.
 */
function mapWalletLedgerItem(t: WalletLedgerItem): WalletLedgerTransaction {
  const display = typeof t.amountDisplay === 'number' ? t.amountDisplay : 0;
  return {
    id: String(t.id),
    sourceType: t.refType ?? '',
    lineType: t.kind ?? '',
    sourceId: t.refId ?? null,
    amount: Math.abs(display),
    currency: (t.currency ?? (t.asset === '1ZE' ? '1ZE' : 'GBP')).toUpperCase(),
    direction: display >= 0 ? 'credit' : 'debit',
    // wallet_ledger rows are committed double-entry facts — no pending state.
    status: 'posted',
    createdAt: t.createdAt,
    description: null,
    kind: t.kind,
    refType: t.refType ?? null,
    refId: t.refId ?? null,
    txId: t.txId ?? null,
    asset: t.asset,
    balanceAfter: typeof t.balanceAfterDisplay === 'number' ? t.balanceAfterDisplay : null,
  };
}

/**
 * One page of the canonical wallet ledger — newest-first up to `limit`.
 * The endpoint exposes no offset/cursor: "load more" grows the window.
 */
async function fetchWalletLedgerPage(
  userId: string,
  asset: WalletLedgerAssetFilter,
  limit: number,
  signal?: AbortSignal,
): Promise<WalletTransactionsPage> {
  const rows = await fetchWalletLedger(userId, { asset, limit }, signal);
  return {
    items: rows.map(mapWalletLedgerItem),
    limit,
    exhausted: rows.length < limit,
  };
}

/** First page of the wallet ledger — the wallet home preview slice. */
async function fetchWalletLedgerTransactions(
  userId: string,
  signal?: AbortSignal,
): Promise<WalletLedgerTransaction[]> {
  const page = await fetchWalletLedgerPage(userId, 'ALL', WALLET_TX_PAGE_SIZE, signal);
  return page.items;
}

/**
 * Canonical wallet ledger feed for the full history surface — mirrors
 * native's getWalletLedger read (asset=ALL|1ZE|FIAT, newest-first). The
 * endpoint paginates by limit alone (no cursor), so "load more" widens
 * the window up to the server's 300-row cap; each widened read returns a
 * superset, never duplicated rows. Disabled outside live mode: the
 * fixture ledger already ships whole inside useWalletData.
 */
export function useWalletTransactions(asset: WalletLedgerAssetFilter = 'ALL') {
  const { user } = useSession();
  const [paging, setPaging] = useState<{ asset: WalletLedgerAssetFilter; pages: number }>({
    asset,
    pages: 1,
  });
  // Asset switches restart the window — `pages` is per-asset state.
  const pages = paging.asset === asset ? paging.pages : 1;
  const limit = Math.min(pages * WALLET_TX_PAGE_SIZE, WALLET_LEDGER_MAX_LIMIT);
  const query = useQuery({
    queryKey: [...walletKeys.transactions(user?.id), asset, limit] as const,
    queryFn: ({ signal }) => fetchWalletLedgerPage(user!.id, asset, limit, signal),
    enabled: DATA_MODE === 'live' && !!user?.id,
    // Widening the window keeps the previous superset on screen while the
    // larger read lands — no flicker back to an empty list.
    placeholderData: keepPreviousData,
  });
  const items = query.data?.items ?? [];
  const exhausted =
    query.data !== undefined &&
    (query.data.exhausted || limit >= WALLET_LEDGER_MAX_LIMIT);
  return {
    items,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
    hasMore: !exhausted,
    isFetchingMore: query.isFetching && !query.isLoading,
    fetchMore: () => setPaging({ asset, pages: pages + 1 }),
  };
}

/** Exported for write-path consumers (e.g. syndicate settlement) that
 *  must seed the wallet cache before debiting — never fabricates funds:
 *  the returned data is the same projection useWalletData reads. */
export async function fetchWallet(userId?: string): Promise<WalletData> {
  if (DATA_MODE === 'live' && userId) {
    // The balance read fails soft inside Promise.all — a null carries the
    // error forward as `balanceError` so surfaces render error+retry
    // instead of a £0.00 collapse (mirrors native sellerBalancesError).
    const [balances, transactions, ize, payoutSummary] = await Promise.all([
      commerceService.fetchWalletBalances(userId).catch(() => null),
      fetchWalletLedgerTransactions(userId),
      fetchIzePocket(userId),
      commerceService.fetchWalletPayoutSummary(userId),
    ]);
    return {
      available: balances?.availableGbp ?? 0,
      pending: balances?.pendingGbp ?? 0,
      heldInReserve: balances?.heldInReserveGbp ?? 0,
      pendingBreakdown: balances?.pendingBreakdown ?? [],
      pendingWithdrawalGbp: payoutSummary?.currentPendingWithdrawalGbp ?? null,
      cumulativeWithdrawnGbp: payoutSummary?.cumulativeWithdrawnGbp ?? null,
      balanceError: balances === null,
      currency: 'GBP',
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
        sourceId: null,
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
    heldInReserve: 0,
    pendingBreakdown: [],
    pendingWithdrawalGbp: 0,
    cumulativeWithdrawnGbp: 0,
    balanceError: false,
    currency: WALLET_BALANCE.currency,
    transactions,
    session: [],
    // Fixture pocket — authored demo state, extended to the same shape
    // the live position read produces.
    ize: {
      ...IZE_POCKET_SEED,
      available: round2(IZE_POCKET_SEED.settled - IZE_POCKET_SEED.reserved),
      redemptionInProgress: 0,
      otherHolds: 0,
      pendingDeposit: 0,
      unsettledSaleProceeds: IZE_POCKET_SEED.pending,
      withdrawable: round2(IZE_POCKET_SEED.settled - IZE_POCKET_SEED.reserved),
      userFiatValue: null,
      safeguarded: true,
      safeguardingPartner: 'Barclays Bank UK PLC',
      safeguardingEvidenceUrl: null,
      safeguardingTermsUrl: null,
      reconciliationState: 'reconciled',
    },
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
