import type { Listing, ListingCondition } from '@/lib/contracts/domain';
import type { AppIconName } from '@/components/ui/Icon';

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
