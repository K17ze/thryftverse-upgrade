import React from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { useStore } from '../store/useStore';
import { fetchFollowing, type FollowListUser } from '../services/profileApi';
import { fetchUserListingsFromApi } from '../services/listingsApi';
import { mapBackendListings } from '../services/listingMapper';
import type { Listing } from '../domain';

// The N+1 composition (paginated following list + per-seller listings) is
// too heavy to run on every focus — gate refocus refetches at 2 minutes.
const FOLLOWING_FEED_STALE_MS = 120_000;

interface FollowingFeedState {
  listings: Listing[];
  followingUsers: FollowListUser[];
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  hasFollowing: boolean;
  refresh: () => Promise<void>;
}

/**
 * Composes a "Following" feed client-side by:
 * 1. Fetching the current user's followed users
 * 2. Fetching each followed seller's active listings
 * 3. Merging and sorting by createdAt (newest first)
 *
 * This bridges the gap until a dedicated /feed/following backend endpoint
 * is available. The composition is parallelised and rate-limited to avoid
 * overwhelming the API.
 */
export function useFollowingFeed(): FollowingFeedState {
  const currentUser = useStore((s) => s.currentUser);
  const queryClient = useQueryClient();
  const [listings, setListings] = React.useState<Listing[]>([]);
  const [followingUsers, setFollowingUsers] = React.useState<FollowListUser[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const userId = currentUser?.id ?? null;
  const lastLoadedAtRef = React.useRef(0);

  const loadFollowingFeed = React.useCallback(
    async (isRefresh: boolean) => {
      if (!userId) {
        setListings([]);
        setFollowingUsers([]);
        return;
      }

      if (isRefresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setError(null);

      try {
        // 1. Fetch all followed users (paginate through all cursors)
        const allFollowing: FollowListUser[] = [];
        let cursor: string | undefined = undefined;
        let pages = 0;
        const MAX_FOLLOWING_PAGES = 10;

        do {
          const page = await fetchFollowing(userId, cursor);
          allFollowing.push(...page.items);
          cursor = page.nextCursor ?? undefined;
          pages++;
        } while (cursor && pages < MAX_FOLLOWING_PAGES);

        setFollowingUsers(allFollowing);
        lastLoadedAtRef.current = Date.now();

        if (allFollowing.length === 0) {
          setListings([]);
          return;
        }

        // 2. Fetch listings for each followed seller in parallel
        // Limit concurrency to avoid overwhelming the API
        const BATCH_SIZE = 5;
        const allListings: Listing[] = [];

        for (let i = 0; i < allFollowing.length; i += BATCH_SIZE) {
          const batch = allFollowing.slice(i, i + BATCH_SIZE);
          const results = await Promise.allSettled(
            batch.map((user) =>
              fetchUserListingsFromApi(user.id, { status: 'active', limit: 20 })
            )
          );

          for (const result of results) {
            if (result.status === 'fulfilled' && result.value.items) {
              const mapped = mapBackendListings(result.value.items);
              allListings.push(...mapped);
            }
          }
        }

        // 3. Sort by createdAt descending (chronological — Depop-style)
        allListings.sort((a, b) => {
          const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return bTime - aTime;
        });

        setListings(allListings);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load following feed';
        setError(message);
        setListings([]);
      } finally {
        if (isRefresh) {
          setIsRefreshing(false);
        } else {
          setIsLoading(false);
        }
      }
    },
    [userId]
  );

  // Initial load + reload when user changes
  React.useEffect(() => {
    void loadFollowingFeed(false);
  }, [loadFollowingFeed]);

  // Follow/unfollow mutations land in the React Query mutation cache under
  // ['social', 'follow', userId] (useFollowMutation / useSellerFollow).
  // This feed composes the following list directly — no RQ query — so
  // cache invalidation alone cannot reach it. Subscribe to successful
  // follow mutations and reload so the feed and followed-seller rows never
  // serve a stale membership set for the rest of the session.
  React.useEffect(() => {
    return queryClient.getMutationCache().subscribe((event) => {
      if (event.type !== 'updated' || event.action?.type !== 'success') return;
      const key = event.mutation.options.mutationKey;
      if (key?.[0] === 'social' && key?.[1] === 'follow') {
        void loadFollowingFeed(true);
      }
    });
  }, [queryClient, loadFollowingFeed]);

  // Refetch on screen focus when the feed is stale — pushed screens keep
  // Home mounted, so the mount effect never refires after the user
  // browses a seller profile or their inventory changes. The first focus
  // is owned by the mount effect; the stale gate keeps the N+1 fetch from
  // firing on every tab revisit.
  const hasFocusedOnceRef = React.useRef(false);
  useFocusEffect(
    React.useCallback(() => {
      if (!hasFocusedOnceRef.current) {
        hasFocusedOnceRef.current = true;
        return;
      }
      if (Date.now() - lastLoadedAtRef.current < FOLLOWING_FEED_STALE_MS) return;
      void loadFollowingFeed(true);
    }, [loadFollowingFeed])
  );

  const refresh = React.useCallback(() => loadFollowingFeed(true), [loadFollowingFeed]);

  return {
    listings,
    followingUsers,
    isLoading,
    isRefreshing,
    error,
    hasFollowing: followingUsers.length > 0,
    refresh,
  };
}
