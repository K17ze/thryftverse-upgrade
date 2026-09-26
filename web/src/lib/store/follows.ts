'use client';

/**
 * Follows — who the session follows, persisted. The Follow button is a
 * real toggle again: profile pages read this store, guest attempts get
 * the signup wall upstream.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface FollowsState {
  /** User ids the session follows. */
  followingIds: string[];
  toggleFollow: (userId: string) => void;
  isFollowing: (userId: string) => boolean;
}

export const useFollows = create<FollowsState>()(
  persist(
    (set, get) => ({
      followingIds: ['u3', 'u5'],
      toggleFollow: (userId) =>
        set((s) => ({
          followingIds: s.followingIds.includes(userId)
            ? s.followingIds.filter((id) => id !== userId)
            : [...s.followingIds, userId],
        })),
      isFollowing: (userId) => get().followingIds.includes(userId),
    }),
    {
      name: 'thryftverse.web.follows',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ followingIds: s.followingIds }),
    },
  ),
);
