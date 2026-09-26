'use client';

/**
 * Notifications — /notifications. Port of NotificationsScreen.
 * Sectioned feed with per-section unread counts, per-kind accent icons,
 * an All / Unread / Orders filter, dot-based unread state resolved in
 * local state, and deep links into the item, order or profile surface
 * each row refers to. Small sets group by day (Today / Yesterday /
 * Earlier); past six rows the feed re-groups by type — Follows, Orders,
 * Offers, Activity — Instagram's activity grammar.
 */

import { useMemo, useState } from 'react';
import { useNotifications } from '@/lib/hooks/queries';
import { useNotificationCursor } from '@/lib/store/notificationCursor';
import { NOTIFICATION_FEED } from '@/lib/data/fixtures';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { NotificationRow } from '@/components/notifications/NotificationRow';
import { NotificationsSkeleton } from '@/components/notifications/NotificationsSkeleton';
import {
  filterNotifications,
  fromLegacyNotification,
  fromNotificationEntry,
  groupNotificationsAuto,
  NOTIFICATION_FILTERS,
  type NotificationFilter,
} from '@/components/notifications/viewModel';

export default function NotificationsPage() {
  const { data, isLoading } = useNotifications();
  const [filter, setFilter] = useState<NotificationFilter>('all');
  // Read cursor — shared with the header badge via the persisted store;
  // the feed's unread flags are the source rows, clearedIds the overlay.
  const clearedIds = useNotificationCursor((s) => s.clearedIds);
  const markRead = useNotificationCursor((s) => s.markRead);
  const markAllRead = useNotificationCursor((s) => s.markAllRead);
  const clearedSet = useMemo(() => new Set(clearedIds), [clearedIds]);

  const items = useMemo(() => {
    const feed = NOTIFICATION_FEED.map(fromNotificationEntry);
    const legacy = (data ?? []).map(fromLegacyNotification);
    return [...feed, ...legacy].map((n) => ({
      ...n,
      unread: n.unread && !clearedSet.has(n.id),
    }));
  }, [data, clearedSet]);

  const unreadCount = useMemo(() => items.filter((n) => n.unread).length, [items]);

  const groups = useMemo(
    () => groupNotificationsAuto(filterNotifications(items, filter)),
    [items, filter],
  );

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-screen-title font-bold text-text-primary">
          Notifications
          {unreadCount > 0 ? (
            <span className="tnum ml-2 align-middle text-meta font-semibold text-text-muted">
              {unreadCount} unread
            </span>
          ) : null}
        </h1>
        {unreadCount > 0 ? (
          <Button variant="quiet" size="sm" onClick={markAllRead}>
            Mark all read
          </Button>
        ) : null}
      </div>

      {/* Filter — pill tabs, All / Unread / Orders (mobile parity) */}
      <div className="mt-3 flex gap-2" role="tablist" aria-label="Filter notifications">
        {NOTIFICATION_FILTERS.map((f) => (
          <Chip key={f.key} selected={filter === f.key} onClick={() => setFilter(f.key)}>
            {f.label}
          </Chip>
        ))}
      </div>

      {isLoading ? (
        <NotificationsSkeleton />
      ) : groups.length === 0 ? (
        filter === 'all' ? (
          <EmptyState
            icon="notifications"
            title="No notifications"
            subtitle="Offers, orders and new followers will show up here."
          />
        ) : (
          <EmptyState
            icon="notifications"
            title={filter === 'unread' ? 'All caught up' : 'No order updates'}
            subtitle={
              filter === 'unread'
                ? 'You have no unread notifications.'
                : 'Order and offer activity will show up here.'
            }
            compact
          />
        )
      ) : (
        groups.map((g) => (
          <section key={g.label} aria-label={g.label} className="mt-6">
            <div className="flex items-center gap-2 px-2">
              <h2 className="text-label font-semibold uppercase tracking-wider text-text-muted">
                {g.label}
              </h2>
              {g.unreadCount > 0 ? (
                <span className="tnum flex h-5 min-w-5 items-center justify-center rounded-full border border-border px-1.5 text-meta text-text-muted">
                  {g.unreadCount}
                </span>
              ) : null}
            </div>
            <div className="mt-1 divide-y divide-border-subtle">
              {g.items.map((n) => (
                <NotificationRow key={n.id} notification={n} onOpen={markRead} />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
