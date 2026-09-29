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
 */

import type { Transaction } from '@/lib/contracts/domain';
import { TRANSACTIONS } from '@/lib/data/fixtures';
import { DATA_MODE } from '@/lib/api/client';
import { round2 } from './convertViewModel';

export type LedgerKind =
  | 'topup'
  | 'withdrawal'
  | 'sale'
  | 'purchase'
  | 'fee'
  | 'conversion'
  | 'refund'
  | 'transfer'
  /** Rows that fit no named category — generic CREDIT/DEBIT legs, Co-Own
   *  movements, unknown kinds. Shown under All; never mislabeled. */
  | 'other';

export interface WalletLedgerEntry {
  id: string;
  kind: LedgerKind;
  /** Signed amount in `currency` — credits positive, debits negative. */
  amount: number;
  /** The row's own currency — '1ZE' for token legs, the per-leg ISO code
   *  for fiat legs. Never assumed: a EUR FX credit renders EUR, not GBP.
   *  Undefined falls back to GBP (fixture/session rows are GBP-denominated). */
  currency?: string;
  /** Asset bucket — '1ZE' formats with the 3-dp token formatter, anything
   *  else (including undefined) renders through Intl with `currency`. */
  asset?: '1ZE' | 'FIAT';
  status: 'completed' | 'pending';
  /** ISO date; day precision for fixture rows, full timestamp for session rows. */
  date: string;
  description: string;
  /** Running balance in `currency` — the wire's balanceAfterDisplay on
   *  live rows, the reconstructed statement walk on fixture rows; null
   *  while pending. */
  balance: number | null;
  /** wallet_ledger ref_type ('commerce_order', 'p2p_transfer',
   *  'withdrawal', ...) — the wire field that lets the detail drawer link
   *  the underlying record. Absent on fixture/session rows. */
  sourceType?: string;
  /** wallet_ledger ref_id — the entity the movement settles against. */
  sourceId?: string | null;
  /** wallet_ledger tx_id — the real server reference shared across the
   *  legs of one movement. Shown in the detail drawer; omitted when empty. */
  txId?: string | null;
  /** Raw wallet_ledger kind ('FX_CONVERT_DEBIT', 'TRANSFER_SEND', ...) —
   *  kept so the drawer can show the truthful server vocabulary. */
  movementKind?: string;
}

/**
 * Live ledger row — the wallet_ledger wire projection carried through
 * useWalletData without loss. `amount` is the UNSIGNED major-unit value in
 * `currency` (from amountDisplay — the sign lives in `direction`), `status`
 * is 'posted' for committed legs, and `description` stays null: the view
 * model derives the human label from `kind` (wallet_ledger legs carry no
 * prose of their own). `currency` is the leg's own code — '1ZE' for token
 * legs, the per-leg ISO code for fiat legs.
 *
 * The legacy ledger_entries fields (sourceType/lineType/direction) are
 * retained in the envelope: for wallet_ledger rows they carry the
 * ref_type/kind/direction equivalents so older consumers keep working.
 */
export interface WalletLedgerTransaction {
  id: string;
  /** wallet_ledger ref_type — 'commerce_order', 'p2p_transfer',
   *  'withdrawal', 'fx_quote', ... ('' when the leg carries none). */
  sourceType: string;
  /** wallet_ledger kind — 'FX_CONVERT_DEBIT', 'TRANSFER_SEND',
   *  'WITHDRAWAL_RESERVED', 'SALE', ... */
  lineType: string;
  /** wallet_ledger ref_id — the order / transfer / withdrawal the leg
   *  settles against. Null when the wire row carries none. */
  sourceId: string | null;
  /** Unsigned major-unit amount in `currency` — sign comes from `direction`. */
  amount: number;
  /** The leg's own currency — '1ZE' or an ISO-4217 code. */
  currency: string;
  direction: string;
  status: string;
  createdAt: string;
  description: string | null;
  /** Raw wallet_ledger kind — drives the honest movement label. */
  kind?: string;
  refType?: string | null;
  refId?: string | null;
  /** Server transaction reference shared across the legs of a movement. */
  txId?: string | null;
  /** '1ZE' | 'FIAT' — selects the token vs fiat formatter. */
  asset?: '1ZE' | 'FIAT' | string;
  /** balanceAfterDisplay — the real running pocket balance in `currency`
   *  after this leg. Null when the wire row carries none. */
  balanceAfter?: number | null;
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
  { value: 'transfer', label: 'Transfers' },
  { value: 'sale', label: 'Sales' },
  { value: 'purchase', label: 'Purchases' },
  { value: 'fee', label: 'Fees' },
  { value: 'conversion', label: 'Conversions' },
] as const;

export type LedgerFilter = (typeof LEDGER_FILTERS)[number]['value'];

export const LEDGER_PAGE_SIZE = 12;

// ── wallet_ledger kind vocabulary ─────────────────────────────────────
//
// Every kind the backend CHECK admits (plus the legacy spellings native
// still renders) maps to an honest human label. An unknown/new kind falls
// back to 'Wallet movement' — never a crash, never a blank row, never a
// mislabeled category.

const MOVEMENT_LABELS: Record<string, string> = {
  CREDIT: 'Credit',
  DEBIT: 'Debit',
  TRANSFER_SEND: 'Sent',
  TRANSFER_RECEIVE: 'Received',
  TRANSFER_SENT: 'Sent', // legacy spelling
  TRANSFER_RECEIVED: 'Received', // legacy spelling
  MINT: 'Top-up',
  BURN: 'Redemption',
  WITHDRAWAL_RESERVED: 'Withdrawal reserved',
  WITHDRAWAL_SETTLED: 'Withdrawal settled',
  WITHDRAWAL_REVERSED: 'Withdrawal reversed',
  WITHDRAWAL_FEE: 'Withdrawal fee',
  SALE: 'Sale',
  PURCHASE: 'Purchase',
  CO_OWN_TRADE: 'Co-Own trade',
  CO_OWN_DRIP: 'Co-Own distribution',
  FEE: 'Fee',
  REDEMPTION: 'Redemption',
  ONEZE_REFUND: 'Refund',
  CONVERT_TO_FIAT: 'Converted to cash',
  CONVERT_FROM_1ZE: 'Converted from 1ZE',
  CREATOR_EARNING_PAYOUT: 'Creator payout',
  FX_CONVERT_DEBIT: 'Exchanged →',
  FX_CONVERT_CREDIT: 'Exchanged ←',
  FX_FEE: 'Exchange fee',
  BUY_1ZE: 'Bought 1ZE',
  // Legacy/native spellings older legs can still carry.
  COMMERCE_ORDER: 'Purchase',
  COMMERCE_REFUND: 'Refund',
  AUCTION_SETTLEMENT: 'Auction win',
  PAYOUT: 'Payout',
};

/** kind → the label the row and the detail drawer show. */
export function ledgerMovementLabel(kind: string | null | undefined): string {
  if (kind && MOVEMENT_LABELS[kind]) return MOVEMENT_LABELS[kind];
  return 'Wallet movement';
}

const MOVEMENT_CATEGORY: Record<string, LedgerKind> = {
  MINT: 'topup',
  TRANSFER_SEND: 'transfer',
  TRANSFER_RECEIVE: 'transfer',
  TRANSFER_SENT: 'transfer',
  TRANSFER_RECEIVED: 'transfer',
  BURN: 'withdrawal',
  REDEMPTION: 'withdrawal',
  WITHDRAWAL_RESERVED: 'withdrawal',
  WITHDRAWAL_SETTLED: 'withdrawal',
  WITHDRAWAL_REVERSED: 'withdrawal',
  WITHDRAWAL_FEE: 'fee',
  SALE: 'sale',
  AUCTION_SETTLEMENT: 'sale',
  CREATOR_EARNING_PAYOUT: 'sale',
  PURCHASE: 'purchase',
  COMMERCE_ORDER: 'purchase',
  FEE: 'fee',
  FX_FEE: 'fee',
  ONEZE_REFUND: 'refund',
  COMMERCE_REFUND: 'refund',
  CONVERT_TO_FIAT: 'conversion',
  CONVERT_FROM_1ZE: 'conversion',
  FX_CONVERT_DEBIT: 'conversion',
  FX_CONVERT_CREDIT: 'conversion',
  BUY_1ZE: 'conversion',
  PAYOUT: 'withdrawal',
};

/** wallet_ledger kind → the closed category the chips/icons classify on.
 *  Generic CREDIT/DEBIT legs, Co-Own movements and unknown kinds land on
 *  'other' — visible under All, never misfiled. */
export function ledgerKindForMovement(kind: string | null | undefined): LedgerKind {
  if (kind && MOVEMENT_CATEGORY[kind]) return MOVEMENT_CATEGORY[kind];
  return 'other';
}
/**
 * Classify a legacy ledger_entries row onto the closed kind vocabulary —
 * kept for rows that arrive in the old shape (line_type/source_type
 * without a wallet_ledger kind). Mirrors mobile's BalanceHistoryScreen
 * precedence — line_type is the finer signal and is checked before
 * source_type.
 */
function kindForLive(sourceType: string, lineType: string, direction: string): LedgerKind {
  const lt = lineType.toLowerCase();
  const st = sourceType.toLowerCase();
  if (lt.includes('refund') || st === 'refund') return 'refund';
  if (
    lt.includes('withdrawal') ||
    lt.includes('payout') ||
    st === 'withdrawal' ||
    st === 'payout'
  ) {
    return 'withdrawal';
  }
  if (lt.includes('seller_payable') || lt.includes('earning') || st === 'sale') return 'sale';
  if (st === 'fx_conversion' || lt.includes('conversion')) return 'conversion';
  if (lt.includes('buyer') || st === 'purchase' || st === 'order_payment') return 'purchase';
  if (lt.includes('fee') || lt.includes('commission') || st === 'fee') return 'fee';
  if (
    lt.includes('topup') ||
    lt.includes('top_up') ||
    lt.includes('deposit') ||
    st === 'topup' ||
    st === 'deposit'
  ) {
    return 'topup';
  }
  if (lt.includes('transfer')) return 'transfer';
  return direction === 'credit' ? 'topup' : 'other';
}

/** 'seller_payable_release' → 'Seller Payable Release' — the humanized
 *  fallback label for legacy rows that carry prose-free types. */
function humanizeLineType(value: string): string {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Map one live wallet_ledger row to a view entry. The wire amount is
 * unsigned — direction carries the sign. `balance` is the wire's own
 * balanceAfterDisplay (a real running balance per pocket), not a
 * reconstruction. The row title is the honest kind label; the raw kind,
 * ref and tx references ride along for the detail drawer.
 */
function liveEntry(t: WalletLedgerTransaction): WalletLedgerEntry {
  const isWalletRow = t.asset != null || t.kind != null;
  return {
    id: t.id,
    kind: isWalletRow
      ? ledgerKindForMovement(t.kind)
      : kindForLive(t.sourceType, t.lineType, t.direction),
    // Wire amount is unsigned — direction carries the sign.
    amount: round2(t.direction === 'credit' ? Math.abs(t.amount) : -Math.abs(t.amount)),
    currency: t.currency,
    asset: t.asset === '1ZE' ? '1ZE' : 'FIAT',
    // wallet_ledger rows are committed facts; only an explicit 'pending'
    // keeps the pending badge. 'posted' renders as settled.
    status: t.status === 'pending' ? 'pending' : 'completed',
    date: t.createdAt,
    description: isWalletRow
      ? ledgerMovementLabel(t.kind)
      : t.description?.trim() || humanizeLineType(t.lineType || t.sourceType),
    balance: typeof t.balanceAfter === 'number' ? t.balanceAfter : null,
    sourceType: t.refType ?? t.sourceType,
    sourceId: t.refId ?? t.sourceId,
    txId: t.txId ?? null,
    movementKind: t.kind,
  };
}

/** Newest-first, with a numeric-aware id tie-break for equal timestamps. */
function newestFirst(a: WalletLedgerEntry, b: WalletLedgerEntry): number {
  const byDate = b.date.localeCompare(a.date);
  if (byDate !== 0) return byDate;
  const na = Number(a.id);
  const nb = Number(b.id);
  if (Number.isFinite(na) && Number.isFinite(nb)) return nb - na;
  return b.id.localeCompare(a.id);
}

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

// ── Per-currency money formatting & totals ────────────────────────────
//
// The canonical ledger is multi-currency: a EUR FX credit, a GBP sale leg
// and a 1ZE transfer can sit side by side. Amounts never sum across
// currencies — totals group per currency, and every row formats with its
// own currency code.

/** Format a ledger amount in the row's own currency — Intl carries the
 *  symbol and exponent for FIAT legs (GBP→2dp, JPY→0dp); token legs use
 *  the 3-dp 1ZE grammar native renders. */
export function formatLedgerMoney(
  amount: number,
  currency?: string,
  asset?: string,
): string {
  if (asset === '1ZE') return `${amount.toFixed(3)} 1ZE`;
  const code = (currency ?? 'GBP').toUpperCase();
  try {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: code,
    }).format(amount);
  } catch {
    // Unknown/unsupported code — render the number beside its code
    // rather than mislabeling it as another currency.
    return `${amount.toFixed(2)} ${code}`;
  }
}

/** Signed variant — '+£3.20', '−€1.05', '+2.500 1ZE'. Zero renders unsigned. */
export function signedLedgerMoney(
  amount: number,
  currency?: string,
  asset?: string,
): string {
  const sign = amount > 0 ? '+' : amount < 0 ? '−' : '';
  return `${sign}${formatLedgerMoney(Math.abs(amount), currency, asset)}`;
}

export interface CurrencyNet {
  currency: string;
  asset?: '1ZE' | 'FIAT';
  net: number;
}

/** Signed net per currency — the only honest total over a mixed ledger.
 *  Callers render one segment per currency, never a blended figure. */
export function netsByCurrency(entries: WalletLedgerEntry[]): CurrencyNet[] {
  const buckets = new Map<string, CurrencyNet>();
  for (const e of entries) {
    const code = (e.currency ?? 'GBP').toUpperCase();
    const bucket = buckets.get(code) ?? { currency: code, asset: e.asset, net: 0 };
    bucket.net += e.amount;
    buckets.set(code, bucket);
  }
  return [...buckets.values()];
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

// ── CSV export ────────────────────────────────────────────────────────

const TYPE_LABEL: Record<LedgerKind, string> = {
  topup: 'Top-up',
  withdrawal: 'Withdrawal',
  sale: 'Sale',
  purchase: 'Purchase',
  fee: 'Fee',
  conversion: 'Conversion',
  refund: 'Refund',
  transfer: 'Transfer',
  other: 'Wallet movement',
};

/** RFC-4180-style escaping — quotes, commas and newlines. */
function csvEscape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Real client-side export — the rows currently shown, oldest first.
 *  Currency rides on every row: the ledger is multi-currency, so an
 *  amount is meaningless without its code. 1ZE legs export at token
 *  precision (3dp), fiat legs at 2dp. */
export function ledgerToCsv(entries: WalletLedgerEntry[]): string {
  const header = 'Date,Description,Type,Asset,Currency,Amount,Balance';
  const rows = [...entries]
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
    .map((e) =>
      [
        e.date.slice(0, 10),
        e.description,
        e.movementKind ?? TYPE_LABEL[e.kind] ?? e.kind,
        e.asset ?? 'FIAT',
        (e.currency ?? 'GBP').toUpperCase(),
        e.asset === '1ZE' ? e.amount.toFixed(3) : e.amount.toFixed(2),
        e.balance == null
          ? ''
          : e.asset === '1ZE'
            ? e.balance.toFixed(3)
            : e.balance.toFixed(2),
      ]
        .map((cell) => csvEscape(String(cell)))
        .join(','),
    );
  return [header, ...rows].join('\n');
}
