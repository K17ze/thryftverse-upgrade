import React from 'react';
import {
  CommerceDetailSection,
  CommerceDetailDisclosureRow,
  ShippingReturnsInfo,
  SustainabilityImpact,
} from '../commerce/detail';
import { useFormattedPrice } from '../../hooks/useFormattedPrice';
import type { ListingCommerceContext } from '../../platform/product';
import type { SupportedCurrencyCode } from '../../constants/currencies';

export interface ItemDetailBuyingSectionProps {
  /** Non-empty when the listing carries purchase terms worth surfacing —
   *  an empty string hides the whole section. The value is the
   *  derivation gate only; owned facts are read from `commerce` so no
   *  entry point restates another's copy. */
  purchaseSummary: string;
  commerce: ListingCommerceContext;
  listingId: string;
  /** Opens the "Costs, delivery & protection" sheet. */
  onShowPurchaseDetails: () => void;
}

/**
 * Zone F — purchase information under one ownership model (audit 04):
 *
 * - `ShippingReturnsInfo` owns the at-a-glance delivery/returns truth:
 *   its collapsed summary states shipping cost/status and returns
 *   status; expansion keeps the full policy detail.
 * - The "Costs & buyer protection" row owns the path to complete terms
 *   (the sheet). Its preview states only facts the sheet owns that the
 *   shipping disclosure does not — estimated total, buyer-protection
 *   coverage and authenticity — so shipping/returns copy is never
 *   duplicated across the two entry points. When the sheet owns no
 *   previewable facts the label carries the row alone.
 * - `SustainabilityImpact` owns environmental impact (unchanged).
 *
 * Progressive disclosure — summaries visible, details expand on tap.
 * Sits after the seller.
 */
export function ItemDetailBuyingSection({
  purchaseSummary,
  commerce,
  listingId,
  onShowPurchaseDetails,
}: ItemDetailBuyingSectionProps) {
  const { formatFromFiat, currencyCode } = useFormattedPrice();
  if (!purchaseSummary) return null;

  const currency = (commerce.currency || currencyCode) as SupportedCurrencyCode;
  const costsFacts: string[] = [];
  if (commerce.estimatedTotal != null) {
    const total = formatFromFiat(commerce.estimatedTotal, currency, { displayMode: 'fiat' });
    // Mirror the terms sheet's qualifier: the estimated total excludes
    // shipping unless the seller pays it — the money fact must not
    // read as more inclusive than it is.
    costsFacts.push(
      commerce.shippingPayer === 'seller'
        ? `Est. total ${total}`
        : `Est. total ${total} (excl. shipping)`,
    );
  } else if (commerce.buyerProtectionFee != null && commerce.buyerProtectionFee > 0) {
    costsFacts.push(
      `Buyer protection fee ${formatFromFiat(commerce.buyerProtectionFee, currency, { displayMode: 'fiat' })}`,
    );
  }
  if (commerce.protectionPolicy?.available) {
    costsFacts.push(commerce.protectionPolicy.label || 'Buyer Protection');
  }
  const authenticity = commerce.authenticity;
  if (authenticity && authenticity.status !== 'not_offered') {
    costsFacts.push(
      authenticity.label
        ?? (authenticity.status === 'verified'
          ? 'Authenticity verified'
          : authenticity.status === 'in_progress'
            ? 'Verification in progress'
            // 'eligible' — verification is available but not requested.
            : 'Authenticity check available'),
    );
  }
  const costsSummary = costsFacts.length > 0 ? costsFacts.join(' · ') : undefined;

  return (
    <CommerceDetailSection variant="continuation">
      <CommerceDetailDisclosureRow
        label="Costs & buyer protection"
        summary={costsSummary}
        onPress={onShowPurchaseDetails}
      />
      <ShippingReturnsInfo
        commerce={commerce}
      />
      <SustainabilityImpact listingId={listingId} />
    </CommerceDetailSection>
  );
}
