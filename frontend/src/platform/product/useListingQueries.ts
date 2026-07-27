import { useQuery, useInfiniteQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { queryKeys } from '../server/queryKeys';
import { fetchRecommendations } from './recommendationService';
import type { RecommendationSectionKey } from './recommendationTypes';
import {
  fetchListingByIdFromApi,
  fetchListingPriceHistory,
  fetchListingQaSummary,
  fetchListingSoldComparables,
} from '../../services/listingsApi';
import type { Listing, ListingCommerceServerContext } from '../../services/listingsApi';
import { fetchJson } from '../../lib/apiClient';
import type { SellerTrustSummary } from './listingDetailContract';
import { mapBackendListingToListing } from '../../services/listingMapper';

export interface ListingDetailResult {
  listing: Listing;
  commerce?: ListingCommerceServerContext;
}

export function useListingDetail(listingId: string | undefined) {
  return useQuery({
    queryKey: listingId ? queryKeys.listing.detail(listingId) : ['listing', 'detail', 'none'],
    queryFn: async () => {
      if (!listingId) return null;
      const res = await fetchListingByIdFromApi(listingId);
      if (!res.ok || !res.listing) {
        throw new Error(res.error || 'Listing not found');
      }
      return {
        listing: mapBackendListingToListing(res.listing),
        commerce: res.commerce,
      } as ListingDetailResult;
    },
    enabled: !!listingId,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: (failureCount, error: any) => {
      if (error?.status === 404) return false;
      return failureCount < 2;
    },
    placeholderData: keepPreviousData,
  });
}

export function useListingSoldComparables(listingId: string | undefined) {
  return useQuery({
    queryKey: listingId ? ['listing', 'sold-comparables', listingId] : ['listing', 'sold-comparables', 'none'],
    queryFn: () => fetchListingSoldComparables(listingId!),
    enabled: !!listingId,
    staleTime: 15 * 60 * 1000,
    retry: 1,
  });
}

export function useListingPriceHistory(listingId: string | undefined) {
  return useQuery({
    queryKey: listingId ? ['listing', 'price-history', listingId] : ['listing', 'price-history', 'none'],
    queryFn: () => fetchListingPriceHistory(listingId!),
    enabled: !!listingId,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}

export function useListingQaSummary(listingId: string | undefined) {
  return useQuery({
    queryKey: listingId ? ['listing', 'qa-summary', listingId] : ['listing', 'qa-summary', 'none'],
    queryFn: () => fetchListingQaSummary(listingId!),
    enabled: !!listingId,
    staleTime: 60 * 1000,
    retry: 1,
  });
}

export function useRecommendations(
  listingId: string | undefined,
  sections?: RecommendationSectionKey[],
  sessionId?: string
) {
  return useQuery({
    queryKey: listingId
      ? queryKeys.listing.recommendations(listingId, sections)
      : ['listing', 'recommendations', 'none'],
    queryFn: async () => {
      if (!listingId) return { listingId: '', sections: [] };
      return fetchRecommendations({ listingId, sections, sessionId });
    },
    enabled: !!listingId,
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 1,
    placeholderData: keepPreviousData,
  });
}

export function useContinueExploring(
  listingId: string | undefined,
  sessionId?: string
) {
  return useInfiniteQuery({
    queryKey: listingId
      ? ['listing', 'continue_exploring', listingId]
      : ['listing', 'continue_exploring', 'none'],
    queryFn: async ({ pageParam }) => {
      if (!listingId) return { listingId: '', sections: [] };
      return fetchRecommendations({
        listingId,
        sections: ['continue_exploring'],
        cursor: pageParam as string | undefined,
        sessionId,
      });
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => {
      const continueSection = lastPage.sections.find((s) => s.key === 'continue_exploring');
      return continueSection?.nextCursor ?? undefined;
    },
    enabled: !!listingId,
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 1,
  });
}

export function useSellerTrust(sellerId: string | undefined) {
  return useQuery({
    queryKey: sellerId ? ['seller', 'trust', sellerId] : ['seller', 'trust', 'none'],
    queryFn: async () => {
      if (!sellerId) return null;
      const res = await fetchJson<{ ok: boolean; seller?: SellerTrustSummary; error?: string }>(
        `/sellers/${sellerId}`
      );
      if (!res.ok || !res.seller) {
        return null;
      }
      return res.seller as SellerTrustSummary;
    },
    enabled: !!sellerId,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    retry: 1,
  });
}

export function useSellerFollow(sellerId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!sellerId) throw new Error('No sellerId');
      const res = await fetchJson<{ ok: boolean; isFollowing: boolean }>(
        `/sellers/${sellerId}/follow`,
        { method: 'POST' }
      );
      return res;
    },
    onSuccess: (data) => {
      if (sellerId) {
        queryClient.setQueryData(['seller', 'trust', sellerId], (old: SellerTrustSummary | null) =>
          old ? { ...old, isFollowing: data.isFollowing } : old
        );
      }
    },
  });
}
