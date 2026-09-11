import crypto from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { appendDomainEvent } from '../lib/domainOutbox.js';
import { validateCompositionDocument } from '../lib/compositionValidation.js';
import { isCompositionNonTrivial, renderComposition } from '../lib/media/compositionRenderer.js';
import { putBinaryObject } from '../lib/s3.js';
import { logger } from '../lib/logger.js';

/**
 * Creator publication orchestration service.
 *
 * This is the P0 fix for the publishing-lifecycle architectural disconnect
 * (research report 23). The publication transaction was previously embedded
 * inside the Fastify route handler, so the scheduled publication worker
 * could not call it without an HTTP inject — and the inject path was broken
 * (it omitted the publish command body).
 *
 * `publishCreatorDocumentTransaction` is the canonical, HTTP-independent
 * publication orchestrator. Both the POST `/creator/documents/:id/publications`
 * route and the scheduled publication worker call this same function.
 *
 * Inside one database transaction it:
 *
 *   1. locks the document row (serializes concurrent publishes);
 *   2. verifies actor ownership and revision;
 *   3. validates the composition envelope;
 *   4. verifies every media layer's upload finalization receipt (owner,
 *      status, MIME, URL, asset, scope — the poster-stories standard);
 *   5. creates the typed public projection (Look or Poster Story);
 *   6. writes a `creator_publications` row binding revision → projection;
 *   7. updates the document lifecycle state to `published`;
 *   8. appends a `content.published` domain outbox event;
 *   9. commits before responding.
 *
 * Same idempotency key + same payload hash → replays the original result.
 * Same key + different hash → 409 conflict (fails closed).
 */

// ── Schemas ────────────────────────────────────────────────────────────

export const publishCommandSchema = z.object({
  revision: z.number().int().min(0),
  destination: z.enum(['look', 'poster', 'moodboard']),
  audience: z.enum(['public', 'private', 'closeFriends']).default('public'),
  expiresInHours: z.number().int().min(1).max(168).default(24),
  // Media evidence: each media layer's finalization receipt + asset.
  expectedMedia: z.array(z.object({
    layerId: z.string().min(1).max(120),
    finalizationId: z.string().min(2).max(160),
    assetId: z.string().min(2).max(160).optional(),
    mediaType: z.enum(['image', 'video']).default('image'),
    suppliedUrl: z.string().min(3).max(2048),
    role: z.string().min(1).max(60).default('primary'),
  })).default([]),
  // The composition document to persist with the projection (WYSIWYG).
  compositionDocument: z.unknown().optional(),
  // Rights snapshot (P1 — optional until rights domain is live).
  rightsSnapshotId: z.string().min(2).max(160).optional(),
  // Optimistic concurrency: the client sends the lock_version and
  // document_hash it observed at save time. The server rejects (409)
  // if the document has changed since, preventing stale publishes.
  expectedLockVersion: z.number().int().min(0).optional(),
  expectedDocumentHash: z.string().optional(),
});

export type PublishCommand = z.infer<typeof publishCommandSchema>;

// ── Public types ───────────────────────────────────────────────────────

export interface PublishDocumentParams {
  db: Pool;
  documentId: string;
  actorUserId: string;
  command: PublishCommand;
  idempotencyKey: string;
  /** true when called from the scheduled publication worker */
  isServiceContext?: boolean;
}

export interface PublishDocumentResult {
  ok: boolean;
  /** HTTP status code the route adapter should set. */
  status: number;
  documentId?: string;
  publicationId?: string;
  targetId?: string;
  destination?: string;
  revisionNumber?: number;
  state?: string;
  idempotentReplay?: boolean;
  error?: string;
  code?: string;
  /** Policy block — the schedule worker marks the row as failed. */
  blocked?: boolean;
  mediaErrors?: MediaCoverageError[];
  layerId?: string;
  field?: string;
  /** Current server metadata for stale-document conflicts (409). Lets the
   * client offer reload / compare / duplicate-draft recovery. */
  serverLockVersion?: number;
  serverDocumentHash?: string;
  serverUpdatedAt?: string;
  serverHeadRevision?: number;
}

// ── Helpers ────────────────────────────────────────────────────────────

const LOCAL_URI_PREFIXES = ['file://', 'ph://', 'asset://', 'data:', 'content://', 'assets-library://'];

function isLocalUri(uri: string): boolean {
  return LOCAL_URI_PREFIXES.some((prefix) => uri.startsWith(prefix));
}

interface VerifiedMedia {
  layerId: string;
  finalizationId: string;
  mediaAssetId: string | null;
  resolvedUrl: string;
  contentType: string;
  role: string;
}

/**
 * Verify a single media finalization receipt against the actor and publication
 * scope. Mirrors the poster-stories standard (index.ts:46091).
 */
async function verifyMediaReceipt(
  client: PoolClient,
  finalizationId: string,
  actorUserId: string,
  publicationId: string,
  expectedMediaType: 'image' | 'video',
  suppliedUrl: string,
  layerId: string,
  field: string,
  suppliedAssetId?: string,
): Promise<VerifiedMedia> {
  const result = await client.query<{
    id: string;
    owner_id: string;
    public_url: string;
    content_type: string;
    status: string;
    scope_ref_id: string | null;
    media_asset_id: string | null;
    media_asset_status: string | null;
    media_asset_processing_status: string | null;
    media_asset_moderation_status: string | null;
    canonical_url: string | null;
  }>(
    `SELECT finalization.id, finalization.owner_id,
            finalization.public_url, finalization.content_type,
            finalization.status, finalization.scope_ref_id,
            finalization.media_asset_id,
            asset.status AS media_asset_status,
            asset.processing_status AS media_asset_processing_status,
            asset.moderation_status AS media_asset_moderation_status,
            asset.canonical_url
     FROM upload_finalizations finalization
     LEFT JOIN media_assets asset
       ON asset.id = finalization.media_asset_id
     WHERE finalization.id = $1
     LIMIT 1
     FOR UPDATE OF finalization`,
    [finalizationId],
  );

  const receipt = result.rows[0];
  const expectedPrefix = expectedMediaType === 'video' ? 'video/' : 'image/';
  const suppliedUrlMatches = receipt
    && (receipt.public_url === suppliedUrl || receipt.canonical_url === suppliedUrl);
  const suppliedAssetMatches = !suppliedAssetId
    || receipt?.media_asset_id === suppliedAssetId;
  const scopeMatches = !receipt?.scope_ref_id || receipt.scope_ref_id === publicationId;

  if (
    !receipt
    || receipt.owner_id !== actorUserId
    || receipt.status !== 'finalized'
    || !receipt.content_type.startsWith(expectedPrefix)
    || !suppliedUrlMatches
    || !suppliedAssetMatches
    || !scopeMatches
  ) {
    throw new MediaVerificationError(
      `Media receipt ${finalizationId} does not match the verified upload`,
      'MEDIA_RECEIPT_MISMATCH',
      layerId,
      field,
    );
  }

  // P0.7: Require a publishable media asset state at publication time.
  // The finalization receipt alone is insufficient — the underlying
  // media_assets row must exist and be in a publishable state. This
  // prevents publishing with unprocessed, quarantined, or failed media.
  if (!receipt.media_asset_id || !receipt.media_asset_status) {
    throw new MediaVerificationError(
      `Layer ${layerId} (${field}): no media asset row exists for finalization ${finalizationId} — upload processing may not have completed`,
      'MEDIA_RECEIPT_MISSING',
      layerId,
      field,
    );
  }

  // Check processing_status — 'failed' is a distinct blocker from
  // still-processing. The 'publishable' lifecycle status on the asset
  // also indicates readiness even if processing_status is not literally
  // 'completed' (e.g. assets that skip transcoding).
  if (receipt.media_asset_processing_status === 'failed') {
    throw new MediaVerificationError(
      `Layer ${layerId} (${field}): media processing failed for asset ${receipt.media_asset_id}`,
      'MEDIA_PROCESSING_FAILED',
      layerId,
      field,
    );
  }

  // Check moderation_status — 'rejected' or 'review' (flagged for
  // human review) means the asset is quarantined and must not be
  // published. 'flagged' is included for forward-compatibility.
  const moderationStatus = receipt.media_asset_moderation_status;
  if (
    moderationStatus === 'rejected'
    || moderationStatus === 'review'
    || moderationStatus === 'flagged'
  ) {
    throw new MediaVerificationError(
      `Layer ${layerId} (${field}): media asset ${receipt.media_asset_id} is quarantined (moderation_status: ${moderationStatus})`,
      'MEDIA_QUARANTINED',
      layerId,
      field,
    );
  }

  // Asset must be in a publishable lifecycle state or have completed
  // processing. 'publishable' and 'published' are both acceptable;
  // 'completed' processing_status is also acceptable regardless of
  // lifecycle status (the asset may not have been transitioned to
  // 'publishable' yet but processing is done).
  const isPublishableLifecycle =
    receipt.media_asset_status === 'publishable'
    || receipt.media_asset_status === 'published';
  const isProcessingComplete = receipt.media_asset_processing_status === 'completed';
  if (!isPublishableLifecycle && !isProcessingComplete) {
    throw new MediaVerificationError(
      `Layer ${layerId} (${field}): media asset ${receipt.media_asset_id} is not publishable (status: ${receipt.media_asset_status}, processing_status: ${receipt.media_asset_processing_status})`,
      'MEDIA_PROCESSING',
      layerId,
      field,
    );
  }

  return {
    layerId,
    finalizationId: receipt.id,
    mediaAssetId: receipt.media_asset_id,
    resolvedUrl: receipt.canonical_url ?? receipt.public_url,
    contentType: receipt.content_type,
    role: 'primary',
  };
}

class MediaVerificationError extends Error {
  code: string;
  layerId?: string;
  field?: string;
  constructor(message: string, code: string, layerId?: string, field?: string) {
    super(message);
    this.code = code;
    this.layerId = layerId;
    this.field = field;
  }
}

// ── Stale-document detection (optimistic concurrency on publish) ───────

/**
 * Error codes for stale-document conflicts during publication.
 * The route adapter maps these to HTTP 409; the frontend shows the
 * conflict UI (reload / duplicate) instead of a generic error.
 */
export type StaleDocumentConflictCode = 'DOCUMENT_VERSION_CONFLICT' | 'DOCUMENT_HASH_CONFLICT';

/**
 * Raised by `checkStaleDocument` when the client's optimistic-concurrency
 * expectations (lock_version / document_hash) do not match the locked
 * server row. The publication transaction catches this and returns a
 * 409 result so the client can surface the reload-or-duplicate choice.
 */
class StaleDocumentError extends Error {
  code: StaleDocumentConflictCode;
  constructor(message: string, code: StaleDocumentConflictCode) {
    super(message);
    this.code = code;
    this.name = 'StaleDocumentError';
  }
}

/**
 * The subset of the locked document row needed for the stale check.
 * `document_hash` is the server-computed hash stored on the row (may
 * be null for rows saved before the column was populated); `document_json`
 * is the canonical stored JSON used to compute the hash when the column
 * is null.
 */
interface DocumentRowForStaleCheck {
  lock_version: number;
  document_hash: string | null;
  document_json: string;
}

/**
 * Verify that the client's optimistic-concurrency expectations match the
 * locked server row. Must be called INSIDE the transaction, after the
 * `FOR UPDATE` row lock — the lock guarantees the row cannot change
 * between this check and the projection write.
 *
 * - `expectedLockVersion`: the `lock_version` the client observed at save
 *   time. If provided and it doesn't match, throws `DOCUMENT_VERSION_CONFLICT`.
 * - `expectedDocumentHash`: the canonical SHA-256 hash the client computed
 *   at save time. If provided, the server computes the hash from the
 *   stored `document_json` (or uses the `document_hash` column when
 *   populated) and compares. Mismatch throws `DOCUMENT_HASH_CONFLICT`.
 *
 * Both checks are optional — omitting a field skips that check, preserving
 * backward compatibility for clients that don't send them.
 */
function checkStaleDocument(
  documentRow: DocumentRowForStaleCheck,
  expectedLockVersion?: number,
  expectedDocumentHash?: string,
): void {
  if (
    expectedLockVersion !== undefined
    && expectedLockVersion !== documentRow.lock_version
  ) {
    throw new StaleDocumentError(
      `Document version mismatch: expected lock_version ${expectedLockVersion}, but the server has ${documentRow.lock_version}. The document was edited on another device.`,
      'DOCUMENT_VERSION_CONFLICT',
    );
  }

  if (expectedDocumentHash !== undefined) {
    // Use the server-computed hash from the documents table when present;
    // otherwise compute from the canonical stored document_json. This is
    // the server's authoritative hash, not a client re-computation.
    const serverHash = documentRow.document_hash
      ?? crypto.createHash('sha256').update(documentRow.document_json).digest('hex');
    if (expectedDocumentHash !== serverHash) {
      throw new StaleDocumentError(
        'Document content hash mismatch — the document was modified since the client last saved. Reload the latest version or duplicate your changes.',
        'DOCUMENT_HASH_CONFLICT',
      );
    }
  }
}

// ── P0.6: Server-walk media references for exact receipt coverage ──────

/**
 * A media-bearing field discovered while walking a composition document.
 * Each reference maps a (layerId, field) pair to a URI and its associated
 * finalization/asset evidence from the document payload.
 */
interface MediaReference {
  layerId: string;
  /** The document field that carries the URI (e.g. 'mediaUri', 'thumbnailUri'). */
  field: string;
  /** The expectedMedia role that corresponds to this field (e.g. 'primary', 'thumbnail'). */
  role: string;
  /** The URI value stored in the document, or undefined if the field is absent. */
  uri: string | undefined;
  /** The finalization ID from the document payload, if present. */
  finalizationId: string | undefined;
  /** The media asset ID from the document payload, if present. */
  mediaAssetId: string | undefined;
}

/**
 * Walk a composition document (stored document_json or the command's
 * compositionDocument) and extract every media-bearing path.
 *
 * Media-bearing fields by layer type:
 *  - media:   mediaUri (→ mediaFinalizationId / mediaAssetId)
 *             thumbnailUri (→ thumbnailFinalizationId / thumbnailMediaAssetId)
 *  - product: snapshotImageUrl (→ snapshotMediaFinalizationId / snapshotMediaAssetId)
 *  - look:    snapshotImageUrl (→ snapshotMediaFinalizationId / snapshotMediaAssetId)
 *
 * Non-media layers (text, mention, vote, quiz, etc.) produce no references.
 */
function extractMediaReferences(doc: unknown): MediaReference[] {
  if (!doc || typeof doc !== 'object') return [];
  const root = doc as { pages?: Array<{ layers?: Array<Record<string, unknown>> }> };
  const pages = root.pages;
  if (!Array.isArray(pages)) return [];

  const refs: MediaReference[] = [];

  for (const page of pages) {
    const layers = page.layers;
    if (!Array.isArray(layers)) continue;

    for (const layer of layers) {
      const layerId = layer['id'];
      const layerType = layer['type'];
      if (typeof layerId !== 'string' || typeof layerType !== 'string') continue;

      const payload = layer['payload'];
      if (!payload || typeof payload !== 'object') continue;
      const p = payload as Record<string, unknown>;

      if (layerType === 'media') {
        // Primary media
        if (typeof p['mediaUri'] === 'string' || p['mediaFinalizationId'] !== undefined || p['mediaAssetId'] !== undefined) {
          refs.push({
            layerId,
            field: 'mediaUri',
            role: 'primary',
            uri: typeof p['mediaUri'] === 'string' ? p['mediaUri'] : undefined,
            finalizationId: typeof p['mediaFinalizationId'] === 'string' ? p['mediaFinalizationId'] : undefined,
            mediaAssetId: typeof p['mediaAssetId'] === 'string' ? p['mediaAssetId'] : undefined,
          });
        }
        // Thumbnail (video poster image)
        if (typeof p['thumbnailUri'] === 'string' || p['thumbnailFinalizationId'] !== undefined || p['thumbnailMediaAssetId'] !== undefined) {
          refs.push({
            layerId,
            field: 'thumbnailUri',
            role: 'thumbnail',
            uri: typeof p['thumbnailUri'] === 'string' ? p['thumbnailUri'] : undefined,
            finalizationId: typeof p['thumbnailFinalizationId'] === 'string' ? p['thumbnailFinalizationId'] : undefined,
            mediaAssetId: typeof p['thumbnailMediaAssetId'] === 'string' ? p['thumbnailMediaAssetId'] : undefined,
          });
        }
      } else if (layerType === 'product' || layerType === 'look') {
        // Product / Look snapshot image. The role must match the frontend
        // walker (mediaReferenceWalker.ts) exactly — coverage is keyed on
        // (layerId, role), so a mismatch here causes MEDIA_COVERAGE_MISMATCH.
        if (typeof p['snapshotImageUrl'] === 'string' || p['snapshotMediaFinalizationId'] !== undefined || p['snapshotMediaAssetId'] !== undefined) {
          refs.push({
            layerId,
            field: 'snapshotImageUrl',
            role: layerType === 'product' ? 'product-snapshot' : 'look-snapshot',
            uri: typeof p['snapshotImageUrl'] === 'string' ? p['snapshotImageUrl'] : undefined,
            finalizationId: typeof p['snapshotMediaFinalizationId'] === 'string' ? p['snapshotMediaFinalizationId'] : undefined,
            mediaAssetId: typeof p['snapshotMediaAssetId'] === 'string' ? p['snapshotMediaAssetId'] : undefined,
          });
        }
      }
    }
  }

  return refs;
}

export interface MediaCoverageError {
  layerId: string;
  field: string;
  code: string;
  message: string;
}

interface MediaCoverageResult {
  ok: boolean;
  errors: MediaCoverageError[];
}

/**
 * Validate that the expectedMedia list exactly covers every media-bearing
 * path in the stored document. This is the P0.6 server-walk: instead of
 * trusting the client-supplied expectedMedia list, the server independently
 * walks the document and proves bidirectional exact coverage.
 *
 * Rejects when:
 *  1. A media path in the document has no matching expectedMedia entry
 *     (missing receipt).
 *  2. expectedMedia contains an entry not found in the document (unused
 *     receipt — the client is claiming media that doesn't exist).
 *  3. A media path has a raw URL but no finalizationId in the document
 *     payload (the document itself lacks the receipt binding).
 */
function validateMediaCoverage(
  docReferences: MediaReference[],
  expectedMedia: Array<{
    layerId: string;
    finalizationId: string;
    role: string;
    suppliedUrl: string;
  }>,
): MediaCoverageResult {
  const errors: MediaCoverageError[] = [];

  // Index expectedMedia by (layerId, role) for O(1) lookup.
  const expectedByKey = new Map<string, typeof expectedMedia[number]>();
  for (const expected of expectedMedia) {
    const key = `${expected.layerId}::${expected.role}`;
    if (expectedByKey.has(key)) {
      errors.push({
        layerId: expected.layerId,
        field: expected.role,
        code: 'MEDIA_RECEIPT_DUPLICATE',
        message: `Duplicate expectedMedia entry for layer ${expected.layerId} role ${expected.role}`,
      });
    }
    expectedByKey.set(key, expected);
  }

  // Index doc references by (layerId, role) for reverse lookup.
  const docByKey = new Map<string, MediaReference>();
  for (const ref of docReferences) {
    const key = `${ref.layerId}::${ref.role}`;
    docByKey.set(key, ref);
  }

  // Check 1 & 3: every media path in the document must have a receipt.
  for (const ref of docReferences) {
    // Check 3: raw URL but no finalizationId in the document payload.
    if (ref.uri && !ref.finalizationId && !ref.mediaAssetId) {
      errors.push({
        layerId: ref.layerId,
        field: ref.field,
        code: 'MEDIA_RECEIPT_MISSING',
        message: `Layer ${ref.layerId} (${ref.field}) has a URL but no finalizationId in the document payload`,
      });
      continue;
    }

    // Check 1: media path exists in the document but no expectedMedia entry.
    const key = `${ref.layerId}::${ref.role}`;
    if (!expectedByKey.has(key)) {
      errors.push({
        layerId: ref.layerId,
        field: ref.field,
        code: 'MEDIA_RECEIPT_MISSING',
        message: `Layer ${ref.layerId} (${ref.field}) has no matching expectedMedia entry — receipt is missing`,
      });
    }
  }

  // Check 2: expectedMedia entries not found in the document (unused receipts).
  for (const expected of expectedMedia) {
    const key = `${expected.layerId}::${expected.role}`;
    if (!docByKey.has(key)) {
      errors.push({
        layerId: expected.layerId,
        field: expected.role,
        code: 'MEDIA_RECEIPT_UNUSED',
        message: `expectedMedia entry for layer ${expected.layerId} role ${expected.role} does not match any media path in the document`,
      });
    }
  }

  return { ok: errors.length === 0, errors };
}

// ── Server-side composition rendering (P0-8) ──────────────────────────

/**
 * Result of burning a composition document into a flattened image. When
 * `renderedUrl` is non-null it replaces the source upload as the canonical
 * `media_url`; `sourceUrl` is always the original verified upload URL and
 * is stored on `source_media_url` for reference and re-render.
 */
interface CompositionRenderResult {
  /** Canonical rendered URL, or null when rendering was skipped/failed. */
  renderedUrl: string | null;
  /** The original source upload URL (always set). */
  sourceUrl: string;
}

/**
 * Result of {@link renderCompositionMedia}. When `renderFailed` is true
 * and `nonTrivial` is true, the composition carried authored edits that
 * would be lost if the source URL were served directly — the caller MUST
 * abort the publication rather than silently publishing unedited media.
 */
interface RenderCompositionMediaResult {
  /** Canonical rendered URL, or null when rendering was skipped/failed. */
  renderedUrl: string | null;
  /** True when the render threw or returned null. */
  renderFailed?: boolean;
  /** True when the composition is non-trivial (has authored edits). */
  nonTrivial?: boolean;
}

/**
 * Burn a composition document into a flattened image and upload it to S3.
 *
 * This runs BEFORE the publication transaction so the I/O-heavy render +
 * upload does not hold a database transaction open. The verified source
 * URL is still resolved inside the transaction; here we use the client-
 * supplied `suppliedUrl` (which the transaction later proves matches the
 * finalization receipt) as the render source.
 *
 * For trivial compositions (single unedited media) a render failure falls
 * back to the source URL as before — the source IS the intended output.
 *
 * For non-trivial compositions (filters, text, stickers, crop, focal-point)
 * a render failure sets `renderFailed: true, nonTrivial: true` so the
 * caller can abort the publication instead of silently publishing the
 * unedited source.
 */
async function renderCompositionMedia(
  documentId: string,
  compositionDocument: unknown,
  primarySuppliedUrl: string,
  primaryMediaType: 'image' | 'video',
  pageIndex?: number,
): Promise<RenderCompositionMediaResult> {
  if (primaryMediaType === 'video') {
    // Video composition rendering is deferred (requires FFmpeg).
    return { renderedUrl: null };
  }
  const nonTrivial = isCompositionNonTrivial(compositionDocument);
  if (!compositionDocument || !nonTrivial) {
    return { renderedUrl: null };
  }
  try {
    const rendered = await renderComposition(
      compositionDocument,
      primarySuppliedUrl,
      pageIndex !== undefined ? { pageIndex } : undefined,
    );
    if (!rendered) {
      // Non-trivial composition returned null — the authored edits would
      // be lost if we fell back to source. Signal the failure so the
      // caller can abort the publication.
      logger.warn(
        { documentId },
        '[creatorPublicationService] non-trivial composition render returned null — aborting publication',
      );
      return { renderedUrl: null, renderFailed: true, nonTrivial: true };
    }

    const objectKey = `renders/${documentId}/composition_${crypto.randomUUID()}.jpg`;
    const renderedUrl = await putBinaryObject(
      objectKey,
      rendered.buffer,
      rendered.contentType,
      { cacheControl: 'public, max-age=31536000, immutable' },
    );
    logger.info(
      { documentId, renderedUrl, width: rendered.width, height: rendered.height },
      '[creatorPublicationService] composition rendered and uploaded',
    );
    return { renderedUrl };
  } catch (error) {
    // Non-trivial composition render threw — the authored edits would be
    // lost if we fell back to source. Signal the failure so the caller
    // can abort the publication.
    logger.warn(
      { documentId, error: String(error) },
      '[creatorPublicationService] non-trivial composition render failed — aborting publication',
    );
    return { renderedUrl: null, renderFailed: true, nonTrivial: true };
  }
}

// ── Multi-page poster rendering ───────────────────────────────────────

/**
 * Defensively extract, for each page of a composition document, the page
 * index and the id of its primary media layer. The backend does not import
 * the frontend Zod schema, so an unknown/forward-compatible shape degrades
 * to "no media layer" (the frame keeps its source URL). Returns one entry
 * per page in document order so the index aligns with the frame `sortOrder`.
 */
function parseCompositionPagesForMedia(
  doc: unknown,
): Array<{ mediaLayerId: string | null }> {
  if (!doc || typeof doc !== 'object') return [];
  const root = doc as Record<string, unknown>;
  const pages = root['pages'];
  if (!Array.isArray(pages)) return [];
  return pages.map((raw) => {
    if (!raw || typeof raw !== 'object') return { mediaLayerId: null };
    const page = raw as Record<string, unknown>;
    const layers = Array.isArray(page['layers']) ? page['layers'] : [];
    const mediaLayer = layers.find(
      (l): l is Record<string, unknown> =>
        l !== null && typeof l === 'object' && (l as Record<string, unknown>)['type'] === 'media',
    );
    const id = mediaLayer ? (mediaLayer['id'] as unknown) : null;
    return { mediaLayerId: typeof id === 'string' && id.length > 0 ? id : null };
  });
}

/**
 * Render every image-type page of a multi-page poster composition in
 * parallel. Each page is rendered independently via {@link renderCompositionMedia}
 * with its own page index and the frame's source URL (resolved from the
 * client-supplied expected media). Video frames keep their source URL —
 * video rendering burns trim/speed only, and overlay burn-in is handled in
 * the composition renderer.
 *
 * For trivial frames a render failure falls back to the source URL. For
 * non-trivial frames a render failure sets `renderFailed: true,
 * nonTrivial: true` so the caller can abort the publication instead of
 * silently publishing unedited media.
 *
 * Returns the per-page rendered URL map plus failure flags.
 */
interface PosterFrameRenderOutcome {
  /** Page index → rendered URL (null when skipped/failed). */
  renders: Map<number, string | null>;
  /** True when at least one non-trivial frame render failed. */
  renderFailed: boolean;
  /** True when the failed frame was non-trivial. */
  nonTrivial: boolean;
}

async function renderPosterFrameCompositions(
  documentId: string,
  compositionDocument: unknown,
  expectedMedia: ReadonlyArray<{
    layerId: string;
    role: string;
    mediaType: 'image' | 'video';
    suppliedUrl: string;
  }>,
): Promise<PosterFrameRenderOutcome> {
  const result = new Map<number, string | null>();
  let renderFailed = false;
  let nonTrivial = false;

  const pages = parseCompositionPagesForMedia(compositionDocument);
  if (pages.length === 0) return { renders: result, renderFailed, nonTrivial };

  // Index expected media by (layerId, role) for O(1) lookup.
  const expectedByKey = new Map<
    string,
    { mediaType: 'image' | 'video'; suppliedUrl: string }
  >();
  for (const e of expectedMedia) {
    expectedByKey.set(`${e.layerId}::${e.role}`, {
      mediaType: e.mediaType,
      suppliedUrl: e.suppliedUrl,
    });
  }

  const tasks = pages.map(async (page, pageIndex) => {
    if (!page.mediaLayerId) return { pageIndex, renderedUrl: null, renderFailed: false, nonTrivial: false };
    const expected = expectedByKey.get(`${page.mediaLayerId}::primary`);
    if (!expected || expected.mediaType !== 'image') {
      // Video frames keep source; text frames have no media.
      return { pageIndex, renderedUrl: null, renderFailed: false, nonTrivial: false };
    }
    try {
      const render = await renderCompositionMedia(
        documentId,
        compositionDocument,
        expected.suppliedUrl,
        'image',
        pageIndex,
      );
      return {
        pageIndex,
        renderedUrl: render.renderedUrl,
        renderFailed: render.renderFailed ?? false,
        nonTrivial: render.nonTrivial ?? false,
      };
    } catch (error) {
      logger.warn(
        { documentId, pageIndex, error: String(error) },
        '[creatorPublicationService] poster page render failed — falling back to source',
      );
      return { pageIndex, renderedUrl: null, renderFailed: false, nonTrivial: false };
    }
  });

  const results = await Promise.all(tasks);
  for (const r of results) {
    result.set(r.pageIndex, r.renderedUrl);
    if (r.renderFailed && r.nonTrivial) {
      renderFailed = true;
      nonTrivial = true;
    }
  }
  return { renders: result, renderFailed, nonTrivial };
}

// ── Projection creation ────────────────────────────────────────────────

interface LookProjectionInput {
  documentId: string;
  creatorId: string;
  title: string;
  caption: string;
  primaryMediaUrl: string;
  /** Original source upload URL, stored on `source_media_url`. */
  sourceMediaUrl: string | null;
  primaryMediaType: 'image' | 'video';
  primaryFinalizationId: string;
  primaryMediaAssetId: string | null;
  additionalMedia?: Array<{
    url: string;
    mediaType: 'image' | 'video';
    finalizationId?: string;
    mediaAssetId?: string | null;
  }>;
  compositionDocument: unknown;
  visibility: string;
  payloadHash: string;
}

/**
 * Create the public Look projection. Mirrors the INSERT in listings.ts:1813
 * but runs inside the orchestrator's transaction.
 */
async function createLookProjection(
  client: PoolClient,
  input: LookProjectionInput,
): Promise<string> {
  const lookId = input.documentId;
  await client.query(
    `INSERT INTO looks (
       id, creator_id, title, caption, media_url, source_media_url, media_type,
       composition_document, status, visibility,
       upload_finalization_id, media_asset_id, publication_payload_hash
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, 'published', $9, $10, $11, $12)`,
    [
      lookId,
      input.creatorId,
      input.title,
      input.caption,
      input.primaryMediaUrl,
      input.sourceMediaUrl,
      input.primaryMediaType,
      input.compositionDocument ? JSON.stringify(input.compositionDocument) : null,
      input.visibility,
      input.primaryFinalizationId,
      input.primaryMediaAssetId,
      input.payloadHash,
    ],
  );
  for (const [position, media] of (input.additionalMedia ?? []).entries()) {
    await client.query(
      `INSERT INTO look_media (
         id, look_id, media_url, media_type, position,
         media_finalization_id, media_asset_id
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        `look_media_${crypto.randomUUID()}`,
        lookId,
        media.url,
        media.mediaType,
        position + 1,
        media.finalizationId ?? null,
        media.mediaAssetId ?? null,
      ],
    );
  }
  return lookId;
}

interface PosterProjectionInput {
  documentId: string;
  creatorId: string;
  audience: string;
  allowReplies: boolean;
  allowReactions: boolean;
  expiresInHours: number;
  compositionDocument: unknown;
  payloadHash: string;
  frames: Array<{
    id: string;
    mediaType: 'image' | 'video' | 'text';
    caption: string;
    backgroundColor: string | null;
    durationMs: number;
    sortOrder: number;
    verifiedMedia: VerifiedMedia | null;
    /** Rendered composition URL (replaces source as media_url), or null. */
    renderedMediaUrl: string | null;
    /** Original source URL, stored on source_media_url. */
    sourceMediaUrl: string | null;
  }>;
}

interface MoodboardProjectionInput {
  documentId: string;
  creatorId: string;
  moodboardId: string;
  audience: string;
  allowReplies: boolean;
  allowReactions: boolean;
  expiresInHours: number;
  compositionDocument: unknown;
  payloadHash: string;
  caption: string;
}

/**
 * Create the public Poster Story projection. Mirrors the transaction in
 * index.ts:46183 but runs inside the orchestrator's transaction.
 */
async function createPosterProjection(
  client: PoolClient,
  input: PosterProjectionInput,
): Promise<string> {
  const storyId = input.documentId;
  const expiresAt = new Date(Date.now() + input.expiresInHours * 60 * 60 * 1000);

  await client.query(
    `INSERT INTO poster_stories (
       id, creator_id, audience, allow_replies, allow_reactions,
       status, expires_at, composition_document, publication_payload_hash
     )
     VALUES ($1, $2, $3, $4, $5, 'active', $6, $7::jsonb, $8)`,
    [
      storyId,
      input.creatorId,
      input.audience,
      input.allowReplies,
      input.allowReactions,
      expiresAt,
      input.compositionDocument ? JSON.stringify(input.compositionDocument) : null,
      input.payloadHash,
    ],
  );

  for (const frame of input.frames) {
    await client.query(
      `INSERT INTO posters (
         id, creator_id, media_url, source_media_url, caption, poster_caption,
         background_color, layout, status, expiry_hours, story_id,
         media_type, sort_order, duration_ms, upload_finalization_id,
         media_asset_id
       )
       VALUES ($1, $2, $3, $4, $5, $5, $6, 'single', 'published', $7, $8, $9, $10, $11, $12, $13)`,
      [
        frame.id,
        input.creatorId,
        frame.renderedMediaUrl ?? frame.verifiedMedia?.resolvedUrl ?? '',
        frame.sourceMediaUrl,
        frame.caption,
        frame.backgroundColor,
        input.expiresInHours,
        storyId,
        frame.mediaType,
        frame.sortOrder,
        frame.durationMs,
        frame.verifiedMedia?.finalizationId ?? null,
        frame.verifiedMedia?.mediaAssetId ?? null,
      ],
    );

    if (frame.verifiedMedia) {
      await client.query(
        `UPDATE upload_finalizations
         SET scope = 'poster', scope_ref_id = $2, updated_at = NOW()
         WHERE id = $1`,
        [frame.verifiedMedia.finalizationId, storyId],
      );
      if (frame.verifiedMedia.mediaAssetId) {
        await client.query(
          `INSERT INTO media_bindings (
             id, media_asset_id, owner_id, target_type,
             target_ref_id, role, sort_order
           )
           VALUES ($1, $2, $3, 'creator_document', $4, $5, $6)
           ON CONFLICT (media_asset_id, target_type, target_ref_id, role)
           DO UPDATE SET removed_at = NULL, sort_order = EXCLUDED.sort_order`,
          [
            `mbind_${crypto.randomUUID()}`,
            frame.verifiedMedia.mediaAssetId,
            input.creatorId,
            storyId,
            `frame:${frame.sortOrder}`,
            frame.sortOrder,
          ],
        );
      }
    }
  }

  return storyId;
}

/**
 * Create the public Moodboard projection. A moodboard publishes as a
 * poster story with content_type='moodboard' and a single frame that
 * references the moodboard canvas. The moodboard items themselves are
 * not copied — the poster references the live moodboard so collaborative
 * edits remain visible until the story expires.
 */
async function createMoodboardProjection(
  client: PoolClient,
  input: MoodboardProjectionInput,
): Promise<string> {
  const storyId = input.documentId;
  const posterId = `poster_mb_${input.moodboardId}_${Date.now()}`;
  const expiresAt = new Date(Date.now() + input.expiresInHours * 60 * 60 * 1000);

  // Verify the moodboard exists and the creator has access.
  const boardResult = await client.query<{ creator_id: string; deleted_at: string | null }>(
    `SELECT creator_id, deleted_at FROM moodboards WHERE id = $1 LIMIT 1`,
    [input.moodboardId],
  );
  if (!boardResult.rowCount || boardResult.rows[0].deleted_at) {
    throw new MediaVerificationError('Moodboard not found', 'MOODBOARD_NOT_FOUND');
  }
  const board = boardResult.rows[0];
  const isCreator = board.creator_id === input.creatorId;
  if (!isCreator) {
    const memberResult = await client.query<{ role: string }>(
      `SELECT role FROM moodboard_members WHERE board_id = $1 AND user_id = $2 AND state = 'active'`,
      [input.moodboardId, input.creatorId],
    );
    if ((memberResult.rowCount ?? 0) === 0) {
      throw new MediaVerificationError('Not a member of this moodboard', 'MOODBOARD_ACCESS_DENIED');
    }
  }

  // Create the story with moodboard content type.
  await client.query(
    `INSERT INTO poster_stories (
       id, creator_id, audience, allow_replies, allow_reactions,
       status, expires_at, content_type, moodboard_id,
       composition_document, publication_payload_hash
     )
     VALUES ($1, $2, $3, $4, $5, 'active', $6, 'moodboard', $7, $8::jsonb, $9)`,
    [
      storyId,
      input.creatorId,
      input.audience,
      input.allowReplies,
      input.allowReactions,
      expiresAt,
      input.moodboardId,
      input.compositionDocument ? JSON.stringify(input.compositionDocument) : null,
      input.payloadHash,
    ],
  );

  // Create a single frame that references the moodboard.
  await client.query(
    `INSERT INTO posters (
       id, creator_id, story_id, media_url, caption, poster_caption,
       media_type, layout, status, expiry_hours, content_type, moodboard_id
     )
     VALUES ($1, $2, $3, '', $4, $4, 'text', 'single', 'published', $5, 'moodboard', $6)`,
    [
      posterId,
      input.creatorId,
      storyId,
      input.caption,
      input.expiresInHours,
      input.moodboardId,
    ],
  );

  // Link the moodboard to the published poster.
  await client.query(
    `UPDATE moodboards SET published_poster_id = $2, updated_at = NOW()
     WHERE id = $1`,
    [input.moodboardId, posterId],
  );

  return storyId;
}

// ── Canonical publication transaction ──────────────────────────────────

/**
 * Execute the canonical publication command inside a single database
 * transaction. This is the single source of truth for publishing a creator
 * document — both the HTTP route and the scheduled publication worker
 * call this function.
 *
 * The function is a pure database transaction with no HTTP dependency.
 * The `status` field on the result tells the route adapter which HTTP
 * status code to set; the worker ignores it and uses `ok`/`blocked`/`error`.
 */
export async function publishCreatorDocumentTransaction(
  params: PublishDocumentParams,
): Promise<PublishDocumentResult> {
  const { db, documentId, actorUserId, command, idempotencyKey } = params;

  // P0.3b: Reject closeFriends audience — the backend must not silently
  // downgrade to public/private. The frontend hides the option, but the
  // server enforces it so a stale or tampered client cannot bypass.
  // This check runs for both the HTTP path and the worker path so a
  // frozen schedule command cannot bypass it either.
  if (command.audience === 'closeFriends') {
    return {
      ok: false,
      status: 400,
      error: 'The closeFriends audience is not supported for publication. Use public or private.',
      code: 'AUDIENCE_UNSUPPORTED',
      blocked: true,
    };
  }

  // Payload hash over the canonical command (deterministic JSON).
  const payloadHash = crypto
    .createHash('sha256')
    .update(JSON.stringify(command))
    .digest('hex');

  // P0-8: Server-side composition rendering. Burn the composition document
  // into a flattened image BEFORE the transaction so the I/O-heavy render +
  // S3 upload does not hold the database transaction open. The rendered URL
  // (when present) replaces the source upload as the canonical `media_url`;
  // the verified source URL is stored on `source_media_url` inside the
  // transaction.
  //
  // For trivial compositions (single unedited media) a render failure falls
  // back to the source URL — the source IS the intended output. For
  // non-trivial compositions (filters, text, stickers, crop, focal-point)
  // a render failure ABORTS the publication with `MEDIA_RENDER_FAILED` so
  // the unedited source is never silently published in place of the
  // authored composition.
  const primaryImageExpected = command.expectedMedia.find(
    (e) => e.role === 'primary' && e.mediaType === 'image',
  );
  const compositionRender = command.destination === 'look' && primaryImageExpected
    ? await renderCompositionMedia(
        documentId,
        command.compositionDocument,
        primaryImageExpected.suppliedUrl,
        'image',
      )
    : { renderedUrl: null as string | null };

  // Abort if a non-trivial look composition render failed — publishing the
  // unedited source would silently discard the author's edits.
  if (compositionRender.renderFailed && compositionRender.nonTrivial) {
    return {
      ok: false,
      status: 500,
      error: 'Composition render failed — the authored edits (filters, text, stickers, crop) could not be burned into the media. Publication aborted to prevent publishing unedited source media.',
      code: 'MEDIA_RENDER_FAILED',
    };
  }

  // Multi-page poster: render every image-type page in parallel so
  // secondary frames show the authored composition, not just the cover.
  // Video frames keep their source URL (video rendering burns trim/speed
  // only; overlay burn-in is handled in the composition renderer). Any
  // individual page render failure falls back to source for that frame.
  const posterFrameRenders =
    command.destination === 'poster' && command.compositionDocument
      ? await renderPosterFrameCompositions(
          documentId,
          command.compositionDocument,
          command.expectedMedia,
        )
      : { renders: new Map<number, string | null>(), renderFailed: false, nonTrivial: false };

  // Abort if any non-trivial poster frame render failed.
  if (posterFrameRenders.renderFailed && posterFrameRenders.nonTrivial) {
    return {
      ok: false,
      status: 500,
      error: 'Composition render failed for one or more poster frames — the authored edits (filters, text, stickers, crop) could not be burned into the media. Publication aborted to prevent publishing unedited source media.',
      code: 'MEDIA_RENDER_FAILED',
    };
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    // 1. Lock the document row.
    const docResult = await client.query<{
      creator_id: string;
      document_json: string;
      document_hash: string | null;
      lock_version: number;
      head_revision: number;
      status: string;
      updated_at: string;
    }>(
      `SELECT creator_id, document_json, document_hash, lock_version, head_revision, status, updated_at
       FROM creator_documents
       WHERE id = $1
       LIMIT 1
       FOR UPDATE`,
      [documentId],
    );

    if (!docResult.rowCount) {
      await client.query('ROLLBACK');
      return { ok: false, status: 404, error: 'Document not found' };
    }

    const docRow = docResult.rows[0];

    // 1b. Optimistic concurrency — reject stale publishes.
    // The client sends expectedLockVersion and expectedDocumentHash from
    // its last successful save. If the document has changed since (another
    // device edited and saved, or the document was re-published), the
    // publish must fail with 409 rather than silently publishing stale
    // content. This check runs INSIDE the transaction, after the FOR UPDATE
    // row lock, so the row cannot change between the check and the write.
    try {
      checkStaleDocument(
        docRow,
        command.expectedLockVersion,
        command.expectedDocumentHash,
      );
    } catch (error) {
      if (error instanceof StaleDocumentError) {
        await client.query('ROLLBACK');
        const serverHash = docRow.document_hash
          ?? crypto.createHash('sha256').update(docRow.document_json).digest('hex');
        return {
          ok: false,
          status: 409,
          error: error.message,
          code: error.code,
          serverLockVersion: docRow.lock_version,
          serverDocumentHash: serverHash,
          serverUpdatedAt: docRow.updated_at,
          serverHeadRevision: docRow.head_revision,
        };
      }
      throw error;
    }

    // P2.12: Collaborator-aware ownership check.
    // The owner (creator_id) can always publish. Editors can also publish.
    // Viewers and non-collaborators are denied.
    const isOwner = docRow.creator_id === actorUserId;
    if (!isOwner) {
      const collabResult = await client.query<{ role: string }>(
        `SELECT role FROM creator_collaborators
         WHERE document_id = $1 AND user_id = $2 AND state = 'active'
         LIMIT 1`,
        [documentId, actorUserId],
      );
      const collabRole = collabResult.rows[0]?.role;
      if (collabRole !== 'editor') {
        await client.query('ROLLBACK');
        return {
          ok: false,
          status: 403,
          error: 'Access denied — only the owner or editors can publish',
        };
      }
    }

    // 2. Check for idempotent replay (same key + same hash).
    const existingPub = await client.query<{
      id: string;
      target_id: string;
      revision_number: number;
      state: string;
      payload_hash: string;
    }>(
      `SELECT id, target_id, revision_number, state, payload_hash
       FROM creator_publications
       WHERE document_id = $1 AND idempotency_key = $2
       LIMIT 1`,
      [documentId, idempotencyKey],
    );

    if (existingPub.rowCount) {
      const existing = existingPub.rows[0];
      if (existing.payload_hash === payloadHash) {
        // Idempotent replay — return the original result.
        await client.query('COMMIT');
        return {
          ok: true,
          status: 200,
          documentId,
          publicationId: existing.id,
          targetId: existing.target_id,
          destination: command.destination,
          revisionNumber: existing.revision_number,
          state: existing.state,
          idempotentReplay: true,
        };
      }
      // Same key, different payload — conflict.
      await client.query('ROLLBACK');
      return {
        ok: false,
        status: 409,
        error: 'This idempotency key was already used with different content',
        code: 'IDEMPOTENCY_CONFLICT',
      };
    }

    // 3. Validate the document is in a publishable state.
    if (docRow.status === 'deleted') {
      await client.query('ROLLBACK');
      return {
        ok: false,
        status: 409,
        error: 'Document is deleted',
        code: 'DOCUMENT_DELETED',
      };
    }

    // Parse the stored document to extract metadata + media for projection.
    const doc = JSON.parse(docRow.document_json) as {
      type: string;
      metadata?: {
        title?: string;
        caption?: string;
        visibility?: string;
        allowReplies?: boolean;
        allowReactions?: boolean;
        expiresInHours?: number;
        moodboardId?: string;
      };
      pages?: Array<{
        id: string;
        durationMs?: number;
        layers: Array<{
          id: string;
          type: string;
          payload: {
            mediaUri?: string;
            mediaFinalizationId?: string;
            mediaAssetId?: string;
            mediaType?: 'image' | 'video';
            isCaption?: boolean;
            caption?: string;
            backgroundColor?: string;
            text?: string;
          };
        }>;
      }>;
    };

    // 4. Validate composition envelope.
    const compositionValidation = validateCompositionDocument(
      command.compositionDocument,
      { type: command.destination === 'moodboard' ? 'poster' : command.destination, id: documentId },
    );
    if (!compositionValidation.ok) {
      await client.query('ROLLBACK');
      return {
        ok: false,
        status: 422,
        error: compositionValidation.error,
        code: compositionValidation.code,
      };
    }

    // 4b. P0.6: Server-walk all media references for exact receipt coverage.
    // Walk both the stored document_json and the compositionDocument (if
    // provided) to extract every media-bearing path, then prove that
    // expectedMedia exactly covers them — no missing receipts, no unused
    // receipts, no raw URLs without finalization bindings.
    const docMediaRefs = extractMediaReferences(doc);
    const compositionMediaRefs = command.compositionDocument
      ? extractMediaReferences(command.compositionDocument)
      : [];
    // Union by (layerId, role) — the compositionDocument may carry
    // additional layers not yet persisted, and the stored document is
    // the authoritative locked state.
    const allMediaRefs = new Map<string, MediaReference>();
    for (const ref of [...docMediaRefs, ...compositionMediaRefs]) {
      const key = `${ref.layerId}::${ref.role}`;
      if (!allMediaRefs.has(key)) {
        allMediaRefs.set(key, ref);
      }
    }
    const coverageResult = validateMediaCoverage(
      [...allMediaRefs.values()],
      command.expectedMedia,
    );
    if (!coverageResult.ok) {
      await client.query('ROLLBACK');
      return {
        ok: false,
        status: 422,
        error: 'Media receipt coverage mismatch',
        code: 'MEDIA_COVERAGE_MISMATCH',
        mediaErrors: coverageResult.errors,
      };
    }

    // 5. Verify media receipts.
    // Key by (layerId, role) — a single video layer can carry both a
    // 'primary' and a 'thumbnail' receipt, and product/look snapshot
    // layers can coexist with primary media. Keying by layerId alone
    // would let the later entry overwrite the earlier one.
    const verifiedMediaByLayer = new Map<string, VerifiedMedia>();
    for (const expected of command.expectedMedia) {
      // Reject local URIs — media must be uploaded before publish.
      if (isLocalUri(expected.suppliedUrl)) {
        await client.query('ROLLBACK');
        return {
          ok: false,
          status: 422,
          error: `Layer ${expected.layerId}: media URL is a local URI — upload before publish`,
          code: 'LOCAL_URI_NOT_ALLOWED',
        };
      }
      try {
        const verified = await verifyMediaReceipt(
          client,
          expected.finalizationId,
          actorUserId,
          documentId,
          expected.mediaType,
          expected.suppliedUrl,
          expected.layerId,
          expected.role,
          expected.assetId,
        );
        verified.role = expected.role;
        const mediaKey = `${expected.layerId}::${expected.role}`;
        verifiedMediaByLayer.set(mediaKey, verified);
      } catch (error) {
        await client.query('ROLLBACK');
        if (error instanceof MediaVerificationError) {
          return {
            ok: false,
            status: 422,
            error: error.message,
            code: error.code,
            layerId: error.layerId,
            field: error.field,
          };
        }
        throw error;
      }
    }

    // 6. Allocate the revision number.
    const revisionNumber = docRow.head_revision + 1;
    const publicationId = `pub_${crypto.randomUUID()}`;
    const revisionId = `rev_${crypto.randomUUID()}`;

    // 7. Create the typed public projection.
    let targetId: string;
    if (command.destination === 'look') {
      // For a Look, the cover is the primary media from the first media
      // layer. Explicitly select role === 'primary' — a video layer may
      // also carry a 'thumbnail' receipt, and product/look snapshot layers
      // may coexist. Keying by layerId alone (or taking the first map
      // entry) could select the thumbnail or a snapshot instead of the
      // primary cover.
      const firstMediaLayer = (doc.pages ?? [])
        .flatMap((page) => page.layers)
        .find((layer) => layer.type === 'media');
      const coverKey = firstMediaLayer
        ? `${firstMediaLayer.id}::primary`
        : null;
      const primaryMedia = coverKey
        ? verifiedMediaByLayer.get(coverKey)
        : undefined;
      if (!primaryMedia) {
        await client.query('ROLLBACK');
        return {
          ok: false,
          status: 422,
          error: 'Look publication requires at least one primary media layer',
          code: 'NO_MEDIA',
        };
      }
      const additionalMedia = (doc.pages ?? [])
        .flatMap((page) => page.layers)
        .filter((layer) => layer.type === 'media' && layer.id !== firstMediaLayer?.id)
        .map((layer) => {
          const verified = verifiedMediaByLayer.get(`${layer.id}::primary`);
          return verified
            ? {
                url: verified.resolvedUrl,
                mediaType: verified.contentType.startsWith('video/') ? 'video' as const : 'image' as const,
                finalizationId: verified.finalizationId,
                mediaAssetId: verified.mediaAssetId,
              }
            : null;
        })
        .filter((media): media is NonNullable<typeof media> => media !== null);
      targetId = await createLookProjection(client, {
        documentId,
        creatorId: actorUserId,
        title: doc.metadata?.title ?? '',
        caption: doc.metadata?.caption ?? '',
        primaryMediaUrl: compositionRender.renderedUrl ?? primaryMedia.resolvedUrl,
        // Always preserve the original source upload URL on source_media_url,
        // regardless of whether rendering succeeded. This ensures the
        // source reference is never lost when the server skips rendering
        // (trivial compositions) or when a render falls back to source.
        sourceMediaUrl: primaryMedia.resolvedUrl,
        primaryMediaType: primaryMedia.contentType.startsWith('video/') ? 'video' : 'image',
        primaryFinalizationId: primaryMedia.finalizationId,
        primaryMediaAssetId: primaryMedia.mediaAssetId,
        additionalMedia,
        compositionDocument: command.compositionDocument,
        visibility: command.audience,
        payloadHash,
      });
    } else if (command.destination === 'poster') {
      // For a Poster, each page becomes a frame. Resolve the frame's
      // primary media explicitly via (mediaLayer.id, 'primary') — a video
      // layer may also carry a 'thumbnail' receipt that must not be
      // selected as the frame's primary media.
      const frames = (doc.pages ?? []).map((page, index) => {
        const mediaLayer = page.layers.find((l) => l.type === 'media');
        const captionLayer = page.layers.find(
          (layer) => layer.type === 'text'
            && (layer.payload.isCaption === true || layer.id.startsWith('caption_')),
        );
        const verified = mediaLayer
          ? verifiedMediaByLayer.get(`${mediaLayer.id}::primary`) ?? null
          : null;
        const isImage = verified
          ? !verified.contentType.startsWith('video/')
          : false;
        // Render every image-type page (not just the cover) so multi-page
        // posters show the authored composition on all frames. Each page
        // was rendered in parallel before the transaction; a missing or
        // failed render falls back to the source URL.
        const renderedUrl = isImage
          ? (posterFrameRenders.renders.get(index) ?? null)
          : null;
        return {
          id: page.id,
          mediaType: mediaLayer
            ? (verified?.contentType.startsWith('video/') ? 'video' as const : 'image' as const)
            : 'text' as const,
          caption: captionLayer?.payload.text ?? mediaLayer?.payload.caption ?? '',
          backgroundColor: null,
          durationMs: page.durationMs ?? 5000,
          sortOrder: index,
          verifiedMedia: verified,
          renderedMediaUrl: renderedUrl,
          // Always preserve the original source upload URL on
          // source_media_url, regardless of whether rendering succeeded.
          // This ensures the source reference is never lost when the
          // server skips rendering or a render falls back to source.
          sourceMediaUrl: verified ? verified.resolvedUrl : null,
        };
      });
      targetId = await createPosterProjection(client, {
        documentId,
        creatorId: actorUserId,
        audience: command.audience,
        allowReplies: doc.metadata?.allowReplies ?? true,
        allowReactions: doc.metadata?.allowReactions ?? true,
        expiresInHours: command.expiresInHours,
        compositionDocument: command.compositionDocument,
        payloadHash,
        frames,
      });
    } else if (command.destination === 'moodboard') {
      // Moodboard projection — creates a poster story with
      // content_type='moodboard' that references the live moodboard
      // canvas. The moodboard ID is extracted from the composition
      // document's metadata.
      const moodboardId = doc.metadata?.moodboardId;
      if (!moodboardId) {
        await client.query('ROLLBACK');
        return {
          ok: false,
          status: 422,
          error: 'Moodboard publication requires a moodboardId in the document metadata',
          code: 'MOODBOARD_ID_REQUIRED',
        };
      }
      targetId = await createMoodboardProjection(client, {
        documentId,
        creatorId: actorUserId,
        moodboardId,
        audience: command.audience,
        allowReplies: doc.metadata?.allowReplies ?? true,
        allowReactions: doc.metadata?.allowReactions ?? true,
        expiresInHours: command.expiresInHours,
        compositionDocument: command.compositionDocument,
        payloadHash,
        caption: doc.metadata?.caption ?? '',
      });
    } else {
      // Unknown destination — fail closed.
      await client.query('ROLLBACK');
      return {
        ok: false,
        status: 422,
        error: `Unsupported destination: ${command.destination}`,
        code: 'DESTINATION_NOT_SUPPORTED',
      };
    }

    // 8. Write the immutable revision snapshot.
    await client.query(
      `INSERT INTO creator_document_revisions (
         id, document_id, creator_id, revision_number,
         document_json, publish_key, document_hash
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        revisionId,
        documentId,
        actorUserId,
        revisionNumber,
        docRow.document_json,
        idempotencyKey,
        payloadHash,
      ],
    );

    // 9. Write the creator_publications row.
    await client.query(
      `INSERT INTO creator_publications (
         id, document_id, creator_id, revision_number,
         destination, target_id, idempotency_key, payload_hash,
         state, rights_snapshot_id
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'published', $9)`,
      [
        publicationId,
        documentId,
        actorUserId,
        revisionNumber,
        command.destination,
        targetId,
        idempotencyKey,
        payloadHash,
        command.rightsSnapshotId ?? null,
      ],
    );

    // 10. Update the document lifecycle state.
    await client.query(
      `UPDATE creator_documents
       SET status = 'published',
           head_revision = $2,
           published_revision = $2,
           publication_id = $3,
           next_revision_number = $2 + 1,
           lock_version = lock_version + 1,
           published_at = COALESCE(published_at, NOW()),
           updated_at = NOW()
       WHERE id = $1`,
      [documentId, revisionNumber, publicationId],
    );

    // 11. Append the domain outbox event.
    await appendDomainEvent(client, {
      aggregateType: 'creator_document',
      aggregateId: documentId,
      eventType: 'content.published',
      payload: {
        documentId,
        publicationId,
        revisionId,
        revisionNumber,
        creatorId: actorUserId,
        destination: command.destination,
        targetId,
        publishedAt: new Date().toISOString(),
      },
      actorId: actorUserId,
      idempotencyKey,
      deduplicationKey: `content.published:${documentId}:${idempotencyKey}`,
    });

    await client.query('COMMIT');

    return {
      ok: true,
      status: 200,
      documentId,
      publicationId,
      targetId,
      destination: command.destination,
      revisionNumber,
      state: 'published',
      idempotentReplay: false,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    // Re-throw so the caller (route or worker) can log and decide. The
    // route maps this to a 500; the worker treats it as a transient
    // failure (or permanent after max attempts).
    throw error;
  } finally {
    client.release();
  }
}
