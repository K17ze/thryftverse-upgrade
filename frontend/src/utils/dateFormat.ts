// Centralised date formatting utilities.
// The app is UK-based, so all formats use 'en-GB' locale and day-first ordering.
// Using a single source of truth prevents inconsistent date rendering across surfaces.

const LOCALE = 'en-GB';

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
export function formatShortDate(value: string | Date | number): string {
  const d = toDate(value);
  if (!d) return '';
  const now = new Date();
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString(LOCALE, sameYear
    ? { day: 'numeric', month: 'short' }
    : { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * "12 Aug 2026" — day + short month + full year.
 * Use for receipts, order details, and formal records.
 */
export function formatFullDate(value: string | Date | number): string {
  const d = toDate(value);
  if (!d) return '';
  return d.toLocaleDateString(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * "12 August 2026" — day + long month + full year.
 * Use for section headers and prominent date labels.
 */
export function formatLongDate(value: string | Date | number): string {
  const d = toDate(value);
  if (!d) return '';
  return d.toLocaleDateString(LOCALE, { day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * "14:30" — 24-hour time without seconds.
 * Use for message timestamps and time-of-day metadata.
 */
export function formatTime(value: string | Date | number): string {
  const d = toDate(value);
  if (!d) return '';
  return d.toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' });
}

/**
 * "12 Aug · 14:30" — short date + time.
 * Use for trade history, ledger rows, and inline timestamps.
 */
export function formatShortDateTime(value: string | Date | number): string {
  const d = toDate(value);
  if (!d) return '';
  return `${formatShortDate(d)} · ${formatTime(d)}`;
}

/**
 * "12 Aug 2026, 14:30" — full date + time.
 * Use for detailed records, receipts, and audit trails.
 */
export function formatFullDateTime(value: string | Date | number): string {
  const d = toDate(value);
  if (!d) return '';
  return d.toLocaleString(LOCALE, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Relative time: "Just now", "5m ago", "3h ago", "2d ago".
 * Falls back to formatShortDate for anything older than 7 days.
 * Use for conversation lists, notifications, and activity feeds.
 */
export function formatRelativeTime(value: string | Date | number): string {
  const d = toDate(value);
  if (!d) return '';
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return formatShortDate(d);
}

/**
 * "Today", "Yesterday", or a formatted date.
 * Use for section headers in grouped lists.
 */
export function formatDayLabel(value: string | Date | number): string {
  const d = toDate(value);
  if (!d) return '';
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return formatLongDate(d);
}

/**
 * Time if today, otherwise short date.
 * Use for conversation list timestamps and activity indicators.
 */
export function formatActivityTimestamp(value: string | Date | number): string {
  const d = toDate(value);
  if (!d) return '';
  const today = new Date();
  if (d.toDateString() === today.toDateString()) {
    return formatTime(d);
  }
  return formatShortDate(d);
}
