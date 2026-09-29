/**
 * Sell-flow domain constants — mirrors the mobile listing-authoring
 * vocabulary (SellScreen + currencyAuthoringFlows) for the web flow.
 */

import type { Listing, ListingCondition, User } from '@/lib/contracts/domain';
import type { AppIconName } from '@/components/ui/Icon';
import { LISTINGS } from '@/lib/data/fixtures';
import {
  canonicalCategoryId,
  canonicalCondition,
  canonicalSubcategoryId,
  isKnownCategoryId,
  isSizeRequiredCategory,
} from './taxonomy';

export {
  allowedConditionsFor,
  conditionAllowedFor,
  isSizelessCategory,
  isSizeRequiredCategory,
  sizesForCategory,
} from './taxonomy';

/** Media cap — mirrors the mobile MAX_MEDIA_COUNT (SellScreen passes
 *  `maxPhotos={10 - mediaDraftItems.length}`); images and video share the
 *  same pool. */
export const MAX_PHOTOS = 10;
export const MAX_TAGS = 8;
export const DESCRIPTION_MAX = 600;
/**
 * Publishable-description floor. Raised above the contract's 10-char
 * minimum (which accepts "blue top" — noise, not a description): a real
 * listing description carries material, fit or condition detail, and
 * under ~40 characters it almost never does. Web enforces the honest
 * floor; the backend still accepts ≥10 so legacy rows stay editable.
 */
export const DESCRIPTION_MIN = 40;

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
  /**
   * Original retail price / RRP — the contract's `originalPrice`
   * (wire: originalPriceGbp). Buyers see it as a struck-through "was"
   * price, so it must be an honest reference price higher than the ask —
   * anything else reads as a fake discount.
   */
  originalPrice: string;
  /**
   * Seller-asserted sustainability attributes — mirrors the mobile
   * SustainabilityTags selector. These are the seller's own claims, not
   * platform-verified facts; the draft carries them and preview/review
   * disclose them as such.
   */
  sustainabilityTags: string[];
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
  originalPrice: '',
  sustainabilityTags: [],
  shippingMethod: '',
  shippingPayer: '',
};

export type SellErrors = Partial<
  Record<
    | 'title'
    | 'category'
    | 'condition'
    | 'size'
    | 'description'
    | 'price'
    | 'originalPrice'
    | 'photos',
    string
  >
>;

/**
 * Prefill the draft from an existing listing — the ?edit=<id> path.
 * Taxonomy values are canonicalised on the way in: the draft only ever
 * carries ids the pickers can emit, so re-publishing an edited listing
 * can't leak a dead fixture slug or a display-name subcategory. Values
 * with no honest canonical equivalent come back empty — the picker shows
 * unselected and the completeness gate asks for a re-pick.
 */
export function draftFromListing(listing: Listing): SellDraft {
  const category = canonicalCategoryId(listing.category);
  // Media rows carry the authoritative order + kind — images[] alone
  // collapses video slots to their poster still, which would re-attach a
  // video slot as a plain image on save. Prefer media uris when present.
  const stagedUris = listing.media?.length
    ? listing.media.map((m) => m.uri)
    : listing.images;
  return {
    photos: stagedUris.filter(Boolean),
    title: listing.title ?? '',
    brand: listing.brand ?? '',
    category,
    subcategory: canonicalSubcategoryId(category, listing.subcategory),
    condition: canonicalCondition(listing.condition),
    size: listing.size ?? '',
    description: listing.description ?? '',
    // Listings published through this flow carry tags forward.
    tags: (listing as Listing & { tags?: string[] }).tags ?? [],
    price: listing.price ? String(listing.price) : '',
    originalPrice: listing.originalPrice ? String(listing.originalPrice) : '',
    // Same extension-field pattern as `tags` — seller-asserted claims that
    // ride on the record outside the shared contract.
    sustainabilityTags: listingSustainabilityTags(listing),
    shippingMethod: isShippingMethod(listing.shippingMethod) ? listing.shippingMethod : '',
    shippingPayer: isShippingPayer(listing.shippingPayer) ? listing.shippingPayer : '',
  };
}

// ============================================================================
// SUSTAINABILITY — seller-asserted attributes, ported from the mobile
// SustainabilityTags selector. Claims, never platform-verified facts: the
// UI discloses that wherever they render, and nothing here feeds the
// backend's sustainability_grade (which stays platform-computed).
// ============================================================================

export interface SustainabilityTagOption {
  id: string;
  label: string;
  icon: AppIconName;
  /** One-line impact summary — mirrors the mobile copy verbatim. */
  impact: string;
}

export const SUSTAINABILITY_TAG_OPTIONS: SustainabilityTagOption[] = [
  { id: 'pre-loved', label: 'Pre-loved', icon: 'repeat', impact: 'Extends the lifecycle of an existing item.' },
  { id: 'vintage', label: 'Vintage', icon: 'clock', impact: '20+ years old — circular fashion at its best.' },
  { id: 'sustainable-brand', label: 'Sustainable brand', icon: 'leaf', impact: 'Brand with documented sustainability practices.' },
  { id: 'upcycled', label: 'Upcycled', icon: 'sparkles', impact: 'Modified from its original form into something new.' },
  { id: 'plastic-free-packaging', label: 'Plastic-free packaging', icon: 'box', impact: 'You ship in eco-friendly, plastic-free packaging.' },
];

/**
 * Extension fields the sell flow stamps on its own records — the same
 * escape hatch `tags` already uses (the shared Listing contract is owned
 * cross-department and stays untouched).
 */
export type ListingWithSellExtras = Listing & {
  tags?: string[];
  sustainabilityTags?: string[];
};

export function listingSustainabilityTags(listing: Listing): string[] {
  return (listing as ListingWithSellExtras).sustainabilityTags ?? [];
}

// ============================================================================
// CONDITION — the canonical taxonomy set (taxonomy_nodes type='condition'),
// radio-card copy ported from the mobile condition picker. The legacy
// 'New without tags' option is gone: it isn't a canonical condition, so
// new listings never emit it (stored legacy values canonicalise to
// 'Very good' on hydrate — see canonicalCondition in ./taxonomy).
// ============================================================================

export interface ConditionOption {
  value: ListingCondition;
  hint: string;
}

export const CONDITION_OPTIONS: ConditionOption[] = [
  { value: 'New with tags', hint: 'Unworn, original tags attached' },
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
  icon: AppIconName;
}[] = [
  { value: 'standard', label: 'Standard delivery', hint: 'For most orders', icon: 'box' },
  { value: 'express', label: 'Express delivery', hint: 'For buyers in a hurry', icon: 'zap' },
];

export const SHIPPING_PAYER_OPTIONS: {
  value: ShippingPayer;
  label: string;
  hint: string;
  icon: AppIconName;
}[] = [
  { value: 'buyer', label: 'Buyer pays', hint: 'Postage is added to their total', icon: 'profile' },
  { value: 'seller', label: 'Free shipping', hint: 'You cover postage — buyers see “Free delivery”', icon: 'store' },
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
export function draftToPreviewListing(
  draft: SellDraft,
  seller: User,
  /** Staged-media lookup (kind + poster) keyed by the draft's preview URL —
   *  video slots project as their poster still, never a playable-source uri
   *  into an <img> slot. */
  mediaOf?: (src: string) => { kind?: 'image' | 'video'; poster?: string | null } | undefined,
): Listing {
  const price = parsePriceInput(draft.price);
  // RRP only rides the preview when it's an honest "was" price — a value
  // at or under the ask would fake a discount, so it never reaches the
  // projection (the composer validates the same rule before publish).
  const originalPrice = parsePriceInput(draft.originalPrice);
  const honestRrp =
    originalPrice != null && price != null && originalPrice > price
      ? originalPrice
      : undefined;
  return {
    id: 'sell-preview',
    title: draft.title.trim() || 'Untitled listing',
    brand: draft.brand.trim() || null,
    size: draft.size || null,
    condition: draft.condition || 'Good',
    price: price ?? 0,
    originalPrice: honestRrp,
    priceWithProtection:
      price != null ? Math.round((price + protectionFeeGbp(price)) * 100) / 100 : undefined,
    // Video slots project their poster still into images[] (the backend's
    // own listingImageUrls semantics — media[] carries the real uri).
    images: draft.photos
      .map((src) => {
        const m = mediaOf?.(src);
        return m?.kind === 'video' ? (m.poster ?? src) : src;
      })
      .filter(Boolean),
    media: draft.photos.length
      ? draft.photos.map((src) => {
          const m = mediaOf?.(src);
          return {
            kind: (m?.kind === 'video' ? 'video' : 'image') as 'image' | 'video',
            uri: src,
            poster: m?.poster ?? null,
          };
        })
      : undefined,
    ...({ sustainabilityTags: [...draft.sustainabilityTags] } as Partial<ListingWithSellExtras>),
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
// TAXONOMY — the composer speaks canonical taxonomy ids, ported in
// ./taxonomy from the shared contract (lib/contracts/taxonomy.ts) and the
// category activation policy. Picker option builders take a node list so
// live-fetched vocabularies and the seed share the same code path; the
// size/condition helpers below are re-exported from there to keep this
// file's import surface stable.
// ============================================================================

/** Brand quick-picks — canonical brand node names (brand is a free-text
 *  field; chips only shortcut the names buyers already search). */
export const POPULAR_BRANDS = [
  'Nike',
  'Adidas',
  "Levi's",
  'Zara',
  'Ralph Lauren',
  'New Balance',
  'H&M',
  'Carhartt',
  'The North Face',
  'Vans',
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
  return priceCompsFor(category)?.median ?? null;
}

/**
 * Comparable set for a category — live listings only (this fixture pool has
 * no sold records, so nothing here claims sold-price evidence). Used for
 * the suggestion chip, the range line and the market-position read.
 */
export function priceCompsFor(
  category: string,
): { min: number; max: number; median: number; count: number } | null {
  const prices = LISTINGS.filter((l) => l.category === category)
    .map((l) => l.price)
    .filter((p) => Number.isFinite(p) && p > 0)
    .sort((a, b) => a - b);
  if (!prices.length) return null;
  return {
    min: prices[0] ?? 0,
    max: prices[prices.length - 1] ?? 0,
    median: Math.round(prices[Math.floor(prices.length / 2)] ?? 0),
    count: prices.length,
  };
}

/**
 * Market position vs the comparable range — mirrors mobile's 20% band:
 * comfortably inside the range is "within", beyond ±20% of the range edges
 * is above/below, anything else is near an edge.
 */
export type PricePosition = 'below' | 'within' | 'above' | 'near-low' | 'near-high';

export function pricePosition(price: number, category: string): PricePosition | null {
  const comps = priceCompsFor(category);
  if (!comps || comps.count < 3 || !(price > 0)) return null;
  if (price < comps.min * 0.8) return 'below';
  if (price > comps.max * 1.2) return 'above';
  if (price >= comps.min && price <= comps.max) return 'within';
  return price < comps.min ? 'near-low' : 'near-high';
}

export const PRICE_POSITION_COPY: Record<PricePosition, { tone: 'good' | 'warn'; label: string }> = {
  below: { tone: 'good', label: 'Priced below similar listings — likely to move fast' },
  'near-low': { tone: 'good', label: 'At the lower end of similar listings' },
  within: { tone: 'good', label: 'Within the range buyers are browsing' },
  'near-high': { tone: 'warn', label: 'At the upper end of similar listings' },
  above: { tone: 'warn', label: 'Priced above similar listings — may sit longer' },
};

/**
 * What the draft still needs before publish — label grammar mirrors the
 * mobile completeness line ("Still needs: photos, price"). Order matches
 * the composer step order so it reads as a checklist.
 */
export function missingPublishFields(draft: SellDraft): string[] {
  const missing: string[] = [];
  if (!draft.photos.length) missing.push('photos');
  if (draft.title.trim().length < 3) missing.push('title');
  // Category is universally required — and must be a canonical root id a
  // picker could have emitted (a dead fixture slug can't activate).
  if (!draft.category || !isKnownCategoryId(draft.category)) missing.push('category');
  // Condition is universally required (UNIVERSAL_REQUIRED in the policy).
  if (!draft.condition) missing.push('condition');
  // Size is category-policy dependent: required under the shoes policy
  // (subcategory *-shoes), recommended/hidden elsewhere.
  if (isSizeRequiredCategory(draft.category, draft.subcategory) && !draft.size) {
    missing.push('size');
  }
  if (draft.description.trim().length < DESCRIPTION_MIN) missing.push('description');
  if (parsePriceInput(draft.price) == null) missing.push('price');
  return missing;
}
