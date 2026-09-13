import type { ThemeColors } from '../../theme/ThemeContext';
import { formatFiatAmount } from '../../utils/currency';
import type { SupportedCurrencyCode } from '../../constants/currencies';
import type { Completeness } from '../../services/creatorAnalyticsApi';

// ── Helpers ──────────────────────────────────────────────────────────
export function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(n);
}

export function formatRate(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`;
}

export function formatDelta(changeRatio: number | null): string {
  if (changeRatio === null) return '';
  const pct = changeRatio * 100;
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct.toFixed(1)}%`;
}

export function formatMoney(minor: number, currencyCode: SupportedCurrencyCode): string {
  const sign = minor < 0 ? '-' : '';
  const abs = Math.abs(minor);
  const major = abs / 100;
  return `${sign}${formatFiatAmount(major, currencyCode)}`;
}

export function shortDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export function formatDateRange(range: { start: string; endExclusive: string }): string {
  const s = new Date(range.start);
  const e = new Date(range.endExclusive);
  e.setUTCDate(e.getUTCDate() - 1); // endExclusive is exclusive — display the last included day
  const fmt = (d: Date) => d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  return `${fmt(s)} – ${fmt(e)}`;
}

export function completenessLabel(c: Completeness): string {
  switch (c) {
    case 'complete': return 'Up to date';
    case 'provisional': return 'Provisional';
    case 'delayed': return 'Delayed';
    case 'unavailable': return 'No data yet';
  }
}

export function completenessColor(c: Completeness, colors: ThemeColors): string {
  switch (c) {
    case 'complete': return colors.success;
    case 'provisional': return colors.warning;
    case 'delayed': return colors.warning;
    case 'unavailable': return colors.textMuted;
  }
}

export function entryTypeLabel(t: string): string {
  switch (t) {
    case 'estimated': return 'Estimated';
    case 'earned': return 'Earned';
    case 'held': return 'Held';
    case 'adjustment': return 'Adjustment';
    case 'refund_reversal': return 'Refund';
    case 'chargeback_reversal': return 'Chargeback';
    case 'payout': return 'Payout';
    default: return t;
  }
}
