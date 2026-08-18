/**
 * Listing Category Activation Policy — Phase 5
 *
 * Defines category-aware required fields for listing activation.
 * Replaces the universal brand/size assumptions that made brandless
 * vintage items and category-without-size items appear "incomplete".
 *
 * Principles (from Phase 5 doc 02 + doc 25):
 * - Brand is NOT universally required (brandless vintage is valid)
 * - Size is NOT universally required (not all categories have sizing)
 * - Condition IS required for all physical goods
 * - Category IS required for activation
 * - At least one image IS required for activation
 * - Title, description, price are universally required (enforced elsewhere)
 *
 * The frontend uses this to validate before submission and to show
 * truthful completeness indicators. The backend should enforce the
 * same policy on activation.
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

export type CategoryId =
  | 'women'
  | 'men'
  | 'designer'
  | 'kids'
  | 'home'
  | 'electronics'
  | 'entertainment'
  | 'hobbies'
  | 'sports'
  | 'cars'
  | 'yachts';

export type SubcategoryId = string;

export interface ListingCategoryPresentationPolicy {
  /** Fields required to activate a listing in this category */
  requiredForActivation: ListingFieldKey[];
  /** Fields recommended but not required */
  recommended: ListingFieldKey[];
  /** Fields that are searchable/filterable for this category */
  searchable: ListingFieldKey[];
  /** Fields that contribute to card identity (for presentation normalizer) */
  cardIdentity: ListingFieldKey[];
  /** Whether brandless items are common/valid in this category */
  brandlessValid: boolean;
  /** Whether sizeless items are common/valid in this category */
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
  brandlessValid: true, // vintage/unbranded apparel is common
  sizelessValid: true, // one-size items (scarves, hats) exist
};

const SHOES_POLICY: ListingCategoryPresentationPolicy = {
  requiredForActivation: [...UNIVERSAL_REQUIRED, 'size'],
  recommended: ['brand', 'subcategory', ...UNIVERSAL_RECOMMENDED],
  searchable: ['brand', 'size', 'condition', 'subcategory'],
  cardIdentity: ['brand', 'subcategory'],
  brandlessValid: true, // generic shoes exist but less common
  sizelessValid: false, // shoes always need a size
};

const BAGS_POLICY: ListingCategoryPresentationPolicy = {
  requiredForActivation: [...UNIVERSAL_REQUIRED],
  recommended: ['brand', 'subcategory', ...UNIVERSAL_RECOMMENDED],
  searchable: ['brand', 'condition', 'subcategory'],
  cardIdentity: ['brand', 'subcategory'],
  brandlessValid: true, // vintage/unbranded bags are common
  sizelessValid: true, // bags don't have standard sizing
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
  brandlessValid: false, // beauty products typically have a brand
  sizelessValid: true,
};

const ELECTRONICS_POLICY: ListingCategoryPresentationPolicy = {
  requiredForActivation: [...UNIVERSAL_REQUIRED],
  recommended: ['brand', 'subcategory', ...UNIVERSAL_RECOMMENDED],
  searchable: ['brand', 'condition', 'subcategory'],
  cardIdentity: ['brand', 'subcategory'],
  brandlessValid: false, // electronics typically have a brand
  sizelessValid: true, // electronics don't use apparel sizing
};

const HOME_POLICY: ListingCategoryPresentationPolicy = {
  requiredForActivation: [...UNIVERSAL_REQUIRED],
  recommended: ['brand', 'subcategory', ...UNIVERSAL_RECOMMENDED],
  searchable: ['condition', 'subcategory'],
  cardIdentity: ['subcategory'],
  brandlessValid: true, // home goods are often unbranded
  sizelessValid: true,
};

const MEDIA_POLICY: ListingCategoryPresentationPolicy = {
  requiredForActivation: [...UNIVERSAL_REQUIRED],
  recommended: ['brand', 'subcategory', ...UNIVERSAL_RECOMMENDED],
  searchable: ['condition', 'subcategory'],
  cardIdentity: ['subcategory'],
  brandlessValid: true, // books/media have publishers, not brands
  sizelessValid: true,
};

const COLLECTABLES_POLICY: ListingCategoryPresentationPolicy = {
  requiredForActivation: [...UNIVERSAL_REQUIRED],
  recommended: ['brand', 'subcategory', ...UNIVERSAL_RECOMMENDED],
  searchable: ['condition', 'subcategory'],
  cardIdentity: ['subcategory'],
  brandlessValid: true, // collectables are often one-of-a-kind
  sizelessValid: true,
};

const SPORTS_POLICY: ListingCategoryPresentationPolicy = {
  requiredForActivation: [...UNIVERSAL_REQUIRED],
  recommended: ['brand', 'size', 'subcategory', ...UNIVERSAL_RECOMMENDED],
  searchable: ['brand', 'size', 'condition', 'subcategory'],
  cardIdentity: ['brand', 'subcategory'],
  brandlessValid: true,
  sizelessValid: true, // some sports gear is one-size
};

// ── High-value commerce: Cars ──────────────────────────────────────────────

const CARS_POLICY: ListingCategoryPresentationPolicy = {
  requiredForActivation: [...UNIVERSAL_REQUIRED],
  recommended: ['brand', 'subcategory', ...UNIVERSAL_RECOMMENDED],
  searchable: ['brand', 'condition', 'subcategory'],
  cardIdentity: ['brand', 'subcategory'],
  brandlessValid: false, // cars always have a make/brand
  sizelessValid: true, // cars don't use apparel sizing
};

// ── High-value commerce: Yachts ────────────────────────────────────────────

const YACHTS_POLICY: ListingCategoryPresentationPolicy = {
  requiredForActivation: [...UNIVERSAL_REQUIRED],
  recommended: ['brand', 'subcategory', ...UNIVERSAL_RECOMMENDED],
  searchable: ['brand', 'condition', 'subcategory'],
  cardIdentity: ['brand', 'subcategory'],
  brandlessValid: false, // yachts always have a make/brand
  sizelessValid: true, // yachts don't use apparel sizing
};

// ── Subcategory → policy mapping ───────────────────────────────────────────

const SUBCATEGORY_POLICIES: Record<string, ListingCategoryPresentationPolicy> = {
  // Women
  'women-clothing': APPAREL_POLICY,
  'women-shoes': SHOES_POLICY,
  'women-bags': BAGS_POLICY,
  'women-accessories': ACCESSORIES_POLICY,
  'women-beauty': BEAUTY_POLICY,
  // Men
  'men-clothing': APPAREL_POLICY,
  'men-shoes': SHOES_POLICY,
  'men-accessories': ACCESSORIES_POLICY,
  'men-grooming': BEAUTY_POLICY,
  // Designer
  'designer-bags': BAGS_POLICY,
  'designer-clothing': APPAREL_POLICY,
  'designer-shoes': SHOES_POLICY,
  'designer-jewellery': ACCESSORIES_POLICY,
  // Kids
  'kids-clothing': APPAREL_POLICY,
  'kids-shoes': SHOES_POLICY,
  'kids-toys': COLLECTABLES_POLICY,
  'kids-accessories': ACCESSORIES_POLICY,
  // Home
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
  // Electronics
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
  // Entertainment
  'ent-books': MEDIA_POLICY,
  'ent-magazines': MEDIA_POLICY,
  'ent-music': MEDIA_POLICY,
  'ent-video': MEDIA_POLICY,
  // Hobbies
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
  // Sports
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
  // Cars
  'cars-luxury': CARS_POLICY,
  'cars-sports': CARS_POLICY,
  'cars-classic': CARS_POLICY,
  'cars-electric': CARS_POLICY,
  // Yachts
  'yachts-motor': YACHTS_POLICY,
  'yachts-sailing': YACHTS_POLICY,
  'yachts-classic': YACHTS_POLICY,
};

// ── Top-level category fallbacks ───────────────────────────────────────────

const CATEGORY_FALLBACKS: Record<CategoryId, ListingCategoryPresentationPolicy> = {
  women: APPAREL_POLICY,
  men: APPAREL_POLICY,
  designer: BAGS_POLICY,
  kids: APPAREL_POLICY,
  home: HOME_POLICY,
  electronics: ELECTRONICS_POLICY,
  entertainment: MEDIA_POLICY,
  hobbies: COLLECTABLES_POLICY,
  sports: SPORTS_POLICY,
  cars: CARS_POLICY,
  yachts: YACHTS_POLICY,
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

/**
 * Resolve the presentation policy for a listing based on its category
 * and optional subcategory. Falls back from subcategory → category → default.
 */
export function resolveListingCategoryPolicy(
  category: string | null | undefined,
  subcategory?: string | null | undefined,
): ListingCategoryPresentationPolicy {
  if (subcategory && SUBCATEGORY_POLICIES[subcategory]) {
    return SUBCATEGORY_POLICIES[subcategory];
  }
  if (category && category in CATEGORY_FALLBACKS) {
    return CATEGORY_FALLBACKS[category as CategoryId];
  }
  return DEFAULT_POLICY;
}

export interface ListingCompletenessResult {
  /** Whether the listing meets all activation requirements */
  canActivate: boolean;
  /** Missing required fields */
  missingRequired: ListingFieldKey[];
  /** Missing recommended fields (not blocking, but shown to seller) */
  missingRecommended: ListingFieldKey[];
  /** Completeness score 0-1 for telemetry */
  completenessScore: number;
  /** The policy used for this evaluation */
  policy: ListingCategoryPresentationPolicy;
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

/**
 * Evaluate listing completeness against its category policy.
 * Used by the Sell screen to show truthful completeness indicators
 * and by the activation gate to prevent incomplete listings from going live.
 */
export function evaluateListingCompleteness(
  values: ListingFieldValues,
): ListingCompletenessResult {
  const policy = resolveListingCategoryPolicy(values.category, values.subcategory);

  const missingRequired = policy.requiredForActivation.filter(
    (field) => !isFieldPresent(field, values),
  );

  const missingRecommended = policy.recommended.filter(
    (field) => !isFieldPresent(field, values) && !missingRequired.includes(field),
  );

  const totalFields = policy.requiredForActivation.length + policy.recommended.length;
  const presentFields = totalFields - missingRequired.length - missingRecommended.length;
  const completenessScore = totalFields > 0 ? presentFields / totalFields : 0;

  return {
    canActivate: missingRequired.length === 0,
    missingRequired,
    missingRecommended,
    completenessScore,
    policy,
  };
}

/**
 * Check if a brandless listing is valid for the given category.
 * Used by the frontend to stop hiding valid brandless categories.
 */
export function isBrandlessValid(category: string | null | undefined, subcategory?: string | null): boolean {
  return resolveListingCategoryPolicy(category, subcategory).brandlessValid;
}

/**
 * Check if a sizeless listing is valid for the given category.
 * Used by the frontend to stop hiding valid sizeless categories.
 */
export function isSizelessValid(category: string | null | undefined, subcategory?: string | null): boolean {
  return resolveListingCategoryPolicy(category, subcategory).sizelessValid;
}
