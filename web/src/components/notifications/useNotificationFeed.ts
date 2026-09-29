'use client';

/**
 * useNotificationFeed — the paginated /notifications feed. The service
 * (/notifications/events) returns `nextCursor`; each fetchNextPage
 * appends the next page. The active filter is part of the query key and
 * is sent server-side (`eventType`/`unread` params — the backend filters
 * the page itself), so Load more paginates within the filter and the
 * server-emitted `filterCounts` describe the whole set, not the loaded
 * window. Fixture mode serves the authored feed as a single honest page
 * (nextCursor: null) and carries no counts — the page's local
 * filter/count derivation applies, unchanged.
 */

import { useInfiniteQuery } from '@tanstack/react-query';
import { DATA_MODE } from '@/lib/api/client';
import * as notificationsService from '@/lib/api/services/notifications';
import { NOTIFICATION_FEED } from '@/lib/data/fixtures';
import type { NotificationEntry } from '@/lib/contracts/domain';
import {
  NOTIFICATION_FILTER_EVENT_TYPES,
  type NotificationFilter,
} from './viewModel';

const PAGE_SIZE = 30;
const tick = (ms = 120) => new Promise((r) => setTimeout(r, ms));

export interface NotificationFeedPage {
  entries: NotificationEntry[];
  nextCursor: string | null;
  /** Whole-set per-filter totals (native bucket keys) — present on every
   *  live page, absent in fixture mode. */
  filterCounts?: Record<string, number>;
  /** Total matches under the active filter — only present when a filter
   *  param was sent. */
  filteredCount?: number;
}

export function useNotificationFeed(filter: NotificationFilter = 'all') {
  return useInfiniteQuery({
    // The filter joins the key: switching tabs fetches a fresh filtered
    // first page rather than re-filtering the merged 'all' window.
    queryKey: ['notification-feed', filter],
    initialPageParam: '',
    queryFn: async ({ pageParam }): Promise<NotificationFeedPage> => {
      if (DATA_MODE === 'live') {
        const page = await notificationsService.fetchNotificationEvents({
          cursor: pageParam || undefined,
          limit: PAGE_SIZE,
          eventTypes:
            filter === 'all' || filter === 'unread'
              ? undefined
              : NOTIFICATION_FILTER_EVENT_TYPES[filter],
          unread: filter === 'unread' ? true : undefined,
        });
        return {
          entries: page.entries,
          nextCursor: page.nextCursor,
          filterCounts: page.filterCounts,
          filteredCount: page.filteredCount,
        };
      }
      await tick();
      return { entries: NOTIFICATION_FEED, nextCursor: null };
    },
    getNextPageParam: (last) => last.nextCursor,
  });
}
