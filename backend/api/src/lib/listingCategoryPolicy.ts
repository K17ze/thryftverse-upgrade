/**
 * Listing Category Activation Policy — Backend Enforcement (Phase 5)
 *
 * Port of the frontend listingCategoryPolicy.ts contract.
 * The backend enforces the same category-aware required fields on activation
 * so that invalid listings cannot be activated even if the frontend is bypassed.
 *
 * Principles (from Phase 5 doc 02 + doc 25):
 * - Brand is NOT universally required (brandless vintage is valid)
 * - Size is NOT universally required (not all categories have sizing)
 * - Condition IS required for all physical goods
 * - Category IS required for activation
 * - At least one image IS required for activation
 * - Title, description, price are universally required
 */

export type ListingFieldKey =
  | 'title'
  | 'description'
  | 'price'
  | 'category'
  | 'subcategory'
  | 'brand'
  | 'size'
  | 'condition'
  | 'images'
  | 'shippingMethod'
  | 'shippingPayer';

export interface ListingCategoryPresentationPolicy {
  requiredForActivation: ListingFieldKey[];
  recommended: ListingFieldKey[];
  searchable: ListingFieldKey[];
  cardIdentity: ListingFieldKey[];
  brandlessValid: boolean;
  sizelessValid: boolean;
}

// ── Universal required fields ──────────────────────────────────────────────

const UNIVERSAL_REQUIRED: ListingFieldKey[] = [
  'title',
  'description',
  'price',
  'category',
  'condition',
  'images',
];

const UNIVERSAL_RECOMMENDED: ListingFieldKey[] = [
  'shippingMethod',
  'shippingPayer',
];

// ── Category-specific policies ─────────────────────────────────────────────

const APPAREL_POLICY: ListingCategoryPresentationPolicy = {
  requiredForActivation: [...UNIVERSAL_REQUIRED],
  recommended: ['brand', 'size', 'subcategory', ...UNIVERSAL_RECOMMENDED],
  searchable: ['brand', 'size', 'condition', 'subcategory'],
  cardIdentity: ['brand', 'subcategory'],
  brandlessValid: true,
  sizelessValid: true,
};

const SHOES_POLICY: ListingCategoryPresentationPolicy = {
  requiredForActivation: [...UNIVERSAL_REQUIRED, 'size'],
  recommended: ['brand', 'subcategory', ...UNIVERSAL_RECOMMENDED],
  searchable: ['brand', 'size', 'condition', 'subcategory'],
  cardIdentity: ['brand', 'subcategory'],
  brandlessValid: true,
  sizelessValid: false,
};

const BAGS_POLICY: ListingCategoryPresentationPolicy = {
  requiredForActivation: [...UNIVERSAL_REQUIRED],
  recommended: ['brand', 'subcategory', ...UNIVERSAL_RECOMMENDED],
  searchable: ['brand', 'condition', 'subcategory'],
  cardIdentity: ['brand', 'subcategory'],
  brandlessValid: true,
  sizelessValid: true,
};

const ACCESSORIES_POLICY: ListingCategoryPresentationPolicy = {
  requiredForActivation: [...UNIVERSAL_REQUIRED],
  recommended: ['brand', 'subcategory', ...UNIVERSAL_RECOMMENDED],
  searchable: ['brand', 'condition', 'subcategory'],
  cardIdentity: ['brand', 'subcategory'],
  brandlessValid: true,
  sizelessValid: true,
};

const BEAUTY_POLICY: ListingCategoryPresentationPolicy = {
  requiredForActivation: [...UNIVERSAL_REQUIRED],
  recommended: ['brand', 'subcategory', ...UNIVERSAL_RECOMMENDED],
  searchable: ['brand', 'condition', 'subcategory'],
  cardIdentity: ['brand', 'subcategory'],
  brandlessValid: false,
  sizelessValid: true,
};

const ELECTRONICS_POLICY: ListingCategoryPresentationPolicy = {
  requiredForActivation: [...UNIVERSAL_REQUIRED],
  recommended: ['brand', 'subcategory', ...UNIVERSAL_RECOMMENDED],
  searchable: ['brand', 'condition', 'subcategory'],
  cardIdentity: ['brand', 'subcategory'],
  brandlessValid: false,
  sizelessValid: true,
};

const HOME_POLICY: ListingCategoryPresentationPolicy = {
  requiredForActivation: [...UNIVERSAL_REQUIRED],
  recommended: ['brand', 'subcategory', ...UNIVERSAL_RECOMMENDED],
  searchable: ['condition', 'subcategory'],
  cardIdentity: ['subcategory'],
  brandlessValid: true,
  sizelessValid: true,
};

const MEDIA_POLICY: ListingCategoryPresentationPolicy = {
  requiredForActivation: [...UNIVERSAL_REQUIRED],
  recommended: ['brand', 'subcategory', ...UNIVERSAL_RECOMMENDED],
  searchable: ['condition', 'subcategory'],
  cardIdentity: ['subcategory'],
  brandlessValid: true,
  sizelessValid: true,
};

const COLLECTABLES_POLICY: ListingCategoryPresentationPolicy = {
  requiredForActivation: [...UNIVERSAL_REQUIRED],
  recommended: ['brand', 'subcategory', ...UNIVERSAL_RECOMMENDED],
  searchable: ['condition', 'subcategory'],
  cardIdentity: ['subcategory'],
  brandlessValid: true,
  sizelessValid: true,
};

const SPORTS_POLICY: ListingCategoryPresentationPolicy = {
  requiredForActivation: [...UNIVERSAL_REQUIRED],
  recommended: ['brand', 'size', 'subcategory', ...UNIVERSAL_RECOMMENDED],
  searchable: ['brand', 'size', 'condition', 'subcategory'],
  cardIdentity: ['brand', 'subcategory'],
  brandlessValid: true,
  sizelessValid: true,
};

// ── Subcategory → policy mapping ───────────────────────────────────────────

const SUBCATEGORY_POLICIES: Record<string, ListingCategoryPresentationPolicy> = {
  'women-clothing': APPAREL_POLICY,
  'women-shoes': SHOES_POLICY,
  'women-bags': BAGS_POLICY,
  'women-accessories': ACCESSORIES_POLICY,
  'women-beauty': BEAUTY_POLICY,
  'men-clothing': APPAREL_POLICY,
  'men-shoes': SHOES_POLICY,
  'men-accessories': ACCESSORIES_POLICY,
  'men-grooming': BEAUTY_POLICY,
  'designer-bags': BAGS_POLICY,
  'designer-clothing': APPAREL_POLICY,
  'designer-shoes': SHOES_POLICY,
  'designer-jewellery': ACCESSORIES_POLICY,
  'kids-clothing': APPAREL_POLICY,
  'kids-shoes': SHOES_POLICY,
  'kids-toys': COLLECTABLES_POLICY,
  'kids-accessories': ACCESSORIES_POLICY,
  'home-kitchen-small': ELECTRONICS_POLICY,
  'home-kitchen-large': ELECTRONICS_POLICY,
  'home-cookware': HOME_POLICY,
  'home-tools': HOME_POLICY,
  'home-tableware': HOME_POLICY,
  'home-care': HOME_POLICY,
  'home-textiles': HOME_POLICY,
  'home-accessories': HOME_POLICY,
  'home-office': HOME_POLICY,
  'home-celebrations': HOME_POLICY,
  'home-diy': HOME_POLICY,
  'elec-gaming': ELECTRONICS_POLICY,
  'elec-computers': ELECTRONICS_POLICY,
  'elec-phones': ELECTRONICS_POLICY,
  'elec-audio': ELECTRONICS_POLICY,
  'elec-cameras': ELECTRONICS_POLICY,
  'elec-tablets': ELECTRONICS_POLICY,
  'elec-tv': ELECTRONICS_POLICY,
  'elec-beauty': ELECTRONICS_POLICY,
  'elec-wearables': ELECTRONICS_POLICY,
  'elec-other': ELECTRONICS_POLICY,
  'ent-books': MEDIA_POLICY,
  'ent-magazines': MEDIA_POLICY,
  'ent-music': MEDIA_POLICY,
  'ent-video': MEDIA_POLICY,
  'hob-trading': COLLECTABLES_POLICY,
  'hob-board': COLLECTABLES_POLICY,
  'hob-puzzles': COLLECTABLES_POLICY,
  'hob-tabletop': COLLECTABLES_POLICY,
  'hob-memorabilia': COLLECTABLES_POLICY,
  'hob-coins': COLLECTABLES_POLICY,
  'hob-stamps': COLLECTABLES_POLICY,
  'hob-postcards': COLLECTABLES_POLICY,
  'hob-music': COLLECTABLES_POLICY,
  'hob-arts': COLLECTABLES_POLICY,
  'hob-storage': HOME_POLICY,
  'spt-cycling': SPORTS_POLICY,
  'spt-fitness': SPORTS_POLICY,
  'spt-outdoor': SPORTS_POLICY,
  'spt-water': SPORTS_POLICY,
  'spt-team': SPORTS_POLICY,
  'spt-racquet': SPORTS_POLICY,
  'spt-golf': SPORTS_POLICY,
  'spt-equestrian': SPORTS_POLICY,
  'spt-skate': SPORTS_POLICY,
  'spt-boxing': SPORTS_POLICY,
  'spt-casual': SPORTS_POLICY,
};

// ── Top-level category fallbacks ───────────────────────────────────────────

const CATEGORY_FALLBACKS: Record<string, ListingCategoryPresentationPolicy> = {
  women: APPAREL_POLICY,
  men: APPAREL_POLICY,
  designer: BAGS_POLICY,
  kids: APPAREL_POLICY,
  home: HOME_POLICY,
  electronics: ELECTRONICS_POLICY,
  entertainment: MEDIA_POLICY,
  hobbies: COLLECTABLES_POLICY,
  sports: SPORTS_POLICY,
};

const DEFAULT_POLICY: ListingCategoryPresentationPolicy = {
  requiredForActivation: [...UNIVERSAL_REQUIRED],
  recommended: ['brand', 'size', 'subcategory', ...UNIVERSAL_RECOMMENDED],
  searchable: ['brand', 'size', 'condition', 'subcategory'],
  cardIdentity: ['brand', 'subcategory'],
  brandlessValid: true,
  sizelessValid: true,
};

// ── Public API ─────────────────────────────────────────────────────────────

export function resolveListingCategoryPolicy(
  category: string | null | undefined,
  subcategory?: string | null | undefined,
): ListingCategoryPresentationPolicy {
  if (subcategory && SUBCATEGORY_POLICIES[subcategory]) {
    return SUBCATEGORY_POLICIES[subcategory];
  }
  if (category && category in CATEGORY_FALLBACKS) {
    return CATEGORY_FALLBACKS[category];
  }
  return DEFAULT_POLICY;
}

export interface ListingFieldValues {
  title?: string | null;
  description?: string | null;
  price?: number | null;
  category?: string | null;
  subcategory?: string | null;
  brand?: string | null;
  size?: string | null;
  condition?: string | null;
  images?: string[] | null;
  shippingMethod?: string | null;
  shippingPayer?: string | null;
}

function isFieldPresent(field: ListingFieldKey, values: ListingFieldValues): boolean {
  switch (field) {
    case 'title':
      return Boolean(values.title?.trim());
    case 'description':
      return Boolean(values.description?.trim());
    case 'price':
      return values.price != null && values.price > 0;
    case 'category':
      return Boolean(values.category?.trim());
    case 'subcategory':
      return Boolean(values.subcategory?.trim());
    case 'brand':
      return Boolean(values.brand?.trim());
    case 'size':
      return Boolean(values.size?.trim());
    case 'condition':
      return Boolean(values.condition?.trim());
    case 'images':
      return Boolean(values.images && values.images.length > 0);
    case 'shippingMethod':
      return Boolean(values.shippingMethod?.trim());
    case 'shippingPayer':
      return Boolean(values.shippingPayer?.trim());
    default:
      return false;
  }
}

export interface ListingValidationResult {
  valid: boolean;
  missingRequired: ListingFieldKey[];
}

/**
 * Validate listing fields against the category-aware activation policy.
 * Only called when status === 'active' (drafts bypass validation).
 */
export function validateListingActivation(values: ListingFieldValues): ListingValidationResult {
  const policy = resolveListingCategoryPolicy(values.category, values.subcategory);
  const missingRequired = policy.requiredForActivation.filter(
    (field) => !isFieldPresent(field, values),
  );
  return {
    valid: missingRequired.length === 0,
    missingRequired,
  };
}
