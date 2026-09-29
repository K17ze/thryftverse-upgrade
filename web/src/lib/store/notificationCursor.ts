'use client';

/**
 * Notification read cursor — shared between the /notifications feed and
 * the header badge. The feed's per-entry unread flags are the source rows;
 * `clearedIds` is the user's persisted read overlay (mirrors the mobile
 * read-cursor contract — server-side in production, mirrored locally here).
 *
 * `sourceUnreadIds` holds the unread ids from the most recent feed read so
 * the header badge and Mark-all count what the feed actually contains in
 * both modes — the /notifications page syncs it whenever entries land
 * (fixture mode seeds it from NOTIFICATION_FEED up front). Read writes go
 * to the live endpoints where they exist so the badge survives a refetch.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { DATA_MODE } from '@/lib/api/client';
import * as notificationsService from '@/lib/api/services/notifications';
import { NOTIFICATION_FEED } from '@/lib/data/fixtures';

/**
 * Persisted overlay cap — the most recent 500 cleared ids. Without a
 * bound, the localStorage list grows forever on an active account; ids
 * past the cap are far older than any page the feed can still surface.
 */
const MAX_CLEARED_IDS = 500;
const capClearedIds = (ids: string[]): string[] =>
  ids.length > MAX_CLEARED_IDS ? ids.slice(ids.length - MAX_CLEARED_IDS) : ids;

interface NotificationCursorState {
  /** Feed ids the user has explicitly read or cleared. */
  clearedIds: string[];
  /** Feed ids the user has dismissed — the swipe-to-clear overlay. Live
   *  mode also deletes the event server-side; the overlay keeps the row
   *  gone across remounts and fixture mode. */
  dismissedIds: string[];
  /** Unread ids from the latest feed read — runtime state, not persisted. */
  sourceUnreadIds: string[];
  /** Re-seed the shared source rows after a feed fetch. */
  syncUnreadSource: (unreadIds: string[]) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  /** Swipe-to-clear analogue — removes the row and posts the delete
   *  edge in live mode. */
  dismissNotification: (id: string) => void;
}

export const useNotificationCursor = create<NotificationCursorState>()(
  persist(
    (set, get) => ({
      clearedIds: [],
      dismissedIds: [],
      sourceUnreadIds: NOTIFICATION_FEED.filter((n) => n.unread).map((n) => n.id),
      syncUnreadSource: (unreadIds) =>
        set((s) =>
          s.sourceUnreadIds.length === unreadIds.length &&
          s.sourceUnreadIds.every((id, i) => id === unreadIds[i])
            ? s
            : { sourceUnreadIds: unreadIds },
        ),
      markRead: (id) => {
        if (DATA_MODE === 'live') {
          // Fire-and-forget — the local overlay is the optimistic mirror;
          // a failed write re-syncs on the next feed fetch.
          void notificationsService.markNotificationRead(id).catch(() => {});
        }
        set((s) =>
          s.clearedIds.includes(id)
            ? s
            : { clearedIds: capClearedIds([...s.clearedIds, id]) },
        );
      },
      markAllRead: () => {
        if (DATA_MODE === 'live') {
          void notificationsService.markAllNotificationsRead().catch(() => {});
        }
        set((s) => ({
          clearedIds: capClearedIds(
            Array.from(new Set([...s.clearedIds, ...get().sourceUnreadIds])),
          ),
        }));
      },
      dismissNotification: (id) => {
        if (DATA_MODE === 'live') {
          // Fire-and-forget — same contract as markRead: the overlay is
          // the optimistic mirror, a failed delete re-syncs on fetch.
          void notificationsService.dismissNotification(id).catch(() => {});
        }
        set((s) =>
          s.dismissedIds.includes(id)
            ? s
            : { dismissedIds: capClearedIds([...s.dismissedIds, id]) },
        );
      },
    }),
    {
      name: 'thryftverse.web.notification-cursor',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        clearedIds: capClearedIds(s.clearedIds),
        dismissedIds: capClearedIds(s.dismissedIds),
      }),
      // v1 → v2: introduce the dismissed overlay — existing clearedIds
      // carry over unchanged.
      version: 2,
      migrate: (persisted) => {
        const old = persisted as
          | { clearedIds?: unknown; dismissedIds?: unknown }
          | undefined;
        const ids = Array.isArray(old?.clearedIds)
          ? (old.clearedIds as string[])
          : [];
        const dismissed = Array.isArray(old?.dismissedIds)
          ? (old.dismissedIds as string[])
          : [];
        return {
          clearedIds: capClearedIds(ids),
          dismissedIds: capClearedIds(dismissed),
        };
      },
    },
  ),
);
