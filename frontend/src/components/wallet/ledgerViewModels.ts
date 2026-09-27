import type { WalletLedgerItem } from '../../services/walletApi';
import { CURRENCIES, type SupportedCurrencyCode } from '../../constants/currencies';
import type { CurrencyDisplayMode } from '../../utils/currency';

// Ledger view models — month rails, signed nets and the CSV export,
// mirroring web/src/components/wallet/ledgerViewModel.ts. The wallet
// ledger is a committed double-entry record, so every row carries a
// real running balance; there is no pending state in this payload.

/** Direction-aware row grammar shared by the full list and the preview. */
export const LEDGER_KIND_META: Record<
  string,
  { label: string; icon: string; direction: 'in' | 'out' | 'neutral' }
> = {
  MINT: { label: 'Top-up', icon: 'arrow-down-circle', direction: 'in' },
  BURN: { label: 'Redemption', icon: 'arrow-up-circle-outline', direction: 'out' },
  BUY_1ZE: { label: 'Bought 1ZE', icon: 'arrow-down-circle', direction: 'in' },
  CONVERT_TO_FIAT: { label: 'Converted to cash', icon: 'swap-horizontal', direction: 'out' },
  CONVERT_FROM_1ZE: { label: 'Converted from 1ZE', icon: 'swap-horizontal', direction: 'in' },
  FEE: { label: 'Fee', icon: 'remove-circle-outline', direction: 'out' },
  PURCHASE: { label: 'Purchase', icon: 'bag-outline', direction: 'out' },
  CO_OWN_TRADE: { label: 'Co-Own trade', icon: 'swap-horizontal', direction: 'neutral' },
  COMMERCE_ORDER: { label: 'Purchase', icon: 'bag-outline', direction: 'out' },
  COMMERCE_REFUND: { label: 'Refund', icon: 'return-up-back', direction: 'in' },
  AUCTION_SETTLEMENT: { label: 'Auction win', icon: 'trophy', direction: 'in' },
  PAYOUT: { label: 'Payout', icon: 'cash-outline', direction: 'out' },
  TRANSFER_SENT: { label: 'Transfer sent', icon: 'arrow-forward-outline', direction: 'out' },
  TRANSFER_RECEIVED: { label: 'Transfer received', icon: 'arrow-back', direction: 'in' } };

export function getLedgerKindMeta(kind: string): { label: string; icon: string; direction: 'in' | 'out' | 'neutral' } {
  return LEDGER_KIND_META[kind] ?? { label: kind, icon: 'ellipse-outline', direction: 'neutral' };
}

export function isSupportedLedgerCurrency(code: string | undefined): code is SupportedCurrencyCode {
  return code != null && code in CURRENCIES;
}

/** "September 2026" from a ledger timestamp. */
export function formatLedgerMonthLabel(createdAt: string): string {
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return createdAt;
  return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

/** Group by calendar month, preserving the caller's order (newest first). */
export function groupLedgerByMonth(items: WalletLedgerItem[]): Array<{ key: string; title: string; items: WalletLedgerItem[] }> {
  const groups = new Map<string, WalletLedgerItem[]>();
  for (const item of items) {
    const d = new Date(item.createdAt);
    const key = Number.isNaN(d.getTime())
      ? item.createdAt
      : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const list = groups.get(key);
    if (list) list.push(item);
    else groups.set(key, [item]);
  }
  return Array.from(groups.entries()).map(([key, groupItems]) => ({
    key,
    title: formatLedgerMonthLabel(groupItems[0].createdAt),
    items: groupItems }));
}

/** Signed display net per asset for a set of rows — 1ZE units and fiat
 *  major units never mix into one number. */
export function ledgerAssetNets(items: WalletLedgerItem[]): { ize: number; fiat: number } {
  let ize = 0;
  let fiat = 0;
  for (const item of items) {
    if (item.asset === '1ZE') ize += item.amountDisplay;
    else fiat += item.amountDisplay;
  }
  return { ize, fiat };
}

/** "+2.500 1ZE · −£3.20" — the signed nets a month rail (or summary)
 *  shows. Only non-zero segments render; an all-zero month shows nothing. */
export function formatLedgerNets(
  items: WalletLedgerItem[],
  formatFiat: (amount: number, currency: SupportedCurrencyCode, options?: { displayMode?: CurrencyDisplayMode }) => string
): string {
  const { ize, fiat } = ledgerAssetNets(items);
  const parts: string[] = [];
  if (ize !== 0) parts.push(`${ize > 0 ? '+' : '\u2212'}${Math.abs(ize).toFixed(3)} 1ZE`);
  if (fiat !== 0) {
    const currency = items.find((item) => item.asset !== '1ZE')?.currency;
    const fiatLabel = formatFiat(Math.abs(fiat), isSupportedLedgerCurrency(currency) ? currency : 'GBP', { displayMode: 'fiat' });
    parts.push(`${fiat > 0 ? '+' : '\u2212'}${fiatLabel}`);
  }
  return parts.join(' \u00b7 ');
}

// ── CSV export ────────────────────────────────────────────────────────

/** RFC-4180-style escaping — quotes, commas and newlines. */
function csvEscape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Real client-side export — the loaded rows, oldest first. Mirrors the
 *  web HistoryView export shape (Date, Description, Type, Amount, Balance). */
export function ledgerToCsv(items: WalletLedgerItem[]): string {
  const header = 'Date,Description,Type,Asset,Amount,Balance';
  const rows = [...items]
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() || a.id - b.id)
    .map((item) => {
      const precision = item.asset === '1ZE' ? 3 : 2;
      return [
        item.createdAt.slice(0, 10),
        getLedgerKindMeta(item.kind).label,
        item.kind,
        item.asset,
        item.amountDisplay.toFixed(precision),
        item.balanceAfterDisplay.toFixed(precision) ]
        .map((cell) => csvEscape(String(cell)))
        .join(',');
    });
  return [header, ...rows].join('\n');
}
