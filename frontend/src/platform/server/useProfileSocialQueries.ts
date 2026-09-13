import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  followUser,
  unfollowUser,
  blockUser,
  unblockUser,
  muteUser,
  unmuteUser,
  restrictUser,
  unrestrictUser,
  reportUser,
  fetchFollowers,
  fetchFollowing,
  ReportReason,
} from '../../services/profileApi';
import { fetchUserListingsFromApi } from '../../services/listingsApi';
import { fetchLooksFromApi } from '../../services/looksApi';
import { fetchSellerReviews } from '../../services/sellerReviewsApi';
import { useStore } from '../../store/useStore';
import { queryKeys } from './queryKeys';

// ── User listings (infinite, status-filtered) ───────────────────────

export function useUserListingsInfinite(userId: string | null | undefined, status: 'active' | 'sold') {
  return useInfiniteQuery({
    queryKey: userId ? queryKeys.user.listings(userId, status) : ['user', 'listings', null],
    queryFn: ({ pageParam }) =>
      fetchUserListingsFromApi(userId!, { status, limit: 20, cursor: pageParam as string | undefined }),
    enabled: Boolean(userId),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    staleTime: 1000 * 60 * 2,
  });
}

// ── User looks (infinite, published only) ───────────────────────────

export function useUserLooksInfinite(userId: string | null | undefined) {
  return useInfiniteQuery({
    queryKey: userId ? queryKeys.user.looks(userId) : ['user', 'looks', null],
    queryFn: ({ pageParam }) =>
      fetchLooksFromApi({ creatorId: userId!, status: 'published', limit: 24, cursor: pageParam as string | undefined }),
    enabled: Boolean(userId),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    staleTime: 1000 * 60 * 2,
  });
}

// ── Seller reviews (infinite) ───────────────────────────────────────

export function useSellerReviewsInfinite(userId: string | null | undefined) {
  return useInfiniteQuery({
    queryKey: userId ? queryKeys.user.reviews(userId) : ['user', 'reviews', null],
    queryFn: ({ pageParam }) =>
      fetchSellerReviews(userId!, { limit: 20, cursor: pageParam as string | undefined }),
    enabled: Boolean(userId),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    staleTime: 1000 * 60 * 5,
  });
}

// ── Followers / following lists ─────────────────────────────────────

export function useFollowersInfinite(userId: string | null | undefined) {
  return useInfiniteQuery({
    queryKey: userId ? queryKeys.user.followers(userId) : ['user', 'followers', null],
    queryFn: ({ pageParam }) => fetchFollowers(userId!, pageParam as string | undefined),
    enabled: Boolean(userId),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    staleTime: 1000 * 60 * 2,
  });
}

export function useFollowingInfinite(userId: string | null | undefined) {
  return useInfiniteQuery({
    queryKey: userId ? queryKeys.user.following(userId) : ['user', 'following', null],
    queryFn: ({ pageParam }) => fetchFollowing(userId!, pageParam as string | undefined),
    enabled: Boolean(userId),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    staleTime: 1000 * 60 * 2,
  });
}

// ── Follow / unfollow mutation (optimistic) ─────────────────────────

export function useFollowMutation(userId: string) {
  const queryClient = useQueryClient();
  const profileKey = queryKeys.user.profile(userId);

  return useMutation({
    // Keyed so non-RQ surfaces (the composed Following feed on Home) can
    // observe successful follow/unfollow mutations via the mutation cache —
    // query invalidation alone cannot reach direct-fetch surfaces.
    mutationKey: ['social', 'follow', userId],
    mutationFn: async (shouldFollow: boolean) => {
      if (shouldFollow) {
        return followUser(userId);
      }
      return unfollowUser(userId);
    },
    onMutate: async (shouldFollow) => {
      await queryClient.cancelQueries({ queryKey: profileKey });
      const previous = queryClient.getQueryData(profileKey);
      queryClient.setQueryData(profileKey, (old: unknown) => {
        if (!old || typeof old !== 'object') return old;
        const agg = old as Record<string, unknown>;
        const oldStats = (agg.stats as Record<string, unknown> | undefined) ?? {};
        const oldViewer = (agg.viewer as Record<string, unknown> | undefined) ?? {};
        const oldFollowerCount = (oldStats.followerCount as number | undefined) ?? 0;
        return {
          ...agg,
          stats: {
            ...oldStats,
            followerCount: Math.max(0, oldFollowerCount + (shouldFollow ? 1 : -1)),
          },
          viewer: {
            ...oldViewer,
            isFollowing: shouldFollow,
          },
        };
      });
      return { previous };
    },
    onError: (_err, _shouldFollow, context) => {
      if (context?.previous) {
        queryClient.setQueryData(profileKey, context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: profileKey });
      // The target's followers list gained/lost the viewer, and the
      // viewer's own following list changed — invalidate both so
      // connection lists and the following feed don't serve stale rows.
      // Scope the following invalidation to the viewer's own list rather
      // than the whole ['user','following'] prefix, which would refetch
      // every user's following list currently mounted.
      queryClient.invalidateQueries({ queryKey: queryKeys.user.followers(userId) });
      const viewerId = useStore.getState().currentUser?.id;
      if (viewerId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.user.following(viewerId) });
      }
    },
  });
}

// ── Block / unblock mutation ────────────────────────────────────────

export function useBlockMutation(userId: string) {
  const queryClient = useQueryClient();
  const profileKey = queryKeys.user.profile(userId);

  return useMutation({
    mutationFn: async (shouldBlock: boolean) => {
      if (shouldBlock) {
        return blockUser(userId);
      }
      return unblockUser(userId);
    },
    onSuccess: (_data, shouldBlock) => {
      import('../../store/useStore').then(({ useStore }) => {
        if (shouldBlock) {
          useStore.getState().addBlockedUser(userId);
        } else {
          useStore.getState().removeBlockedUser(userId);
          useStore.getState().hydrateBlockedUsers().catch(() => undefined);
        }
        useStore.getState().setUserModerationInConversations(userId, { isBlocked: shouldBlock });
      }).catch(() => undefined);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: profileKey });
      // listingsAll is the 3-segment prefix — `listings(userId)` produces
      // a 4-segment key that would not match the 'active'/'sold' variants.
      queryClient.invalidateQueries({ queryKey: queryKeys.user.listingsAll(userId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.user.looks(userId) });
    },
  });
}

// ── Mute / unmute mutation ──────────────────────────────────────────
// Mute is the silent rung of the moderation ladder — no notification to
// the target; suppresses their-message notifications for the viewer.

export function useMuteMutation(userId: string) {
  const queryClient = useQueryClient();
  const profileKey = queryKeys.user.profile(userId);

  return useMutation({
    mutationFn: async (shouldMute: boolean) => {
      if (shouldMute) {
        return muteUser(userId);
      }
      return unmuteUser(userId);
    },
    onSuccess: (_data, shouldMute) => {
      import('../../store/useStore').then(({ useStore }) => {
        if (shouldMute) {
          useStore.getState().addMutedUser(userId);
        } else {
          useStore.getState().removeMutedUser(userId);
          useStore.getState().hydrateMutedUsers().catch(() => undefined);
        }
        useStore.getState().setUserModerationInConversations(userId, { isAuthorMuted: shouldMute });
      }).catch(() => undefined);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: profileKey });
    },
  });
}

// ── Restrict / unrestrict mutation ──────────────────────────────────
// Restrict is invisible to the target — their DMs land in the viewer's
// message requests and read receipts / typing stop flowing back.

export function useRestrictMutation(userId: string) {
  const queryClient = useQueryClient();
  const profileKey = queryKeys.user.profile(userId);

  return useMutation({
    mutationFn: async (shouldRestrict: boolean) => {
      if (shouldRestrict) {
        return restrictUser(userId);
      }
      return unrestrictUser(userId);
    },
    onSuccess: (_data, shouldRestrict) => {
      import('../../store/useStore').then(({ useStore }) => {
        if (shouldRestrict) {
          useStore.getState().addRestrictedUser(userId);
        } else {
          useStore.getState().removeRestrictedUser(userId);
          useStore.getState().hydrateRestrictedUsers().catch(() => undefined);
        }
        useStore.getState().setUserModerationInConversations(userId, { isRestricted: shouldRestrict });
      }).catch(() => undefined);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: profileKey });
    },
  });
}

// ── Report user mutation ────────────────────────────────────────────

export function useReportUserMutation(userId: string) {
  return useMutation({
    mutationFn: async (input: { reason: ReportReason; details?: string }) =>
      reportUser(userId, input.reason, input.details),
  });
}
