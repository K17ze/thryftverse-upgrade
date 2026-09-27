/**
 * Checkout view model — pure derivations for /checkout, keeping the page
 * thin. Ports of the mobile components/checkout/checkoutViewModels.ts
 * semantics, adapted to the web's multi-parcel (per-seller) bag:
 *
 *  - checkoutTotalsWithDelivery: the ledger when each buyer-paid parcel
 *    carries a chosen delivery quote instead of the flat fee.
 *  - buildPartialDataPrompt: one quiet banner naming the first missing
 *    capability (address → payment), mirroring buildPartialDataPrompt.
 *  - computeCheckoutSteps: the Delivery/Payment/Review dot states.
 */

import type { Listing, PaymentMethod } from '@/lib/contracts/domain';
import type { AppIconName } from '@/components/ui/Icon';
import { sellerGroups, type SellerGroup } from '@/lib/data/fixtures';
import { protectionFeeFor } from '@/lib/data/fixtures-commerce';
import type { CheckoutTotals } from '@/lib/commerce/postage';
import {
  defaultParcelQuote,
  type CheckoutDeliveryQuote,
} from '@/lib/data/fixtures-checkout';

/** Parcel selection map — chosen quote per sellerId. Parcels without an
 *  entry ride the default quote (the flat-fee equivalent). */
export type DeliverySelection = Record<string, CheckoutDeliveryQuote>;

/** A parcel the seller ships on their own tab — no buyer-paid delivery
 *  choice exists for it (mobile: shippingPayer === 'seller'). */
export function parcelSellerCovered(group: SellerGroup): boolean {
  return (
    group.items.length > 0 &&
    group.items.every((item) => item.shippingPayer === 'seller')
  );
}

/** The quote a parcel is priced on — the buyer's pick, or the default
 *  catalogue quote. Seller-covered parcels return null (no charge). */
export function parcelQuote(
  group: SellerGroup,
  selection: DeliverySelection,
): CheckoutDeliveryQuote | null {
  if (parcelSellerCovered(group)) return null;
  return selection[group.sellerId] ?? defaultParcelQuote();
}

/** Postage for one parcel under the selection — 0 when seller-covered. */
export function parcelPostageWithSelection(
  group: SellerGroup,
  selection: DeliverySelection,
): number {
  return parcelQuote(group, selection)?.priceFromGbp ?? 0;
}

/** Bag/checkout totals with per-parcel delivery choices — same shape as
 *  checkoutTotals so OrderSummary keeps one contract. */
export function checkoutTotalsWithDelivery(
  items: Listing[],
  selection: DeliverySelection,
): CheckoutTotals {
  const groups = sellerGroups(items);
  const itemsSum = items.reduce((sum, l) => sum + l.price, 0);
  const protectionFee = items.reduce((sum, l) => sum + protectionFeeFor(l), 0);
  const shippingFee = groups.reduce(
    (sum, g) => sum + parcelPostageWithSelection(g, selection),
    0,
  );
  return {
    items: itemsSum,
    protectionFee,
    shippingFee: Math.round(shippingFee * 100) / 100,
    parcels: groups.length,
    total: itemsSum + protectionFee + Math.round(shippingFee * 100) / 100,
  };
}

// ── Partial-data prompt (mobile buildPartialDataPrompt) ──────────────────────

export interface CheckoutPartialDataPrompt {
  icon: AppIconName;
  message: string;
  actionLabel: string;
  onAction: () => void;
}

/**
 * One quiet prompt naming the first missing capability — the checkout is
 * still usable, this just says what's missing. Priority mirrors mobile:
 * address before payment (delivery quotes can't resolve without a
 * destination anyway).
 */
export function buildPartialDataPrompt({
  isLoading,
  addressLoaded,
  paymentLoaded,
  onAddAddress,
  onAddPayment,
}: {
  isLoading: boolean;
  addressLoaded: boolean;
  paymentLoaded: boolean;
  onAddAddress: () => void;
  onAddPayment: () => void;
}): CheckoutPartialDataPrompt | null {
  if (isLoading) return null;

  if (!addressLoaded) {
    return {
      icon: 'location',
      message: 'Add a delivery address to continue.',
      actionLabel: 'Add address',
      onAction: onAddAddress,
    };
  }
  if (!paymentLoaded) {
    return {
      icon: 'card',
      message: 'Add a payment method to continue.',
      actionLabel: 'Add payment',
      onAction: onAddPayment,
    };
  }
  return null;
}

// ── Progress dots (mobile computeCheckoutStepCompletion) ─────────────────────

/**
 * Delivery / Payment / Review completion for the dot row:
 *  - delivery: an address exists and every buyer-paid parcel resolves a
 *    delivery service (the default quote means they always do).
 *  - payment: a chargeable method is selected — a saved card, or the 1ZE
 *    wallet when its settled balance covers the order.
 *  - review: everything above; the Pay button is live.
 */
export function computeCheckoutSteps({
  hasAddress,
  parcelsHaveDelivery,
  selectedPayment,
  useOnezeWallet,
  onezeSettled,
  onezeRequired,
}: {
  hasAddress: boolean;
  parcelsHaveDelivery: boolean;
  /** The selected saved method, already filtered for expiry. */
  selectedPayment: PaymentMethod | null;
  useOnezeWallet: boolean;
  /** Settled 1ZE pocket balance (0 when unknown). */
  onezeSettled: number;
  /** 1ZE amount the order needs. */
  onezeRequired: number;
}): { delivery: boolean; payment: boolean; review: boolean } {
  const delivery = hasAddress && parcelsHaveDelivery;
  const payment = useOnezeWallet
    ? onezeSettled >= onezeRequired
    : !!selectedPayment;
  return { delivery, payment, review: delivery && payment };
}
