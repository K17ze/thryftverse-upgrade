'use client';

/**
 * Follows — who the session follows, persisted. The Follow button is a
 * real toggle again: profile pages read this store, guest attempts get
 * the signup wall upstream. Live mode posts the follow edge to
 * /users/:id/follow as an optimistic write (revert on failure) and
 * hydrates the server list when the session resolves; the fixture seed
 * belongs to the demo account only — a real account never inherits it.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { DATA_MODE } from '@/lib/api/client';
import { fetchFollowingIds, followUser, unfollowUser } from '@/lib/api/services/users';
import { sessionEpoch, sessionIdentityIsCurrent } from '@/lib/session/identityEpoch';

/** Demo-session seed — fixture mode only. Seeding a live account with
 *  fixture ids would mark strangers "followed" who the member never
 *  chose, so live sessions start empty and hydrate server truth. */
const FIXTURE_SEED = ['u3', 'u5'];

interface FollowsState {
  /** User ids the session follows. */
  followingIds: string[];
  toggleFollow: (userId: string) => void;
  isFollowing: (userId: string) => boolean;
  /** Live-mode seed — union server-observed "viewer follows" edges into
   *  the persisted set (follow lists carry per-row isFollowing). Union-
   *  only: a wire `false` can't outrank an optimistic toggle already
   *  applied locally, and hydrateFollows remains the wholesale
   *  reconciliation on session resolve. */
  seedFollowing: (userIds: string[]) => void;
}

export const useFollows = create<FollowsState>()(
  persist(
    (set, get) => ({
      followingIds: DATA_MODE === 'live' ? [] : FIXTURE_SEED,
      toggleFollow: (userId) => {
        const before = get().followingIds;
        const nowFollowing = !before.includes(userId);
        set({
          followingIds: nowFollowing
            ? [...before, userId]
            : before.filter((id) => id !== userId),
        });
        if (DATA_MODE !== 'live') return;
        // Optimistic mirror — a failed write reverts to the pre-toggle set.
        void (nowFollowing ? followUser(userId) : unfollowUser(userId)).catch(() =>
          set({ followingIds: before }),
        );
      },
      isFollowing: (userId) => get().followingIds.includes(userId),
      seedFollowing: (userIds) => {
        if (userIds.length === 0) return;
        const before = get().followingIds;
        const next = new Set(before);
        for (const id of userIds) next.add(id);
        if (next.size === before.length) return;
        set({ followingIds: [...next] });
      },
    }),
    {
      name: 'thryftverse.web.follows',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ followingIds: s.followingIds }),
    },
  ),
);

/**
 * Live mode: pull the server-authoritative following list once the session
 * resolves. Called from the session provider next to hydrateSavedLists —
 * no-ops in fixture mode; a failed read keeps the local set.
 *
 * The write is sequenced by the session epoch: if the identity changed
 * (logout, expiry, another account) while the read was in flight, the
 * resolved ids are dropped rather than written onto the new session.
 */
export async function hydrateFollows(userId: string): Promise<void> {
  if (DATA_MODE !== 'live') return;
  const epoch = sessionEpoch();
  try {
    const ids = await fetchFollowingIds(userId);
    if (!sessionIdentityIsCurrent(userId, epoch)) return;
    useFollows.setState({ followingIds: ids });
  } catch {
    // Guest or offline — keep the local list.
  }
}
