'use client';

/**
 * Co-Own watchlist — the starred assets the session is tracking,
 * persisted locally. Mirrors the mobile watch affordance on the asset
 * header: a quiet star toggle, not a list-management surface.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface CoOwnWatchlistState {
  /** Co-Own asset ids the session watches. */
  watchedIds: string[];
  toggleWatch: (assetId: string) => void;
  isWatching: (assetId: string) => boolean;
}

export const useCoOwnWatchlist = create<CoOwnWatchlistState>()(
  persist(
    (set, get) => ({
      watchedIds: [],
      toggleWatch: (assetId) =>
        set((s) => ({
          watchedIds: s.watchedIds.includes(assetId)
            ? s.watchedIds.filter((id) => id !== assetId)
            : [...s.watchedIds, assetId],
        })),
      isWatching: (assetId) => get().watchedIds.includes(assetId),
    }),
    {
      name: 'thryftverse.web.coown-watchlist',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ watchedIds: s.watchedIds }),
    },
  ),
);
