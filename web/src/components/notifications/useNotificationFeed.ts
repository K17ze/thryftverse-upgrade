'use client';

/**
 * useNotificationFeed — the paginated /notifications feed. The service
 * (/notifications/events) already returns `nextCursor`; the previous
 * reader (useNotificationEntries in queries.ts) fetched page 1 and
 * dropped it, so long feeds truncated silently. This hook wires the
 * cursor: each fetchNextPage appends the next page. Fixture mode serves
 * the authored feed as a single honest page (nextCursor: null).
 *
 * Uses its own query key — `['notification-entries']` stays owned by the
 * flat-array reader the header badge consumes (same shape contract).
 */

import { useInfiniteQuery } from '@tanstack/react-query';
import { DATA_MODE } from '@/lib/api/client';
import * as notificationsService from '@/lib/api/services/notifications';
import { NOTIFICATION_FEED } from '@/lib/data/fixtures';
import type { NotificationEntry } from '@/lib/contracts/domain';

const PAGE_SIZE = 30;
const tick = (ms = 120) => new Promise((r) => setTimeout(r, ms));

export interface NotificationFeedPage {
  entries: NotificationEntry[];
  nextCursor: string | null;
}

export function useNotificationFeed() {
  return useInfiniteQuery({
    queryKey: ['notification-feed'],
    initialPageParam: '',
    queryFn: async ({ pageParam }): Promise<NotificationFeedPage> => {
      if (DATA_MODE === 'live') {
        const page = await notificationsService.fetchNotificationEvents({
          cursor: pageParam || undefined,
          limit: PAGE_SIZE,
        });
        return { entries: page.entries, nextCursor: page.nextCursor };
      }
      await tick();
      return { entries: NOTIFICATION_FEED, nextCursor: null };
    },
    getNextPageParam: (last) => last.nextCursor,
  });
}
