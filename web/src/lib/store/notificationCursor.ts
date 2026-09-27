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
  /** Unread ids from the latest feed read — runtime state, not persisted. */
  sourceUnreadIds: string[];
  /** Re-seed the shared source rows after a feed fetch. */
  syncUnreadSource: (unreadIds: string[]) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
}

export const useNotificationCursor = create<NotificationCursorState>()(
  persist(
    (set, get) => ({
      clearedIds: [],
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
    }),
    {
      name: 'thryftverse.web.notification-cursor',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ clearedIds: capClearedIds(s.clearedIds) }),
      // v0 → v1: cap the persisted list — pre-cap storage can hold an
      // unbounded clearedIds array.
      version: 1,
      migrate: (persisted) => {
        const old = persisted as { clearedIds?: unknown } | undefined;
        const ids = Array.isArray(old?.clearedIds)
          ? (old.clearedIds as string[])
          : [];
        return { clearedIds: capClearedIds(ids) };
      },
    },
  ),
);
