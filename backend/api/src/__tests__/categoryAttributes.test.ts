import { describe, expect, it } from 'vitest';

import {
  CANONICAL_CONDITIONS,
  resolveCategoryAttributeSchema,
  validateListingAttributes,
} from '../lib/categoryAttributes.js';
import { validateListingActivation } from '../lib/listingCategoryPolicy.js';

const ACTIVE_BASE = {
  title: 'A real listing title',
  description: 'A sufficiently long listing description.',
  price: 50,
  images: ['https://example.com/i.jpg'],
};

describe('resolveCategoryAttributeSchema', () => {
  it('resolves subcategory → category → default in that order', () => {
    expect(
      resolveCategoryAttributeSchema('electronics', 'elec-phones')
        .requiredAttributes,
    ).toContain('functionalCondition');
    // Category fallback when the subcategory is unknown.
    expect(
      resolveCategoryAttributeSchema('electronics', 'elec-unknown')
        .requiredAttributes,
    ).toContain('functionalCondition');
    // Unknown categories get the permissive default schema.
    const fallback = resolveCategoryAttributeSchema('unknown-cat');
    expect(fallback.requiredAttributes).toEqual([]);
    expect(fallback.allowedConditions).toEqual([...CANONICAL_CONDITIONS]);
  });
});

describe('validateListingAttributes — condition refinement', () => {
  it('rejects New with tags on electronics (subcategory and fallback)', () => {
    const result = validateListingAttributes(
      'electronics',
      { functionalCondition: 'fully-functional' },
      'New with tags',
      'elec-phones',
    );
    expect(result.ok).toBe(false);
    expect(result.errors[0].code).toBe('condition_not_allowed_for_category');

    const viaCategory = validateListingAttributes(
      'electronics',
      undefined,
      'New with tags',
    );
    expect(viaCategory.ok).toBe(false);
  });

  it('accepts used-grade conditions on electronics', () => {
    expect(
      validateListingAttributes('electronics', undefined, 'Very good').ok,
    ).toBe(true);
    expect(
      validateListingAttributes('electronics', undefined, 'Satisfactory').ok,
    ).toBe(true);
  });

  it('keeps New with tags valid for apparel', () => {
    expect(
      validateListingAttributes('women', undefined, 'New with tags', 'women-clothing').ok,
    ).toBe(true);
  });

  it('passes non-canonical legacy conditions through (lenient enum)', () => {
    // The global enum stays lenient — the registry only refuses canonical
    // values the category disallows, it does not retro-enforce the enum.
    expect(
      validateListingAttributes('electronics', undefined, 'Vintage').ok,
    ).toBe(true);
  });
});

describe('validateListingAttributes — per-category attribute schema', () => {
  it('requires a box disclosure for shoes', () => {
    const missing = validateListingAttributes(
      'women',
      {},
      'Very good',
      'women-shoes',
    );
    expect(missing.ok).toBe(false);
    expect(missing.errors[0].code).toBe('missing_required_attribute');
    expect(missing.errors[0].attribute).toBe('boxIncluded');

    expect(
      validateListingAttributes(
        'women',
        { boxIncluded: true, boxCondition: 'worn' },
        'Good',
        'women-shoes',
      ).ok,
    ).toBe(true);
  });

  it('requires hardware condition for bags and constrains its values', () => {
    const missing = validateListingAttributes(
      'designer',
      {},
      'Good',
      'designer-bags',
    );
    expect(missing.ok).toBe(false);
    expect(missing.errors[0].attribute).toBe('hardwareCondition');

    const badValue = validateListingAttributes(
      'designer',
      { hardwareCondition: 'minty-fresh' },
      'Good',
      'designer-bags',
    );
    expect(badValue.ok).toBe(false);
    expect(badValue.errors[0].code).toBe('invalid_attribute_value');

    expect(
      validateListingAttributes(
        'designer',
        { hardwareCondition: 'tarnished', dustBagIncluded: true },
        'Satisfactory',
        'designer-bags',
      ).ok,
    ).toBe(true);
  });

  it('requires functional condition for electronics and rejects undeclared keys', () => {
    const missing = validateListingAttributes(
      'electronics',
      {},
      'Good',
      'elec-phones',
    );
    expect(missing.errors.map((e) => e.attribute)).toContain('functionalCondition');

    const unknownKey = validateListingAttributes(
      'electronics',
      { functionalCondition: 'fully-functional', hemline: 'short' },
      'Good',
      'elec-phones',
    );
    expect(unknownKey.ok).toBe(false);
    expect(unknownKey.errors[0].code).toBe('unknown_attribute');

    const badBattery = validateListingAttributes(
      'electronics',
      { functionalCondition: 'fully-functional', batteryHealthPct: 140 },
      'Good',
      'elec-phones',
    );
    expect(badBattery.errors[0].code).toBe('invalid_attribute_value');
  });

  it('requires year + mileage for cars', () => {
    const result = validateListingAttributes(
      'cars',
      { year: 2004, mileageKm: 182_000, fuelType: 'petrol' },
      'Good',
    );
    expect(result.ok).toBe(true);

    const missing = validateListingAttributes('cars', { year: 2004 }, 'Good');
    expect(missing.errors.map((e) => e.attribute)).toContain('mileageKm');
  });

  it('skips required-attribute checks when the surface carries no attributes', () => {
    // attributes === undefined → the write path cannot express attributes,
    // so required keys cannot be enforced. Condition is still checked.
    expect(
      validateListingAttributes('electronics', undefined, 'Good', 'elec-phones').ok,
    ).toBe(true);
  });
});

describe('validateListingActivation — registry wiring', () => {
  it('fails activation when the condition is invalid for the category', () => {
    const result = validateListingActivation({
      ...ACTIVE_BASE,
      category: 'electronics',
      subcategory: 'elec-phones',
      condition: 'New with tags',
    });
    expect(result.valid).toBe(false);
    expect(result.missingRequired).toEqual([]);
    expect(result.attributeErrors[0].code).toBe('condition_not_allowed_for_category');
  });

  it('activates a conforming electronics listing', () => {
    const result = validateListingActivation({
      ...ACTIVE_BASE,
      category: 'electronics',
      subcategory: 'elec-phones',
      condition: 'Very good',
      attributes: { functionalCondition: 'fully-functional' },
    });
    expect(result.valid).toBe(true);
    expect(result.attributeErrors).toEqual([]);
  });

  it('activates a shoe listing only when size and box disclosure are present', () => {
    const result = validateListingActivation({
      ...ACTIVE_BASE,
      category: 'women',
      subcategory: 'women-shoes',
      condition: 'Very good',
      attributes: { boxIncluded: false },
    });
    // 'size' is required for shoes by the presentation policy; the
    // attributes map satisfies the registry's required key.
    expect(result.missingRequired).toEqual(['size']);
    expect(result.attributeErrors).toEqual([]);
    expect(result.valid).toBe(false);
  });
});
