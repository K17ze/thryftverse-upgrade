'use client';

/**
 * Ledger view model — the canonical wallet Activity ledger for the web,
 * mirroring mobile's WalletHistoryScreen (one ledger, one name). Live mode
 * reads wallet_ledger (GET /wallet/1ze/:userId/ledger) — the same source
 * native renders — so FX conversions, transfers and 1ZE legs are visible
 * alongside fiat movements. Fixture TRANSACTIONS are the commerce seed
 * (read-only import); wallet-specific movements — top-ups, payouts, fees,
 * session conversions — extend it. The fixture running balance is
 * reconstructed forward from a derived opening position; live rows carry
 * the real balanceAfterDisplay straight off the wire.
 *
 * Decomposed into modular units:
 * - ledger/ledgerModel.ts: Types, classifications, converters, filters
 * - ledger/ledgerFormatting.ts: Multi-currency formatting, grouping, netting, CSV export
 */

import { TRANSACTIONS } from '@/lib/data/fixtures';
import { DATA_MODE } from '@/lib/api/client';
import { round2 } from './convertViewModel';
import {
  type WalletLedgerEntry,
  type WalletLedgerTransaction,
  type LedgerFilter,
  KIND_FOR_TX,
  liveEntry,
  newestFirst,
} from './ledger/ledgerModel';

export * from './ledger/ledgerModel';
export * from './ledger/ledgerFormatting';

/** Wallet-only seed rows — top-ups, payouts and protection fees. */
export const SEED_EXTRA: WalletLedgerEntry[] = [
  { id: 'w-1001', kind: 'topup', amount: 100, status: 'completed', date: '2026-09-01', description: 'Top-up — Visa •••• 4521', balance: null },
  { id: 'w-1002', kind: 'fee', amount: -1.9, status: 'completed', date: '2026-09-10', description: 'Buyer Protection — Suede Ankle Boots', balance: null },
  { id: 'w-1003', kind: 'topup', amount: 50, status: 'completed', date: '2026-09-12', description: 'Top-up — Visa •••• 4521', balance: null },
  { id: 'w-1004', kind: 'withdrawal', amount: -60, status: 'completed', date: '2026-09-15', description: 'Withdrawal to bank •••• 4521', balance: null },
  { id: 'w-1005', kind: 'sale', amount: 68.9, status: 'completed', date: '2026-09-19', description: 'Sale — Heavyweight Boxy Hoodie', balance: null },
  { id: 'w-1006', kind: 'fee', amount: -1.0, status: 'completed', date: '2026-09-24', description: 'Buyer Protection — Silk Slip Dress', balance: null },
];

/**
 * Build the full ledger newest-first.
 *
 * Live mode renders only the real wallet_ledger rows the wallet hook
 * fetched — fixture TRANSACTIONS and SEED_EXTRA are never merged in, and
 * the running balance comes straight off the wire (balanceAfterDisplay),
 * never reconstructed.
 *
 * Fixture mode keeps the original statement reconstruction: the balance
 * walk runs over settled entries only, anchored so the newest settled
 * row lands on the current available balance; pending entries keep a
 * null balance until they clear.
 */
export function buildLedger(
  sessionEntries: WalletLedgerEntry[],
  currentAvailable: number,
  transactions: WalletLedgerTransaction[] = [],
): WalletLedgerEntry[] {
  if (DATA_MODE === 'live') {
    return [...transactions.map(liveEntry), ...sessionEntries].sort(newestFirst);
  }

  const fromFixture: WalletLedgerEntry[] = TRANSACTIONS.map((t) => ({
    id: t.id,
    kind: KIND_FOR_TX[t.type],
    amount: t.amount,
    status: t.status,
    date: t.date,
    description: t.description,
    balance: null,
  }));

  const chronological = [...SEED_EXTRA, ...fromFixture, ...sessionEntries].sort(
    (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id),
  );

  const settledSum = chronological
    .filter((e) => e.status === 'completed')
    .reduce((sum, e) => sum + e.amount, 0);
  let running = round2(currentAvailable - settledSum);

  return chronological
    .map((entry) => {
      if (entry.status === 'pending') return entry;
      const balance = round2(running + entry.amount);
      running = balance;
      return { ...entry, balance };
    })
    .reverse();
}

export function filterLedger(
  entries: WalletLedgerEntry[],
  filter: LedgerFilter,
): WalletLedgerEntry[] {
  if (filter === 'all') return entries;
  return entries.filter((e) => e.kind === filter);
}
