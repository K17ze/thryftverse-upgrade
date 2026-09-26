'use client';

/**
 * inboxSafety — per-viewer safety state for conversations: blocked
 * counterparties. Mirrors the mobile store's blockedUsers slice; persisted
 * to localStorage like inboxPrefs so the block survives reloads.
 *
 * The web inbox has no restrict pipeline (restricted users would need a
 * requests queue their messages route into) — block is the honest rung the
 * data model supports.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface InboxSafetyState {
  blockedUserIds: string[];
  toggleBlocked: (userId: string) => void;
}

export const useInboxSafety = create<InboxSafetyState>()(
  persist(
    (set) => ({
      blockedUserIds: [],
      toggleBlocked: (userId) =>
        set((s) => ({
          blockedUserIds: s.blockedUserIds.includes(userId)
            ? s.blockedUserIds.filter((id) => id !== userId)
            : [...s.blockedUserIds, userId],
        })),
    }),
    {
      name: 'thryftverse.web.inbox-safety',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ blockedUserIds: s.blockedUserIds }),
    },
  ),
);
