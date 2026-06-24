import { useQuery, useInfiniteQuery, keepPreviousData } from '@tanstack/react-query';
import { queryKeys } from '../server/queryKeys';
import { fetchRecommendations } from './recommendationService';
import type { RecommendationSectionKey } from './recommendationTypes';
import { fetchListingByIdFromApi } from '../../services/listingsApi';
import { Listing, MOCK_LISTINGS } from '../../data/mockData';
import { ENABLE_RUNTIME_MOCKS } from '../../constants/runtimeFlags';

function mapApiListingToListing(row: any): Listing {
  const price = Number(row.priceGbp ?? 0);
  const protectionFee = Number((price * 0.05 + 0.7).toFixed(2));
  return {
    id: row.id,
    title: row.title || 'Untitled listing',
    brand: row.brand || row.title?.split(' ').slice(0, 2).join(' ') || 'Thryftverse',
    size: row.size || 'One size',
    condition: (row.condition as Listing['condition']) || 'Very good',
    price,
    priceWithProtection: Number((price + protectionFee).toFixed(2)),
    images: row.images?.length ? row.images : row.imageUrl ? [row.imageUrl] : [],
    likes: 0,
    isSold: row.status === 'sold',
    sellerId: row.sellerId || 'u1',
    seller: row.seller ?? null,
    category: row.category || 'women',
    subcategory: 'Clothing',
    description: row.description || '',
    createdAt: row.createdAt,
  };
}

export function useListingDetail(listingId: string | undefined) {
  return useQuery({
    queryKey: listingId ? queryKeys.listing.detail(listingId) : ['listing', 'detail', 'none'],
    queryFn: async () => {
      if (!listingId) return null;
      try {
        const res = await fetchListingByIdFromApi(listingId);
        if (res.ok && res.listing) {
          return mapApiListingToListing(res.listing);
        }
      } catch {
        // fall through to context data
      }
      return null;
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
