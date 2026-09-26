'use client';

/**
 * Inbox preferences — archived and muted conversation ids, persisted.
 * Archived threads leave the All tab for the Archived tab; muted threads
 * stay in All but their unread badge is suppressed (Instagram grammar).
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface InboxPrefsState {
  archivedIds: string[];
  mutedIds: string[];
  toggleArchive: (id: string) => void;
  toggleMute: (id: string) => void;
}

export const useInboxPrefs = create<InboxPrefsState>()(
  persist(
    (set) => ({
      archivedIds: [],
      mutedIds: [],
      toggleArchive: (id) =>
        set((s) => ({
          archivedIds: s.archivedIds.includes(id)
            ? s.archivedIds.filter((x) => x !== id)
            : [...s.archivedIds, id],
        })),
      toggleMute: (id) =>
        set((s) => ({
          mutedIds: s.mutedIds.includes(id)
            ? s.mutedIds.filter((x) => x !== id)
            : [...s.mutedIds, id],
        })),
    }),
    {
      name: 'thryftverse.web.inbox-prefs',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ archivedIds: s.archivedIds, mutedIds: s.mutedIds }),
    },
  ),
);
