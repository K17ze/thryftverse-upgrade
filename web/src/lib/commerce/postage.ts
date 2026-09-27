/**
 * Parcel postage — the Vinted model the bag/checkout surfaces already
 * imply ("items from one seller post together"): one parcel per seller,
 * one flat postage charge per parcel. A parcel is free only when every
 * item in it carries shippingPayer === 'seller' — the same flag the PDP
 * renders as "Free delivery — the seller covers postage".
 *
 * This supersedes orderTotals().shippingFee (one flat charge per
 * checkout) on the bag/checkout surfaces: a two-seller order is two
 * parcels, and the ledger must charge for both or the recorded order
 * total is a lie.
 */

import { sellerGroups, type SellerGroup } from '@/lib/data/fixtures';
import { SHIPPING_FEE, protectionFeeFor } from '@/lib/data/fixtures-commerce';
import type { Listing } from '@/lib/contracts/domain';

/** The postage a single seller parcel costs the buyer. */
export function parcelPostageFor(group: SellerGroup): number {
  const sellerCovered =
    group.items.length > 0 &&
    group.items.every((item) => item.shippingPayer === 'seller');
  return sellerCovered ? 0 : SHIPPING_FEE;
}

export interface CheckoutTotals {
  items: number;
  protectionFee: number;
  /** Sum of per-parcel postage — one charge per seller, not per checkout. */
  shippingFee: number;
  /** Number of seller parcels the order splits into. */
  parcels: number;
  total: number;
}

/** Bag/checkout totals under the per-seller parcel model. */
export function checkoutTotals(items: Listing[]): CheckoutTotals {
  const groups = sellerGroups(items);
  const itemsSum = items.reduce((sum, l) => sum + l.price, 0);
  const protectionFee = items.reduce((sum, l) => sum + protectionFeeFor(l), 0);
  const shippingFee = groups.reduce((sum, g) => sum + parcelPostageFor(g), 0);
  return {
    items: itemsSum,
    protectionFee,
    shippingFee,
    parcels: groups.length,
    total: itemsSum + protectionFee + shippingFee,
  };
}
