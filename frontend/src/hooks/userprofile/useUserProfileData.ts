import { useCallback, useEffect, useMemo, useState } from 'react';
import { useVisuallyComplete } from '../../performance/visuallyComplete';
import {
  type PublicProfileStats,
  type PublicProfileViewer,
  type PublicProfileUser,
} from '../../services/profileApi';
import {
  usePublicProfileQuery,
  useUserListingsInfinite,
  useUserLooksInfinite,
  useSellerReviewsInfinite,
} from '../../platform/server';
import { useSellerTrust } from '../../platform/product';
import { useRefetchOnFocus } from '../useRefetchOnFocus';
import { queryKeys } from '../../platform/server/queryKeys';
import type { ListingApiItem } from '../../services/listingsApi';
import type { LookApiItem } from '../../services/looksApi';
import type { SellerReviewItem, SellerReviewSummary } from '../../services/sellerReviewsApi';
import { fetchPosterHighlights, type PosterHighlight } from '../../services/postersApi';
import type { ShopRailItem } from '../../components/profile/ShopRail';
import type { UserProfileTab, UserProfileShopSegment } from './types';

/**
 * Owns the user-profile data lifecycle: the public profile aggregate plus the
 * four tab-scoped infinite queries (active/sold listings, looks, reviews),
 * seller trust, story highlights, focus-refetch, readiness milestones, and
 * every derived display field / list projection the screen renders.
 */
export function useUserProfileData(
  targetUserId: string | undefined,
  activeTab: UserProfileTab,
  shopSegment: UserProfileShopSegment,
) {
  const reportReady = useVisuallyComplete('UserProfile');

  // Pushed screens stay mounted under React Navigation, so refetchOnMount
  // never refires on back-navigation — the profile aggregate (follower
  // counts, viewer relationship, away state) would serve stale data for
  // up to its staleTime. Refetch on focus instead; debounced inside the
  // hook so rapid focus churn doesn't spam the API.
  useRefetchOnFocus(
    targetUserId ? queryKeys.user.profile(targetUserId) : ['user', 'profile', 'none'],
    Boolean(targetUserId),
  );

  const publicProfileQuery = usePublicProfileQuery(targetUserId);
  const activeListingsQuery = useUserListingsInfinite(targetUserId, 'active');
  const soldListingsQuery = useUserListingsInfinite(targetUserId, 'sold');
  const looksQuery = useUserLooksInfinite(targetUserId);
  const reviewsQuery = useSellerReviewsInfinite(targetUserId);

  // Seller trust summary - verified badge, response time, dispatch time, completed sales.
  // This provides the detailed trust signals (response rate, dispatch time, badges)
  // that complement the aggregate's verification flags and away state.
  const { data: sellerTrust } = useSellerTrust(targetUserId ?? undefined);

  // Authoritative away state from the profile aggregate — replaces the
  // previous useSellerTrust-derived holiday mode. The aggregate is the
  // source-of-truth for the public profile projection.
  const awayState = publicProfileQuery.away ?? null;

  // DSA Article 30 trader disclosure from the aggregate.
  // Legally required in EU/UK — buyers must know if they're transacting
  // with a business (trader) or a private individual (non-trader).
  const traderDisclosure = publicProfileQuery.trader ?? null;

  // Published storefront summary from the aggregate.
  // Contains the seller's shop announcement, section titles, and
  // server-owned featured listing IDs for ordering.
  const storefrontSummary = publicProfileQuery.storefront ?? null;

  // Story highlights — fetched for the highlights rail below the ProfileHero.
  // Renders nothing when empty (truthful UI — no fabricated placeholder content).
  const [highlights, setHighlights] = useState<PosterHighlight[]>([]);
  useEffect(() => {
    if (!targetUserId) return;
    let cancelled = false;
    fetchPosterHighlights(targetUserId)
      .then((res) => { if (!cancelled) setHighlights(res.items ?? []); })
      .catch(() => { if (!cancelled) setHighlights([]); });
    return () => { cancelled = true; };
  }, [targetUserId]);

  // Derived profile data
  const publicProfile = publicProfileQuery.data ?? null;
  const profileAggregate = publicProfileQuery.aggregate ?? null;
  const isLoadingProfile = publicProfileQuery.isLoading;

  // Readiness milestones: 'data-ready' when the profile query settles
  // (data or terminal error); 'interaction-ready' alongside it — the
  // header/follow controls render once loading clears. When the query is
  // disabled (no userId) there is nothing to load and readiness reports
  // immediately, which is accurate.
  useEffect(() => {
    if (!isLoadingProfile) {
      reportReady('data-ready');
      reportReady('interaction-ready');
    }
  }, [isLoadingProfile, reportReady]);
  const profileError = publicProfileQuery.error ? 'Unable to load profile. Tap to retry.' : null;
  const stats: PublicProfileStats | null = profileAggregate?.stats ?? null;
  const viewer: PublicProfileViewer | null = profileAggregate?.viewer ?? null;

  const targetProfile: PublicProfileUser | null = publicProfile;
  const displayUsername = targetProfile?.username ?? 'Thryft user';
  const displayHandle = targetProfile ? `@${targetProfile.username}` : '';
  const displayAvatar = targetProfile?.avatar || undefined;
  const displayCover = targetProfile?.coverPhoto || '';
  const memberSince = targetProfile?.createdAt ? new Date(targetProfile.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long' }) : undefined;

  // Tab counts - ratingAverage consumed by ProfileHero via stats
  const activeCount = stats?.activeListingCount ?? 0;
  const soldCount = stats?.soldListingCount ?? 0;
  const lookCount = stats?.publishedLookCount ?? 0;
  const reviewCount = stats?.reviewCount ?? 0;

  // List data
  const listData = useMemo(() => {
    if (activeTab === 'About') return [];
    if (activeTab === 'Listings') {
      const query = shopSegment === 'forsale' ? activeListingsQuery : soldListingsQuery;
      const pages = query.data?.pages ?? [];
      const items: ListingApiItem[] = [];
      for (const page of pages) for (const item of page.items) items.push(item);
      // Server-owned featured listing ranks from the storefront aggregate.
      // The backend determines which listings are featured and their rank
      // order via storefront_featured_listings. We apply the server's rank
      // order to the grid — featured listings appear first in rank order,
      // non-featured listings follow in their original backend order.
      // This is NOT client-side featured derivation — it's applying the
      // server's authoritative ranking.
      const featuredIds = storefrontSummary?.featuredListingIds;
      if (featuredIds && featuredIds.length > 0 && shopSegment === 'forsale') {
        const rankMap = new Map<string, number>();
        featuredIds.forEach((id, idx) => rankMap.set(id, idx));
        const featured: ListingApiItem[] = [];
        const rest: ListingApiItem[] = [];
        for (const item of items) {
          if (rankMap.has(item.id)) {
            featured.push(item);
          } else {
            rest.push(item);
          }
        }
        featured.sort((a, b) => (rankMap.get(a.id) ?? 0) - (rankMap.get(b.id) ?? 0));
        return [...featured, ...rest];
      }
      return items;
    }
    if (activeTab === 'Looks') {
      const pages = looksQuery.data?.pages ?? [];
      const items: LookApiItem[] = [];
      for (const page of pages) for (const item of page.items) items.push(item);
      return items;
    }
    const pages = reviewsQuery.data?.pages ?? [];
    const items: SellerReviewItem[] = [];
    for (const page of pages) for (const item of page.items) items.push(item);
    return items;
  }, [activeTab, shopSegment, activeListingsQuery.data, soldListingsQuery.data, looksQuery.data, reviewsQuery.data, storefrontSummary]);

  // Curated shop window — featured listings for the ShopRail. Uses the
  // server-owned featuredListingIds from the storefront aggregate to pick
  // the curated selection. ShopRail renders nothing when empty.
  const shopRailItems = useMemo<ShopRailItem[]>(() => {
    const featuredIds = storefrontSummary?.featuredListingIds;
    if (!featuredIds || featuredIds.length === 0) return [];
    const pages = activeListingsQuery.data?.pages ?? [];
    const allItems: ListingApiItem[] = [];
    for (const page of pages) for (const item of page.items) allItems.push(item);
    const rankMap = new Map<string, number>();
    featuredIds.forEach((id, idx) => rankMap.set(id, idx));
    return allItems
      .filter((item) => rankMap.has(item.id))
      .sort((a, b) => (rankMap.get(a.id) ?? 0) - (rankMap.get(b.id) ?? 0))
      .slice(0, 10)
      .map((item) => ({
        id: item.id,
        title: item.title,
        price: item.priceGbp,
        imageUri: item.images?.[0] ?? item.imageUrl ?? '',
        brand: item.brand,
        isSold: item.status === 'sold',
        isPinned: true,
      }));
  }, [storefrontSummary, activeListingsQuery.data]);

  const activeQuery = activeTab === 'Listings' ? (shopSegment === 'forsale' ? activeListingsQuery : soldListingsQuery) : activeTab === 'Looks' ? looksQuery : activeTab === 'About' ? activeListingsQuery : reviewsQuery;
  const isRefreshing = activeQuery.isRefetching;
  const hasNextPage = Boolean(activeQuery.hasNextPage);
  const isFetchingNextPage = activeQuery.isFetchingNextPage;
  const reviewSummary: SellerReviewSummary | null = reviewsQuery.data?.pages?.[0]?.summary ?? null;

  const handleLoadMore = useCallback(() => { if (hasNextPage && !isFetchingNextPage) activeQuery.fetchNextPage(); }, [hasNextPage, isFetchingNextPage, activeQuery]);
  const handleRefresh = useCallback(() => { activeQuery.refetch(); publicProfileQuery.refetch(); }, [activeQuery, publicProfileQuery]);
  const refetchProfile = useCallback(() => { publicProfileQuery.refetch(); }, [publicProfileQuery]);
  const refetchReviews = useCallback(() => { reviewsQuery.refetch(); }, [reviewsQuery]);

  return {
    publicProfileQuery,
    activeQuery,
    isLoadingProfile,
    profileError,
    stats,
    viewer,
    targetProfile,
    displayUsername,
    displayHandle,
    displayAvatar,
    displayCover,
    memberSince,
    sellerTrust,
    awayState,
    traderDisclosure,
    storefrontSummary,
    highlights,
    activeCount,
    soldCount,
    lookCount,
    reviewCount,
    listData,
    shopRailItems,
    isRefreshing,
    hasNextPage,
    isFetchingNextPage,
    reviewSummary,
    handleLoadMore,
    handleRefresh,
    refetchProfile,
    refetchReviews,
  };
}
