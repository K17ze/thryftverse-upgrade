/**
 * Sell-flow taxonomy — the composer's canonical vocabulary.
 *
 * Two layers, both derived from the same source of truth:
 *
 *  1. Picker options — category/subcategory selects emit taxonomy node
 *     ids (e.g. 'women-clothing'), never display labels; node names carry
 *     the human copy. The seed is the fixture-mode truth and the offline
 *     fallback; live mode swaps in GET /taxonomy via useTaxonomy.
 *
 *  2. Category policy — a minimal port of the activation policy the
 *     composer can actually answer (frontend/src/contracts/
 *     listingCategoryPolicy.ts + backend lib/categoryAttributes.ts):
 *       - size is required only for shoes policies, recommended for
 *         apparel/sports, hidden everywhere else
 *       - 'New with tags' is meaningless where a garment-style tag cannot
 *         exist (electronics, cars, yachts) and is excluded there
 *     Buckets mirror the subcategory→policy tables exactly so web and
 *     backend can never disagree about which leaf owns which rule.
 *
 * Nothing here stores or invents attributes — it only decides what the
 * pickers offer and what the completeness gate requires.
 */

import {
  TAXONOMY_SEED,
  type TaxonomyNode,
} from '@/lib/contracts/taxonomy';
import type { ListingCondition } from '@/lib/contracts/domain';

// ============================================================================
// PICKER OPTIONS — id → select value, name → display label
// ============================================================================

export interface TaxonomyOption {
  /** Taxonomy node id — what the draft and the write payload carry. */
  value: string;
  /** Human label — the node's display name. */
  label: string;
}

function bySortOrder(a: TaxonomyNode, b: TaxonomyNode): number {
  return a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);
}

/** Top-level category options from a node set (seed or live). */
export function categoryOptions(categories: TaxonomyNode[]): TaxonomyOption[] {
  return categories
    .filter((n) => n.parentId === null)
    .sort(bySortOrder)
    .map((n) => ({ value: n.id, label: n.name }));
}

/** "Type" options — children of the selected root category. */
export function subcategoryOptions(
  categories: TaxonomyNode[],
  categoryId: string,
): TaxonomyOption[] {
  if (!categoryId) return [];
  return categories
    .filter((n) => n.parentId === categoryId)
    .sort(bySortOrder)
    .map((n) => ({ value: n.id, label: n.name }));
}

/** Display name for a category/subcategory id — labels for review/preview
 *  surfaces so ids never render raw. Null when the id isn't in the set. */
export function categoryNodeName(
  categories: TaxonomyNode[],
  id: string | null | undefined,
): string | null {
  if (!id) return null;
  return categories.find((n) => n.id === id)?.name ?? null;
}

/** Canonical size vocabulary — the taxonomy's size node names (mirrors the
 *  mobile picker, which offers the single global list per category). */
export const SIZE_OPTIONS: readonly string[] = TAXONOMY_SEED.sizes.map(
  (n) => n.name,
);

const ROOT_CATEGORY_IDS = new Set(
  TAXONOMY_SEED.categories.filter((n) => n.parentId === null).map((n) => n.id),
);

/** True when `id` is a canonical root category the composer can own. */
export function isKnownCategoryId(id: string | null | undefined): boolean {
  return !!id && ROOT_CATEGORY_IDS.has(id);
}

// ============================================================================
// CATEGORY POLICY — minimal port of listingCategoryPolicy +
// categoryAttributes. The composer can answer: is size required, is size
// shown at all, and which conditions are meaningful.
// ============================================================================

type PolicyBucket =
  | 'apparel'
  | 'shoes'
  | 'bags'
  | 'accessories'
  | 'beauty'
  | 'electronics'
  | 'home'
  | 'media'
  | 'collectables'
  | 'sports'
  | 'cars'
  | 'yachts';

/**
 * Subcategory → policy bucket. Ported from the SUBCATEGORY_POLICIES /
 * SUBCATEGORY_ATTRIBUTE_SCHEMAS tables — both registries assign the same
 * bucket to every leaf, so one map serves size and condition rules alike.
 */
const SUBCATEGORY_BUCKETS: Record<string, PolicyBucket> = {
  'women-clothing': 'apparel',
  'women-shoes': 'shoes',
  'women-bags': 'bags',
  'women-accessories': 'accessories',
  'women-beauty': 'beauty',
  'men-clothing': 'apparel',
  'men-shoes': 'shoes',
  'men-accessories': 'accessories',
  'men-grooming': 'beauty',
  'designer-bags': 'bags',
  'designer-clothing': 'apparel',
  'designer-shoes': 'shoes',
  'designer-jewellery': 'accessories',
  'kids-clothing': 'apparel',
  'kids-shoes': 'shoes',
  'kids-toys': 'collectables',
  'kids-accessories': 'accessories',
  'home-kitchen-small': 'electronics',
  'home-kitchen-large': 'electronics',
  'home-cookware': 'home',
  'home-tools': 'home',
  'home-tableware': 'home',
  'home-care': 'home',
  'home-textiles': 'home',
  'home-accessories': 'home',
  'home-office': 'home',
  'home-celebrations': 'home',
  'home-diy': 'home',
  'elec-gaming': 'electronics',
  'elec-computers': 'electronics',
  'elec-phones': 'electronics',
  'elec-audio': 'electronics',
  'elec-cameras': 'electronics',
  'elec-tablets': 'electronics',
  'elec-tv': 'electronics',
  'elec-beauty': 'electronics',
  'elec-wearables': 'electronics',
  'elec-other': 'electronics',
  'ent-books': 'media',
  'ent-magazines': 'media',
  'ent-music': 'media',
  'ent-video': 'media',
  'hob-trading': 'collectables',
  'hob-board': 'collectables',
  'hob-puzzles': 'collectables',
  'hob-tabletop': 'collectables',
  'hob-memorabilia': 'collectables',
  'hob-coins': 'collectables',
  'hob-stamps': 'collectables',
  'hob-postcards': 'collectables',
  'hob-music': 'collectables',
  'hob-arts': 'collectables',
  'hob-storage': 'home',
  'spt-cycling': 'sports',
  'spt-fitness': 'sports',
  'spt-outdoor': 'sports',
  'spt-water': 'sports',
  'spt-team': 'sports',
  'spt-racquet': 'sports',
  'spt-golf': 'sports',
  'spt-equestrian': 'sports',
  'spt-skate': 'sports',
  'spt-boxing': 'sports',
  'spt-casual': 'sports',
  'cars-luxury': 'cars',
  'cars-sports': 'cars',
  'cars-classic': 'cars',
  'cars-electric': 'cars',
  'yachts-motor': 'yachts',
  'yachts-sailing': 'yachts',
  'yachts-classic': 'yachts',
};

/** Root category → bucket, when no subcategory is picked (CATEGORY_FALLBACKS). */
const CATEGORY_BUCKETS: Record<string, PolicyBucket> = {
  women: 'apparel',
  men: 'apparel',
  designer: 'bags',
  kids: 'apparel',
  home: 'home',
  electronics: 'electronics',
  entertainment: 'media',
  hobbies: 'collectables',
  sports: 'sports',
  cars: 'cars',
  yachts: 'yachts',
};

function bucketFor(
  category: string | null | undefined,
  subcategory?: string | null,
): PolicyBucket | null {
  if (subcategory && SUBCATEGORY_BUCKETS[subcategory]) {
    return SUBCATEGORY_BUCKETS[subcategory];
  }
  if (category && CATEGORY_BUCKETS[category]) {
    return CATEGORY_BUCKETS[category];
  }
  return null;
}

export type SizeRequirement = 'required' | 'recommended' | 'hidden';

/**
 * The size field's obligation for a draft's category/subcategory — the
 * subset of the policy the composer can answer:
 *   shoes  → requiredForActivation includes 'size'  → 'required'
 *   apparel/sports/unknown (DEFAULT_POLICY) → recommended list → 'recommended'
 *   everything else → not a sized category at all   → 'hidden'
 */
export function sizeRequirement(
  category: string | null | undefined,
  subcategory?: string | null,
): SizeRequirement {
  const bucket = bucketFor(category, subcategory);
  if (bucket === 'shoes') return 'required';
  if (bucket === null || bucket === 'apparel' || bucket === 'sports') {
    return 'recommended';
  }
  return 'hidden';
}

/** Size is a hard publish requirement only under the shoes policy. */
export function isSizeRequiredCategory(
  category: string,
  subcategory?: string,
): boolean {
  return sizeRequirement(category, subcategory) === 'required';
}

/** Categories with no meaningful size choice — the field hides entirely. */
export function isSizelessCategory(
  category: string,
  subcategory?: string,
): boolean {
  return sizeRequirement(category, subcategory) === 'hidden';
}

/** Size chips offered for the draft's bucket — the canonical size set, or
 *  nothing where the category doesn't carry sizing. */
export function sizesForCategory(category: string, subcategory?: string): string[] {
  return isSizelessCategory(category, subcategory) ? [] : [...SIZE_OPTIONS];
}

// ============================================================================
// CONDITION POLICY — canonical set, minus 'New with tags' where a
// garment-style tag cannot exist (categoryAttributes NO_TAG_CONDITIONS:
// electronics, cars, yachts).
// ============================================================================

const NO_TAG_BUCKETS: ReadonlySet<PolicyBucket> = new Set([
  'electronics',
  'cars',
  'yachts',
]);

export const CANONICAL_CONDITIONS: readonly ListingCondition[] =
  TAXONOMY_SEED.conditions.map((n) => n.name) as ListingCondition[];

/** Conditions the category policy allows — picker vocabulary for the draft's
 *  bucket. Everything else gets the full canonical set. */
export function allowedConditionsFor(
  category: string | null | undefined,
  subcategory?: string | null,
): readonly ListingCondition[] {
  const bucket = bucketFor(category, subcategory);
  if (bucket && NO_TAG_BUCKETS.has(bucket)) {
    return CANONICAL_CONDITIONS.filter((c) => c !== 'New with tags');
  }
  return CANONICAL_CONDITIONS;
}

export function conditionAllowedFor(
  category: string | null | undefined,
  subcategory: string | null | undefined,
  condition: string,
): boolean {
  return (allowedConditionsFor(category, subcategory) as readonly string[]).includes(
    condition,
  );
}

// ============================================================================
// LEGACY VALUE CANONICALISATION — pre-taxonomy rows hydrated into the
// composer (edit/draft-resume paths) carry fixture slugs and display-name
// subcategories. Drafts normalise to canonical ids — or empty, which the
// pickers render as unselected and the completeness gate flags for re-pick
// rather than republishing an unrecognisable value.
// ============================================================================

const LEGACY_SUBCATEGORY_IDS: Record<string, string> = {
  // Fixture display names → canonical leaf, keyed `${category}:${label}`.
  'women:dresses': 'women-clothing',
  'women:tops': 'women-clothing',
  'women:knitwear': 'women-clothing',
  'women:coats': 'women-clothing',
  'women:jackets': 'women-clothing',
  'women:jeans': 'women-clothing',
  'women:trousers': 'women-clothing',
  'women:skirts': 'women-clothing',
  'women:boots': 'women-shoes',
  'women:shoes': 'women-shoes',
  'women:shoulder bags': 'women-bags',
  'women:totes': 'women-bags',
  'women:crossbody bags': 'women-bags',
  'women:backpacks': 'women-bags',
  'women:clutches': 'women-bags',
  'women:watches': 'women-accessories',
  'women:sunglasses': 'women-accessories',
  'women:jewellery': 'women-accessories',
  'women:scarves': 'women-accessories',
  'women:belts': 'women-accessories',
  'women:hats': 'women-accessories',
  'men:t-shirts': 'men-clothing',
  'men:shirts': 'men-clothing',
  'men:hoodies': 'men-clothing',
  'men:knitwear': 'men-clothing',
  'men:jackets': 'men-clothing',
  'men:denim jackets': 'men-clothing',
  'men:leather jackets': 'men-clothing',
  'men:jeans': 'men-clothing',
  'men:trousers': 'men-clothing',
  'men:blazers': 'men-clothing',
  'men:boots': 'men-shoes',
  'men:shoes': 'men-shoes',
  'designer:bags': 'designer-bags',
  // Designer leaf "Bags & Accessories" owns the legacy 'Accessories' value.
  'designer:accessories': 'designer-bags',
  'designer:dresses': 'designer-clothing',
  'designer:ready-to-wear': 'designer-clothing',
  'designer:shoes': 'designer-shoes',
  'designer:jewellery': 'designer-jewellery',
  'designer:watches': 'designer-jewellery',
};

const CANONICAL_SUBCATEGORY_IDS = new Set(
  TAXONOMY_SEED.categories.filter((n) => n.parentId !== null).map((n) => n.id),
);

/**
 * Canonical root id for a persisted/stored category value. Dead fixture
 * roots (sneakers, bags, accessories, vintage, streetwear) have no honest
 * canonical equivalent — they return '' so the composer forces an explicit
 * re-pick instead of republishing an id the taxonomy doesn't know.
 */
export function canonicalCategoryId(value: string | null | undefined): string {
  return value && ROOT_CATEGORY_IDS.has(value) ? value : '';
}

/**
 * Canonical leaf id for a stored subcategory under a canonical category.
 * Accepts existing ids, maps known legacy display names, else ''.
 */
export function canonicalSubcategoryId(
  category: string,
  value: string | null | undefined,
): string {
  if (!value) return '';
  if (CANONICAL_SUBCATEGORY_IDS.has(value)) {
    const node = TAXONOMY_SEED.categories.find((n) => n.id === value);
    // A canonical leaf under a different root is still wrong — scope it.
    return node?.parentId === category ? value : '';
  }
  return LEGACY_SUBCATEGORY_IDS[`${category}:${value.trim().toLowerCase()}`] ?? '';
}

/**
 * Canonical condition for a stored value. 'New without tags' (the legacy
 * fifth option) has no canonical home — the nearest honest claim is
 * 'Very good'; mapping down never overstates condition on re-publish.
 */
export function canonicalCondition(
  value: string | null | undefined,
): ListingCondition | '' {
  if (!value) return '';
  if (value === 'New without tags') return 'Very good';
  return (CANONICAL_CONDITIONS as readonly string[]).includes(value)
    ? (value as ListingCondition)
    : '';
}
