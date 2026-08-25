/**
 * Field Provenance
 *
 * Helpers for materialising the per-field provenance rows that back the
 * review workbench's "Imported vs ThryftVerse" diff view. Every field on a
 * canonical listing candidate becomes one provenance row so the audit trail
 * can answer "who or what produced this value, and from what?".
 *
 * The row shape mirrors the `catalog_import_field_provenance` table.
 */

import type {
  CanonicalListingCandidate,
  CanonicalListingField,
  FieldConfidence,
  FieldSourceKind,
} from '../../domain/catalogImports/catalogImportTypes.js';
import { CANONICAL_FIELDS } from './canonicalListingSchema.js';

// ---------------------------------------------------------------------------
// Provenance record (mirrors catalog_import_field_provenance)
// ---------------------------------------------------------------------------

export interface ProvenanceRecord {
  id: string;
  importItemId: string;
  fieldName: string;
  sourceKind: FieldSourceKind;
  sourceValueJson: unknown;
  resolvedValueJson: unknown;
  confidence: FieldConfidence;
  mappingVersion: string | null;
  changedBy: string | null;
  changedAt: Date;
  reasonCode: string | null;
}

// ---------------------------------------------------------------------------
// Field iteration
// ---------------------------------------------------------------------------

type FieldEntry = CanonicalListingField<unknown> | undefined;

const FIELD_NAMES: ReadonlyArray<{ key: keyof CanonicalListingCandidate; column: string }> = [
  { key: 'title', column: CANONICAL_FIELDS.title },
  { key: 'description', column: CANONICAL_FIELDS.description },
  { key: 'priceGbp', column: CANONICAL_FIELDS.priceGbp },
  { key: 'currency', column: CANONICAL_FIELDS.currency },
  { key: 'category', column: CANONICAL_FIELDS.category },
  { key: 'brand', column: CANONICAL_FIELDS.brand },
  { key: 'size', column: CANONICAL_FIELDS.size },
  { key: 'originalSizeLabel', column: CANONICAL_FIELDS.originalSizeLabel },
  { key: 'condition', column: CANONICAL_FIELDS.condition },
  { key: 'quantity', column: CANONICAL_FIELDS.quantity },
  { key: 'sku', column: CANONICAL_FIELDS.sku },
  { key: 'sourceUrl', column: CANONICAL_FIELDS.sourceUrl },
  { key: 'tags', column: CANONICAL_FIELDS.tags },
];

// ---------------------------------------------------------------------------
// Record builder
// ---------------------------------------------------------------------------

/**
 * Build one provenance row per field on the canonical candidate. Each row
 * captures the source kind, the original source value, the resolved value,
 * the confidence, the mapping version (if deterministic), and the actor
 * that last touched the field.
 *
 * `changedBy` is the operator/seller/system actor that produced this
 * candidate; it may be null for purely automated deterministic mappings.
 */
export function buildProvenanceRecords(
  itemId: string,
  candidate: CanonicalListingCandidate,
  changedBy: string | null,
): ProvenanceRecord[] {
  const changedAt = new Date();
  const records: ProvenanceRecord[] = [];

  for (const { key, column } of FIELD_NAMES) {
    const field = candidate[key] as FieldEntry;
    if (!field) continue;

    records.push({
      id: `${itemId}:${column}`,
      importItemId: itemId,
      fieldName: column,
      sourceKind: field.sourceKind,
      sourceValueJson: field.sourceValue ?? null,
      resolvedValueJson: field.value ?? null,
      confidence: field.confidence,
      mappingVersion: field.mappingVersion ?? null,
      changedBy,
      changedAt,
      reasonCode: field.reasonCode ?? null,
    });
  }

  return records;
}

// ---------------------------------------------------------------------------
// Summary (for UI display)
// ---------------------------------------------------------------------------

export interface ProvenanceSummary {
  totalFields: number;
  lowConfidenceCount: number;
  aiSuggestionCount: number;
  deterministicMapCount: number;
}

/**
 * Summarise a set of provenance records for the review workbench header:
 * how many fields are present, how many need seller review (low confidence),
 * and how many were produced by AI suggestions vs deterministic maps.
 */
export function summariseProvenance(records: ProvenanceRecord[]): ProvenanceSummary {
  let lowConfidenceCount = 0;
  let aiSuggestionCount = 0;
  let deterministicMapCount = 0;

  for (const record of records) {
    if (record.confidence === 'low') {
      lowConfidenceCount += 1;
    }
    if (record.sourceKind === 'ai_suggestion') {
      aiSuggestionCount += 1;
    }
    if (record.sourceKind === 'deterministic_map') {
      deterministicMapCount += 1;
    }
  }

  return {
    totalFields: records.length,
    lowConfidenceCount,
    aiSuggestionCount,
    deterministicMapCount,
  };
}
