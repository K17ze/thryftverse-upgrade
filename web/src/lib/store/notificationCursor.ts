'use client';

/**
 * Notification read cursor — shared between the /notifications feed and
 * the header badge. The fixture feed carries per-entry unread flags; this
 * store is the user's read overlay (mirrors the mobile read-cursor
 * contract — server-side in production, persisted locally here).
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { NOTIFICATION_FEED } from '@/lib/data/fixtures';

interface NotificationCursorState {
  /** Feed ids the user has explicitly read or cleared. */
  clearedIds: string[];
  markRead: (id: string) => void;
  markAllRead: () => void;
}

export const useNotificationCursor = create<NotificationCursorState>()(
  persist(
    (set) => ({
      clearedIds: [],
      markRead: (id) =>
        set((s) =>
          s.clearedIds.includes(id)
            ? s
            : { clearedIds: [...s.clearedIds, id] },
        ),
      markAllRead: () =>
        set((s) => ({
          clearedIds: Array.from(
            new Set([
              ...s.clearedIds,
              ...NOTIFICATION_FEED.filter((n) => n.unread).map((n) => n.id),
            ]),
          ),
        })),
    }),
    {
      name: 'thryftverse.web.notification-cursor',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ clearedIds: s.clearedIds }),
    },
  ),
);

/** Live unread count — feed unreads minus the user's cleared overlay. */
export function unreadNotificationCount(clearedIds: readonly string[]): number {
  const cleared = new Set(clearedIds);
  return NOTIFICATION_FEED.filter((n) => n.unread && !cleared.has(n.id)).length;
}
