/**
 * Catalogue Mapping Layer — Barrel Export
 *
 * Re-exports every mapping module so consumers can import from a single
 * path: `.../mapping/catalog/index.js`.
 */

export {
  CANONICAL_LISTING_SCHEMA_VERSION,
  CANONICAL_FIELDS,
  REQUIRED_FIELDS_FOR_PUBLICATION,
  fromMarketplace,
  fromDeterministicMap,
  fromSeller,
  fromAiSuggestion,
  validateCanonicalCandidate,
  serialiseCanonicalCandidate,
} from './canonicalListingSchema.js';
export type {
  CanonicalFieldName,
  CanonicalValidationResult,
} from './canonicalListingSchema.js';

export {
  CATEGORY_MAPPING_VERSION,
  PROHIBITED_CATEGORIES,
  EBAY_CATEGORY_MAP,
  mapCategory,
} from './categoryMapping.js';
export type { CategoryMappingTable } from './categoryMapping.js';

export {
  CONDITION_MAPPING_VERSION,
  CONDITION_RANK,
  EBAY_CONDITION_MAP,
  assertNoConditionUpgrade,
  mapCondition,
} from './conditionMapping.js';
export type { ConditionMappingEntry } from './conditionMapping.js';

export {
  SIZE_MAPPING_VERSION,
  TOP_SIZE_MAP,
  BOTTOM_SIZE_MAP,
  SHOE_SIZE_MAP,
  DRESS_SIZE_MAP,
  detectSizeSystem,
  mapSize,
} from './sizeMapping.js';
export type {
  SizeSystem,
  SizeSystemMap,
  MappedSize,
} from './sizeMapping.js';

export {
  CURRENCY_POLICY_VERSION,
  SUPPORTED_CURRENCIES,
  isCurrencySupported,
  resolveCurrency,
  formatPriceForDisplay,
} from './currencyPolicy.js';
export type { ResolvedCurrency } from './currencyPolicy.js';

export {
  DEDUP_VERSION,
  computeSourceChecksum,
  normaliseSourceUrl,
  computePerceptualSimilarity,
  detectDuplicates,
} from './deduplication.js';
export type {
  DedupLayer,
  DedupResult,
  DedupItem,
  ExistingListing,
} from './deduplication.js';

export {
  buildProvenanceRecords,
  summariseProvenance,
} from './fieldProvenance.js';
export type {
  ProvenanceRecord,
  ProvenanceSummary,
} from './fieldProvenance.js';
