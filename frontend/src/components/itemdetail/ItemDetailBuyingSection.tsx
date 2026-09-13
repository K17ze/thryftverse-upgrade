import React from 'react';
import {
  CommerceDetailSection,
  CommerceDetailDisclosureRow,
  ShippingReturnsInfo,
  SustainabilityImpact,
} from '../commerce/detail';
import type { ListingCommerceContext } from '../../platform/product';

export interface ItemDetailBuyingSectionProps {
  /** Compact purchase summary — empty string hides the whole section. */
  purchaseSummary: string;
  commerce: ListingCommerceContext;
  listingId: string;
  /** Opens the "Costs, delivery & protection" sheet. */
  onShowPurchaseDetails: () => void;
}

/**
 * Zone F — Shipping & returns (collapsed by default). Full commerce
 * details: costs, delivery, protection, returns, authenticity.
 * Progressive disclosure — summary visible, details expand on tap.
 * Sits after the seller.
 */
export function ItemDetailBuyingSection({
  purchaseSummary,
  commerce,
  listingId,
  onShowPurchaseDetails,
}: ItemDetailBuyingSectionProps) {
  if (!purchaseSummary) return null;

  return (
    <CommerceDetailSection label="Buying this item" variant="continuation">
      <CommerceDetailDisclosureRow
        label="Costs, delivery & protection"
        summary="Full breakdown"
        onPress={onShowPurchaseDetails}
        leadingIcon="information-circle-outline"
      />
      <ShippingReturnsInfo
        commerce={commerce}
      />
      <SustainabilityImpact listingId={listingId} />
    </CommerceDetailSection>
  );
}
