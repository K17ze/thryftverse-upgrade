'use client';

/**
 * Notifications — /notifications. Port of NotificationsScreen.
 * Structured useNotificationFeed() feed — cursor-paginated in live mode,
 * the authored feed as one page in fixture mode —
 * per-kind accent icons, dot-based unread resolved through the persisted
 * read cursor (live mode also posts the read edge), deep links into the
 * item, order or profile surface each row refers to, an All / Unread /
 * Orders filter, and the mobile section grammar: day buckets for small
 * sets, type sections (Follows / Orders / Offers / Activity) past six
 * rows. Loading skeletons, a real error/retry state and honest empties
 * cover the full state machine.
 */

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useNotificationFeed } from '@/components/notifications/useNotificationFeed';
import { DATA_MODE } from '@/lib/api/client';
import { useNotificationCursor } from '@/lib/store/notificationCursor';
import { useHydrated } from '@/lib/store/useStore';
import { isQuietHoursActive, useSettingsPrefs } from '@/lib/store/settingsPrefs';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { StateGate } from '@/components/flagship/StateGate';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { NotificationRow } from '@/components/notifications/NotificationRow';
import { NotificationFilterSheet } from '@/components/notifications/NotificationFilterSheet';
import { NotificationsSkeleton } from '@/components/notifications/NotificationsSkeleton';
import {
  filterNotifications,
  fromNotificationEntry,
  groupNotificationsAuto,
  notificationFilterCounts,
  notificationFilterEmpty,
  NOTIFICATION_FILTERS,
  type NotificationFilter,
} from '@/components/notifications/viewModel';
import type { NotificationEntry } from '@/lib/contracts/domain';

export default function NotificationsPage() {
  const qc = useQueryClient();
  const router = useRouter();
  const hydrated = useHydrated();
  const {
    data: feed,
    isLoading,
    isError,
    refetch,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
  } = useNotificationFeed();
  // Flatten the paged feed — dedupe by id, first occurrence wins.
  // Boundary-shift between cursor fetches can repeat a row across pages;
  // a duplicated id would render twice and collide on React keys. Every
  // downstream derivation (read overlay, filters, grouping) works on the
  // merged entry list.
  const data = useMemo(() => {
    if (!feed) return undefined;
    const seen = new Set<string>();
    const entries: NotificationEntry[] = [];
    for (const page of feed.pages) {
      for (const entry of page.entries) {
        if (seen.has(entry.id)) continue;
        seen.add(entry.id);
        entries.push(entry);
      }
    }
    return entries;
  }, [feed]);
  const [filter, setFilter] = useState<NotificationFilter>('all');
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  // Quiet-hours indicator — the persisted preference decides; gated behind
  // hydration so SSR and the first client render agree.
  const quietHours = useSettingsPrefs((s) => s.quietHours);
  const quietActive = hydrated && isQuietHoursActive(quietHours);
  // Read cursor — the persisted overlay the header badge shares; live
  // writes go to the server endpoints inside the store actions.
  const clearedIds = useNotificationCursor((s) => s.clearedIds);
  const markRead = useNotificationCursor((s) => s.markRead);
  const markAllRead = useNotificationCursor((s) => s.markAllRead);
  const syncUnreadSource = useNotificationCursor((s) => s.syncUnreadSource);
  const clearedSet = useMemo(() => new Set(clearedIds), [clearedIds]);

  // Re-seed the shared source rows whenever the feed lands so Mark-all
  // clears exactly what this fetch carried (both modes).
  useEffect(() => {
    if (data) syncUnreadSource(data.filter((n) => n.unread).map((n) => n.id));
  }, [data, syncUnreadSource]);

  const items = useMemo(
    () =>
      (data ?? []).map((n) => ({
        ...fromNotificationEntry(n),
        // Persisted overlay applies only after hydration — SSR and the
        // first client render stay deterministic on the source flags.
        unread: n.unread === true && !(hydrated && clearedSet.has(n.id)),
      })),
    [data, clearedSet, hydrated],
  );

  const unreadCount = useMemo(() => items.filter((n) => n.unread).length, [items]);

  const groups = useMemo(
    () => groupNotificationsAuto(filterNotifications(items, filter)),
    [items, filter],
  );

  // Per-filter counts for the sheet — the dataset's own derivation, so a
  // filter with nothing behind it reads no count.
  const filterCounts = useMemo(() => notificationFilterCounts(items), [items]);

  const handleMarkAll = () => {
    markAllRead();
    // Live mode re-reads the server flags so the cursor stays a mirror,
    // not the only truth. Both feed readers re-fetch — the flat
    // notification-entries reader drives the header badge.
    if (DATA_MODE === 'live') {
      void qc.invalidateQueries({ queryKey: ['notification-entries'] });
      void qc.invalidateQueries({ queryKey: ['notification-feed'] });
    }
  };

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
        <div className="flex items-center gap-1">
          {unreadCount > 0 ? (
            <Button variant="quiet" size="sm" onClick={handleMarkAll}>
              Mark all read
            </Button>
          ) : null}
          <IconButton
            name="filter"
            aria-label="Filter notifications"
            size={20}
            onClick={() => setFilterSheetOpen(true)}
          />
        </div>
      </div>

      {/* Quiet-hours banner — only when the persisted window is active
          right now (mobile parity). Tapping opens notification settings
          where the window is authored. */}
      {quietActive ? (
        <button
          type="button"
          onClick={() => router.push('/settings/notifications')}
          aria-label={`Quiet hours on — notifications muted until ${quietHours.endHour}:00. Open notification settings.`}
          className="pressable mt-3 flex w-full items-center gap-2 border-t border-b border-hairline py-2 text-left"
        >
          <Icon name="moon" size={14} className="text-text-muted" />
          <span className="text-meta text-text-secondary">
            Quiet hours on — muted until {quietHours.endHour}:00.
          </span>
        </button>
      ) : null}

      {/* Filter — toggle chips, All / Unread / Orders (mobile parity).
          aria-pressed toggles, not tabs: no tabpanels exist. */}
      <div className="mt-3 flex gap-2" role="group" aria-label="Filter notifications">
        {NOTIFICATION_FILTERS.map((f) => (
          <Chip key={f.key} selected={filter === f.key} onClick={() => setFilter(f.key)}>
            {f.label}
          </Chip>
        ))}
      </div>

      {/* StateGate resolves loading/error/offline from the notifications
          registry entry (offline reads "You're offline"); the per-filter
          empties stay bespoke — notificationFilterEmpty carries context
          the registry doesn't have. */}
      <StateGate
        domain="notifications"
        isLoading={isLoading}
        isError={isError}
        skeleton={<NotificationsSkeleton />}
        onRetry={() => void refetch()}
      >
        {groups.length === 0 ? (
        filter === 'all' ? (
          <EmptyState
            icon="notifications"
            title="No notifications"
            subtitle="Offers, orders and new followers will show up here."
          />
        ) : (
          <EmptyState
            icon="notifications"
            title={notificationFilterEmpty(filter).title}
            subtitle={notificationFilterEmpty(filter).subtitle}
            compact
          />
        )
      ) : (
        <>
          {groups.map((g) => (
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
          ))}

          {/* Feed pagination — the service's nextCursor drives Load more;
              a failed page gets an honest retry, an exhausted feed ends
              quietly. */}
          {hasNextPage || isFetchingNextPage || isFetchNextPageError ? (
            <div className="mt-6 flex justify-center">
              <Button
                variant="outline"
                size="sm"
                disabled={isFetchingNextPage}
                onClick={() => void fetchNextPage()}
              >
                {isFetchingNextPage
                  ? 'Loading…'
                  : isFetchNextPageError
                    ? 'Couldn’t load more — try again'
                    : 'Load more'}
              </Button>
            </div>
          ) : null}
        </>
      )}
      </StateGate>

      <NotificationFilterSheet
        open={filterSheetOpen}
        onClose={() => setFilterSheetOpen(false)}
        activeFilter={filter}
        counts={filterCounts}
        onSelect={(f) => {
          setFilter(f);
          setFilterSheetOpen(false);
        }}
      />
    </div>
  );
}
