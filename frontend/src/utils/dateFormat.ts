// Centralised date formatting utilities.
// Each function accepts an optional `locale` parameter so callers can render
// dates in the user's active locale. The default locale is 'en-GB' (the app's
// canonical locale) but callers should pass the i18n locale from `getI18nLocale()`
// or `useTranslation().i18n.language` for user-facing surfaces.
//
// Relative-time strings ("Just now", "5m ago", "Today", "Yesterday") use
// `Intl.RelativeTimeFormat` when available, falling back to English for
// older runtimes. This ensures locale-correct pluralisation and phrasing
// without hardcoded English strings.

const DEFAULT_LOCALE = 'en-GB';

// Cache RelativeTimeFormat instances per locale — construction is expensive.
// On Hermes (React Native's JS engine), Intl.RelativeTimeFormat may not
// exist. We guard for that and fall back to a manual formatter.
type RtfLike = { format(value: number, unit: string): string };
const rtfCache = new Map<string, RtfLike>();

const FALLBACK_RTF: RtfLike = {
  format(value: number, unit: string): string {
    const abs = Math.abs(value);
    const isPast = value < 0;
    switch (unit) {
      case 'second':
        return 'just now';
      case 'minute':
        return isPast ? `${abs}m ago` : `in ${abs}m`;
      case 'hour':
        return isPast ? `${abs}h ago` : `in ${abs}h`;
      case 'day':
        if (value === 0) return 'today';
        if (value === -1) return 'yesterday';
        return isPast ? `${abs}d ago` : `in ${abs}d`;
      default:
        return isPast ? `${abs} ${unit} ago` : `in ${abs} ${unit}`;
    }
  },
};

function getRelativeTimeFormatter(locale: string): RtfLike {
  const cached = rtfCache.get(locale);
  if (cached) return cached;
  let formatter: RtfLike;
  if (typeof Intl !== 'undefined' && typeof Intl.RelativeTimeFormat !== 'undefined') {
    formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  } else {
    formatter = FALLBACK_RTF;
  }
  rtfCache.set(locale, formatter);
  return formatter;
}

/**
 * Parse an ISO string or Date into a valid Date, returning null for invalid input.
 */
function toDate(value: string | Date | number): Date | null {
  const d = value instanceof Date ? value : new Date(value);
  return Number.isFinite(d.getTime()) ? d : null;
}

/**
 * "12 Aug" — day + short month. Omits year when same year as now.
 * Use for list rows, timestamps, and compact metadata.
 */
export function formatShortDate(value: string | Date | number, locale: string = DEFAULT_LOCALE): string {
  const d = toDate(value);
  if (!d) return '';
  const now = new Date();
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString(locale, sameYear
    ? { day: 'numeric', month: 'short' }
    : { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * "12 Aug 2026" — day + short month + full year.
 * Use for receipts, order details, and formal records.
 */
export function formatFullDate(value: string | Date | number, locale: string = DEFAULT_LOCALE): string {
  const d = toDate(value);
  if (!d) return '';
  return d.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * "12 August 2026" — day + long month + full year.
 * Use for section headers and prominent date labels.
 */
export function formatLongDate(value: string | Date | number, locale: string = DEFAULT_LOCALE): string {
  const d = toDate(value);
  if (!d) return '';
  return d.toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * "14:30" — 24-hour time without seconds.
 * Use for message timestamps and time-of-day metadata.
 */
export function formatTime(value: string | Date | number, locale: string = DEFAULT_LOCALE): string {
  const d = toDate(value);
  if (!d) return '';
  return d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
}

/**
 * "12 Aug · 14:30" — short date + time.
 * Use for trade history, ledger rows, and inline timestamps.
 */
export function formatShortDateTime(value: string | Date | number, locale: string = DEFAULT_LOCALE): string {
  const d = toDate(value);
  if (!d) return '';
  return `${formatShortDate(d, locale)} · ${formatTime(d, locale)}`;
}

/**
 * "12 Aug 2026, 14:30" — full date + time.
 * Use for detailed records, receipts, and audit trails.
 */
export function formatFullDateTime(value: string | Date | number, locale: string = DEFAULT_LOCALE): string {
  const d = toDate(value);
  if (!d) return '';
  return d.toLocaleString(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Relative time using Intl.RelativeTimeFormat for locale-correct phrasing.
 * Produces "just now", "5 minutes ago", "3 hours ago", "2 days ago", etc.
 * in the user's locale. Falls back to formatShortDate for anything older
 * than 7 days.
 * Use for conversation lists, notifications, and activity feeds.
 */
export function formatRelativeTime(value: string | Date | number, locale: string = DEFAULT_LOCALE): string {
  const d = toDate(value);
  if (!d) return '';
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  const rtf = getRelativeTimeFormatter(locale);

  if (diffMin < 1) return rtf.format(0, 'second');   // "just now" / "just now" (auto)
  if (diffMin < 60) return rtf.format(-diffMin, 'minute');  // "5 minutes ago"
  if (diffHr < 24) return rtf.format(-diffHr, 'hour');      // "3 hours ago"
  if (diffDay < 7) return rtf.format(-diffDay, 'day');      // "2 days ago"
  return formatShortDate(d, locale);
}

/**
 * "Today", "Yesterday", or a formatted date — locale-aware via
 * Intl.RelativeTimeFormat for the day-level labels.
 * Use for section headers in grouped lists.
 */
export function formatDayLabel(value: string | Date | number, locale: string = DEFAULT_LOCALE): string {
  const d = toDate(value);
  if (!d) return '';
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const rtf = getRelativeTimeFormatter(locale);

  if (d.toDateString() === today.toDateString()) return rtf.format(0, 'day');      // "today"
  if (d.toDateString() === yesterday.toDateString()) return rtf.format(-1, 'day');  // "yesterday"
  return formatLongDate(d, locale);
}

/**
 * Time if today, otherwise short date.
 * Use for conversation list timestamps and activity indicators.
 */
export function formatActivityTimestamp(value: string | Date | number, locale: string = DEFAULT_LOCALE): string {
  const d = toDate(value);
  if (!d) return '';
  const today = new Date();
  if (d.toDateString() === today.toDateString()) {
    return formatTime(d, locale);
  }
  return formatShortDate(d, locale);
}
