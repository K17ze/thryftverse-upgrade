/**
 * Seller-tools fixture extensions — the fixture-side counterparts for the
 * gap-cluster surfaces that fixtures-seller.ts doesn't already own:
 * batch 'edit' patches, offer-to-likers batches, and the analytics
 * aggregates the /seller-hub/analytics view consumes.
 *
 * Everything here is session-local and read-only-safe: mutations write the
 * shared MY_LISTINGS array (same posture as pauseFixtureListing) or a
 * private session store flagged for demo disclosure.
 */

import { MY_LISTINGS } from '@/lib/data/fixtures';
import { allCommerceOrders } from '@/lib/data/fixtures-commerce';
import {
  round2,
  sellerDailySeries,
  sellerPerformanceRows,
  type BulkItemReceipt,
  type SellerDailyPoint,
} from './fixtures-seller';
import type { SellerHubListingEditPatch } from '@/lib/api/services/sellerHub';
import type { ListingCondition } from '@/lib/contracts/domain';

// ============================================================================
// BULK EDIT — fixture-side of POST /seller-hub/batch-command {command:'edit'}
// ============================================================================

const EDITABLE_CONDITIONS = new Set<ListingCondition>([
  'New with tags',
  'New without tags',
  'Very good',
  'Good',
  'Satisfactory',
]);

export interface FixtureEditReceipt extends BulkItemReceipt {
  /** Field names actually written — the batch-command contract's
   *  appliedFields, so live and fixture receipts report identically. */
  appliedFields?: string[];
}

/**
 * Apply one listing patch — the per-item fixture equivalent of the live
 * 'edit' batch command. Guardrails mirror the service contract: sold rows
 * keep order history and reject; a patch carrying no writable fields
 * rejects rather than fabricating a no-op apply.
 */
export function applyFixtureListingEdit(
  id: string,
  patch: SellerHubListingEditPatch,
): FixtureEditReceipt {
  const listing = MY_LISTINGS.find((l) => l.id === id);
  if (!listing) return { listingId: id, state: 'rejected', reason: 'not_found' };
  if (listing.isSold || listing.status === 'sold') {
    return { listingId: id, state: 'rejected', reason: 'already_sold' };
  }

  const applied: string[] = [];
  if (patch.title != null && patch.title.trim()) {
    listing.title = patch.title.trim();
    applied.push('title');
  }
  if (patch.description != null) {
    listing.description = patch.description.trim();
    applied.push('description');
  }
  if (patch.priceGbp != null && Number.isFinite(patch.priceGbp) && patch.priceGbp >= 0.5) {
    listing.price = round2(patch.priceGbp);
    applied.push('priceGbp');
  }
  if (patch.category != null && patch.category.trim()) {
    listing.category = patch.category;
    applied.push('category');
  }
  if (patch.brand != null) {
    listing.brand = patch.brand.trim() || null;
    applied.push('brand');
  }
  if (patch.size != null) {
    listing.size = patch.size.trim() || null;
    applied.push('size');
  }
  if (patch.condition != null && EDITABLE_CONDITIONS.has(patch.condition as ListingCondition)) {
    listing.condition = patch.condition as ListingCondition;
    applied.push('condition');
  }
  if (patch.originalPriceGbp != null && Number.isFinite(patch.originalPriceGbp)) {
    listing.originalPrice = patch.originalPriceGbp > 0 ? round2(patch.originalPriceGbp) : undefined;
    applied.push('originalPriceGbp');
  }
  if (patch.shippingMethod != null && patch.shippingMethod.trim()) {
    listing.shippingMethod = patch.shippingMethod;
    applied.push('shippingMethod');
  }
  if (patch.shippingPayer != null && patch.shippingPayer.trim()) {
    listing.shippingPayer = patch.shippingPayer;
    applied.push('shippingPayer');
  }

  if (applied.length === 0) {
    return { listingId: id, state: 'rejected', reason: 'empty_patch' };
  }
  return { listingId: id, state: 'applied', appliedFields: applied };
}

// ============================================================================
// OFFER TO LIKERS — session-local record of seller-authored fan-outs
// ============================================================================

/**
 * A liker-offer batch the seller sent in fixture mode. Recorded locally so
 * the manage surface can show "you offered £X to N likers on …" — a true
 * record of an action taken, not invented liker identities. `demo` marks
 * the row so every reader discloses no offers actually left the device.
 */
export interface LikerOfferBatch {
  listingId: string;
  offerPriceGbp: number;
  discountPct: number | null;
  likerCount: number;
  includeFreeShipping: boolean;
  expiryHours: number;
  createdAt: string;
  batchKey: string;
}

const LIKER_OFFER_BATCHES: LikerOfferBatch[] = [];

export function recordLikerOffer(batch: Omit<LikerOfferBatch, 'createdAt'>): LikerOfferBatch {
  const row: LikerOfferBatch = { ...batch, createdAt: new Date().toISOString() };
  LIKER_OFFER_BATCHES.push(row);
  return row;
}

export function likerOfferBatches(listingId: string): LikerOfferBatch[] {
  return LIKER_OFFER_BATCHES.filter((b) => b.listingId === listingId);
}

export function latestLikerOffer(listingId: string): LikerOfferBatch | null {
  const rows = likerOfferBatches(listingId);
  return rows.length ? rows[rows.length - 1]! : null;
}

// ============================================================================
// ANALYTICS AGGREGATES — derived views over the shared fixtures
// ============================================================================

/** Earliest day the fixture series covers — range pickers clamp to this
 *  and disclose the clamp instead of implying older history exists. */
export function fixtureSeriesBounds(): { first: string; last: string } {
  const all = sellerDailySeries();
  return { first: all[0]!.date, last: all[all.length - 1]!.date };
}

/** Revenue/orders/views/likes for an inclusive ISO date range, clamped to
 *  the generated 90-day window. Empty result is a truthful "no data". */
export function sellerSeriesRange(fromISO: string, toISO: string): SellerDailyPoint[] {
  return sellerDailySeries().filter((p) => p.date >= fromISO && p.date <= toISO);
}

export interface SellerCategorySlice {
  category: string;
  label: string;
  items: number;
  valueGbp: number;
  sharePct: number;
}

const CATEGORY_LABELS: Record<string, string> = {
  women: 'Women',
  men: 'Men',
  sneakers: 'Sneakers',
  bags: 'Bags',
  accessories: 'Accessories',
  vintage: 'Vintage',
  designer: 'Designer',
  streetwear: 'Streetwear',
};

const categoryLabel = (slug: string) =>
  CATEGORY_LABELS[slug] ??
  (slug ? slug.charAt(0).toUpperCase() + slug.slice(1) : 'Uncategorised');

/**
 * Category mix across the seller's real inventory — live rows plus the
 * sold archive (the same population sellerPerformanceRows reports on).
 * Share is by item count; valueGbp is the sum of listed prices.
 */
export function sellerCategoryMix(): SellerCategorySlice[] {
  const rows = sellerPerformanceRows('90d');
  const byCategory = new Map<string, { items: number; valueGbp: number }>();
  for (const row of rows) {
    const key = row.listing.category || 'uncategorised';
    const bucket = byCategory.get(key) ?? { items: 0, valueGbp: 0 };
    bucket.items += 1;
    bucket.valueGbp += row.listing.price;
    byCategory.set(key, bucket);
  }
  const total = rows.length;
  return [...byCategory.entries()]
    .map(([category, b]) => ({
      category,
      label: categoryLabel(category),
      items: b.items,
      valueGbp: round2(b.valueGbp),
      sharePct: total > 0 ? Math.round((b.items / total) * 100) : 0,
    }))
    .sort((a, b) => b.items - a.items || b.valueGbp - a.valueGbp);
}

export interface RepeatBuyerStats {
  /** Distinct buyers with at least one order from this seller. */
  buyers: number;
  /** Buyers with two or more orders. */
  repeatBuyers: number;
  /** repeatBuyers / buyers — null when there are no buyers yet. */
  repeatSharePct: number | null;
  /** Share of all seller orders placed by repeat buyers. */
  repeatOrderSharePct: number | null;
  orders: number;
}

/**
 * Cohort-style returning-buyer read — real commerce orders where the
 * fixture viewer ('me') is the seller. Null when the order book is empty
 * so the UI renders an honest unavailable state, never a 0% guess.
 */
export function sellerRepeatBuyerStats(): RepeatBuyerStats | null {
  const sales = allCommerceOrders().filter(
    (o) => o.sellerId === 'me' && o.status !== 'cancelled',
  );
  if (sales.length === 0) return null;
  const perBuyer = new Map<string, number>();
  for (const o of sales) {
    perBuyer.set(o.buyerId, (perBuyer.get(o.buyerId) ?? 0) + 1);
  }
  const buyers = perBuyer.size;
  const repeatBuyers = [...perBuyer.values()].filter((n) => n >= 2).length;
  const repeatOrders = [...perBuyer.values()].reduce((s, n) => s + (n >= 2 ? n : 0), 0);
  return {
    buyers,
    repeatBuyers,
    repeatSharePct: buyers > 0 ? Math.round((repeatBuyers / buyers) * 100) : null,
    repeatOrderSharePct: sales.length > 0 ? Math.round((repeatOrders / sales.length) * 100) : null,
    orders: sales.length,
  };
}
