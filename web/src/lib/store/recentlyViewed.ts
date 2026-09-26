'use client';

/**
 * Recently viewed — listing ids the session has opened on the PDP,
 * persisted, most-recent-first, capped at 20. Powers the "Recently
 * viewed" home module; consumers gate persisted reads behind
 * useHydrated like every other persisted store.
 */

import { useEffect } from 'react';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

const RECENTLY_VIEWED_CAP = 20;

interface RecentlyViewedState {
  /** Listing ids, most-recent-first. */
  listingIds: string[];
  /** Record a PDP view — re-viewed ids move back to the front. */
  record: (listingId: string) => void;
  clear: () => void;
}

export const useRecentlyViewed = create<RecentlyViewedState>()(
  persist(
    (set) => ({
      listingIds: [],
      record: (listingId) =>
        set((s) => ({
          listingIds: [
            listingId,
            ...s.listingIds.filter((id) => id !== listingId),
          ].slice(0, RECENTLY_VIEWED_CAP),
        })),
      clear: () => set({ listingIds: [] }),
    }),
    {
      name: 'thryftverse.web.recently-viewed',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ listingIds: s.listingIds }),
    },
  ),
);

/**
 * PDP wiring — the item page calls this with the resolved listing id.
 * Recording waits for a real listing (never the raw route param), so a
 * deleted/unknown id can't enter the history.
 */
export function useRecordListingView(listingId: string | null | undefined): void {
  useEffect(() => {
    if (listingId) useRecentlyViewed.getState().record(listingId);
  }, [listingId]);
}
