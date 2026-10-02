import type { NotificationEntry, NotificationKind } from '@/lib/contracts/domain';

/**
 * Aggregation — port of native aggregateNotifications
 * (frontend/src/components/notifications/notificationViewModels.ts).
 * Like/price-drop/new-item events on the same entity within a 24h
 * window collapse into one card ("X and N others liked your item").
 * Orders, resolutions, auctions and follows never aggregate — each is
 * unique or actor-scoped. The grouped card takes the newest member's
 * feed position and fans mutations out to every member id.
 */

/** Kinds that collapse, keyed by the group copy's action verb. The kind
 *  set mirrors native AGGREGATABLE_TYPES by card type — saved-search
 *  matches file under 'new_item' cards natively, so they join here. */
export const AGGREGATED_ACTION: Partial<Record<NotificationKind, string>> = {
  like: 'liked',
  price_drop: 'dropped the price on',
  new_item: 'listed',
  saved_search_match: 'listed',
};

/** Card-type prefix for the legacy fallback key (native `${type}:${id}`
 *  — kind → native card type). */
export const AGGREGATION_TYPE_PREFIX: Partial<Record<NotificationKind, string>> = {
  like: 'like',
  price_drop: 'price',
  new_item: 'new_item',
  saved_search_match: 'new_item',
};

export const AGGREGATION_WINDOW_MS = 24 * 3_600_000;

/** 24h window membership — prefers the real event timestamp; fixture
 *  rows carry only the relative label, where 'now'/s/m/h units are
 *  always <24h (24h+ renders as Yesterday/Nd). */
export function entryWithinWindow(n: NotificationEntry, now: number): boolean {
  const created = n.createdAt ? Date.parse(n.createdAt) : NaN;
  if (!Number.isNaN(created)) return now - created <= AGGREGATION_WINDOW_MS;
  const t = n.time.trim().toLowerCase();
  if (t === 'now' || t === 'just now') return true;
  return /^\d+\s*[smh]$/.test(t);
}

/** Group key — the wire's `aggregationKey` first, then the native legacy
 *  fallback `type:entityId`. A keyless event (no registry key, no
 *  objectRef entity) stays standalone: there is no shared object to
 *  prove the events refer to the same entity. */
export function aggregationGroupKey(n: NotificationEntry): string | null {
  if (n.aggregationKey) return n.aggregationKey;
  const prefix = AGGREGATION_TYPE_PREFIX[n.kind];
  const entityId = n.objectRef?.id;
  return prefix && entityId ? `${prefix}:${entityId}` : null;
}

/** Member recency — the group primary is the newest member. Feed order
 *  is already newest-first, so a missing timestamp keeps encounter order. */
export function entryTimeMs(n: NotificationEntry): number {
  const t = n.createdAt ? Date.parse(n.createdAt) : NaN;
  return Number.isNaN(t) ? 0 : t;
}

/** Compose the grouped card — "X and N others {verb} {object}", the
 *  native copy grammar verbatim. */
export function composeAggregatedEntry(members: NotificationEntry[]): NotificationEntry {
  const sorted = [...members].sort((a, b) => entryTimeMs(b) - entryTimeMs(a));
  const primary = sorted[0];
  // Actor names read newest-first — the lead name is the most recent
  // actor, matching the native sort-then-name ordering.
  const actorNames = sorted
    .map((n) => n.actorDisplayName || n.actorUsername)
    .filter((name): name is string => Boolean(name));
  const uniqueActorNames = [...new Set(actorNames)];
  const count = members.length;
  const othersCount = count - 1;
  const firstActor = uniqueActorNames[0] || 'Someone';
  const action = AGGREGATED_ACTION[primary.kind] ?? 'interacted with';
  const object = primary.objectRef?.label ?? 'your item';
  return {
    ...primary,
    id: `agg:${primary.id}`,
    text: `${firstActor} and ${othersCount} other${othersCount === 1 ? '' : 's'} ${action} ${object}`,
    aggregatedCount: count,
    aggregatedIds: members.map((n) => n.id),
    aggregatedUnreadIds: members.filter((n) => n.unread).map((n) => n.id),
    unread: members.some((n) => n.unread),
  };
}

/**
 * Collapse eligible entries into grouped cards. Input is expected in
 * feed order (newest first) with the read/dismiss overlays already
 * applied — `aggregatedUnreadIds` then describes the members a mark-read
 * actually needs to write. A group card claims its newest member's slot;
 * a group of one returns the member untouched.
 */
export function aggregateNotificationEntries(
  entries: NotificationEntry[],
): NotificationEntry[] {
  const now = Date.now();
  const groups = new Map<string, NotificationEntry[]>();
  const slots = new Map<string, number>();
  const result: (NotificationEntry | null)[] = [];

  for (const entry of entries) {
    const key = AGGREGATED_ACTION[entry.kind] ? aggregationGroupKey(entry) : null;
    if (!key || !entryWithinWindow(entry, now)) {
      result.push(entry);
      continue;
    }
    const group = groups.get(key);
    if (group) {
      group.push(entry);
    } else {
      groups.set(key, [entry]);
      slots.set(key, result.length);
      result.push(null);
    }
  }

  for (const [key, group] of groups) {
    const slot = slots.get(key);
    if (slot !== undefined) {
      result[slot] = group.length > 1 ? composeAggregatedEntry(group) : group[0];
    }
  }

  return result.filter((e): e is NotificationEntry => e !== null);
}
