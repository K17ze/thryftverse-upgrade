import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  followUser,
  unfollowUser,
  blockUser,
  unblockUser,
  reportUser,
  fetchFollowers,
  fetchFollowing,
  ReportReason,
} from '../../services/profileApi';
import { fetchUserListingsFromApi } from '../../services/listingsApi';
import { fetchLooksFromApi } from '../../services/looksApi';
import { fetchSellerReviews } from '../../services/sellerReviewsApi';
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
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: profileKey });
      queryClient.invalidateQueries({ queryKey: queryKeys.user.listings(userId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.user.looks(userId) });
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
