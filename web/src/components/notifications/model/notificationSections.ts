import type { NotificationRowModel, NotificationSection } from './notificationTypes';

/**
 * Day bucketing — 's/m/h/now' → Today, 'Yesterday'/'1d' → Yesterday,
 * everything older → Earlier. Mirrors the mobile grouping contract.
 *
 * Hydration-safe by construction: inputs are relative labels or ISO
 * strings, and the day-diff branch is pure epoch arithmetic (UTC ms —
 * no local calendar, no runtime timezone). It also only runs once the
 * feed query has resolved client-side, so no SSR render ever produces
 * these labels.
 */
export function bucketLabel(time: string): string {
  const t = time.trim().toLowerCase();
  if (t === 'now' || t === 'just now') return 'Today';
  const match = /^(\d+)\s*([smhdw])$/.exec(t);
  if (match) {
    const n = Number(match[1]);
    const unit = match[2];
    if (unit === 's' || unit === 'm' || unit === 'h') return 'Today';
    if (unit === 'd') return n <= 1 ? 'Yesterday' : 'Earlier';
    return 'Earlier';
  }
  if (t === 'yesterday' || t === '1d') return 'Yesterday';
  const d = new Date(time);
  if (!Number.isNaN(d.getTime())) {
    const days = (Date.now() - d.getTime()) / 86_400_000;
    return days < 1 ? 'Today' : days < 2 ? 'Yesterday' : 'Earlier';
  }
  return 'Earlier';
}

export const SECTION_ORDER = ['Today', 'Yesterday', 'Earlier'];

/**
 * Row recency for ordering — the wire's `createdAt` first (aggregated
 * cards keep their newest member's stamp), else the compact relative
 * label parsed back to a duration, else the label as a date string.
 * Unparseable rows sink (-Infinity) rather than leapfrog newer ones.
 * Sort is stable, so equal timestamps keep feed order.
 */
export function rowTimeMs(n: NotificationRowModel, now: number): number {
  const wired = n.createdAt ? Date.parse(n.createdAt) : NaN;
  if (!Number.isNaN(wired)) return wired;
  const t = n.time.trim().toLowerCase();
  if (t === 'now' || t === 'just now') return now;
  const match = /^(\d+)\s*([smhdw])$/.exec(t);
  if (match) {
    const unitMs: Record<string, number> = {
      s: 1_000,
      m: 60_000,
      h: 3_600_000,
      d: 86_400_000,
      w: 604_800_000,
    };
    return now - Number(match[1]) * unitMs[match[2]];
  }
  if (t === 'yesterday') return now - 86_400_000;
  const d = Date.parse(n.time);
  return Number.isNaN(d) ? Number.NEGATIVE_INFINITY : d;
}

/** Newest-first within a section — cursor merges and aggregated slots
 *  can both land a newer row behind an older one; the reader contract
 *  is chronological. */
export function sortByRecency(items: NotificationRowModel[]): NotificationRowModel[] {
  const now = Date.now();
  return [...items].sort((a, b) => rowTimeMs(b, now) - rowTimeMs(a, now));
}

export function groupNotifications(items: NotificationRowModel[]): NotificationSection[] {
  const buckets = new Map<string, NotificationRowModel[]>();
  for (const item of items) {
    const label = bucketLabel(item.time);
    const bucket = buckets.get(label);
    if (bucket) bucket.push(item);
    else buckets.set(label, [item]);
  }
  return SECTION_ORDER.map((label) => {
    const section = sortByRecency(buckets.get(label) ?? []);
    return { label, items: section, unreadCount: section.filter((i) => i.unread).length };
  }).filter((s) => s.items.length > 0);
}

/**
 * Section grammar — the mobile contract (notificationViewModels
 * groupNotifications): a "Needs attention" bucket of action-required
 * events leads, then the day buckets Today / Yesterday / Earlier. The
 * earlier type-section experiment (Follows/Orders/Offers/Activity past
 * six rows) was a deviation — filtering by kind already lives in the
 * chips and the overflow sheet.
 */
export function groupNotificationsAuto(items: NotificationRowModel[]): NotificationSection[] {
  const attention = sortByRecency(items.filter((i) => i.requiresAction));
  const rest = items.filter((i) => !i.requiresAction);
  const daySections = groupNotifications(rest);
  if (!attention.length) return daySections;
  return [
    {
      label: 'Needs attention',
      items: attention,
      unreadCount: attention.filter((i) => i.unread).length,
      attention: true,
    },
    ...daySections,
  ];
}
