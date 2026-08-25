/**
 * Catalogue Import Normalisation Worker Handler
 *
 * Maps source fields to the canonical listing schema, validates the candidate,
 * runs duplicate detection, and computes the item's readiness for seller
 * review. When all items in the batch have been normalised, the batch
 * transitions to 'awaiting_seller' (or 'awaiting_operator' if there are
 * mapping blockers that require operator intervention).
 *
 * Mapping principles (per blueprint §10):
 * - Source values are preserved verbatim in provenance for diff display.
 * - Deterministic maps are versioned and reproducible.
 * - Low-confidence and missing fields become blocking issues.
 * - Condition never upgrades automatically.
 * - Currency is never auto-converted.
 *
 * Idempotency: if the item is already at 'ready', 'needs_input', or
 * 'probable_duplicate', the handler is a no-op. Provenance inserts use
 * ON CONFLICT DO NOTHING.
 *
 * @packageDocumentation
 */

import crypto from 'node:crypto';

import { db } from '../../db/pool.js';
import { logger } from '../../lib/logger.js';
import type {
  BlockingIssue,
  CanonicalListingCandidate,
  CatalogImportItemRow,
  CatalogSource,
  ItemReadiness,
} from '../../domain/catalogImports/catalogImportTypes.js';
import {
  fromMarketplace,
  mapCategory,
  mapCondition,
  mapSize,
  resolveCurrency,
  validateCanonicalCandidate,
  serialiseCanonicalCandidate,
  detectDuplicates,
  buildProvenanceRecords,
  type DedupItem,
  type ExistingListing,
} from '../../mapping/catalog/index.js';

// ---------------------------------------------------------------------------
// Job payload
// ---------------------------------------------------------------------------

export interface CatalogImportNormalisationJobData {
  batchId: string;
  itemId: string;
}

// ---------------------------------------------------------------------------
// Source field extraction
// ---------------------------------------------------------------------------

interface SourceFields {
  title: string;
  description: string;
  price: string;
  currency: string;
  category: string;
  brand: string;
  size: string;
  condition: string;
  quantity: string;
  sku: string;
  sourceUrl: string | null;
}

function extractSourceFields(
  raw: Record<string, unknown> | null,
  item: CatalogImportItemRow,
): SourceFields {
  const r = raw ?? {};
  const str = (key: string): string => {
    const val = r[key];
    return typeof val === 'string' ? val : val != null ? String(val) : '';
  };

  return {
    title: str('title'),
    description: str('description'),
    price: str('price'),
    currency: str('currency'),
    category: str('category'),
    brand: str('brand'),
    size: str('size'),
    condition: str('condition'),
    quantity: str('quantity'),
    sku: str('sku'),
    sourceUrl: item.source_url ?? (typeof r['source_url'] === 'string' ? r['source_url'] : null),
  };
}

function parsePrice(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  const parsed = Number.parseFloat(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseQuantity(raw: string): number {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return 1;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

// ---------------------------------------------------------------------------
// Canonical candidate builder
// ---------------------------------------------------------------------------

function buildCanonicalCandidate(
  source: CatalogSource,
  fields: SourceFields,
): CanonicalListingCandidate {
  const price = parsePrice(fields.price);

  const categoryField = mapCategory(source, fields.category || null);
  const conditionField = mapCondition(source, fields.condition || null);
  const sizeMapping = mapSize(source, fields.size || null, categoryField.value);
  const currencyResolution = resolveCurrency(fields.currency || null, price);

  const title = fields.title.trim();
  const description = fields.description.trim();
  const brand = fields.brand.trim();
  const sku = fields.sku.trim();

  return {
    title: fromMarketplace<string>(title, fields.title, title.length >= 3 ? 'high' : 'low'),
    description: fromMarketplace<string>(description, fields.description, 'high'),
    priceGbp: currencyResolution.priceGbp,
    currency: currencyResolution.currency,
    category: categoryField,
    brand: fromMarketplace<string | null>(brand || null, fields.brand, brand ? 'high' : 'low'),
    size: sizeMapping.size,
    originalSizeLabel: sizeMapping.originalLabel,
    condition: conditionField,
    quantity: fromMarketplace<number>(parseQuantity(fields.quantity), fields.quantity, 'high'),
    sku: fromMarketplace<string | null>(sku || null, fields.sku, sku ? 'high' : 'low'),
    sourceUrl: fromMarketplace<string | null>(fields.sourceUrl, fields.sourceUrl, 'high'),
    tags: fromMarketplace<string[]>([], undefined, 'medium'),
  };
}

// ---------------------------------------------------------------------------
// Blocking issue builder
// ---------------------------------------------------------------------------

function buildBlockingIssues(
  candidate: CanonicalListingCandidate,
  validationResult: {
    missingFields: string[];
    lowConfidenceFields: string[];
  },
): BlockingIssue[] {
  const issues: BlockingIssue[] = [];

  for (const field of validationResult.missingFields) {
    issues.push(missingIssueForField(field));
  }

  for (const field of validationResult.lowConfidenceFields) {
    issues.push(lowConfidenceIssueForField(field));
  }

  return issues;
}

function missingIssueForField(fieldName: string): BlockingIssue {
  switch (fieldName) {
    case 'title':
      return {
        code: 'missing_title',
        fieldName,
        message: 'Title is missing or too short',
        recoveryHint: 'Provide a descriptive title of at least 3 characters.',
      };
    case 'price_gbp':
      return {
        code: 'missing_price',
        fieldName,
        message: 'Price is missing or invalid',
        recoveryHint: 'Confirm the listing price in GBP.',
      };
    case 'currency':
      return {
        code: 'missing_currency',
        fieldName,
        message: 'Currency is missing',
        recoveryHint: 'Specify the source currency so the GBP price can be confirmed.',
      };
    case 'category':
      return {
        code: 'missing_category',
        fieldName,
        message: 'Category could not be mapped',
        recoveryHint: 'Select a ThryftVerse category for this listing.',
      };
    case 'condition':
      return {
        code: 'missing_condition',
        fieldName,
        message: 'Condition could not be mapped',
        recoveryHint: 'Select the ThryftVerse condition that matches the source listing.',
      };
    default:
      return {
        code: 'missing_title',
        fieldName,
        message: `Required field '${fieldName}' is missing`,
        recoveryHint: 'Provide a value for this field.',
      };
  }
}

function lowConfidenceIssueForField(fieldName: string): BlockingIssue {
  switch (fieldName) {
    case 'category':
      return {
        code: 'low_confidence_category',
        fieldName,
        message: 'Category mapping is uncertain',
        recoveryHint: 'Review the mapped category and correct if needed.',
      };
    case 'currency':
      return {
        code: 'non_gbp_currency_unconfirmed',
        fieldName,
        message: 'Non-GBP currency requires seller confirmation',
        recoveryHint: 'Confirm the GBP price for this listing.',
      };
    case 'condition':
      return {
        code: 'ambiguous_condition',
        fieldName,
        message: 'Condition mapping is ambiguous',
        recoveryHint: 'Review the condition and confirm the correct value.',
      };
    default:
      return {
        code: 'ambiguous_condition',
        fieldName,
        message: `Field '${fieldName}' has low confidence and needs review`,
        recoveryHint: 'Review and confirm the value for this field.',
      };
  }
}

// ---------------------------------------------------------------------------
// Dedup
// ---------------------------------------------------------------------------

interface MediaShaRow {
  sha256: string | null;
}

interface BatchItemRow {
  id: string;
  external_item_id: string;
  source_url: string | null;
  source_checksum: string;
  normalised_fields: Record<string, unknown> | null;
}

async function loadDedupItems(batchId: string): Promise<DedupItem[]> {
  const itemsResult = await db.query<BatchItemRow>(
    `SELECT id, external_item_id, source_url, source_checksum, normalised_fields
     FROM catalog_import_items
     WHERE batch_id = $1`,
    [batchId],
  );

  const dedupItems: DedupItem[] = [];
  for (const row of itemsResult.rows) {
    const fields = (row.normalised_fields ?? {}) as Record<string, unknown>;
    const title = typeof fields['title'] === 'object' && fields['title'] !== null
      ? ((fields['title'] as Record<string, unknown>)['value'] as string) ?? undefined
      : undefined;
    const brand = typeof fields['brand'] === 'object' && fields['brand'] !== null
      ? ((fields['brand'] as Record<string, unknown>)['value'] as string) ?? undefined
      : undefined;
    const size = typeof fields['size'] === 'object' && fields['size'] !== null
      ? ((fields['size'] as Record<string, unknown>)['value'] as string) ?? undefined
      : undefined;

    // Load the primary media sha256 for this item.
    const mediaResult = await db.query<MediaShaRow>(
      `SELECT sha256 FROM catalog_import_media
       WHERE import_item_id = $1 AND sha256 IS NOT NULL
       ORDER BY position ASC
       LIMIT 1`,
      [row.id],
    );
    const sha256 = mediaResult.rows[0]?.sha256 ?? undefined;

    dedupItems.push({
      id: row.id,
      externalItemId: row.external_item_id,
      sourceUrl: row.source_url ?? undefined,
      sourceChecksum: row.source_checksum,
      sha256,
      title,
      brand,
      size,
    });
  }

  return dedupItems;
}

async function loadExistingListings(userId: string): Promise<ExistingListing[]> {
  // Load existing live/draft listings for the user to detect cross-batch
  // duplicates. The primary media hash is resolved through the
  // media_bindings table (target_type='listing') which links listings to
  // their authoritative media_assets.
  const result = await db.query<ExistingListing & { sha256: string | null }>(
    `SELECT l.id, l.title, l.brand, l.size, l.price_gbp::text AS "priceGbp",
            ma.checksum_sha256 AS sha256
     FROM listings l
     LEFT JOIN LATERAL (
       SELECT ma2.checksum_sha256
       FROM media_bindings mb2
       JOIN media_assets ma2 ON ma2.id = mb2.media_asset_id
       WHERE mb2.target_type = 'listing'
         AND mb2.target_ref_id = l.id
         AND mb2.removed_at IS NULL
         AND ma2.checksum_sha256 IS NOT NULL
       ORDER BY mb2.sort_order ASC
       LIMIT 1
     ) ma ON true
     WHERE l.user_id = $1
       AND l.status IN ('live', 'draft')
     LIMIT 500`,
    [userId],
  );

  return result.rows.map((row) => ({
    id: row.id,
    title: row.title,
    brand: row.brand ?? undefined,
    size: row.size ?? undefined,
    priceGbp: Number(row.priceGbp),
    sha256: row.sha256 ?? undefined,
  }));
}

// ---------------------------------------------------------------------------
// Batch completion check
// ---------------------------------------------------------------------------

interface PendingCountRow {
  pending: string;
}

async function checkAllItemsNormalised(batchId: string): Promise<boolean> {
  const result = await db.query<PendingCountRow>(
    `SELECT COUNT(*)::text AS pending
     FROM catalog_import_items
     WHERE batch_id = $1
       AND readiness IN ('discovered', 'hydrated', 'media_pending', 'mapping_pending')`,
    [batchId],
  );

  return Number(result.rows[0]?.pending ?? 0) === 0;
}

async function updateBatchCounts(batchId: string): Promise<void> {
  await db.query(
    `UPDATE catalog_import_batches
     SET ready_count = (
       SELECT COUNT(*)::int FROM catalog_import_items
       WHERE batch_id = $1 AND readiness = 'ready'
     ),
     issue_count = (
       SELECT COUNT(*)::int FROM catalog_import_items
       WHERE batch_id = $1 AND readiness IN ('needs_input', 'probable_duplicate')
     ),
     updated_at = NOW()
     WHERE id = $1`,
    [batchId],
  );
}

async function transitionBatchForReview(
  batchId: string,
  hasOperatorBlockers: boolean,
): Promise<void> {
  const targetStatus = hasOperatorBlockers ? 'awaiting_operator' : 'awaiting_seller';
  await db.query(
    `UPDATE catalog_import_batches
     SET status = $2,
         status_reason = NULL,
         updated_at = NOW()
     WHERE id = $1
       AND status = 'normalising'`,
    [batchId, targetStatus],
  );
}

// ---------------------------------------------------------------------------
// Provenance persistence
// ---------------------------------------------------------------------------

async function persistProvenance(
  itemId: string,
  candidate: CanonicalListingCandidate,
): Promise<void> {
  const records = buildProvenanceRecords(itemId, candidate, null);

  for (const record of records) {
    await db.query(
      `INSERT INTO catalog_import_field_provenance (
         id, import_item_id, field_name,
         source_kind, source_value_json, resolved_value_json,
         confidence, mapping_version, changed_by, changed_at, reason_code
       )
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8, $9, $10, $11)
       ON CONFLICT (id) DO NOTHING`,
      [
        record.id,
        record.importItemId,
        record.fieldName,
        record.sourceKind,
        JSON.stringify(record.sourceValueJson ?? null),
        JSON.stringify(record.resolvedValueJson ?? null),
        record.confidence,
        record.mappingVersion,
        record.changedBy,
        record.changedAt,
        record.reasonCode,
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

/**
 * Processes a catalogue import normalisation job for a single item. Maps
 * source fields to the canonical schema, validates the candidate, runs
 * dedup, and updates the item's readiness. When all items are normalised,
 * transitions the batch for seller/operator review.
 */
export async function processCatalogImportNormalisation(
  data: CatalogImportNormalisationJobData,
): Promise<void> {
  const { batchId, itemId } = data;

  const itemResult = await db.query<CatalogImportItemRow>(
    `SELECT id, batch_id, user_id, external_item_id,
            source_url, source_state, source_updated_at,
            source_checksum, raw_snapshot_ciphertext,
            normalised_fields, field_revision,
            readiness, blocking_issues,
            duplicate_of_listing_id, duplicate_score,
            seller_decision, draft_listing_id,
            publication_status, publication_idempotency_key,
            created_at, updated_at
     FROM catalog_import_items
     WHERE id = $1 AND batch_id = $2
     LIMIT 1`,
    [itemId, batchId],
  );

  const item = itemResult.rows[0];
  if (!item) {
    logger.warn({ batchId, itemId }, 'catalogImportNormalisation.item_not_found');
    return;
  }

  // Idempotency: skip if already normalised.
  if (
    item.readiness === 'ready' ||
    item.readiness === 'needs_input' ||
    item.readiness === 'probable_duplicate'
  ) {
    logger.info(
      { batchId, itemId, readiness: item.readiness },
      'catalogImportNormalisation.skipped_already_normalised',
    );
    return;
  }

  // Load the batch to get the source.
  const batchResult = await db.query<{
    source: string;
    user_id: string;
    status: string;
  }>(
    `SELECT source, user_id, status FROM catalog_import_batches WHERE id = $1 LIMIT 1`,
    [batchId],
  );
  const batch = batchResult.rows[0];
  if (!batch) {
    logger.warn({ batchId }, 'catalogImportNormalisation.batch_not_found');
    return;
  }

  const source = batch.source as CatalogSource;

  // Extract source fields from normalised_fields (seller_package) or
  // raw_snapshot (OAuth). For seller_package, the CSV fields were stored
  // in normalised_fields during discovery. For OAuth, the raw payload was
  // stored in raw_snapshot_ciphertext during hydration.
  const rawFields = item.normalised_fields ?? null;
  const fields = extractSourceFields(rawFields, item);

  // Build the canonical candidate.
  const candidate = buildCanonicalCandidate(source, fields);

  // Validate.
  const validationResult = validateCanonicalCandidate(candidate);
  const blockingIssues = buildBlockingIssues(candidate, validationResult);

  // Run dedup.
  const dedupItems = await loadDedupItems(batchId);
  const existingListings = await loadExistingListings(batch.user_id);
  const dedupResults = detectDuplicates({
    items: dedupItems,
    existingListings,
  });
  const dedupResult = dedupResults.get(itemId);

  let duplicateOfListingId: string | null = null;
  let duplicateScore: number | null = null;

  if (dedupResult && dedupResult.isDuplicate) {
    duplicateOfListingId = dedupResult.duplicateOfListingId;
    duplicateScore = Math.round(dedupResult.score * 10000) / 10000;
    blockingIssues.push({
      code: 'probable_duplicate',
      message: 'This item appears to be a duplicate of an existing listing',
      recoveryHint: 'Review the duplicate match and exclude or confirm this item.',
    });
  }

  // Determine readiness.
  let readiness: ItemReadiness;
  if (dedupResult && dedupResult.isDuplicate) {
    readiness = 'probable_duplicate';
  } else if (blockingIssues.length > 0) {
    readiness = 'needs_input';
  } else {
    readiness = 'ready';
  }

  // Serialise the candidate for storage.
  const serialised = serialiseCanonicalCandidate(candidate);

  // Update the item. Use a UUID-based field_revision consistent with the
  // domain service's createId('frev') scheme so optimistic concurrency
  // checks work uniformly across worker and seller-driven updates.
  const newFieldRevision = `frev_${crypto.randomUUID()}`;

  await db.query(
    `UPDATE catalog_import_items
     SET normalised_fields = $2::jsonb,
         readiness = $3,
         blocking_issues = $4::jsonb,
         duplicate_of_listing_id = $5,
         duplicate_score = $6,
         field_revision = $7,
         updated_at = NOW()
     WHERE id = $1`,
    [
      itemId,
      JSON.stringify(serialised),
      readiness,
      JSON.stringify(blockingIssues),
      duplicateOfListingId,
      duplicateScore,
      newFieldRevision,
    ],
  );

  // Persist provenance records.
  await persistProvenance(itemId, candidate);

  logger.info(
    {
      batchId,
      itemId,
      readiness,
      blockingIssueCount: blockingIssues.length,
      isDuplicate: dedupResult?.isDuplicate ?? false,
    },
    'catalogImportNormalisation.item_complete',
  );

  // Check whether all items are normalised and transition the batch.
  const allNormalised = await checkAllItemsNormalised(batchId);
  if (allNormalised) {
    await updateBatchCounts(batchId);

    // Determine if there are operator-level blockers (missing/low-confidence
    // category or condition mappings that require operator review before the
    // seller sees them).
    const operatorBlockerResult = await db.query<PendingCountRow>(
      `SELECT COUNT(*)::text AS pending
       FROM catalog_import_items
       WHERE batch_id = $1
         AND readiness = 'needs_input'
         AND blocking_issues @> '[{"code":"missing_category"},{"code":"low_confidence_category"},{"code":"missing_condition"},{"code":"ambiguous_condition"}]'::jsonb`,
      [batchId],
    );
    const hasOperatorBlockers = Number(operatorBlockerResult.rows[0]?.pending ?? 0) > 0;

    await transitionBatchForReview(batchId, hasOperatorBlockers);

    logger.info(
      { batchId, targetStatus: hasOperatorBlockers ? 'awaiting_operator' : 'awaiting_seller' },
      'catalogImportNormalisation.batch_transitioned_for_review',
    );
  }
}
