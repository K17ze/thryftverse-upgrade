/**
 * Catalog Import API — ThryftVerse Concierge Catalogue Importer.
 *
 * Wraps every backend endpoint under `/catalog-imports/*` using the shared
 * `fetchJson` client from `lib/apiClient`. The client handles base URL
 * resolution, auth token injection/refresh, request deduplication, timeout,
 * retry, and structured error parsing — so this module only defines the
 * typed request/response shapes and the per-endpoint options that the
 * client does not infer on its own (e.g. the `If-Match` header on item
 * patches).
 */

import { fetchJson, ApiRequestError, parseApiError } from '../lib/apiClient';

// ─────────────────────────────────────────────────────────────────────────────
// DTO types — mirror the backend serialisers exactly
// ─────────────────────────────────────────────────────────────────────────────

export type CatalogSource = 'ebay' | 'seller_package' | 'depop' | 'vinted';

export type ConnectionState =
  | 'pending_authorisation'
  | 'active'
  | 'reauthorisation_required'
  | 'revoked'
  | 'expired'
  | 'deleted';

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
  | 'paused_rate_limit'
  | 'paused_reauth'
  | 'failed_recoverable'
  | 'cancelling'
  | 'cancelled';

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

export type SellerDecision = 'selected' | 'excluded' | 'undecided';

export type MediaFetchStatus =
  | 'pending'
  | 'fetching'
  | 'fetched'
  | 'verifying'
  | 'verified'
  | 'failed'
  | 'quarantined';

export interface SourceCapabilityDTO {
  source: CatalogSource;
  authorization: string;
  available: boolean;
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
  previewUrl: string | null;
}

export interface BlockingIssue {
  code: string;
  fieldName?: string;
  message: string;
  recoveryHint: string;
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

export interface PublicationReceiptItemDTO {
  itemId: string;
  externalItemId: string;
  publicationStatus: ItemPublicationStatus;
  draftListingId: string | null;
  reason: string | null;
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

// ─────────────────────────────────────────────────────────────────────────────
// Response envelopes
// ─────────────────────────────────────────────────────────────────────────────

interface SourcesResponse {
  sources: SourceCapabilityDTO[];
}

interface AuthorizeResponse {
  redirectUrl: string;
  state: string;
}

interface CallbackResponse {
  connectionId: string;
  status: string;
}

interface ConnectionsResponse {
  connections: ConnectionDTO[];
}

interface OkResponse {
  ok: true;
}

interface PresignResponse {
  packageId: string;
  uploadUrl: string;
  objectKey: string;
}

interface FinalizeResponse {
  packageId: string;
  status: 'finalized';
}

interface CreateBatchResponse {
  batch: BatchSummaryDTO;
}

interface ListBatchesResponse {
  batches: BatchSummaryDTO[];
}

interface GetBatchResponse {
  batch: BatchSummaryDTO;
  phase: string;
}

export interface ItemListSummary {
  ready: number;
  needsInput: number;
  probableDuplicate: number;
  excluded: number;
  total: number;
}

interface ListItemsResponse {
  items: ImportItemDTO[];
  nextCursor: string | null;
  summary: ItemListSummary;
}

interface SingleItemResponse {
  item: ImportItemDTO;
}

interface BulkCorrectionsResponse {
  updated: number;
}

interface ApproveResponse {
  batch: BatchSummaryDTO;
  approvalRevision: string;
}

interface PublishResponse {
  receipt: PublicationReceiptDTO;
}

interface PublicationReceiptResponse {
  receipt: PublicationReceiptDTO;
}

// ─────────────────────────────────────────────────────────────────────────────
// Typed error
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Raised when a catalog-import endpoint returns a non-2xx response. Wraps the
 * shared `ApiRequestError` with a friendly, field-level message so hook/UI
 * layers can render it directly without re-parsing the payload.
 */
export class CatalogImportError extends Error {
  readonly status: number | undefined;
  readonly code: string | null;
  readonly isNetworkError: boolean;

  constructor(cause: unknown, fallback = 'Catalog import request failed') {
    const parsed = parseApiError(cause, fallback);
    super(parsed.message);
    this.name = 'CatalogImportError';
    this.status = parsed.status;
    this.code = parsed.code;
    this.isNetworkError = parsed.isNetworkError;
  }
}

function toError(cause: unknown): CatalogImportError {
  if (cause instanceof CatalogImportError) return cause;
  return new CatalogImportError(cause);
}

// ─────────────────────────────────────────────────────────────────────────────
// Sources & connections
// ─────────────────────────────────────────────────────────────────────────────

export async function fetchImportSources(): Promise<SourceCapabilityDTO[]> {
  try {
    const payload = await fetchJson<SourcesResponse>('/catalog-imports/sources');
    return Array.isArray(payload.sources) ? payload.sources : [];
  } catch (cause) {
    throw toError(cause);
  }
}

export async function authorizeConnection(
  source: CatalogSource,
  redirectUri: string
): Promise<{ redirectUrl: string; state: string }> {
  try {
    return await fetchJson<AuthorizeResponse>(
      `/catalog-imports/connections/${encodeURIComponent(source)}/authorize`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ redirectUri }),
      }
    );
  } catch (cause) {
    throw toError(cause);
  }
}

export async function completeConnectionCallback(
  source: CatalogSource,
  code: string,
  state: string
): Promise<{ connectionId: string; status: string }> {
  try {
    const params = new URLSearchParams();
    params.set('code', code);
    params.set('state', state);
    return await fetchJson<CallbackResponse>(
      `/catalog-imports/connections/${encodeURIComponent(source)}/callback?${params.toString()}`
    );
  } catch (cause) {
    throw toError(cause);
  }
}

export async function fetchConnections(): Promise<ConnectionDTO[]> {
  try {
    const payload = await fetchJson<ConnectionsResponse>('/catalog-imports/connections');
    return Array.isArray(payload.connections) ? payload.connections : [];
  } catch (cause) {
    throw toError(cause);
  }
}

export async function deleteConnection(connectionId: string): Promise<void> {
  try {
    await fetchJson<OkResponse>(
      `/catalog-imports/connections/${encodeURIComponent(connectionId)}`,
      { method: 'DELETE' }
    );
  } catch (cause) {
    throw toError(cause);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Seller packages (file upload presign + finalize)
// ─────────────────────────────────────────────────────────────────────────────

export interface PresignPackageResult {
  packageId: string;
  uploadUrl: string;
  objectKey: string;
}

export async function presignSellerPackage(params: {
  fileName: string;
  contentType: string;
  sizeBytes: number;
}): Promise<PresignPackageResult> {
  try {
    return await fetchJson<PresignResponse>('/catalog-imports/packages/presign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName: params.fileName,
        contentType: params.contentType,
        sizeBytes: params.sizeBytes,
      }),
    });
  } catch (cause) {
    throw toError(cause);
  }
}

export async function finalizeSellerPackage(
  packageId: string,
  params: {
    objectKey: string;
    fileName: string;
    contentType: string;
    sizeBytes: number;
  }
): Promise<{ packageId: string; status: 'finalized' }> {
  try {
    return await fetchJson<FinalizeResponse>(
      `/catalog-imports/packages/${encodeURIComponent(packageId)}/finalize`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          objectKey: params.objectKey,
          fileName: params.fileName,
          contentType: params.contentType,
          sizeBytes: params.sizeBytes,
        }),
      }
    );
  } catch (cause) {
    throw toError(cause);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Batches
// ─────────────────────────────────────────────────────────────────────────────

export async function createImportBatch(params: {
  source: CatalogSource;
  connectionId?: string;
  packageId?: string;
  consentVersion: string;
}): Promise<BatchSummaryDTO> {
  try {
    const payload = await fetchJson<CreateBatchResponse>('/catalog-imports/batches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: params.source,
        connectionId: params.connectionId,
        packageId: params.packageId,
        consentVersion: params.consentVersion,
      }),
    });
    return payload.batch;
  } catch (cause) {
    throw toError(cause);
  }
}

export async function fetchImportBatches(): Promise<BatchSummaryDTO[]> {
  try {
    const payload = await fetchJson<ListBatchesResponse>('/catalog-imports/batches');
    return Array.isArray(payload.batches) ? payload.batches : [];
  } catch (cause) {
    throw toError(cause);
  }
}

export async function fetchImportBatch(
  batchId: string
): Promise<{ batch: BatchSummaryDTO; phase: string }> {
  try {
    return await fetchJson<GetBatchResponse>(
      `/catalog-imports/batches/${encodeURIComponent(batchId)}`
    );
  } catch (cause) {
    throw toError(cause);
  }
}

export async function startImportBatch(batchId: string): Promise<void> {
  try {
    await fetchJson<OkResponse>(
      `/catalog-imports/batches/${encodeURIComponent(batchId)}/start`,
      { method: 'POST' }
    );
  } catch (cause) {
    throw toError(cause);
  }
}

export async function cancelImportBatch(batchId: string): Promise<void> {
  try {
    await fetchJson<OkResponse>(
      `/catalog-imports/batches/${encodeURIComponent(batchId)}/cancel`,
      { method: 'POST' }
    );
  } catch (cause) {
    throw toError(cause);
  }
}

export async function retryImportBatch(batchId: string): Promise<void> {
  try {
    await fetchJson<OkResponse>(
      `/catalog-imports/batches/${encodeURIComponent(batchId)}/retry`,
      { method: 'POST' }
    );
  } catch (cause) {
    throw toError(cause);
  }
}

export async function deleteBatchRawData(batchId: string): Promise<void> {
  try {
    await fetchJson<OkResponse>(
      `/catalog-imports/batches/${encodeURIComponent(batchId)}/raw-data`,
      { method: 'DELETE' }
    );
  } catch (cause) {
    throw toError(cause);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Items
// ─────────────────────────────────────────────────────────────────────────────

export interface FetchItemsResult {
  items: ImportItemDTO[];
  nextCursor: string | null;
  summary: ItemListSummary;
}

export async function fetchImportItems(
  batchId: string,
  params?: {
    cursor?: string;
    readiness?: ItemReadiness;
    decision?: SellerDecision;
    limit?: number;
  }
): Promise<FetchItemsResult> {
  try {
    const query = new URLSearchParams();
    if (params?.cursor) query.set('cursor', params.cursor);
    if (params?.readiness) query.set('readiness', params.readiness);
    if (params?.decision) query.set('decision', params.decision);
    if (params?.limit !== undefined) query.set('limit', String(params.limit));
    const qs = query.toString();
    const payload = await fetchJson<ListItemsResponse>(
      `/catalog-imports/batches/${encodeURIComponent(batchId)}/items${qs ? `?${qs}` : ''}`
    );
    return {
      items: Array.isArray(payload.items) ? payload.items : [],
      nextCursor: payload.nextCursor ?? null,
      summary: payload.summary,
    };
  } catch (cause) {
    throw toError(cause);
  }
}

export async function fetchImportItem(itemId: string): Promise<ImportItemDTO> {
  try {
    const payload = await fetchJson<SingleItemResponse>(
      `/catalog-imports/items/${encodeURIComponent(itemId)}`
    );
    return payload.item;
  } catch (cause) {
    throw toError(cause);
  }
}

export async function patchImportItem(
  itemId: string,
  fieldRevision: string,
  patch: {
    fields: Record<string, unknown>;
    sellerDecision?: 'selected' | 'excluded';
  }
): Promise<ImportItemDTO> {
  try {
    const payload = await fetchJson<SingleItemResponse>(
      `/catalog-imports/items/${encodeURIComponent(itemId)}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'If-Match': fieldRevision,
        },
        body: JSON.stringify({
          fields: patch.fields,
          sellerDecision: patch.sellerDecision,
        }),
      }
    );
    return payload.item;
  } catch (cause) {
    throw toError(cause);
  }
}

export async function applyBulkCorrections(
  batchId: string,
  params: { itemIds: string[]; fields: Record<string, unknown> }
): Promise<number> {
  try {
    const payload = await fetchJson<BulkCorrectionsResponse>(
      `/catalog-imports/batches/${encodeURIComponent(batchId)}/bulk-corrections`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemIds: params.itemIds,
          fields: params.fields,
        }),
      }
    );
    return payload.updated;
  } catch (cause) {
    throw toError(cause);
  }
}

export async function approveImportBatch(
  batchId: string,
  params: {
    itemIds: string[];
    attestation: {
      ownsRights: boolean;
      accurateFacts: boolean;
      noBuyerData: boolean;
    };
  }
): Promise<{ batch: BatchSummaryDTO; approvalRevision: string }> {
  try {
    return await fetchJson<ApproveResponse>(
      `/catalog-imports/batches/${encodeURIComponent(batchId)}/approve`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemIds: params.itemIds,
          attestation: params.attestation,
        }),
      }
    );
  } catch (cause) {
    throw toError(cause);
  }
}

export async function publishImportBatch(
  batchId: string
): Promise<PublicationReceiptDTO> {
  try {
    const payload = await fetchJson<PublishResponse>(
      `/catalog-imports/batches/${encodeURIComponent(batchId)}/publish`,
      { method: 'POST' }
    );
    return payload.receipt;
  } catch (cause) {
    throw toError(cause);
  }
}

export async function fetchPublicationReceipt(
  batchId: string
): Promise<PublicationReceiptDTO> {
  try {
    const payload = await fetchJson<PublicationReceiptResponse>(
      `/catalog-imports/batches/${encodeURIComponent(batchId)}/publication-receipt`
    );
    return payload.receipt;
  } catch (cause) {
    throw toError(cause);
  }
}

// Re-export the shared error types so callers can import everything from one
// module without reaching into `lib/apiClient` directly.
export { ApiRequestError };
