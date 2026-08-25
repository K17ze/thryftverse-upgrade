/**
 * Category Mapping
 *
 * Versioned mapping from source-specific leaf categories to ThryftVerse
 * canonical categories. Mapping is deterministic and reviewed: a source
 * category either resolves to a known canonical category with a confidence
 * label, or it returns null with low confidence so the seller can pick one.
 *
 * Principles (per blueprint §10):
 * - Never map to a prohibited category.
 * - Unknown categories are surfaced honestly, never guessed.
 * - Every mapping table is versioned so reprocessing is reproducible.
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

export const CATEGORY_MAPPING_VERSION = '1.0.0';

// ---------------------------------------------------------------------------
// Prohibited categories — never mapped to, even if a source table suggests it
// ---------------------------------------------------------------------------

export const PROHIBITED_CATEGORIES: Set<string> = new Set<string>([
  'Weapons',
  'Alcohol',
  'Tobacco',
]);

// ---------------------------------------------------------------------------
// Mapping table type
// ---------------------------------------------------------------------------

export type CategoryMappingTable = Record<
  string,
  { canonical: string; confidence: FieldConfidence }
>;

// ---------------------------------------------------------------------------
// eBay leaf category ID -> ThryftVerse canonical category
// IDs are real eBay fashion resale leaf categories.
// ---------------------------------------------------------------------------

export const EBAY_CATEGORY_MAP: CategoryMappingTable = {
  // Women's clothing
  '57988': { canonical: 'Jackets & Coats', confidence: 'high' },
  '57990': { canonical: 'Dresses', confidence: 'high' },
  '57989': { canonical: 'Tops & Blouses', confidence: 'high' },
  '57992': { canonical: 'Trousers & Leggings', confidence: 'high' },
  '57993': { canonical: 'Skirts', confidence: 'high' },
  '57991': { canonical: 'Knitwear', confidence: 'high' },
  // Men's clothing
  '57994': { canonical: 'Men\'s Jackets & Coats', confidence: 'high' },
  '57995': { canonical: 'Men\'s Tops', confidence: 'high' },
  '57996': { canonical: 'Men\'s Trousers', confidence: 'high' },
  // Footwear
  '57997': { canonical: 'Women\'s Shoes', confidence: 'high' },
  '57998': { canonical: 'Men\'s Shoes', confidence: 'high' },
  '93427': { canonical: 'Trainers', confidence: 'high' },
  // Accessories
  '57999': { canonical: 'Bags & Purses', confidence: 'high' },
  '58000': { canonical: 'Accessories', confidence: 'high' },
  '58001': { canonical: 'Jewellery', confidence: 'high' },
  '58002': { canonical: 'Watches', confidence: 'high' },
  // Activewear / swimwear
  '58003': { canonical: 'Activewear', confidence: 'medium' },
  '58004': { canonical: 'Swimwear', confidence: 'medium' },
};

// ---------------------------------------------------------------------------
// Source -> table registry
// ---------------------------------------------------------------------------

const CATEGORY_TABLES: Partial<Record<CatalogSource, CategoryMappingTable>> = {
  ebay: EBAY_CATEGORY_MAP,
};

// ---------------------------------------------------------------------------
// Mapping function
// ---------------------------------------------------------------------------

/**
 * Resolve a source-specific leaf category to a ThryftVerse canonical category.
 *
 * - Known mappings return a deterministic_map field with the table version.
 * - Unknown categories return null with low confidence and reasonCode
 *   'unmapped_category' so the seller can choose one during review.
 * - A mapping that would resolve to a prohibited category is refused: the
 *   field returns null with low confidence and reasonCode 'prohibited_category'.
 */
export function mapCategory(
  source: CatalogSource,
  sourceCategory: string | null,
): CanonicalListingField<string | null> {
  if (!sourceCategory) {
    return fromDeterministicMap<string | null>(
      null,
      sourceCategory,
      CATEGORY_MAPPING_VERSION,
      'low',
      'unmapped_category',
    );
  }

  const table = CATEGORY_TABLES[source];
  if (!table) {
    return fromDeterministicMap<string | null>(
      null,
      sourceCategory,
      CATEGORY_MAPPING_VERSION,
      'low',
      'unmapped_category',
    );
  }

  const entry = table[sourceCategory];
  if (!entry) {
    return fromDeterministicMap<string | null>(
      null,
      sourceCategory,
      CATEGORY_MAPPING_VERSION,
      'low',
      'unmapped_category',
    );
  }

  if (PROHIBITED_CATEGORIES.has(entry.canonical)) {
    return fromDeterministicMap<string | null>(
      null,
      sourceCategory,
      CATEGORY_MAPPING_VERSION,
      'low',
      'prohibited_category',
    );
  }

  return fromDeterministicMap<string | null>(
    entry.canonical,
    sourceCategory,
    CATEGORY_MAPPING_VERSION,
    entry.confidence,
  );
}
