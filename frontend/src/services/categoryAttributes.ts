/**
 * Category Attribute Contract — structured condition + item specifics (R30/R31)
 *
 * Service-layer mirror of backend lib/categoryAttributes.ts. The backend
 * registry is authoritative on write; this contract lets the client shape
 * the attributes map it sends and pre-validate before submission with the
 * same rules, so PDP attribute rows and sell-form specifics stay
 * schema-shaped instead of a fixed global list.
 *
 * Semantics identical to the backend:
 * - `attributes === undefined` → the surface does not carry attributes;
 *   required keys are not enforceable and only condition is checked.
 * - An attributes map (even `{}`) is an authored statement: required keys
 *   must be present, every key must be declared, every value must satisfy
 *   its constraint. Categories with no declared schema accept free-form maps.
 * - Condition: a canonical condition the category disallows is rejected;
 *   non-canonical legacy values pass through (the global enum stays lenient).
 */

import type { ListingCondition } from '../contracts/taxonomy';

// ── Canonical conditions ─────────────────────────────────────────────────
//
// taxonomy_nodes type='condition' (migration 171) — same set the frontend
// taxonomy seed exposes as CONDITION_NAMES in contracts/taxonomy.ts.

export const CANONICAL_CONDITIONS: readonly ListingCondition[] = [
  'New with tags',
  'Very good',
  'Good',
  'Satisfactory',
];

// ── Attribute value contract ─────────────────────────────────────────────

export type ListingAttributeValue = string | number | boolean;
export type ListingAttributes = Record<string, ListingAttributeValue>;

export type AttributeValueConstraint =
  | { type: 'string'; maxLength: number }
  | { type: 'number'; min?: number; max?: number }
  | { type: 'boolean' }
  | { type: 'enum'; values: readonly string[] };

export interface CategoryAttributeSchema {
  requiredAttributes: readonly string[];
  optionalAttributes: readonly string[];
  /** Canonical conditions valid for this category — subset of
   *  CANONICAL_CONDITIONS; the global enum stays valid elsewhere. */
  allowedConditions: readonly ListingCondition[];
  attributeValueConstraints: Record<string, AttributeValueConstraint>;
}

// ── Shared constraint fragments ──────────────────────────────────────────

const MATERIAL_CONSTRAINT: AttributeValueConstraint = { type: 'string', maxLength: 80 };
const COLOUR_CONSTRAINT: AttributeValueConstraint = { type: 'string', maxLength: 40 };
const YEAR_CONSTRAINT: AttributeValueConstraint = { type: 'number', min: 1886, max: 2100 };

const ALL_CONDITIONS: readonly ListingCondition[] = CANONICAL_CONDITIONS;
// Categories where a garment-style "tag" cannot exist — a sealed device or
// vehicle is 'new', which this enum cannot express, but it is never
// 'New with tags'.
const NO_TAG_CONDITIONS: readonly ListingCondition[] = CANONICAL_CONDITIONS.filter(
  (c) => c !== 'New with tags',
);

// ── Category attribute schemas (mirror of the backend registry) ──────────

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
  requiredAttributes: ['sealed'],
  optionalAttributes: ['volumeRemainingPct'],
  allowedConditions: ALL_CONDITIONS,
  attributeValueConstraints: {
    sealed: { type: 'boolean' },
    volumeRemainingPct: { type: 'number', min: 0, max: 100 },
  },
};

const ELECTRONICS_ATTRIBUTES: CategoryAttributeSchema = {
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
// Same leaf ids as contracts/listingCategoryPolicy.ts / taxonomy seed.

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
  subcategory?: string | null,
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
 * Mirror of the backend `validateListingAttributes` — same rules, same
 * error codes. Use it to pre-validate before submit; the backend result is
 * authoritative.
 */
export function validateListingAttributes(
  category: string | null | undefined,
  attributes: ListingAttributes | null | undefined,
  condition: string | null | undefined,
  subcategory?: string | null,
): ListingAttributeValidationResult {
  const schema = resolveCategoryAttributeSchema(category, subcategory);
  const errors: AttributeValidationError[] = [];

  if (condition && isCanonicalCondition(condition) && !schema.allowedConditions.includes(condition as ListingCondition)) {
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
