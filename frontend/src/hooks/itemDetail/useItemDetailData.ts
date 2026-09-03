import { useEffect, useMemo } from 'react';
import type {
  Listing,
  ListingCommerceServerContext,
  ListingSoldComparables,
  ListingPriceEvent,
  ListingQaSummary,
} from '../../services/listingsApi';
import type {
  SellerTrustSummary,
  RecommendationSection,
} from '../../platform/product';
import {
  useListingDetail,
  useListingPriceHistory,
  useListingQaSummary,
  useListingSoldComparables,
  useRecommendations,
  useContinueExploring,
  useSellerTrust,
  useSellerFollow,
  buildSellerTrustSummary,
  setProductAnalyticsHandler,
  setProductSessionId,
  ProductAnalytics,
} from '../../platform/product';
import { trackListingView } from '../../services/listingsApi';
import { trackTelemetryEvent } from '../../lib/telemetry';
import { track } from '../../analytics/track';

/**
 * Route params forwarded from the screen so the hook can wire analytics
 * context (sectionKey / position / reasonCode / personalised) without the
 * screen owning the effect.
 */
export interface ItemDetailDataRouteContext {
  itemId: string | undefined;
  sectionKey?: string;
  position?: number;
  reasonCode?: string;
  personalised?: boolean;
}

export interface ItemDetailDataResult {
  /** The resolved listing, or null while loading / errored with no cache. */
  listing: Listing | null;
  /** Server commerce context (buyer protection fee, estimated total, etc). */
  commerce: ListingCommerceServerContext | null;
  /** Resolved seller trust summary (backend-backed, with fallback build). */
  seller: SellerTrustSummary | null;
  /** Seller follow mutation (toggle + isPending). */
  sellerFollow: ReturnType<typeof useSellerFollow>;
  /** Recommendation sections (more_from_seller, seen_in_looks, etc). */
  recommendationSections: RecommendationSection[];
  /** True when the recommendations query errored. */
  recommendationsError: boolean;
  /** Sold comparables for the price-insight rows. */
  soldComparables: ListingSoldComparables | null;
  /** Price history events (newest first). */
  priceHistory: ListingPriceEvent[];
  /** Q&A summary (question count). */
  qaSummary: ListingQaSummary | null;
  /** Continue-exploring pagination handles (prefetched for the next surface). */
  explore: {
    items: Listing[];
    fetchNextPage: ReturnType<typeof useContinueExploring>['fetchNextPage'];
    hasNextPage: ReturnType<typeof useContinueExploring>['hasNextPage'];
    isFetchingNextPage: ReturnType<typeof useContinueExploring>['isFetchingNextPage'];
  };
  /** True on the first load with no cached listing. */
  isLoading: boolean;
  /** True when the listing query errored with no cached listing. */
  isError: boolean;
  /** Refetch the listing query. */
  refetch: ReturnType<typeof useListingDetail>['refetch'];
}

/**
 * Owns the product-query domain for the item detail screen: the listing,
 * its server commerce context, seller trust, recommendations, sold
 * comparables, price history, Q&A summary, and the continue-exploring
 * prefetch. Also owns the product analytics session + item-view telemetry
 * effects so the screen does not have to wire them inline.
 */
export function useItemDetailData(
  ctx: ItemDetailDataRouteContext,
): ItemDetailDataResult {
  const { itemId, sectionKey, position, reasonCode, personalised } = ctx;

  const {
    data: queryData,
    isLoading: queryLoading,
    isError: queryError,
    refetch: refetchListing,
  } = useListingDetail(itemId);

  const {
    data: recommendationsData,
    isError: recsError,
  } = useRecommendations(itemId);
  const {
    data: exploreData,
    fetchNextPage: exploreNextPage,
    hasNextPage: exploreHasNextPage,
    isFetchingNextPage: exploreFetching,
  } = useContinueExploring(itemId);
  const { data: soldComps } = useListingSoldComparables(itemId);
  const { data: priceHistory = [] } = useListingPriceHistory(itemId);
  const { data: qaSummary } = useListingQaSummary(itemId);

  const item = queryData?.listing ?? null;
  const serverCommerce = queryData?.commerce ?? null;

  const { data: sellerTrustData } = useSellerTrust(item?.sellerId ?? undefined);
  const sellerFollowMutation = useSellerFollow(item?.sellerId ?? undefined);

  // ── Product analytics session ──
  // Wires the platform analytics handler + session id for the duration of
  // this listing view. Cleaned up on unmount / itemId change.
  useEffect(() => {
    setProductAnalyticsHandler((event) => {
      trackTelemetryEvent(event.event, {
        listingId: event.listingId,
        sectionKey: event.sectionKey,
        position: event.position,
        reasonCode: event.reasonCode,
        personalised: event.personalised,
        sessionId: event.sessionId,
      });
    });
    const session = `item_${itemId}_${Date.now()}`;
    setProductSessionId(session);
    return () => {
      setProductAnalyticsHandler(() => {});
    };
  }, [itemId]);

  // ── Item view telemetry ──
  // Fires the itemView analytics event + feeds the backend interactions
  // table (the critical bridge for seller analytics). Fire-and-forget.
  useEffect(() => {
    if (item) {
      ProductAnalytics.itemView(item.id, sectionKey, position, reasonCode, personalised);
      track('item_viewed', {
        listing_id: item.id,
        seller_id: item.sellerId ?? item.seller?.id ?? '',
        price: item.price,
      });
      trackListingView(item.id, { qualified: true }).catch(() => {});
    }
  }, [item?.id, sectionKey, position, reasonCode, personalised]);

  // Seller trust summary — prefer the backend-backed trust data, fall
  // back to a summary built from the listing's embedded seller.
  const seller: SellerTrustSummary | null = sellerTrustData
    ? sellerTrustData
    : item
      ? buildSellerTrustSummary(item.seller)
      : null;

  // Continue-exploring items — prefetched so the next discovery surface
  // stays warm. Filtered to non-look recommendations.
  const exploreItems: Listing[] = useMemo(() => {
    const items: Listing[] = [];
    for (const page of exploreData?.pages ?? []) {
      const section = page.sections.find((candidate) => candidate.key === 'continue_exploring');
      if (!section) continue;
      for (const recommendation of section.items) {
        if (!(recommendation as { type?: string }).type) {
          items.push(recommendation as Listing);
        }
      }
    }
    return items;
  }, [exploreData]);

  const recommendationSections: RecommendationSection[] = recommendationsData?.sections ?? [];

  return {
    listing: item,
    commerce: serverCommerce,
    seller,
    sellerFollow: sellerFollowMutation,
    recommendationSections,
    recommendationsError: recsError,
    soldComparables: soldComps ?? null,
    priceHistory,
    qaSummary: qaSummary ?? null,
    explore: {
      items: exploreItems,
      fetchNextPage: exploreNextPage,
      hasNextPage: exploreHasNextPage,
      isFetchingNextPage: exploreFetching,
    },
    isLoading: queryLoading,
    isError: queryError,
    refetch: refetchListing,
  };
}
