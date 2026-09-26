'use client';

/**
 * Ledger view model — the canonical wallet Activity ledger for the web,
 * mirroring mobile's WalletHistoryScreen (one ledger, one name). Fixture
 * TRANSACTIONS are the commerce seed (read-only import); wallet-specific
 * movements — top-ups, payouts, fees, session conversions — extend it.
 * The running balance is reconstructed forward from a derived opening
 * position so the newest settled row lands on the current available
 * balance; pending rows stay out of the walk, like a real statement.
 */

import type { Transaction } from '@/lib/contracts/domain';
import { TRANSACTIONS } from '@/lib/data/fixtures';
import { round2 } from './convertViewModel';

export type LedgerKind =
  | 'topup'
  | 'withdrawal'
  | 'sale'
  | 'purchase'
  | 'fee'
  | 'conversion'
  | 'refund';

export interface WalletLedgerEntry {
  id: string;
  kind: LedgerKind;
  /** Signed GBP amount — credits positive, debits negative. */
  amount: number;
  status: 'completed' | 'pending';
  /** ISO date; day precision for fixture rows, full timestamp for session rows. */
  date: string;
  description: string;
  /** Running balance after this entry; null while pending. */
  balance: number | null;
}

/** Wallet-only seed rows — top-ups, payouts and protection fees. */
const SEED_EXTRA: WalletLedgerEntry[] = [
  { id: 'w-1001', kind: 'topup', amount: 100, status: 'completed', date: '2026-09-01', description: 'Top-up — Visa •••• 4521', balance: null },
  { id: 'w-1002', kind: 'fee', amount: -1.9, status: 'completed', date: '2026-09-10', description: 'Buyer Protection — Suede Ankle Boots', balance: null },
  { id: 'w-1003', kind: 'topup', amount: 50, status: 'completed', date: '2026-09-12', description: 'Top-up — Visa •••• 4521', balance: null },
  { id: 'w-1004', kind: 'withdrawal', amount: -60, status: 'completed', date: '2026-09-15', description: 'Withdrawal to bank •••• 4521', balance: null },
  { id: 'w-1005', kind: 'sale', amount: 68.9, status: 'completed', date: '2026-09-19', description: 'Sale — Heavyweight Boxy Hoodie', balance: null },
  { id: 'w-1006', kind: 'fee', amount: -1.0, status: 'completed', date: '2026-09-24', description: 'Buyer Protection — Silk Slip Dress', balance: null },
];

const KIND_FOR_TX: Record<Transaction['type'], LedgerKind> = {
  sale: 'sale',
  purchase: 'purchase',
  withdrawal: 'withdrawal',
  refund: 'refund',
};

export const LEDGER_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'topup', label: 'Top-ups' },
  { value: 'withdrawal', label: 'Withdrawals' },
  { value: 'sale', label: 'Sales' },
  { value: 'purchase', label: 'Purchases' },
  { value: 'fee', label: 'Fees' },
  { value: 'conversion', label: 'Conversions' },
] as const;

export type LedgerFilter = (typeof LEDGER_FILTERS)[number]['value'];

export const LEDGER_PAGE_SIZE = 12;

/**
 * Build the full ledger newest-first. The balance walk runs over settled
 * entries only; pending entries keep a null balance until they clear.
 */
export function buildLedger(
  sessionEntries: WalletLedgerEntry[],
  currentAvailable: number,
): WalletLedgerEntry[] {
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

/** Net of the entries currently shown — loaded activity, not lifetime. */
export function netOf(entries: WalletLedgerEntry[]): number {
  return round2(entries.reduce((sum, e) => sum + e.amount, 0));
}

// ── Grouping ──────────────────────────────────────────────────────────

/** Group by calendar month, preserving the caller's order (newest first). */
export function groupByMonth(entries: WalletLedgerEntry[]): Array<[string, WalletLedgerEntry[]]> {
  const groups = new Map<string, WalletLedgerEntry[]>();
  for (const entry of entries) {
    const month = entry.date.slice(0, 7);
    const list = groups.get(month);
    if (list) list.push(entry);
    else groups.set(month, [entry]);
  }
  return Array.from(groups.entries());
}

/** "September 2026" — UTC-pinned so SSR and client agree on the label. */
export function formatMonthLabel(month: string): string {
  const d = new Date(`${month}-01T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return month;
  return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/** Signed net of one month's entries — what the header rail shows. */
export function monthNet(entries: WalletLedgerEntry[]): number {
  return round2(entries.reduce((sum, e) => sum + e.amount, 0));
}

// ── CSV export ────────────────────────────────────────────────────────

const TYPE_LABEL: Record<LedgerKind, string> = {
  topup: 'Top-up',
  withdrawal: 'Withdrawal',
  sale: 'Sale',
  purchase: 'Purchase',
  fee: 'Fee',
  conversion: 'Conversion',
  refund: 'Refund',
};

/** RFC-4180-style escaping — quotes, commas and newlines. */
function csvEscape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Real client-side export — the rows currently shown, oldest first. */
export function ledgerToCsv(entries: WalletLedgerEntry[]): string {
  const header = 'Date,Description,Type,Status,Amount,Balance';
  const rows = [...entries]
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
    .map((e) =>
      [
        e.date.slice(0, 10),
        e.description,
        TYPE_LABEL[e.kind],
        e.status,
        e.amount.toFixed(2),
        e.balance == null ? '' : e.balance.toFixed(2),
      ]
        .map((cell) => csvEscape(String(cell)))        .join(','),
    );
  return [header, ...rows].join('\n');
}
