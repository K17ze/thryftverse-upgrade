/**
 * Category Attribute Registry — structured condition + item specifics (R30/R31)
 *
 * The canonical condition set is GLOBAL (taxonomy_nodes type='condition',
 * seeded in migration 171; ranked in mapping/catalog/conditionMapping.ts):
 *   'New with tags' > 'Very good' > 'Good' > 'Satisfactory'
 *
 * The write path accepts those values leniently — free text is normalised
 * against taxonomy synonyms and unknown values pass through (see
 * lib/taxonomyValidation.ts) so legacy rows stay editable. That global
 * contract is unchanged here.
 *
 * What this module adds is the per-category refinement the audit flagged:
 * which canonical conditions are *meaningful* for a category, and which
 * structured attributes (stored in listings.attributes JSONB) a category
 * declares — required vs optional, with value constraints. It answers
 * "sneakers need size + box disclosure", "bags need hardware condition",
 * "electronics need a functional-condition grade", without inventing a
 * second condition enum.
 *
 * Scope discipline: only rules that are defensible from the resale domain
 * are encoded. 'New with tags' is excluded only where the concept of a
 * garment-style tag cannot exist (electronics, powered appliances, cars,
 * yachts) — every other category keeps the full canonical set.
 */

// ── Canonical conditions ─────────────────────────────────────────────────
//
// Single source of truth: taxonomy_nodes (type='condition') seed in
// migration 171 and CONDITION_RANK in mapping/catalog/conditionMapping.ts.
// Mirrored here so the registry is a pure leaf module with no DB access.

export const CANONICAL_CONDITIONS = [
  'New with tags',
  'Very good',
  'Good',
  'Satisfactory',
] as const;

export type CanonicalCondition = (typeof CANONICAL_CONDITIONS)[number];

// ── Attribute value contract ─────────────────────────────────────────────

/** Attribute values are scalar — the PDP renders them as label/value rows. */
export type ListingAttributeValue = string | number | boolean;
export type ListingAttributes = Record<string, ListingAttributeValue>;

export type AttributeValueConstraint =
  | { type: 'string'; maxLength: number }
  | { type: 'number'; min?: number; max?: number }
  | { type: 'boolean' }
  | { type: 'enum'; values: readonly string[] };

export interface CategoryAttributeSchema {
  /** Attribute keys that must be present when an attributes map is supplied. */
  requiredAttributes: readonly string[];
  /** Attribute keys the category recognises but does not require. */
  optionalAttributes: readonly string[];
  /**
   * Canonical conditions valid for this category — a subset of
   * CANONICAL_CONDITIONS. The global enum stays valid elsewhere; this is
   * the per-category refinement.
   */
  allowedConditions: readonly string[];
  /** Value constraints for declared (required + optional) attributes. */
  attributeValueConstraints: Record<string, AttributeValueConstraint>;
}

// ── Shared constraint fragments ──────────────────────────────────────────

const MATERIAL_CONSTRAINT: AttributeValueConstraint = { type: 'string', maxLength: 80 };
const COLOUR_CONSTRAINT: AttributeValueConstraint = { type: 'string', maxLength: 40 };
const YEAR_CONSTRAINT: AttributeValueConstraint = { type: 'number', min: 1886, max: 2100 };

const ALL_CONDITIONS: readonly string[] = CANONICAL_CONDITIONS;
// Categories where a garment-style "tag" cannot exist — a sealed device or
// vehicle is 'new', which this enum cannot express, but it is never
// 'New with tags'.
const NO_TAG_CONDITIONS: readonly string[] = CANONICAL_CONDITIONS.filter(
  (c) => c !== 'New with tags',
);

// ── Category attribute schemas ───────────────────────────────────────────

const APPAREL_ATTRIBUTES: CategoryAttributeSchema = {
  requiredAttributes: [],
  optionalAttributes: ['material', 'colour', 'fit'],
  allowedConditions: ALL_CONDITIONS,
  attributeValueConstraints: {
    material: MATERIAL_CONSTRAINT,
    colour: COLOUR_CONSTRAINT,
    fit: { type: 'enum', values: ['slim', 'regular', 'relaxed', 'oversized'] },
  },
};

const SHOES_ATTRIBUTES: CategoryAttributeSchema = {
  // Size is already required for shoes by listingCategoryPolicy
  // (requiredForActivation includes 'size'); the attribute schema owns the
  // box disclosure buyers expect on sneakers and designer footwear.
  requiredAttributes: ['boxIncluded'],
  optionalAttributes: ['material', 'colour', 'boxCondition'],
  allowedConditions: ALL_CONDITIONS,
  attributeValueConstraints: {
    boxIncluded: { type: 'boolean' },
    boxCondition: { type: 'enum', values: ['pristine', 'worn', 'damaged'] },
    material: MATERIAL_CONSTRAINT,
    colour: COLOUR_CONSTRAINT,
  },
};

const BAGS_ATTRIBUTES: CategoryAttributeSchema = {
  // Hardware is the main wear surface on a resale bag — zips, clasps, chain
  // straps — and the first thing buyers ask about.
  requiredAttributes: ['hardwareCondition'],
  optionalAttributes: ['material', 'colour', 'dustBagIncluded'],
  allowedConditions: ALL_CONDITIONS,
  attributeValueConstraints: {
    hardwareCondition: {
      type: 'enum',
      values: ['pristine', 'light-wear', 'visible-wear', 'tarnished'],
    },
    dustBagIncluded: { type: 'boolean' },
    material: MATERIAL_CONSTRAINT,
    colour: COLOUR_CONSTRAINT,
  },
};

const ACCESSORIES_ATTRIBUTES: CategoryAttributeSchema = {
  requiredAttributes: [],
  optionalAttributes: ['material', 'colour'],
  allowedConditions: ALL_CONDITIONS,
  attributeValueConstraints: {
    material: MATERIAL_CONSTRAINT,
    colour: COLOUR_CONSTRAINT,
  },
};

const BEAUTY_ATTRIBUTES: CategoryAttributeSchema = {
  // Resale cosmetics are a hygiene surface: 'sealed' is the disclosure that
  // separates a sellable item from a used one.
  requiredAttributes: ['sealed'],
  optionalAttributes: ['volumeRemainingPct'],
  allowedConditions: ALL_CONDITIONS,
  attributeValueConstraints: {
    sealed: { type: 'boolean' },
    volumeRemainingPct: { type: 'number', min: 0, max: 100 },
  },
};

const ELECTRONICS_ATTRIBUTES: CategoryAttributeSchema = {
  // Cosmetic grade alone cannot describe a device — a phone can be
  // pristine and dead. Functional condition is the required disclosure.
  requiredAttributes: ['functionalCondition'],
  optionalAttributes: ['model', 'accessoriesIncluded', 'batteryHealthPct'],
  allowedConditions: NO_TAG_CONDITIONS,
  attributeValueConstraints: {
    functionalCondition: {
      type: 'enum',
      values: ['fully-functional', 'partially-functional', 'for-parts-or-repair'],
    },
    model: { type: 'string', maxLength: 120 },
    accessoriesIncluded: { type: 'string', maxLength: 200 },
    batteryHealthPct: { type: 'number', min: 0, max: 100 },
  },
};

const HOME_ATTRIBUTES: CategoryAttributeSchema = {
  requiredAttributes: [],
  optionalAttributes: ['material', 'colour', 'dimensions'],
  allowedConditions: ALL_CONDITIONS,
  attributeValueConstraints: {
    material: MATERIAL_CONSTRAINT,
    colour: COLOUR_CONSTRAINT,
    dimensions: { type: 'string', maxLength: 80 },
  },
};

const MEDIA_ATTRIBUTES: CategoryAttributeSchema = {
  requiredAttributes: [],
  optionalAttributes: ['format', 'author'],
  allowedConditions: ALL_CONDITIONS,
  attributeValueConstraints: {
    format: { type: 'string', maxLength: 40 },
    author: { type: 'string', maxLength: 120 },
  },
};

const COLLECTABLES_ATTRIBUTES: CategoryAttributeSchema = {
  requiredAttributes: [],
  optionalAttributes: ['edition', 'year', 'grader', 'gradeScore'],
  allowedConditions: ALL_CONDITIONS,
  attributeValueConstraints: {
    edition: { type: 'string', maxLength: 80 },
    year: YEAR_CONSTRAINT,
    grader: { type: 'string', maxLength: 40 },
    gradeScore: { type: 'number', min: 0, max: 10 },
  },
};

const SPORTS_ATTRIBUTES: CategoryAttributeSchema = {
  requiredAttributes: [],
  optionalAttributes: ['material', 'colour'],
  allowedConditions: ALL_CONDITIONS,
  attributeValueConstraints: {
    material: MATERIAL_CONSTRAINT,
    colour: COLOUR_CONSTRAINT,
  },
};

const CARS_ATTRIBUTES: CategoryAttributeSchema = {
  requiredAttributes: ['year', 'mileageKm'],
  optionalAttributes: ['fuelType', 'gearbox'],
  allowedConditions: NO_TAG_CONDITIONS,
  attributeValueConstraints: {
    year: YEAR_CONSTRAINT,
    mileageKm: { type: 'number', min: 0, max: 2_000_000 },
    fuelType: { type: 'enum', values: ['petrol', 'diesel', 'hybrid', 'electric', 'other'] },
    gearbox: { type: 'enum', values: ['manual', 'automatic'] },
  },
};

const YACHTS_ATTRIBUTES: CategoryAttributeSchema = {
  requiredAttributes: ['year', 'lengthM'],
  optionalAttributes: ['engineHours', 'berth'],
  allowedConditions: NO_TAG_CONDITIONS,
  attributeValueConstraints: {
    year: YEAR_CONSTRAINT,
    lengthM: { type: 'number', min: 1, max: 200 },
    engineHours: { type: 'number', min: 0 },
    berth: { type: 'string', maxLength: 120 },
  },
};

// ── Subcategory → schema mapping ─────────────────────────────────────────
//
// Mirrors the subcategory→policy mapping in lib/listingCategoryPolicy.ts so
// the two registries can never disagree about which bucket a leaf belongs
// to. Category ids are the taxonomy_nodes ids from migration 171.

const SUBCATEGORY_ATTRIBUTE_SCHEMAS: Record<string, CategoryAttributeSchema> = {
  'women-clothing': APPAREL_ATTRIBUTES,
  'women-shoes': SHOES_ATTRIBUTES,
  'women-bags': BAGS_ATTRIBUTES,
  'women-accessories': ACCESSORIES_ATTRIBUTES,
  'women-beauty': BEAUTY_ATTRIBUTES,
  'men-clothing': APPAREL_ATTRIBUTES,
  'men-shoes': SHOES_ATTRIBUTES,
  'men-accessories': ACCESSORIES_ATTRIBUTES,
  'men-grooming': BEAUTY_ATTRIBUTES,
  'designer-bags': BAGS_ATTRIBUTES,
  'designer-clothing': APPAREL_ATTRIBUTES,
  'designer-shoes': SHOES_ATTRIBUTES,
  'designer-jewellery': ACCESSORIES_ATTRIBUTES,
  'kids-clothing': APPAREL_ATTRIBUTES,
  'kids-shoes': SHOES_ATTRIBUTES,
  'kids-toys': COLLECTABLES_ATTRIBUTES,
  'kids-accessories': ACCESSORIES_ATTRIBUTES,
  'home-kitchen-small': ELECTRONICS_ATTRIBUTES,
  'home-kitchen-large': ELECTRONICS_ATTRIBUTES,
  'home-cookware': HOME_ATTRIBUTES,
  'home-tools': HOME_ATTRIBUTES,
  'home-tableware': HOME_ATTRIBUTES,
  'home-care': HOME_ATTRIBUTES,
  'home-textiles': HOME_ATTRIBUTES,
  'home-accessories': HOME_ATTRIBUTES,
  'home-office': HOME_ATTRIBUTES,
  'home-celebrations': HOME_ATTRIBUTES,
  'home-diy': HOME_ATTRIBUTES,
  'elec-gaming': ELECTRONICS_ATTRIBUTES,
  'elec-computers': ELECTRONICS_ATTRIBUTES,
  'elec-phones': ELECTRONICS_ATTRIBUTES,
  'elec-audio': ELECTRONICS_ATTRIBUTES,
  'elec-cameras': ELECTRONICS_ATTRIBUTES,
  'elec-tablets': ELECTRONICS_ATTRIBUTES,
  'elec-tv': ELECTRONICS_ATTRIBUTES,
  'elec-beauty': ELECTRONICS_ATTRIBUTES,
  'elec-wearables': ELECTRONICS_ATTRIBUTES,
  'elec-other': ELECTRONICS_ATTRIBUTES,
  'ent-books': MEDIA_ATTRIBUTES,
  'ent-magazines': MEDIA_ATTRIBUTES,
  'ent-music': MEDIA_ATTRIBUTES,
  'ent-video': MEDIA_ATTRIBUTES,
  'hob-trading': COLLECTABLES_ATTRIBUTES,
  'hob-board': COLLECTABLES_ATTRIBUTES,
  'hob-puzzles': COLLECTABLES_ATTRIBUTES,
  'hob-tabletop': COLLECTABLES_ATTRIBUTES,
  'hob-memorabilia': COLLECTABLES_ATTRIBUTES,
  'hob-coins': COLLECTABLES_ATTRIBUTES,
  'hob-stamps': COLLECTABLES_ATTRIBUTES,
  'hob-postcards': COLLECTABLES_ATTRIBUTES,
  'hob-music': COLLECTABLES_ATTRIBUTES,
  'hob-arts': COLLECTABLES_ATTRIBUTES,
  'hob-storage': HOME_ATTRIBUTES,
  'spt-cycling': SPORTS_ATTRIBUTES,
  'spt-fitness': SPORTS_ATTRIBUTES,
  'spt-outdoor': SPORTS_ATTRIBUTES,
  'spt-water': SPORTS_ATTRIBUTES,
  'spt-team': SPORTS_ATTRIBUTES,
  'spt-racquet': SPORTS_ATTRIBUTES,
  'spt-golf': SPORTS_ATTRIBUTES,
  'spt-equestrian': SPORTS_ATTRIBUTES,
  'spt-skate': SPORTS_ATTRIBUTES,
  'spt-boxing': SPORTS_ATTRIBUTES,
  'spt-casual': SPORTS_ATTRIBUTES,
  'cars-luxury': CARS_ATTRIBUTES,
  'cars-sports': CARS_ATTRIBUTES,
  'cars-classic': CARS_ATTRIBUTES,
  'cars-electric': CARS_ATTRIBUTES,
  'yachts-motor': YACHTS_ATTRIBUTES,
  'yachts-sailing': YACHTS_ATTRIBUTES,
  'yachts-classic': YACHTS_ATTRIBUTES,
};

// ── Top-level category fallbacks ─────────────────────────────────────────

const CATEGORY_ATTRIBUTE_FALLBACKS: Record<string, CategoryAttributeSchema> = {
  women: APPAREL_ATTRIBUTES,
  men: APPAREL_ATTRIBUTES,
  designer: BAGS_ATTRIBUTES,
  kids: APPAREL_ATTRIBUTES,
  home: HOME_ATTRIBUTES,
  electronics: ELECTRONICS_ATTRIBUTES,
  entertainment: MEDIA_ATTRIBUTES,
  hobbies: COLLECTABLES_ATTRIBUTES,
  sports: SPORTS_ATTRIBUTES,
  cars: CARS_ATTRIBUTES,
  yachts: YACHTS_ATTRIBUTES,
};

const DEFAULT_ATTRIBUTE_SCHEMA: CategoryAttributeSchema = {
  requiredAttributes: [],
  optionalAttributes: [],
  allowedConditions: ALL_CONDITIONS,
  attributeValueConstraints: {},
};

// ── Public API ───────────────────────────────────────────────────────────

/**
 * Resolve the attribute schema for a listing: subcategory → category →
 * default, the same fallback order as resolveListingCategoryPolicy.
 */
export function resolveCategoryAttributeSchema(
  category: string | null | undefined,
  subcategory?: string | null | undefined,
): CategoryAttributeSchema {
  if (subcategory && SUBCATEGORY_ATTRIBUTE_SCHEMAS[subcategory]) {
    return SUBCATEGORY_ATTRIBUTE_SCHEMAS[subcategory];
  }
  if (category && category in CATEGORY_ATTRIBUTE_FALLBACKS) {
    return CATEGORY_ATTRIBUTE_FALLBACKS[category];
  }
  return DEFAULT_ATTRIBUTE_SCHEMA;
}

export type AttributeErrorCode =
  | 'condition_not_allowed_for_category'
  | 'missing_required_attribute'
  | 'unknown_attribute'
  | 'invalid_attribute_value';

export interface AttributeValidationError {
  code: AttributeErrorCode;
  /** The offending attribute key — absent for condition errors. */
  attribute?: string;
  message: string;
}

export interface ListingAttributeValidationResult {
  ok: boolean;
  errors: AttributeValidationError[];
}

function isCanonicalCondition(condition: string): boolean {
  return (CANONICAL_CONDITIONS as readonly string[]).includes(condition);
}

function checkConstraint(
  attribute: string,
  value: ListingAttributeValue,
  constraint: AttributeValueConstraint,
): AttributeValidationError | null {
  switch (constraint.type) {
    case 'string':
      if (typeof value !== 'string' || value.length === 0 || value.length > constraint.maxLength) {
        return {
          code: 'invalid_attribute_value',
          attribute,
          message: `Attribute '${attribute}' must be a string of at most ${constraint.maxLength} characters`,
        };
      }
      return null;
    case 'number':
      if (
        typeof value !== 'number' ||
        !Number.isFinite(value) ||
        (constraint.min !== undefined && value < constraint.min) ||
        (constraint.max !== undefined && value > constraint.max)
      ) {
        return {
          code: 'invalid_attribute_value',
          attribute,
          message: `Attribute '${attribute}' is outside its allowed range`,
        };
      }
      return null;
    case 'boolean':
      if (typeof value !== 'boolean') {
        return {
          code: 'invalid_attribute_value',
          attribute,
          message: `Attribute '${attribute}' must be a boolean`,
        };
      }
      return null;
    case 'enum':
      if (typeof value !== 'string' || !constraint.values.includes(value)) {
        return {
          code: 'invalid_attribute_value',
          attribute,
          message: `Attribute '${attribute}' must be one of: ${constraint.values.join(', ')}`,
        };
      }
      return null;
    default:
      return null;
  }
}

/**
 * Validate a listing's structured attributes and condition against the
 * category's attribute schema.
 *
 * Semantics:
 * - `condition` is checked whenever provided. A *canonical* condition that
 *   the category disallows is rejected; non-canonical values pass through
 *   unchanged — the global enum is lenient by design (legacy rows stay
 *   editable until the taxonomy backfill maps them).
 * - `attributes === undefined` means the calling surface does not carry
 *   attributes (e.g. a write path that predates the column): required
 *   attributes cannot be enforced and only the condition is checked.
 * - `attributes` as a map — including `{}` — is an authored statement:
 *   required attributes must be present, every key must be declared by the
 *   schema, and every value must satisfy its constraint. Categories with
 *   no declared attributes accept free-form maps.
 */
export function validateListingAttributes(
  category: string | null | undefined,
  attributes: ListingAttributes | null | undefined,
  condition: string | null | undefined,
  subcategory?: string | null | undefined,
): ListingAttributeValidationResult {
  const schema = resolveCategoryAttributeSchema(category, subcategory);
  const errors: AttributeValidationError[] = [];

  if (condition && isCanonicalCondition(condition) && !schema.allowedConditions.includes(condition)) {
    errors.push({
      code: 'condition_not_allowed_for_category',
      message: `Condition '${condition}' is not valid for category '${subcategory ?? category ?? 'unknown'}'`,
    });
  }

  if (attributes !== undefined && attributes !== null) {
    for (const required of schema.requiredAttributes) {
      if (!(required in attributes) || attributes[required] === undefined) {
        errors.push({
          code: 'missing_required_attribute',
          attribute: required,
          message: `Attribute '${required}' is required for category '${subcategory ?? category ?? 'unknown'}'`,
        });
      }
    }

    const declared = new Set<string>([
      ...schema.requiredAttributes,
      ...schema.optionalAttributes,
    ]);
    // Categories with a declared schema own their key space — unknown keys
    // are rejected so PDP attribute rows stay schema-shaped. Undeclared
    // categories (the default schema) accept free-form attributes.
    if (declared.size > 0) {
      for (const [key, value] of Object.entries(attributes)) {
        if (!declared.has(key)) {
          errors.push({
            code: 'unknown_attribute',
            attribute: key,
            message: `Attribute '${key}' is not declared for category '${subcategory ?? category ?? 'unknown'}'`,
          });
          continue;
        }
        const constraint = schema.attributeValueConstraints[key];
        if (constraint) {
          const violation = checkConstraint(key, value, constraint);
          if (violation) errors.push(violation);
        }
      }
    }
  }

  return { ok: errors.length === 0, errors };
}
