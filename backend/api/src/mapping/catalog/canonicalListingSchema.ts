/**
 * Canonical Listing Schema
 *
 * The canonical field shape that every source maps into. This is the
 * contract between the mapping layer and the publication layer. It is
 * deliberately a plain interface, not a class — the mapping layer produces
 * it, the validation layer checks it, and the publication layer consumes it.
 *
 * Mapping principles (per blueprint §10):
 * 1. Preserve the source value and source identity.
 * 2. Map deterministically when there is a reviewed rule.
 * 3. Use AI only to suggest when deterministic mapping cannot resolve.
 * 4. Never convert low confidence into a material fact.
 * 5. Never improve condition or authenticity claims automatically.
 * 6. Require seller review for price/currency, shipping, condition
 *    uncertainty, prohibited/restricted categories, and any
 *    authenticity-related claim.
 * 7. Version every mapping table so reprocessing is reproducible.
 */

import type {
  CanonicalListingCandidate,
  CanonicalListingField,
  FieldConfidence,
  FieldSourceKind,
} from '../../domain/catalogImports/catalogImportTypes.js';

// ---------------------------------------------------------------------------
// Schema version
// ---------------------------------------------------------------------------

export const CANONICAL_LISTING_SCHEMA_VERSION = '1.0.0';

// ---------------------------------------------------------------------------
// Canonical field names (single source of truth for column/JSON keys)
// ---------------------------------------------------------------------------

export const CANONICAL_FIELDS = {
  title: 'title',
  description: 'description',
  priceGbp: 'price_gbp',
  currency: 'currency',
  category: 'category',
  brand: 'brand',
  size: 'size',
  originalSizeLabel: 'original_size_label',
  condition: 'condition',
  quantity: 'quantity',
  sku: 'sku',
  sourceUrl: 'source_url',
  tags: 'tags',
} as const;

export type CanonicalFieldName = typeof CANONICAL_FIELDS[keyof typeof CANONICAL_FIELDS];

// ---------------------------------------------------------------------------
// Required fields for publication readiness
// ---------------------------------------------------------------------------

export const REQUIRED_FIELDS_FOR_PUBLICATION: readonly CanonicalFieldName[] = [
  CANONICAL_FIELDS.title,
  CANONICAL_FIELDS.priceGbp,
  CANONICAL_FIELDS.currency,
  CANONICAL_FIELDS.category,
  CANONICAL_FIELDS.condition,
] as const;

// ---------------------------------------------------------------------------
// Factory helpers for building canonical fields with provenance
// ---------------------------------------------------------------------------

export function fromMarketplace<T>(
  value: T,
  sourceValue: unknown,
  confidence: FieldConfidence = 'high',
  reasonCode?: string,
): CanonicalListingField<T> {
  return {
    value,
    sourceKind: 'marketplace' as FieldSourceKind,
    sourceValue,
    confidence,
    reasonCode,
  };
}

export function fromDeterministicMap<T>(
  value: T,
  sourceValue: unknown,
  mappingVersion: string,
  confidence: FieldConfidence,
  reasonCode?: string,
): CanonicalListingField<T> {
  return {
    value,
    sourceKind: 'deterministic_map' as FieldSourceKind,
    sourceValue,
    confidence,
    mappingVersion,
    reasonCode,
  };
}

export function fromSeller<T>(
  value: T,
  sourceValue: unknown,
  confidence: FieldConfidence = 'high',
  reasonCode?: string,
): CanonicalListingField<T> {
  return {
    value,
    sourceKind: 'seller' as FieldSourceKind,
    sourceValue,
    confidence,
    reasonCode,
  };
}

export function fromAiSuggestion<T>(
  value: T,
  sourceValue: unknown,
  confidence: FieldConfidence,
  reasonCode?: string,
): CanonicalListingField<T> {
  return {
    value,
    sourceKind: 'ai_suggestion' as FieldSourceKind,
    sourceValue,
    confidence,
    reasonCode,
  };
}

// ---------------------------------------------------------------------------
// Validation: which fields block publication
// ---------------------------------------------------------------------------

export interface CanonicalValidationResult {
  valid: boolean;
  /** Fields that are required but missing or empty. */
  missingFields: CanonicalFieldName[];
  /** Fields present but with low confidence that require seller review. */
  lowConfidenceFields: CanonicalFieldName[];
}

export function validateCanonicalCandidate(
  candidate: CanonicalListingCandidate,
): CanonicalValidationResult {
  const missingFields: CanonicalFieldName[] = [];
  const lowConfidenceFields: CanonicalFieldName[] = [];

  // Title
  if (!candidate.title.value || candidate.title.value.trim().length < 3) {
    missingFields.push(CANONICAL_FIELDS.title);
  } else if (candidate.title.confidence === 'low') {
    lowConfidenceFields.push(CANONICAL_FIELDS.title);
  }

  // Price
  if (!Number.isFinite(candidate.priceGbp.value) || candidate.priceGbp.value <= 0) {
    missingFields.push(CANONICAL_FIELDS.priceGbp);
  } else if (candidate.priceGbp.confidence === 'low') {
    lowConfidenceFields.push(CANONICAL_FIELDS.priceGbp);
  }

  // Currency — must be GBP for v1 (confirmed conversion)
  if (!candidate.currency.value) {
    missingFields.push(CANONICAL_FIELDS.currency);
  } else if (candidate.currency.value !== 'GBP' && candidate.currency.confidence !== 'high') {
    lowConfidenceFields.push(CANONICAL_FIELDS.currency);
  }

  // Category
  if (!candidate.category.value) {
    missingFields.push(CANONICAL_FIELDS.category);
  } else if (candidate.category.confidence === 'low') {
    lowConfidenceFields.push(CANONICAL_FIELDS.category);
  }

  // Condition
  if (!candidate.condition.value) {
    missingFields.push(CANONICAL_FIELDS.condition);
  } else if (candidate.condition.confidence === 'low') {
    lowConfidenceFields.push(CANONICAL_FIELDS.condition);
  }

  return {
    valid: missingFields.length === 0 && lowConfidenceFields.length === 0,
    missingFields,
    lowConfidenceFields,
  };
}

// ---------------------------------------------------------------------------
// Serialisation: convert canonical candidate to the JSONB shape stored in
// catalog_import_items.normalised_fields and returned to the frontend.
// ---------------------------------------------------------------------------

export function serialiseCanonicalCandidate(
  candidate: CanonicalListingCandidate,
): Record<string, unknown> {
  return {
    schema_version: CANONICAL_LISTING_SCHEMA_VERSION,
    title: candidate.title,
    description: candidate.description,
    price_gbp: candidate.priceGbp,
    currency: candidate.currency,
    category: candidate.category,
    brand: candidate.brand,
    size: candidate.size,
    original_size_label: candidate.originalSizeLabel,
    condition: candidate.condition,
    quantity: candidate.quantity,
    sku: candidate.sku,
    source_url: candidate.sourceUrl,
    tags: candidate.tags,
  };
}
