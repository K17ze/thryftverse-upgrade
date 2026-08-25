/**
 * Catalogue Import — Domain Types
 *
 * The single source of truth for every state enum, value object, and
 * domain error code used by the concierge catalogue importer. Every layer
 * (routes, service, workers, connectors, mappers, frontend contract) imports
 * from this file so the state machines and field shapes cannot drift.
 *
 * Design principles (per AGENTS.md and the concierge blueprint):
 * - State transitions are validated in the domain service, never in route
 *   handlers or workers directly.
 * - Adapters return source facts, not ThryftVerse listing rows.
 * - Provenance is preserved for every material field.
 * - No AI suggestion can become a material fact without seller review.
 * - Unknown outcomes are represented honestly, never collapsed to
 *   "failed" or "live".
 */

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

/**
 * Approved catalogue sources. A source is only connectable when its
 * capability is registered AND its legal gate is satisfied. The capability
 * registry controls which of these the UI may present as available.
 */
export type CatalogSource =
  | 'ebay'
  | 'seller_package'
  | 'depop'
  | 'vinted';

/**
 * How a source authorises ThryftVerse to read the seller's catalogue.
 */
export type SourceAuthorization =
  | 'oauth'
  | 'partner_key'
  | 'seller_upload';

// ---------------------------------------------------------------------------
// Connection state machine
// ---------------------------------------------------------------------------

export type ConnectionState =
  | 'pending_authorisation'
  | 'active'
  | 'reauthorisation_required'
  | 'revoked'
  | 'expired'
  | 'deleted';

export const CONNECTION_STATES: readonly ConnectionState[] = [
  'pending_authorisation',
  'active',
  'reauthorisation_required',
  'revoked',
  'expired',
  'deleted',
] as const;

export const CONNECTION_TRANSITIONS: Record<ConnectionState, readonly ConnectionState[]> = {
  pending_authorisation: ['active', 'reauthorisation_required', 'revoked', 'expired', 'deleted'],
  active: ['reauthorisation_required', 'revoked', 'expired', 'deleted'],
  reauthorisation_required: ['active', 'revoked', 'expired', 'deleted'],
  revoked: ['deleted'],
  expired: ['deleted'],
  deleted: [],
} as const;

// ---------------------------------------------------------------------------
// Batch state machine
// ---------------------------------------------------------------------------

export type BatchState =
  | 'created'
  | 'discovering'
  | 'hydrating'
  | 'ingesting_media'
  | 'normalising'
  | 'awaiting_operator'
  | 'awaiting_seller'
  | 'approved'
  | 'publishing'
  | 'completed'
  // Paused / recoverable
  | 'paused_rate_limit'
  | 'paused_reauth'
  | 'failed_recoverable'
  // Cancellation
  | 'cancelling'
  | 'cancelled';

export const BATCH_STATES: readonly BatchState[] = [
  'created',
  'discovering',
  'hydrating',
  'ingesting_media',
  'normalising',
  'awaiting_operator',
  'awaiting_seller',
  'approved',
  'publishing',
  'completed',
  'paused_rate_limit',
  'paused_reauth',
  'failed_recoverable',
  'cancelling',
  'cancelled',
] as const;

export const BATCH_TRANSITIONS: Record<BatchState, readonly BatchState[]> = {
  created: ['discovering', 'cancelling', 'cancelled'],
  discovering: ['hydrating', 'paused_rate_limit', 'paused_reauth', 'failed_recoverable', 'cancelling', 'cancelled'],
  hydrating: ['ingesting_media', 'paused_rate_limit', 'paused_reauth', 'failed_recoverable', 'cancelling', 'cancelled'],
  ingesting_media: ['normalising', 'paused_rate_limit', 'failed_recoverable', 'cancelling', 'cancelled'],
  normalising: ['awaiting_operator', 'awaiting_seller', 'failed_recoverable', 'cancelling', 'cancelled'],
  awaiting_operator: ['awaiting_seller', 'failed_recoverable', 'cancelling', 'cancelled'],
  awaiting_seller: ['approved', 'failed_recoverable', 'cancelling', 'cancelled'],
  approved: ['publishing', 'cancelled'],
  publishing: ['completed', 'failed_recoverable', 'cancelled'],
  completed: [],
  paused_rate_limit: ['discovering', 'hydrating', 'ingesting_media', 'normalising', 'cancelling', 'cancelled'],
  paused_reauth: ['discovering', 'hydrating', 'ingesting_media', 'normalising', 'cancelling', 'cancelled'],
  failed_recoverable: ['discovering', 'hydrating', 'ingesting_media', 'normalising', 'awaiting_operator', 'awaiting_seller', 'cancelling', 'cancelled'],
  cancelling: ['cancelled'],
  cancelled: [],
} as const;

/** Terminal states where no further transition is possible. */
export const BATCH_TERMINAL_STATES: readonly BatchState[] = [
  'completed',
  'cancelled',
] as const;

// ---------------------------------------------------------------------------
// Item state machine
// ---------------------------------------------------------------------------

export type ItemReadiness =
  | 'discovered'
  | 'hydrated'
  | 'media_pending'
  | 'mapping_pending'
  | 'ready'
  | 'needs_input'
  | 'probable_duplicate'
  | 'excluded'
  | 'source_changed';

export const ITEM_READINESS_STATES: readonly ItemReadiness[] = [
  'discovered',
  'hydrated',
  'media_pending',
  'mapping_pending',
  'ready',
  'needs_input',
  'probable_duplicate',
  'excluded',
  'source_changed',
] as const;

export type ItemPublicationStatus =
  | 'pending'
  | 'approved'
  | 'draft_created'
  | 'publishing'
  | 'live'
  | 'failed_recoverable'
  | 'outcome_unknown'
  | 'reconciled'
  | 'excluded';

export const ITEM_PUBLICATION_STATES: readonly ItemPublicationStatus[] = [
  'pending',
  'approved',
  'draft_created',
  'publishing',
  'live',
  'failed_recoverable',
  'outcome_unknown',
  'reconciled',
  'excluded',
] as const;

export type SellerDecision = 'selected' | 'excluded' | 'undecided';

// ---------------------------------------------------------------------------
// Media fetch state
// ---------------------------------------------------------------------------

export type MediaFetchStatus =
  | 'pending'
  | 'fetching'
  | 'fetched'
  | 'verifying'
  | 'verified'
  | 'failed'
  | 'quarantined';

export const MEDIA_FETCH_STATES: readonly MediaFetchStatus[] = [
  'pending',
  'fetching',
  'fetched',
  'verifying',
  'verified',
  'failed',
  'quarantined',
] as const;

// ---------------------------------------------------------------------------
// Field provenance
// ---------------------------------------------------------------------------

/**
 * Who or what produced a resolved field value. This is the audit answer to
 * "Why does this listing say 'Very good'?"
 */
export type FieldSourceKind =
  | 'marketplace'
  | 'seller'
  | 'operator'
  | 'deterministic_map'
  | 'ai_suggestion';

/**
 * Confidence label for a mapped field. Low confidence blocks publication
 * until the seller reviews.
 */
export type FieldConfidence = 'high' | 'medium' | 'low';

// ---------------------------------------------------------------------------
// Canonical listing candidate (output of the mapping layer)
// ---------------------------------------------------------------------------

/**
 * The canonical field shape that the mapping layer produces and the
 * publication layer consumes. Every field carries provenance so the review
 * workbench can show "Imported vs ThryftVerse" diffs.
 */
export interface CanonicalListingField<T> {
  value: T;
  sourceKind: FieldSourceKind;
  /** Original source value before mapping, for diff display. */
  sourceValue: unknown;
  confidence: FieldConfidence;
  /** Mapping table version that produced this value, if deterministic. */
  mappingVersion?: string;
  /** Reason code explaining why this value was chosen. */
  reasonCode?: string;
}

export interface CanonicalListingCandidate {
  title: CanonicalListingField<string>;
  description: CanonicalListingField<string>;
  priceGbp: CanonicalListingField<number>;
  currency: CanonicalListingField<string>;
  category: CanonicalListingField<string | null>;
  brand: CanonicalListingField<string | null>;
  size: CanonicalListingField<string | null>;
  originalSizeLabel: CanonicalListingField<string | null>;
  condition: CanonicalListingField<string | null>;
  quantity: CanonicalListingField<number>;
  sku: CanonicalListingField<string | null>;
  sourceUrl: CanonicalListingField<string | null>;
  tags: CanonicalListingField<string[]>;
}

// ---------------------------------------------------------------------------
// Blocking issues
// ---------------------------------------------------------------------------

export type BlockingIssueCode =
  | 'missing_title'
  | 'missing_price'
  | 'missing_currency'
  | 'non_gbp_currency_unconfirmed'
  | 'missing_category'
  | 'low_confidence_category'
  | 'missing_condition'
  | 'ambiguous_condition'
  | 'missing_media'
  | 'media_not_publishable'
  | 'probable_duplicate'
  | 'source_sold'
  | 'source_removed'
  | 'prohibited_category'
  | 'missing_shipping'
  | 'attestation_required';

export interface BlockingIssue {
  code: BlockingIssueCode;
  fieldName?: string;
  message: string;
  /** Recovery hint for the seller or operator. */
  recoveryHint: string;
}

// ---------------------------------------------------------------------------
// Domain errors
// ---------------------------------------------------------------------------

export type CatalogImportErrorCode =
  | 'connection_not_found'
  | 'connection_not_active'
  | 'connection_reauthorisation_required'
  | 'batch_not_found'
  | 'item_not_found'
  | 'invalid_state_transition'
  | 'approval_revision_mismatch'
  | 'approval_required_before_publish'
  | 'blocking_issues_unresolved'
  | 'source_unavailable'
  | 'source_not_approved'
  | 'package_rejected'
  | 'package_quota_exceeded'
  | 'media_fetch_failed'
  | 'media_quarantined'
  | 'ssrf_blocked'
  | 'publication_idempotency_conflict'
  | 'outcome_unknown'
  | 'rate_limited'
  | 'permission_denied'
  | 'consent_required'
  | 'attestation_required'
  | 'retention_window_expired'
  | 'validation_failed';

export class CatalogImportError extends Error {
  readonly code: CatalogImportErrorCode;
  readonly statusCode: number;
  readonly details?: Record<string, unknown>;

  constructor(
    code: CatalogImportErrorCode,
    message: string,
    options?: { statusCode?: number; details?: Record<string, unknown> },
  ) {
    super(message);
    this.name = 'CatalogImportError';
    this.code = code;
    this.statusCode = options?.statusCode ?? statusCodeForCode(code);
    this.details = options?.details;
  }
}

export function statusCodeForCode(code: CatalogImportErrorCode): number {
  switch (code) {
    case 'connection_not_found':
    case 'batch_not_found':
    case 'item_not_found':
      return 404;
    case 'connection_not_active':
    case 'connection_reauthorisation_required':
    case 'source_unavailable':
    case 'source_not_approved':
    case 'consent_required':
    case 'attestation_required':
    case 'retention_window_expired':
      return 409;
    case 'invalid_state_transition':
    case 'approval_revision_mismatch':
    case 'approval_required_before_publish':
    case 'blocking_issues_unresolved':
    case 'package_rejected':
    case 'publication_idempotency_conflict':
    case 'validation_failed':
      return 422;
    case 'package_quota_exceeded':
    case 'rate_limited':
      return 429;
    case 'permission_denied':
      return 403;
    case 'media_fetch_failed':
    case 'media_quarantined':
    case 'ssrf_blocked':
    case 'outcome_unknown':
    default:
      return 500;
  }
}

// ---------------------------------------------------------------------------
// Persistence row shapes (typed queries)
// ---------------------------------------------------------------------------

export interface CatalogImportConnectionRow {
  id: string;
  user_id: string;
  source: CatalogSource;
  external_account_id: string;
  external_display_name: string | null;
  encrypted_access_token: string | null;
  encrypted_refresh_token: string | null;
  token_expires_at: Date | null;
  scopes: string[] | null;
  status: ConnectionState;
  consent_version: string;
  consented_at: Date;
  revoked_at: Date | null;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface CatalogImportBatchRow {
  id: string;
  user_id: string;
  connection_id: string | null;
  source: CatalogSource;
  mode: 'one_time';
  status: BatchState;
  status_reason: string | null;
  checkpoint_json: Record<string, unknown> | null;
  source_snapshot_at: Date | null;
  discovered_count: number;
  ready_count: number;
  issue_count: number;
  published_count: number;
  approval_revision: string | null;
  approved_at: Date | null;
  approved_by: string | null;
  raw_delete_after: Date | null;
  created_at: Date;
  updated_at: Date;
  completed_at: Date | null;
}

export interface CatalogImportItemRow {
  id: string;
  batch_id: string;
  user_id: string;
  external_item_id: string;
  source_url: string | null;
  source_state: string | null;
  source_updated_at: Date | null;
  source_checksum: string;
  raw_snapshot_ciphertext: string | null;
  normalised_fields: Record<string, unknown> | null;
  field_revision: string;
  readiness: ItemReadiness;
  blocking_issues: BlockingIssue[] | null;
  duplicate_of_listing_id: string | null;
  duplicate_score: number | null;
  seller_decision: SellerDecision;
  draft_listing_id: string | null;
  publication_status: ItemPublicationStatus;
  publication_idempotency_key: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface CatalogImportMediaRow {
  id: string;
  import_item_id: string;
  position: number;
  external_media_id: string | null;
  source_url_ciphertext: string | null;
  fetch_status: MediaFetchStatus;
  attempt_count: number;
  last_error_code: string | null;
  sha256: string | null;
  perceptual_hash: string | null;
  sniffed_mime_type: string | null;
  byte_size: number | null;
  width: number | null;
  height: number | null;
  media_asset_id: string | null;
  finalization_id: string | null;
  moderation_status: string | null;
  publishability: string | null;
  source_url_delete_after: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface CatalogImportFieldProvenanceRow {
  id: string;
  import_item_id: string;
  field_name: string;
  source_kind: FieldSourceKind;
  source_value_json: unknown;
  resolved_value_json: unknown;
  confidence: FieldConfidence;
  mapping_version: string | null;
  changed_by: string | null;
  changed_at: Date;
  reason_code: string | null;
}

export interface CatalogImportEventRow {
  id: string;
  batch_id: string;
  item_id: string | null;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: Date;
}

// ---------------------------------------------------------------------------
// API-facing DTOs (serialised for REST responses)
// ---------------------------------------------------------------------------

export interface SourceCapabilityDTO {
  source: CatalogSource;
  authorization: SourceAuthorization;
  available: boolean;
  /** Human-readable reason when not available (e.g. "Pilot — request access"). */
  unavailableReason: string | null;
  legalApprovalVersion: string;
  canReadInventory: boolean;
  canReadMedia: boolean;
  canReadVariations: boolean;
  supportsRevocation: boolean;
}

export interface ConnectionDTO {
  id: string;
  source: CatalogSource;
  externalAccountId: string;
  externalDisplayName: string | null;
  status: ConnectionState;
  consentVersion: string;
  consentedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface BatchSummaryDTO {
  id: string;
  source: CatalogSource;
  mode: string;
  status: BatchState;
  statusReason: string | null;
  discoveredCount: number;
  readyCount: number;
  issueCount: number;
  publishedCount: number;
  sourceSnapshotAt: string | null;
  approvalRevision: string | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface ImportItemDTO {
  id: string;
  batchId: string;
  externalItemId: string;
  sourceUrl: string | null;
  sourceState: string | null;
  sourceUpdatedAt: string | null;
  readiness: ItemReadiness;
  publicationStatus: ItemPublicationStatus;
  sellerDecision: SellerDecision;
  fieldRevision: string;
  draftListingId: string | null;
  duplicateOfListingId: string | null;
  duplicateScore: number | null;
  blockingIssues: BlockingIssue[] | null;
  normalisedFields: Record<string, unknown> | null;
  media: ImportMediaDTO[];
  createdAt: string;
  updatedAt: string;
}

export interface ImportMediaDTO {
  id: string;
  position: number;
  fetchStatus: MediaFetchStatus;
  sha256: string | null;
  sniffedMimeType: string | null;
  byteSize: number | null;
  width: number | null;
  height: number | null;
  mediaAssetId: string | null;
  finalizationId: string | null;
  moderationStatus: string | null;
  publishability: string | null;
  /** Resolved public URL for preview when media is verified. */
  previewUrl: string | null;
}

export interface PublicationReceiptDTO {
  batchId: string;
  liveCount: number;
  draftCount: number;
  excludedCount: number;
  failedCount: number;
  outcomeUnknownCount: number;
  items: PublicationReceiptItemDTO[];
  publishedAt: string;
}

export interface PublicationReceiptItemDTO {
  itemId: string;
  externalItemId: string;
  publicationStatus: ItemPublicationStatus;
  draftListingId: string | null;
  reason: string | null;
}
