/**
 * Size Mapping
 *
 * Category-aware size system mapping. The original source size label is NEVER
 * discarded: it is preserved verbatim in `originalLabel` so the review
 * workbench can show "Imported vs ThryftVerse" diffs and the seller can
 * correct a bad canonical mapping without losing the source truth.
 *
 * Principles (per blueprint §10):
 * - Never discard the original size label.
 * - Map deterministically by category group when a reviewed rule exists.
 * - Unknown sizes return null with low confidence for seller review.
 */

import type {
  CanonicalListingField,
  CatalogSource,
  FieldConfidence,
} from '../../domain/catalogImports/catalogImportTypes.js';
import { fromDeterministicMap } from './canonicalListingSchema.js';

// ---------------------------------------------------------------------------
// Version
// ---------------------------------------------------------------------------

export const SIZE_MAPPING_VERSION = '1.0.0';

// ---------------------------------------------------------------------------
// Size system detection
// ---------------------------------------------------------------------------

export type SizeSystem = 'alpha' | 'numeric' | 'waist' | 'eu' | 'uk' | 'us';

/**
 * Detect the size system implied by a source size label. Used to route a
 * label to the right mapping table and to annotate provenance. Unknown
 * labels default to 'alpha'.
 */
export function detectSizeSystem(label: string): SizeSystem {
  const trimmed = label.trim();

  // Waist measurements: "30W", "W30", "30x32"
  if (/^\d{2}w$/i.test(trimmed) || /^w\d{2}$/i.test(trimmed) || /^\d{2}\s*[xX]\s*\d{2}$/.test(trimmed)) {
    return 'waist';
  }

  // EU sizes: "EU 42", "42 EU"
  if (/^eu\s*\d{2,3}$/i.test(trimmed) || /^\d{2,3}\s*eu$/i.test(trimmed)) {
    return 'eu';
  }

  // UK sizes: "UK 8", "10 UK"
  if (/^uk\s*\d{1,2}$/i.test(trimmed) || /^\d{1,2}\s*uk$/i.test(trimmed)) {
    return 'uk';
  }

  // US sizes: "US 6", "4 US"
  if (/^us\s*\d{1,2}$/i.test(trimmed) || /^\d{1,2}\s*us$/i.test(trimmed)) {
    return 'us';
  }

  // Pure numeric (dress / shoe numeric): "8", "42"
  if (/^\d{1,3}(\.5)?$/.test(trimmed)) {
    return 'numeric';
  }

  // Everything else (XS/S/M/L/XL, "One Size", "Free Size") is alpha.
  return 'alpha';
}

// ---------------------------------------------------------------------------
// Mapping table type
// ---------------------------------------------------------------------------

export type SizeSystemMap = Record<
  string,
  { canonical: string; confidence: FieldConfidence }
>;

// ---------------------------------------------------------------------------
// Per-category-group maps
// ---------------------------------------------------------------------------

export const TOP_SIZE_MAP: SizeSystemMap = {
  XS: { canonical: 'XS', confidence: 'high' },
  S: { canonical: 'S', confidence: 'high' },
  M: { canonical: 'M', confidence: 'high' },
  L: { canonical: 'L', confidence: 'high' },
  XL: { canonical: 'XL', confidence: 'high' },
  XXL: { canonical: 'XXL', confidence: 'high' },
  '2XL': { canonical: 'XXL', confidence: 'high' },
  '3XL': { canonical: '3XL', confidence: 'high' },
};

export const BOTTOM_SIZE_MAP: SizeSystemMap = {
  '28': { canonical: '28', confidence: 'high' },
  '30': { canonical: '30', confidence: 'high' },
  '32': { canonical: '32', confidence: 'high' },
  '34': { canonical: '34', confidence: 'high' },
  '36': { canonical: '36', confidence: 'high' },
  '38': { canonical: '38', confidence: 'high' },
  '40': { canonical: '40', confidence: 'high' },
  '42': { canonical: '42', confidence: 'high' },
};

export const SHOE_SIZE_MAP: SizeSystemMap = {
  '6': { canonical: 'UK 6', confidence: 'high' },
  '7': { canonical: 'UK 7', confidence: 'high' },
  '8': { canonical: 'UK 8', confidence: 'high' },
  '9': { canonical: 'UK 9', confidence: 'high' },
  '10': { canonical: 'UK 10', confidence: 'high' },
  '11': { canonical: 'UK 11', confidence: 'high' },
  '12': { canonical: 'UK 12', confidence: 'high' },
  'EU 39': { canonical: 'EU 39', confidence: 'high' },
  'EU 40': { canonical: 'EU 40', confidence: 'high' },
  'EU 41': { canonical: 'EU 41', confidence: 'high' },
  'EU 42': { canonical: 'EU 42', confidence: 'high' },
  'EU 43': { canonical: 'EU 43', confidence: 'high' },
  'EU 44': { canonical: 'EU 44', confidence: 'high' },
};

export const DRESS_SIZE_MAP: SizeSystemMap = {
  '6': { canonical: 'UK 6', confidence: 'high' },
  '8': { canonical: 'UK 8', confidence: 'high' },
  '10': { canonical: 'UK 10', confidence: 'high' },
  '12': { canonical: 'UK 12', confidence: 'high' },
  '14': { canonical: 'UK 14', confidence: 'high' },
  '16': { canonical: 'UK 16', confidence: 'high' },
  '18': { canonical: 'UK 18', confidence: 'high' },
  'US 2': { canonical: 'US 2', confidence: 'high' },
  'US 4': { canonical: 'US 4', confidence: 'high' },
  'US 6': { canonical: 'US 6', confidence: 'high' },
  'US 8': { canonical: 'US 8', confidence: 'high' },
  'US 10': { canonical: 'US 10', confidence: 'high' },
};

// ---------------------------------------------------------------------------
// Category group routing
// ---------------------------------------------------------------------------

type CategoryGroup = 'top' | 'bottom' | 'shoe' | 'dress';

const CATEGORY_GROUP_KEYWORDS: Array<{ group: CategoryGroup; keywords: string[] }> = [
  { group: 'shoe', keywords: ['shoe', 'trainer', 'boot', 'heel', 'sandal'] },
  { group: 'dress', keywords: ['dress', 'gown'] },
  { group: 'bottom', keywords: ['trouser', 'jean', 'legging', 'short', 'skirt', 'bottom'] },
  { group: 'top', keywords: ['jacket', 'coat', 'top', 'blouse', 'shirt', 'knit', 'jumper', 'sweater'] },
];

function resolveCategoryGroup(category: string | null): CategoryGroup | null {
  if (!category) return null;
  const lower = category.toLowerCase();
  for (const { group, keywords } of CATEGORY_GROUP_KEYWORDS) {
    if (keywords.some((kw) => lower.includes(kw))) {
      return group;
    }
  }
  return null;
}

function sizeMapForGroup(group: CategoryGroup): SizeSystemMap {
  switch (group) {
    case 'top':
      return TOP_SIZE_MAP;
    case 'bottom':
      return BOTTOM_SIZE_MAP;
    case 'shoe':
      return SHOE_SIZE_MAP;
    case 'dress':
      return DRESS_SIZE_MAP;
  }
}

// ---------------------------------------------------------------------------
// Mapping function
// ---------------------------------------------------------------------------

export interface MappedSize {
  size: CanonicalListingField<string | null>;
  originalLabel: CanonicalListingField<string | null>;
}

/**
 * Map a source size label to a canonical size for the given category.
 *
 * - The original label is ALWAYS preserved verbatim in `originalLabel` with
 *   marketplace provenance, regardless of whether the canonical mapping
 *   succeeds. This guarantees the source truth is never lost.
 * - The canonical `size` is resolved via the category-group mapping table.
 *   Unknown sizes return null with low confidence and reasonCode
 *   'unmapped_size' so the seller can pick one during review.
 * - When no category is available, the size cannot be safely mapped and
 *   returns null with low confidence and reasonCode 'size_category_unknown'.
 */
export function mapSize(
  source: CatalogSource,
  sourceSize: string | null,
  category: string | null,
): MappedSize {
  const originalLabel: CanonicalListingField<string | null> = {
    value: sourceSize,
    sourceKind: 'marketplace',
    sourceValue: sourceSize,
    confidence: sourceSize ? 'high' : 'low',
    reasonCode: sourceSize ? undefined : 'missing_size_label',
  };

  if (!sourceSize) {
    return {
      size: fromDeterministicMap<string | null>(
        null,
        sourceSize,
        SIZE_MAPPING_VERSION,
        'low',
        'unmapped_size',
      ),
      originalLabel,
    };
  }

  const group = resolveCategoryGroup(category);
  if (!group) {
    return {
      size: fromDeterministicMap<string | null>(
        null,
        sourceSize,
        SIZE_MAPPING_VERSION,
        'low',
        'size_category_unknown',
      ),
      originalLabel,
    };
  }

  const map = sizeMapForGroup(group);
  const entry = map[sourceSize];
  if (!entry) {
    return {
      size: fromDeterministicMap<string | null>(
        null,
        sourceSize,
        SIZE_MAPPING_VERSION,
        'low',
        'unmapped_size',
      ),
      originalLabel,
    };
  }

  return {
    size: fromDeterministicMap<string | null>(
      entry.canonical,
      sourceSize,
      SIZE_MAPPING_VERSION,
      entry.confidence,
    ),
    originalLabel,
  };
}
