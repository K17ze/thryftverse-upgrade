import type { LedgerKind, WalletLedgerEntry } from './ledgerModel';

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
