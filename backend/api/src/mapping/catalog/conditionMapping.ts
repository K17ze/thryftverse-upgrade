/**
 * Condition Mapping
 *
 * Versioned mapping from source-specific condition labels to ThryftVerse
 * canonical conditions. Condition is a material claim: it NEVER maps upward
 * silently. A conservative mapping is always preferred to an optimistic one,
 * and any ambiguous or refurbished condition is flagged for seller review.
 *
 * ThryftVerse canonical conditions (best -> worst):
 *   'New with tags' > 'Very good' > 'Good' > 'Satisfactory'
 *
 * Principles (per blueprint §10):
 * - Never improve a condition claim automatically.
 * - Refurbished and "new other" conditions never upgrade to NWT.
 * - Ambiguous conditions land on low confidence for human review.
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

export const CONDITION_MAPPING_VERSION = '1.0.0';

// ---------------------------------------------------------------------------
// Canonical condition ordering (higher = better)
// ---------------------------------------------------------------------------

export const CONDITION_RANK: Record<string, number> = {
  'New with tags': 4,
  'Very good': 3,
  'Good': 2,
  'Satisfactory': 1,
};

// ---------------------------------------------------------------------------
// Mapping entry
// ---------------------------------------------------------------------------

export interface ConditionMappingEntry {
  canonical: string;
  confidence: FieldConfidence;
  /** Optional reason code for low-confidence / review-required entries. */
  reasonCode?: string;
}

// ---------------------------------------------------------------------------
// eBay condition ID -> ThryftVerse canonical condition
// eBay conditions: 1000 New, 1500 New other, 2000 Manufacturer refurbished,
// 2500 Seller refurbished, 3000 Used, 4000 Very good, 5000 Good, 6000 Fair.
// ---------------------------------------------------------------------------

export const EBAY_CONDITION_MAP: Record<string, ConditionMappingEntry> = {
  '1000': { canonical: 'New with tags', confidence: 'high' },
  '1500': { canonical: 'Very good', confidence: 'medium', reasonCode: 'new_other_never_nwt' },
  '2000': { canonical: 'Very good', confidence: 'low', reasonCode: 'refurbished_requires_review' },
  '2500': { canonical: 'Very good', confidence: 'low', reasonCode: 'refurbished_requires_review' },
  '3000': { canonical: 'Good', confidence: 'medium' },
  '4000': { canonical: 'Very good', confidence: 'high' },
  '5000': { canonical: 'Good', confidence: 'high' },
  '6000': { canonical: 'Satisfactory', confidence: 'high' },
};

// ---------------------------------------------------------------------------
// Source -> table registry
// ---------------------------------------------------------------------------

const CONDITION_TABLES: Partial<Record<CatalogSource, Record<string, ConditionMappingEntry>>> = {
  ebay: EBAY_CONDITION_MAP,
};

// ---------------------------------------------------------------------------
// Anti-upgrade guard
// ---------------------------------------------------------------------------

/**
 * Returns false if mapping `from` -> `to` would be an upgrade (the mapped
 * condition ranks higher than the source condition). This is the anti-upgrade
 * guard: a deterministic map must never silently improve a condition claim.
 *
 * Unknown source conditions are treated as the lowest rank so any non-trivial
 * mapping is flagged for review rather than assumed safe.
 */
export function assertNoConditionUpgrade(from: string, to: string): boolean {
  const fromRank = CONDITION_RANK[from] ?? 0;
  const toRank = CONDITION_RANK[to] ?? 0;
  return toRank <= fromRank;
}

// ---------------------------------------------------------------------------
// Mapping function
// ---------------------------------------------------------------------------

/**
 * Resolve a source-specific condition to a ThryftVerse canonical condition.
 *
 * - Known mappings return a deterministic_map field with the table version.
 * - Unknown conditions return null with low confidence and reasonCode
 *   'unmapped_condition' for seller review.
 * - The anti-upgrade guard is applied: if a table entry would rank higher
 *   than a recognisable source label, the mapping is refused and returned
 *   as null with low confidence and reasonCode 'condition_upgrade_blocked'.
 */
export function mapCondition(
  source: CatalogSource,
  sourceCondition: string | null,
): CanonicalListingField<string | null> {
  if (!sourceCondition) {
    return fromDeterministicMap<string | null>(
      null,
      sourceCondition,
      CONDITION_MAPPING_VERSION,
      'low',
      'unmapped_condition',
    );
  }

  const table = CONDITION_TABLES[source];
  if (!table) {
    return fromDeterministicMap<string | null>(
      null,
      sourceCondition,
      CONDITION_MAPPING_VERSION,
      'low',
      'unmapped_condition',
    );
  }

  const entry = table[sourceCondition];
  if (!entry) {
    return fromDeterministicMap<string | null>(
      null,
      sourceCondition,
      CONDITION_MAPPING_VERSION,
      'low',
      'unmapped_condition',
    );
  }

  // Anti-upgrade guard: if the source label is itself a recognisable
  // canonical condition, refuse any mapping that would improve it.
  if (CONDITION_RANK[sourceCondition] !== undefined) {
    if (!assertNoConditionUpgrade(sourceCondition, entry.canonical)) {
      return fromDeterministicMap<string | null>(
        null,
        sourceCondition,
        CONDITION_MAPPING_VERSION,
        'low',
        'condition_upgrade_blocked',
      );
    }
  }

  return fromDeterministicMap<string | null>(
    entry.canonical,
    sourceCondition,
    CONDITION_MAPPING_VERSION,
    entry.confidence,
    entry.reasonCode,
  );
}
