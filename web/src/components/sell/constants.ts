/**
 * Sell-flow domain constants — mirrors the mobile listing-authoring
 * vocabulary (SellScreen + currencyAuthoringFlows) for the web flow.
 */

import type { Listing, ListingCondition, User } from '@/lib/contracts/domain';
import { LISTINGS } from '@/lib/data/fixtures';

export const MAX_PHOTOS = 8;
export const MAX_TAGS = 8;
export const DESCRIPTION_MAX = 600;

/** The whole listing draft — one flat object owned by SellFlow. */
export interface SellDraft {
  photos: string[];
  title: string;
  brand: string;
  category: string;
  subcategory: string;
  condition: ListingCondition | '';
  size: string;
  description: string;
  /** Discovery tags — mirrors the mobile sell draft's `tags` field. */
  tags: string[];
  price: string;
  /** Per-listing delivery choices — the Listing contract's
   *  shippingMethod/shippingPayer (mobile ShippingPickerSheet). */
  shippingMethod: ShippingMethod | '';
  shippingPayer: ShippingPayer | '';
}

export const EMPTY_DRAFT: SellDraft = {
  photos: [],
  title: '',
  brand: '',
  category: '',
  subcategory: '',
  condition: '',
  size: '',
  description: '',
  tags: [],
  price: '',
  shippingMethod: '',
  shippingPayer: '',
};

export type SellErrors = Partial<
  Record<'title' | 'category' | 'condition' | 'price' | 'photos', string>
>;

/** Prefill the draft from an existing listing — the ?edit=<id> path. */
export function draftFromListing(listing: Listing): SellDraft {
  return {
    photos: listing.images.filter(Boolean),
    title: listing.title ?? '',
    brand: listing.brand ?? '',
    category: listing.category ?? '',
    subcategory: listing.subcategory ?? '',
    condition: listing.condition ?? '',
    size: listing.size ?? '',
    description: listing.description ?? '',
    // Listings published through this flow carry tags forward.
    tags: (listing as Listing & { tags?: string[] }).tags ?? [],
    price: listing.price ? String(listing.price) : '',
    shippingMethod: isShippingMethod(listing.shippingMethod) ? listing.shippingMethod : '',
    shippingPayer: isShippingPayer(listing.shippingPayer) ? listing.shippingPayer : '',
  };
}

// ============================================================================
// CONDITION — radio-card copy ported from the mobile condition picker
// ============================================================================

export interface ConditionOption {
  value: ListingCondition;
  hint: string;
}

export const CONDITION_OPTIONS: ConditionOption[] = [
  { value: 'New with tags', hint: 'Unworn, original tags attached' },
  { value: 'New without tags', hint: 'Unworn, tags removed' },
  { value: 'Very good', hint: 'Lightly used, no visible flaws' },
  { value: 'Good', hint: 'Used, minor signs of wear' },
  { value: 'Satisfactory', hint: 'Visible wear, honestly described' },
];

// ============================================================================
// POSTAGE — per-listing delivery choices. Vocabulary mirrors the mobile
// sell flow's ShippingPickerSheet: a speed (standard/express) and who pays
// (buyer/seller). Costs stay honest — calculated at checkout, never quoted
// here. Unset is allowed and renders as "Confirmed at checkout" downstream.
// ============================================================================

export type ShippingMethod = 'standard' | 'express';
export type ShippingPayer = 'buyer' | 'seller';

export function isShippingMethod(value: unknown): value is ShippingMethod {
  return value === 'standard' || value === 'express';
}
export function isShippingPayer(value: unknown): value is ShippingPayer {
  return value === 'buyer' || value === 'seller';
}

export const SHIPPING_METHOD_OPTIONS: {
  value: ShippingMethod;
  label: string;
  hint: string;
}[] = [
  { value: 'standard', label: 'Standard delivery', hint: 'For most orders' },
  { value: 'express', label: 'Express delivery', hint: 'For buyers in a hurry' },
];

export const SHIPPING_PAYER_OPTIONS: {
  value: ShippingPayer;
  label: string;
  hint: string;
}[] = [
  { value: 'buyer', label: 'Buyer pays', hint: 'Postage is added to their total' },
  { value: 'seller', label: 'Free shipping', hint: 'You cover postage — buyers see “Free delivery”' },
];

/** One-line postage summary — mirrors mobile's formatShippingSummary. */
export function postageSummary(
  method: ShippingMethod | '',
  payer: ShippingPayer | '',
): string | null {
  if (!method) return null;
  const speed = method === 'express' ? 'Express' : 'Standard';
  const who = payer === 'seller' ? 'Free shipping' : payer === 'buyer' ? 'Buyer pays' : null;
  return who ? `${speed} · ${who}` : speed;
}

/**
 * The draft projected as a Listing — feeds the real PDP gallery on the
 * preview surface so sellers see the same media treatment buyers get.
 * Never published; the preview id never resolves outside this screen.
 */
export function draftToPreviewListing(draft: SellDraft, seller: User): Listing {
  const price = parsePriceInput(draft.price);
  return {
    id: 'sell-preview',
    title: draft.title.trim() || 'Untitled listing',
    brand: draft.brand.trim() || null,
    size: draft.size || null,
    condition: draft.condition || 'Good',
    price: price ?? 0,
    priceWithProtection:
      price != null ? Math.round((price + protectionFeeGbp(price)) * 100) / 100 : undefined,
    images: draft.photos,
    likes: 0,
    views: 0,
    sellerId: seller.id,
    seller: {
      id: seller.id,
      username: seller.username,
      avatar: seller.avatar,
      rating: seller.rating,
      reviewCount: seller.reviewCount,
      location: seller.location,
      verified: seller.isVerified,
    },
    category: draft.category,
    subcategory: draft.subcategory || null,
    description: draft.description.trim(),
    status: 'draft',
    shippingMethod: draft.shippingMethod || null,
    shippingPayer: draft.shippingPayer || null,
  };
}

// ============================================================================
// TAXONOMY — category slug → subcategory leaves + size grammar
// ============================================================================

export const SUBCATEGORIES: Record<string, string[]> = {
  women: ['Dresses', 'Tops', 'Knitwear', 'Coats', 'Jackets', 'Jeans', 'Trousers', 'Skirts', 'Boots', 'Shoes'],
  men: ['T-shirts', 'Shirts', 'Hoodies', 'Knitwear', 'Jackets', 'Denim jackets', 'Leather jackets', 'Jeans', 'Trousers', 'Blazers'],
  sneakers: ['Low tops', 'High tops', 'Boots', 'Sandals'],
  bags: ['Shoulder bags', 'Totes', 'Crossbody bags', 'Backpacks', 'Clutches'],
  accessories: ['Watches', 'Sunglasses', 'Jewellery', 'Scarves', 'Belts', 'Hats'],
  vintage: ['T-shirts', 'Denim', 'Jackets', 'Dresses', 'Accessories'],
  designer: ['Bags', 'Dresses', 'Shoes', 'Accessories', 'Ready-to-wear'],
  streetwear: ['T-shirts', 'Hoodies', 'Sneakers', 'Jackets', 'Accessories'],
};

const CLOTHING_SIZES = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'UK 6', 'UK 8', 'UK 10', 'UK 12', 'UK 14', 'UK 16', 'One size'];
const SHOE_SIZES = ['UK 4', 'UK 5', 'UK 6', 'UK 7', 'UK 8', 'UK 9', 'UK 10', 'UK 11', 'UK 12'];
const ONE_SIZE = ['One size'];

export function sizesForCategory(category: string): string[] {
  if (category === 'sneakers') return SHOE_SIZES;
  if (category === 'bags' || category === 'accessories') return ONE_SIZE;
  if (!category) return [];
  return CLOTHING_SIZES;
}

/** Categories that don't carry a meaningful size choice at all. */
export function isSizelessCategory(category: string): boolean {
  return category === 'bags' || category === 'accessories';
}

export const POPULAR_BRANDS = [
  'Nike',
  'Adidas',
  "Levi's",
  'Zara',
  'Ralph Lauren',
  'New Balance',
  'COS',
  'Carhartt WIP',
  'Dr. Martens',
  'The North Face',
];

// ============================================================================
// PRICING — buyer-protection fee mirrors calculatePlatformChargeGbp:
// 5% + £0.70, floor 2%, zero-value carries no fee. Buyer pays the fee;
// the seller receives the listed price in full.
// ============================================================================

export function protectionFeeGbp(priceGbp: number): number {
  if (!Number.isFinite(priceGbp) || priceGbp <= 0) return 0;
  const charge = priceGbp * 0.05 + 0.7;
  const minimum = priceGbp * 0.02;
  return Number(Math.max(charge, minimum).toFixed(2));
}

export function parsePriceInput(raw: string): number | null {
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Keep digits + a single decimal point (mirrors sanitizeDecimalInput). */
export function sanitizePriceInput(raw: string): string {
  const normalized = raw.replace(',', '.').replace(/[^0-9.]/g, '');
  const firstDot = normalized.indexOf('.');
  if (firstDot === -1) return normalized;
  return (
    normalized.slice(0, firstDot + 1) +
    normalized.slice(firstDot + 1).replace(/\./g, '')
  );
}

/** Suggested price — median of comparable live listings in the category. */
export function suggestedPriceFor(category: string): number | null {
  const prices = LISTINGS.filter((l) => l.category === category)
    .map((l) => l.price)
    .sort((a, b) => a - b);
  if (!prices.length) return null;
  return Math.round(prices[Math.floor(prices.length / 2)] ?? 0);
}
