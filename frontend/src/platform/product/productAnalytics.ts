export interface ProductAnalyticsEvent {
  event: string;
  listingId?: string;
  sectionKey?: string;
  position?: number;
  reasonCode?: string;
  personalised?: boolean;
  sessionId?: string;
}

type AnalyticsHandler = (event: ProductAnalyticsEvent) => void;

let handler: AnalyticsHandler | null = null;
let sessionId: string | null = null;

export function setProductAnalyticsHandler(h: AnalyticsHandler) {
  handler = h;
}

export function setProductSessionId(id: string) {
  sessionId = id;
}

export function trackProductEvent(
  event: string,
  data: Omit<ProductAnalyticsEvent, 'event' | 'sessionId'> = {}
) {
  const payload: ProductAnalyticsEvent = {
    event,
    ...data,
    sessionId: sessionId ?? undefined,
  };
  if (handler) {
    try {
      handler(payload);
    } catch {
      // silently fail — analytics must not crash the app
    }
  }
}

export const ProductAnalytics = {
  itemView: (listingId: string) =>
    trackProductEvent('item_detail_view', { listingId }),
  mediaView: (listingId: string, position: number) =>
    trackProductEvent('item_media_view', { listingId, position }),
  mediaZoom: (listingId: string) =>
    trackProductEvent('item_media_zoom', { listingId }),
  itemSave: (listingId: string) =>
    trackProductEvent('item_save', { listingId }),
  itemShare: (listingId: string) =>
    trackProductEvent('item_share', { listingId }),
  sellerProfileOpen: (listingId: string, sellerId: string) =>
    trackProductEvent('seller_profile_open', { listingId, sectionKey: sellerId }),
  sellerMessageStart: (listingId: string) =>
    trackProductEvent('seller_message_start', { listingId }),
  recommendationImpression: (
    listingId: string,
    sectionKey: string,
    position: number,
    reasonCode?: string,
    personalised?: boolean
  ) =>
    trackProductEvent('recommendation_impression', {
      listingId,
      sectionKey,
      position,
      reasonCode,
      personalised,
    }),
  recommendationClick: (
    listingId: string,
    sectionKey: string,
    position: number,
    reasonCode?: string,
    personalised?: boolean
  ) =>
    trackProductEvent('recommendation_click', {
      listingId,
      sectionKey,
      position,
      reasonCode,
      personalised,
    }),
  recommendationSectionSeeAll: (listingId: string, sectionKey: string) =>
    trackProductEvent('recommendation_section_see_all', { listingId, sectionKey }),
  offerStart: (listingId: string) =>
    trackProductEvent('offer_start', { listingId }),
  checkoutStart: (listingId: string) =>
    trackProductEvent('checkout_start', { listingId }),
};
