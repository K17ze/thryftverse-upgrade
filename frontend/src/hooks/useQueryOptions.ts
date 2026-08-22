import { queryOptions } from '@tanstack/react-query';
import { fetchJson } from '../lib/apiClient';
import type { ListingSingleResponse, ListingSearchResult } from '../services/listingsApi';
import type { PublicProfileAggregate } from '../services/profileApi';
import type { Collection } from '../services/collectionsApi';
import type { CommerceOrder } from '../services/commerceApi';
import type { AuctionDetailResponse } from '../services/marketApi';
import type { Conversation } from '../domain';

interface InboxResponse {
  ok: true;
  items: Conversation[];
}

interface ClosetResponse {
  ok: true;
  collections: Collection[];
}

interface OrderResponse {
  ok: true;
  order: CommerceOrder;
}

interface SearchResponse {
  ok: boolean;
  query: string;
  items: ListingSearchResult[];
  fallback?: boolean;
}

/**
 * Reusable, type-safe query configuration for a single listing detail.
 * Uses the `queryOptions()` helper from React Query v5 so the returned
 * object can be spread into `useQuery`, `prefetchQuery`, `fetchQuery`, and
 * `ensureQueryData` calls with full type inference.
 *
 * @param listingId - The listing ID to fetch.
 */
export function listingQueryOptions(listingId: string) {
  return queryOptions({
    queryKey: ['listing', listingId] as const,
    queryFn: ({ signal }) =>
      fetchJson<ListingSingleResponse>(
        `/listings/${encodeURIComponent(listingId)}`,
        { method: 'GET' },
        { signal },
      ),
    staleTime: 60_000,
  });
}

/**
 * Reusable, type-safe query configuration for a user's public profile
 * aggregate (user + stats + viewer relationship).
 *
 * @param userId - The user ID whose profile to fetch.
 */
export function userProfileQueryOptions(userId: string) {
  return queryOptions({
    queryKey: ['user', 'profile', userId] as const,
    queryFn: ({ signal }) =>
      fetchJson<PublicProfileAggregate>(
        `/users/${encodeURIComponent(userId)}/profile`,
        { method: 'GET' },
        { signal },
      ),
    staleTime: 5 * 60_000,
  });
}

/**
 * Reusable, type-safe query configuration for the inbox conversations list.
 */
export function inboxQueryOptions() {
  return queryOptions({
    queryKey: ['chat', 'conversations'] as const,
    queryFn: ({ signal }) =>
      fetchJson<InboxResponse>('/chat/conversations', { method: 'GET' }, { signal }),
    staleTime: 2 * 60_000,
  });
}

/**
 * Reusable, type-safe query configuration for the current user's closet
 * (collections).
 */
export function closetQueryOptions() {
  return queryOptions({
    queryKey: ['user', 'collections', 'me'] as const,
    queryFn: ({ signal }) =>
      fetchJson<ClosetResponse>('/collections', { method: 'GET' }, { signal }),
    staleTime: 5 * 60_000,
  });
}

/**
 * Reusable, type-safe query configuration for a single order.
 *
 * @param orderId - The order ID to fetch.
 */
export function orderQueryOptions(orderId: string) {
  return queryOptions({
    queryKey: ['order', orderId] as const,
    queryFn: ({ signal }) =>
      fetchJson<OrderResponse>(
        `/orders/${encodeURIComponent(orderId)}`,
        { method: 'GET' },
        { signal },
      ),
    staleTime: 30_000,
  });
}

/**
 * Reusable, type-safe query configuration for a single auction detail.
 *
 * @param auctionId - The auction ID to fetch.
 */
export function auctionQueryOptions(auctionId: string) {
  return queryOptions({
    queryKey: ['auction', auctionId] as const,
    queryFn: ({ signal }) =>
      fetchJson<AuctionDetailResponse>(
        `/auctions/${encodeURIComponent(auctionId)}`,
        { method: 'GET' },
        { signal },
      ),
    staleTime: 15_000,
  });
}

/**
 * Reusable, type-safe query configuration for a listing search. The query
 * key includes the optional filters object so filtered searches are cached
 * independently from unfiltered ones.
 *
 * @param query   - The search query string.
 * @param filters - Optional filter criteria; included in the query key.
 */
export function searchQueryOptions(query: string, filters?: Record<string, unknown>) {
  return queryOptions({
    queryKey: ['search', query, filters] as const,
    queryFn: ({ signal }) => {
      const params = new URLSearchParams();
      params.set('q', query);
      if (filters) {
        for (const [key, value] of Object.entries(filters)) {
          if (value !== undefined && value !== null) {
            params.set(key, typeof value === 'string' ? value : JSON.stringify(value));
          }
        }
      }
      return fetchJson<SearchResponse>(
        `/search/listings?${params.toString()}`,
        { method: 'GET' },
        { signal },
      );
    },
    staleTime: 30_000,
  });
}
