'use client';

import { useMemo, useState } from 'react';
import type { OfferWithOrder } from '@/lib/commerce/offerAcceptance';
import { useResolvedListings } from '@/lib/hooks/home-modules';
import { useListingIds } from '@/lib/hooks/listing-resolution';
import { useChatOfferActions, useChatOffers } from '../useChatOffers';

/**
 * Isolated commerce and offer workflow for chat:
 *  - Offer lifecycles (accept, decline, counter)
 *  - Counter-offer target selection and listing resolution
 *  - Listing-share offer composer
 */
export function useChatCommerceWorkflow(conversationId: string) {
  const { data: chatOffers } = useChatOffers();
  const {
    respond: respondToOffer,
    sendCounter,
    sendNewOffer,
  } = useChatOfferActions(conversationId);

  const [counterTarget, setCounterTarget] = useState<OfferWithOrder | null>(null);
  const [shareOfferId, setShareOfferId] = useState<string | null>(null);

  const shareOfferResolved = useListingIds(
    useMemo(() => (shareOfferId ? [shareOfferId] : []), [shareOfferId]),
  );
  const shareOfferListing = shareOfferId
    ? shareOfferResolved.byId.get(shareOfferId)
    : undefined;

  const { items: counterListingResolved } = useResolvedListings(
    counterTarget ? [counterTarget.listingId] : [],
  );
  const counterListing = counterListingResolved[0];

  return {
    chatOffers,
    counterTarget,
    setCounterTarget,
    shareOfferId,
    setShareOfferId,
    shareOfferListing,
    counterListing,
    respondToOffer,
    sendCounter,
    sendNewOffer,
  };
}
