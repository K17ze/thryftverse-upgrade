'use client';

/**
 * Notifications — /notifications. Port of NotificationsScreen.
 * Structured useNotificationFeed() feed — cursor-paginated in live mode,
 * the authored feed as one page in fixture mode —
 * per-kind accent icons, dot-based unread resolved through the persisted
 * read cursor (live mode also posts the read edge), deep links into the
 * item, order or profile surface each row refers to, an All / Unread /
 * Orders filter, per-row mark-read and dismiss (the swipe affordances'
 * desktop hover grammar), and the mobile section grammar: a "Needs
 * attention" bucket of action-required events ahead of the day buckets
 * (Today / Yesterday / Earlier). Loading skeletons, a real error/retry
 * state and honest empties cover the full state machine.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { useNotificationFeed } from '@/components/notifications/useNotificationFeed';
import { DATA_MODE } from '@/lib/api/client';
import { focusAdjacentGroupControl } from '@/lib/a11y/focus';
import { useNotificationCursor } from '@/lib/store/notificationCursor';
import { useHydrated } from '@/lib/store/useStore';
import { isQuietHoursActive, useSettingsPrefs } from '@/lib/store/settingsPrefs';
import { Button } from '@/components/ui/Button';
import { Tabs } from '@/components/ui/Tabs';
import { EmptyState } from '@/components/ui/EmptyState';
import { StateGate } from '@/components/flagship/StateGate';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { NotificationRow } from '@/components/notifications/NotificationRow';
import { NotificationFilterSheet } from '@/components/notifications/NotificationFilterSheet';
import { NotificationsSkeleton } from '@/components/notifications/NotificationsSkeleton';
import {
  aggregateNotificationEntries,
  filterNotifications,
  fromNotificationEntry,
  groupNotificationsAuto,
  notificationFilterCounts,
  notificationFilterEmpty,
  serverNotificationFilterCounts,
  NOTIFICATION_FILTERS,
  type NotificationFilter,
  type NotificationRowModel,
} from '@/components/notifications/viewModel';
import type { NotificationEntry } from '@/lib/contracts/domain';

export default function NotificationsPage() {
  const qc = useQueryClient();
  const hydrated = useHydrated();
  // The active filter rides the feed query — server-side in live mode so
  // Load more paginates within the filter, client-side pass-through in
  // fixture mode (filterNotifications below still applies it).
  const [filter, setFilter] = useState<NotificationFilter>('all');
  const {
    data: feed,
    isLoading,
    isError,
    refetch,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
  } = useNotificationFeed(filter);
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
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  // Quiet-hours indicator — the persisted preference decides; gated behind
  // hydration so SSR and the first client render agree.
  const quietHours = useSettingsPrefs((s) => s.quietHours);
  const quietActive = hydrated && isQuietHoursActive(quietHours);
  // Read cursor — the persisted overlay the header badge shares; live
  // writes go to the server endpoints inside the store actions. The
  // dismissed overlay removes rows entirely (the swipe-to-clear grammar).
  const clearedIds = useNotificationCursor((s) => s.clearedIds);
  const dismissedIds = useNotificationCursor((s) => s.dismissedIds);
  const markRead = useNotificationCursor((s) => s.markRead);
  const markAllRead = useNotificationCursor((s) => s.markAllRead);
  const dismissNotification = useNotificationCursor((s) => s.dismissNotification);
  const syncUnreadSource = useNotificationCursor((s) => s.syncUnreadSource);
  const clearedSet = useMemo(() => new Set(clearedIds), [clearedIds]);
  const dismissedSet = useMemo(() => new Set(dismissedIds), [dismissedIds]);

  // Re-seed the shared source rows whenever the feed lands so Mark-all
  // clears exactly what this fetch carried (both modes). Dismissed rows
  // never count toward it. In live mode only an unfiltered page describes
  // the whole unread set — seeding from a server-filtered page would drop
  // unread rows the header badge still counts.
  useEffect(() => {
    if (data && (DATA_MODE !== 'live' || filter === 'all')) {
      syncUnreadSource(
        data.filter((n) => n.unread && !dismissedSet.has(n.id)).map((n) => n.id),
      );
    }
  }, [data, dismissedSet, filter, syncUnreadSource]);

  const items = useMemo(
    () =>
      aggregateNotificationEntries(
        (data ?? [])
          // Dismissed rows are gone from the feed — the overlay applies
          // post-hydration so SSR and the first client render agree. It
          // runs BEFORE aggregation so a dismissed member rebuilds the
          // group from its survivors (the native delete-then-refetch
          // outcome).
          .filter((n) => !(hydrated && dismissedSet.has(n.id)))
          .map((n) => ({
            ...n,
            // Persisted overlay applies only after hydration — SSR and the
            // first client render stay deterministic on the source flags.
            unread: n.unread === true && !(hydrated && clearedSet.has(n.id)),
          })),
      ).map(fromNotificationEntry),
    [data, clearedSet, dismissedSet, hydrated],
  );

  const unreadCount = useMemo(() => items.filter((n) => n.unread).length, [items]);

  const groups = useMemo(
    () => groupNotificationsAuto(filterNotifications(items, filter)),
    [items, filter],
  );

  // Per-filter counts for the tabs and sheet — live mode reads the
  // server's whole-set totals (truthful past page one); fixture mode and
  // responses without counts fall back to the dataset's own derivation,
  // so a filter with nothing behind it reads no count.
  const filterCounts = useMemo(() => {
    for (const page of feed?.pages ?? []) {
      const server = serverNotificationFilterCounts(page.filterCounts);
      if (server) return server;
    }
    return notificationFilterCounts(items);
  }, [feed, items]);

  const handleMarkAll = () => {
    markAllRead();
    // Live mode re-reads the server flags so the cursor stays a mirror,
    // not the only truth. The feed re-fetches and the header badge
    // re-reads the count endpoint — unfetched unread rows can't hide
    // behind the local overlay.
    if (DATA_MODE === 'live') {
      void qc.invalidateQueries({ queryKey: ['notifications', 'unread-count'] });
      void qc.invalidateQueries({ queryKey: ['notification-feed'] });
    }
  };

  /** Mark-read — aggregated cards carry a synthetic `agg:` id, so the
   *  write fans out to the group's UNREAD member event ids (native
   *  unreadMemberIds): already-read members would 404 the live edge and
   *  churn the write set for nothing. */
  const openRow = (n: NotificationRowModel) => {
    for (const id of n.aggregatedUnreadIds ?? [n.id]) markRead(id);
  };

  /** Dismiss unmounts the row while its button may hold focus — park
   *  focus on the adjacent row's primary control first (the swipe-left
   *  Clear's keyboard grammar), falling back to the page landmark when
   *  the dismissed row was the only one left. Aggregated cards fan the
   *  delete out to every member id (native memberIds). */
  const dismissRow = (n: NotificationRowModel) => {
    const parked = focusAdjacentGroupControl(
      document.activeElement,
      '[data-notification-row]',
      '[data-notification-open]',
    );
    if (!parked) {
      document.getElementById('main-content')?.focus({ preventScroll: true });
    }
    for (const id of n.aggregatedIds ?? [n.id]) dismissNotification(id);
  };

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-screen-title text-text-primary">
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
            aria-haspopup="dialog"
            aria-expanded={filterSheetOpen}
            size={20}
            onClick={() => setFilterSheetOpen(true)}
          />
          {/* Preferences shortcut — the mobile NotificationHeaderActions
              gear; a pure destination, so a real link with the icon-button
              chrome (44px transparent target) rather than a button that
              pushes a route. */}
          <Link
            href="/settings/notifications"
            aria-label="Notification settings"
            className="pressable inline-flex h-11 w-11 items-center justify-center rounded-full text-text-primary hover:bg-brand-subtle"
          >
            <Icon name="settings" size={20} />
          </Link>
        </div>
      </div>

      {/* Quiet-hours banner — only when the persisted window is active
          right now (mobile parity). Links to notification settings where
          the window is authored. */}
      {quietActive ? (
        <Link
          href="/settings/notifications"
          aria-label={`Quiet hours on — notifications muted until ${quietHours.endHour}:00. Open notification settings.`}
          className="pressable mt-3 flex w-full items-center gap-2 border-y border-border-subtle py-2 text-left"
        >
          <Icon name="moon" size={14} className="text-text-muted" />
          <span className="text-meta text-text-secondary">
            Quiet hours on — muted until {quietHours.endHour}:00.
          </span>
        </Link>
      ) : null}

      {/* Section tabs — All / Unread / Orders. Text tabs on the hairline
          baseline, counts from the dataset's own per-filter derivation. */}
      <Tabs
        className="-mx-4 mt-3 sm:-mx-6"
        railClassName="px-1 sm:px-3"
        tabs={NOTIFICATION_FILTERS.map((f) => ({
          key: f.key,
          label: f.label,
          count: filterCounts[f.key],
        }))}
        active={filter}
        onChange={setFilter}
        ariaLabel="Filter notifications"
      />

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
          {/* Focused single-column chronological stream */}
          <div className="mt-2 space-y-6">
          {groups.map((g) => (
            <section key={g.label} aria-label={g.label} className="mt-6">
              <div className="flex items-center gap-2 px-2">
                {g.attention ? (
                  <Icon name="alert" size={13} className="text-danger-text" aria-hidden />
                ) : null}
                <h2
                  className={`text-label ${
                    g.attention ? 'text-danger-text' : 'text-text-muted'
                  }`}
                >
                  {g.label}
                </h2>
                {g.unreadCount > 0 ? (
                  <span
                    className={`tnum flex h-4 min-w-4 items-center justify-center rounded-full border px-1 text-micro font-bold leading-none ${
                      g.attention
                        ? 'border-danger-text/40 text-danger-text'
                        : 'border-border text-text-muted'
                    }`}
                  >
                    {g.unreadCount > 99 ? '99+' : g.unreadCount}
                  </span>
                ) : null}
              </div>
              <div className="mt-1 divide-y divide-border-subtle">
                {g.items.map((n) => (
                  <NotificationRow
                    key={n.id}
                    notification={n}
                    onOpen={openRow}
                    onDismiss={dismissRow}
                  />
                ))}
              </div>
            </section>
          ))}
          </div>

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
