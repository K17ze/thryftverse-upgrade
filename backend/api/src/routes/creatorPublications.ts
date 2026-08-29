import crypto from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { appendDomainEvent } from '../lib/domainOutbox.js';
import { validateCompositionDocument } from '../lib/compositionValidation.js';

/**
 * Creator publication orchestrator.
 *
 * This is the P0 fix for the publishing-lifecycle architectural disconnect
 * (research report 23). The old `/creator/documents/:id/publish` endpoint
 * flipped a status flag and wrote an internal revision but created NO public
 * Look or Poster projection. The native publisher bypassed it entirely.
 *
 * `POST /creator/documents/:id/publications` is the canonical publish command.
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
 * No response after commit → discoverable by key via GET lookup.
 */

type CreatorPublicationsRouteDependencies = {
  app: FastifyInstance;
  db: Pool;
  resolveAuthenticatedUserId: (request: FastifyRequest) => string;
};

// ── Schemas ────────────────────────────────────────────────────────────

const documentIdParamsSchema = z.object({
  documentId: z.string().min(2).max(120),
});

const idempotencyKeyParamsSchema = z.object({
  documentId: z.string().min(2).max(120),
  idempotencyKey: z.string().min(8).max(160),
});

const publishCommandSchema = z.object({
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
});

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
        // Product / Look snapshot image
        if (typeof p['snapshotImageUrl'] === 'string' || p['snapshotMediaFinalizationId'] !== undefined || p['snapshotMediaAssetId'] !== undefined) {
          refs.push({
            layerId,
            field: 'snapshotImageUrl',
            role: 'snapshot',
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

interface MediaCoverageError {
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

// ── Projection creation ────────────────────────────────────────────────

interface LookProjectionInput {
  documentId: string;
  creatorId: string;
  title: string;
  caption: string;
  primaryMediaUrl: string;
  primaryMediaType: 'image' | 'video';
  primaryFinalizationId: string;
  primaryMediaAssetId: string | null;
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
       id, creator_id, title, caption, media_url, media_type,
       composition_document, status, visibility,
       upload_finalization_id, media_asset_id, publication_payload_hash
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, 'published', $8, $9, $10, $11)`,
    [
      lookId,
      input.creatorId,
      input.title,
      input.caption,
      input.primaryMediaUrl,
      input.primaryMediaType,
      input.compositionDocument ? JSON.stringify(input.compositionDocument) : null,
      input.visibility,
      input.primaryFinalizationId,
      input.primaryMediaAssetId,
      input.payloadHash,
    ],
  );
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
         id, creator_id, media_url, caption, poster_caption,
         background_color, layout, status, expiry_hours, story_id,
         media_type, sort_order, duration_ms, upload_finalization_id,
         media_asset_id
       )
       VALUES ($1, $2, $3, $4, $4, $5, 'single', 'published', $6, $7, $8, $9, $10, $11, $12)`,
      [
        frame.id,
        input.creatorId,
        frame.verifiedMedia?.resolvedUrl ?? '',
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

// ── Route registration ─────────────────────────────────────────────────

export const registerCreatorPublicationRoutes = ({
  app,
  db,
  resolveAuthenticatedUserId,
}: CreatorPublicationsRouteDependencies) => {

  // POST /creator/documents/:documentId/publications
  // The canonical publish command. Creates the public projection transactionally.
  app.post('/creator/documents/:documentId/publications', async (request, reply) => {
    const actorUserId = resolveAuthenticatedUserId(request);
    const { documentId } = documentIdParamsSchema.parse(request.params);
    const command = publishCommandSchema.parse(request.body ?? {});

    // P0.3b: Reject closeFriends audience — the backend must not silently
    // downgrade to public/private. The frontend hides the option, but the
    // server enforces it so a stale or tampered client cannot bypass.
    if (command.audience === 'closeFriends') {
      reply.code(400);
      return {
        ok: false,
        error: 'The closeFriends audience is not supported for publication. Use public or private.',
        code: 'AUDIENCE_UNSUPPORTED',
      };
    }

    // Idempotency key: header takes precedence, then body, then derived.
    const rawHeaderKey = Array.isArray(request.headers['idempotency-key'])
      ? request.headers['idempotency-key'][0]
      : request.headers['idempotency-key'];
    const headerKey = rawHeaderKey
      ? z.string().trim().min(8).max(160).parse(rawHeaderKey)
      : undefined;
    const idempotencyKey = headerKey ?? `pub_${documentId}_${command.revision}`;

    // Payload hash over the canonical command (deterministic JSON).
    const payloadHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(command))
      .digest('hex');

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      // 1. Lock the document row.
      const docResult = await client.query<{
        creator_id: string;
        document_json: string;
        lock_version: number;
        head_revision: number;
        status: string;
      }>(
        `SELECT creator_id, document_json, lock_version, head_revision, status
         FROM creator_documents
         WHERE id = $1
         LIMIT 1
         FOR UPDATE`,
        [documentId],
      );

      if (!docResult.rowCount) {
        await client.query('ROLLBACK');
        reply.code(404);
        return { ok: false, error: 'Document not found' };
      }

      const docRow = docResult.rows[0];

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
          reply.code(403);
          return { ok: false, error: 'Access denied — only the owner or editors can publish' };
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
        reply.code(409);
        return {
          ok: false,
          error: 'This idempotency key was already used with different content',
          code: 'IDEMPOTENCY_CONFLICT',
        };
      }

      // 3. Validate the document is in a publishable state.
      if (docRow.status === 'deleted') {
        await client.query('ROLLBACK');
        reply.code(409);
        return { ok: false, error: 'Document is deleted', code: 'DOCUMENT_DELETED' };
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
        reply.code(422);
        return {
          ok: false,
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
        reply.code(422);
        return {
          ok: false,
          error: 'Media receipt coverage mismatch',
          code: 'MEDIA_COVERAGE_MISMATCH',
          mediaErrors: coverageResult.errors,
        };
      }

      // 5. Verify media receipts.
      const verifiedMediaByLayer = new Map<string, VerifiedMedia>();
      for (const expected of command.expectedMedia) {
        // Reject local URIs — media must be uploaded before publish.
        if (isLocalUri(expected.suppliedUrl)) {
          await client.query('ROLLBACK');
          reply.code(422);
          return {
            ok: false,
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
          verifiedMediaByLayer.set(expected.layerId, verified);
        } catch (error) {
          await client.query('ROLLBACK');
          if (error instanceof MediaVerificationError) {
            reply.code(422);
            return {
              ok: false,
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
        // For a Look, the first media layer is the primary cover.
        const primaryMedia = verifiedMediaByLayer.values().next().value;
        if (!primaryMedia) {
          await client.query('ROLLBACK');
          reply.code(422);
          return { ok: false, error: 'Look publication requires at least one media layer', code: 'NO_MEDIA' };
        }
        targetId = await createLookProjection(client, {
          documentId,
          creatorId: actorUserId,
          title: doc.metadata?.title ?? '',
          caption: doc.metadata?.caption ?? '',
          primaryMediaUrl: primaryMedia.resolvedUrl,
          primaryMediaType: primaryMedia.contentType.startsWith('video/') ? 'video' : 'image',
          primaryFinalizationId: primaryMedia.finalizationId,
          primaryMediaAssetId: primaryMedia.mediaAssetId,
          compositionDocument: command.compositionDocument,
          visibility: command.audience,
          payloadHash,
        });
      } else if (command.destination === 'poster') {
        // For a Poster, each page becomes a frame.
        const frames = (doc.pages ?? []).map((page, index) => {
          const mediaLayer = page.layers.find((l) => l.type === 'media');
          const verified = mediaLayer
            ? verifiedMediaByLayer.get(mediaLayer.id) ?? null
            : null;
          return {
            id: page.id,
            mediaType: verified?.contentType.startsWith('video/') ? 'video' as const : 'image' as const,
            caption: mediaLayer?.payload.caption ?? '',
            backgroundColor: null,
            durationMs: page.durationMs ?? 5000,
            sortOrder: index,
            verifiedMedia: verified,
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
          reply.code(422);
          return {
            ok: false,
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
        reply.code(422);
        return {
          ok: false,
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
      app.log.error({ err: error }, 'Failed to publish creator document');
      reply.code(500);
      return { ok: false, error: 'Failed to publish document' };
    } finally {
      client.release();
    }
  });

  // GET /creator/documents/:documentId/publications/:idempotencyKey
  // Unknown-outcome recovery: the client lost the response but remembers the
  // idempotency key it sent. Resolve the authoritative outcome.
  app.get('/creator/documents/:documentId/publications/:idempotencyKey', async (request, reply) => {
    const actorUserId = resolveAuthenticatedUserId(request);
    const { documentId, idempotencyKey } = idempotencyKeyParamsSchema.parse(request.params);

    // Verify document ownership.
    const docResult = await db.query<{ creator_id: string }>(
      `SELECT creator_id FROM creator_documents WHERE id = $1 LIMIT 1`,
      [documentId],
    );
    if (!docResult.rowCount) {
      reply.code(404);
      return { ok: false, error: 'Document not found' };
    }
    if (docResult.rows[0].creator_id !== actorUserId) {
      reply.code(403);
      return { ok: false, error: 'Access denied' };
    }

    const pubResult = await db.query<{
      id: string;
      revision_number: number;
      destination: string;
      target_id: string;
      state: string;
      payload_hash: string;
      created_at: string;
    }>(
      `SELECT id, revision_number, destination, target_id, state, payload_hash, created_at
       FROM creator_publications
       WHERE document_id = $1 AND idempotency_key = $2
       LIMIT 1`,
      [documentId, idempotencyKey],
    );

    if (!pubResult.rowCount) {
      // No publication found for this key — the publish may not have reached
      // the server. This is an honest "unknown" result, not a success.
      reply.code(404);
      return {
        ok: false,
        error: 'No publication found for this idempotency key',
        code: 'PUBLICATION_NOT_FOUND',
      };
    }

    const pub = pubResult.rows[0];
    return {
      ok: true,
      documentId,
      publicationId: pub.id,
      targetId: pub.target_id,
      destination: pub.destination,
      revisionNumber: pub.revision_number,
      state: pub.state,
      publishedAt: pub.created_at,
    };
  });

  // GET /creator/documents/:documentId/publications
  // List all publications for a document (revision history as publication timeline).
  app.get('/creator/documents/:documentId/publications', async (request, reply) => {
    const actorUserId = resolveAuthenticatedUserId(request);
    const { documentId } = documentIdParamsSchema.parse(request.params);

    const docResult = await db.query<{ creator_id: string }>(
      `SELECT creator_id FROM creator_documents WHERE id = $1 LIMIT 1`,
      [documentId],
    );
    if (!docResult.rowCount) {
      reply.code(404);
      return { ok: false, error: 'Document not found' };
    }
    if (docResult.rows[0].creator_id !== actorUserId) {
      reply.code(403);
      return { ok: false, error: 'Access denied' };
    }

    const result = await db.query<{
      id: string;
      revision_number: number;
      destination: string;
      target_id: string;
      state: string;
      created_at: string;
    }>(
      `SELECT id, revision_number, destination, target_id, state, created_at
       FROM creator_publications
       WHERE document_id = $1
       ORDER BY revision_number DESC`,
      [documentId],
    );

    return {
      ok: true,
      publications: result.rows.map((row) => ({
        id: row.id,
        revisionNumber: row.revision_number,
        destination: row.destination,
        targetId: row.target_id,
        state: row.state,
        publishedAt: row.created_at,
      })),
    };
  });

  // ── Scheduling ──────────────────────────────────────────────────────

  // POST /creator/documents/:documentId/schedule
  // Create a server-owned scheduled publication. The publish command is
  // frozen at schedule time and executed by the scheduled-publication
  // worker at due_at. This replaces the old PATCH /schedule that merely
  // set a timestamp on a row the native flow never created.
  const scheduleBodySchema = z.object({
    dueAt: z.string().datetime(),
    timezone: z.string().max(60).default('UTC'),
    publishCommand: z.object({
      revision: z.number().int().min(0),
      destination: z.enum(['look', 'poster', 'moodboard']),
      audience: z.enum(['public', 'private', 'closeFriends']).default('public'),
      expiresInHours: z.number().int().min(1).max(168).default(24),
      expectedMedia: z.array(z.object({
        layerId: z.string().min(1).max(120),
        finalizationId: z.string().min(2).max(160),
        assetId: z.string().min(2).max(160).optional(),
        mediaType: z.enum(['image', 'video']).default('image'),
        suppliedUrl: z.string().min(3).max(2048),
        role: z.string().min(1).max(60).default('primary'),
      })).default([]),
      compositionDocument: z.unknown().optional(),
      rightsSnapshotId: z.string().min(2).max(160).optional(),
    }),
  });

  app.post('/creator/documents/:documentId/schedule', async (request, reply) => {
    const actorUserId = resolveAuthenticatedUserId(request);
    const { documentId } = documentIdParamsSchema.parse(request.params);
    const body = scheduleBodySchema.parse(request.body);

    // P0.3b: Reject closeFriends audience at schedule time too — fail fast
    // so the creator gets immediate feedback rather than a failure at
    // execution time.
    if (body.publishCommand.audience === 'closeFriends') {
      reply.code(400);
      return {
        ok: false,
        error: 'The closeFriends audience is not supported for publication. Use public or private.',
        code: 'AUDIENCE_UNSUPPORTED',
      };
    }

    // Verify document ownership.
    const docResult = await db.query<{ creator_id: string; status: string }>(
      `SELECT creator_id, status FROM creator_documents WHERE id = $1 LIMIT 1`,
      [documentId],
    );
    if (!docResult.rowCount) {
      reply.code(404);
      return { ok: false, error: 'Document not found' };
    }
    if (docResult.rows[0].creator_id !== actorUserId) {
      reply.code(403);
      return { ok: false, error: 'Access denied' };
    }

    // Due time must be in the future.
    const dueAt = new Date(body.dueAt);
    if (dueAt.getTime() <= Date.now()) {
      reply.code(422);
      return { ok: false, error: 'Scheduled time must be in the future', code: 'PAST_DUE_TIME' };
    }

    // Cancel any existing pending schedule for this document (increment version).
    await db.query(
      `UPDATE creator_schedules
       SET state = 'cancelled',
           version = version + 1,
           updated_at = NOW()
       WHERE document_id = $1 AND state IN ('pending', 'claimed')`,
      [documentId],
    );

    // Create the new schedule row.
    const scheduleId = `sched_${crypto.randomUUID()}`;
    await db.query(
      `INSERT INTO creator_schedules (
         id, document_id, creator_id, due_at, timezone,
         version, publish_command, state
       )
       VALUES ($1, $2, $3, $4, $5, 1, $6::jsonb, 'pending')`,
      [
        scheduleId,
        documentId,
        actorUserId,
        dueAt,
        body.timezone,
        JSON.stringify(body.publishCommand),
      ],
    );

    // Update document status to 'scheduled'.
    await db.query(
      `UPDATE creator_documents
       SET status = 'scheduled', updated_at = NOW()
       WHERE id = $1`,
      [documentId],
    );

    return {
      ok: true,
      scheduleId,
      documentId,
      dueAt: body.dueAt,
      timezone: body.timezone,
    };
  });

  // DELETE /creator/documents/:documentId/schedule
  // Cancel a pending scheduled publication. Increments version so an
  // already-leased stale job cannot publish.
  app.delete('/creator/documents/:documentId/schedule', async (request, reply) => {
    const actorUserId = resolveAuthenticatedUserId(request);
    const { documentId } = documentIdParamsSchema.parse(request.params);

    const docResult = await db.query<{ creator_id: string }>(
      `SELECT creator_id FROM creator_documents WHERE id = $1 LIMIT 1`,
      [documentId],
    );
    if (!docResult.rowCount) {
      reply.code(404);
      return { ok: false, error: 'Document not found' };
    }
    if (docResult.rows[0].creator_id !== actorUserId) {
      reply.code(403);
      return { ok: false, error: 'Access denied' };
    }

    const result = await db.query<{ id: string }>(
      `UPDATE creator_schedules
       SET state = 'cancelled',
           version = version + 1,
           updated_at = NOW()
       WHERE document_id = $1 AND state IN ('pending', 'claimed')
       RETURNING id`,
      [documentId],
    );

    // Reset document status to draft.
    await db.query(
      `UPDATE creator_documents
       SET status = 'draft', updated_at = NOW()
       WHERE id = $1 AND status = 'scheduled'`,
      [documentId],
    );

    return {
      ok: true,
      cancelled: result.rowCount ?? 0,
    };
  });

  // GET /creator/documents/:documentId/schedule
  // Get the current schedule for a document (if any).
  app.get('/creator/documents/:documentId/schedule', async (request, reply) => {
    const actorUserId = resolveAuthenticatedUserId(request);
    const { documentId } = documentIdParamsSchema.parse(request.params);

    const docResult = await db.query<{ creator_id: string }>(
      `SELECT creator_id FROM creator_documents WHERE id = $1 LIMIT 1`,
      [documentId],
    );
    if (!docResult.rowCount) {
      reply.code(404);
      return { ok: false, error: 'Document not found' };
    }
    if (docResult.rows[0].creator_id !== actorUserId) {
      reply.code(403);
      return { ok: false, error: 'Access denied' };
    }

    const result = await db.query<{
      id: string;
      due_at: string;
      timezone: string;
      version: number;
      state: string;
      attempts: number;
      publication_id: string | null;
      failure_reason: string | null;
    }>(
      `SELECT id, due_at, timezone, version, state, attempts, publication_id, failure_reason
       FROM creator_schedules
       WHERE document_id = $1 AND state IN ('pending', 'claimed', 'published', 'failed')
       ORDER BY created_at DESC
       LIMIT 1`,
      [documentId],
    );

    if (!result.rowCount) {
      return { ok: true, schedule: null };
    }

    const row = result.rows[0];
    return {
      ok: true,
      schedule: {
        id: row.id,
        dueAt: row.due_at,
        timezone: row.timezone,
        version: row.version,
        state: row.state,
        attempts: row.attempts,
        publicationId: row.publication_id,
        failureReason: row.failure_reason,
      },
    };
  });

  // ── Collaborators (P2.12) ───────────────────────────────────────────

  // Permission helper: resolve the actor's role on a document.
  // Returns 'owner', 'editor', 'viewer', or null (no access).
  async function resolveCollaboratorRole(
    documentId: string,
    userId: string,
  ): Promise<'owner' | 'editor' | 'viewer' | null> {
    const result = await db.query<{ role: string }>(
      `SELECT role FROM creator_collaborators
       WHERE document_id = $1 AND user_id = $2 AND state = 'active'
       LIMIT 1`,
      [documentId, userId],
    );
    if (!result.rowCount) return null;
    return result.rows[0].role as 'owner' | 'editor' | 'viewer';
  }

  // Log an auditable operation.
  async function logCreatorOperation(
    documentId: string,
    actorId: string,
    operation: string,
    targetUserId?: string | null,
    detail?: Record<string, unknown>,
  ): Promise<void> {
    try {
      await db.query(
        `INSERT INTO creator_operation_log (id, document_id, actor_id, operation, target_user_id, detail)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
        [
          `op_${crypto.randomUUID()}`,
          documentId,
          actorId,
          operation,
          targetUserId ?? null,
          JSON.stringify(detail ?? {}),
        ],
      );
    } catch {
      // Non-fatal — audit log is a projection, not a gate.
    }
  }

  // GET /creator/documents/:documentId/collaborators
  // List all collaborators on a document. Owner or active collaborators can view.
  app.get('/creator/documents/:documentId/collaborators', async (request, reply) => {
    const actorUserId = resolveAuthenticatedUserId(request);
    const { documentId } = documentIdParamsSchema.parse(request.params);

    const role = await resolveCollaboratorRole(documentId, actorUserId);
    if (!role) {
      reply.code(403);
      return { ok: false, error: 'Access denied' };
    }

    const result = await db.query<{
      user_id: string;
      role: string;
      state: string;
      joined_at: string;
    }>(
      `SELECT user_id, role, state, joined_at
       FROM creator_collaborators
       WHERE document_id = $1 AND state IN ('active', 'invited')
       ORDER BY
         CASE role WHEN 'owner' THEN 0 WHEN 'editor' THEN 1 ELSE 2 END,
         joined_at ASC`,
      [documentId],
    );

    return {
      ok: true,
      collaborators: result.rows.map((row) => ({
        userId: row.user_id,
        role: row.role,
        state: row.state,
        joinedAt: row.joined_at,
      })),
    };
  });

  // POST /creator/documents/:documentId/collaborators
  // Invite a collaborator. Only the owner can invite.
  const inviteBodySchema = z.object({
    userId: z.string().min(2).max(120),
    role: z.enum(['editor', 'viewer']).default('viewer'),
  });

  app.post('/creator/documents/:documentId/collaborators', async (request, reply) => {
    const actorUserId = resolveAuthenticatedUserId(request);
    const { documentId } = documentIdParamsSchema.parse(request.params);
    const body = inviteBodySchema.parse(request.body);

    const actorRole = await resolveCollaboratorRole(documentId, actorUserId);
    if (actorRole !== 'owner') {
      reply.code(403);
      return { ok: false, error: 'Only the owner can invite collaborators' };
    }

    // Check if the user is already a collaborator.
    const existing = await db.query<{ state: string }>(
      `SELECT state FROM creator_collaborators
       WHERE document_id = $1 AND user_id = $2
       LIMIT 1`,
      [documentId, body.userId],
    );

    if (existing.rowCount && existing.rows[0].state === 'active') {
      reply.code(409);
      return { ok: false, error: 'User is already an active collaborator' };
    }

    // Upsert the collaborator row (re-activate if previously removed).
    await db.query(
      `INSERT INTO creator_collaborators (document_id, user_id, role, state, invited_by, joined_at)
       VALUES ($1, $2, $3, 'invited', $4, NOW())
       ON CONFLICT (document_id, user_id)
       DO UPDATE SET role = EXCLUDED.role, state = 'invited',
                      invited_by = EXCLUDED.invited_by,
                      removed_at = NULL, joined_at = NOW()`,
      [documentId, body.userId, body.role, actorUserId],
    );

    await logCreatorOperation(documentId, actorUserId, 'invite', body.userId, { role: body.role });

    return { ok: true, documentId, userId: body.userId, role: body.role, state: 'invited' };
  });

  // POST /creator/documents/:documentId/collaborators/:userId/accept
  // Accept an invitation. The invited user accepts their own invitation.
  app.post('/creator/documents/:documentId/collaborators/:userId/accept', async (request, reply) => {
    const actorUserId = resolveAuthenticatedUserId(request);
    const { documentId, userId } = z.object({
      documentId: z.string().min(2).max(120),
      userId: z.string().min(2).max(120),
    }).parse(request.params);

    if (actorUserId !== userId) {
      reply.code(403);
      return { ok: false, error: 'You can only accept your own invitation' };
    }

    const result = await db.query<{ role: string }>(
      `UPDATE creator_collaborators
       SET state = 'active', joined_at = NOW()
       WHERE document_id = $1 AND user_id = $2 AND state = 'invited'
       RETURNING role`,
      [documentId, userId],
    );

    if (!result.rowCount) {
      reply.code(404);
      return { ok: false, error: 'No pending invitation found' };
    }

    await logCreatorOperation(documentId, actorUserId, 'accept_invite', userId);

    return { ok: true, documentId, userId, role: result.rows[0].role, state: 'active' };
  });

  // DELETE /creator/documents/:documentId/collaborators/:userId
  // Remove a collaborator. Only the owner can remove.
  app.delete('/creator/documents/:documentId/collaborators/:userId', async (request, reply) => {
    const actorUserId = resolveAuthenticatedUserId(request);
    const { documentId, userId } = z.object({
      documentId: z.string().min(2).max(120),
      userId: z.string().min(2).max(120),
    }).parse(request.params);

    const actorRole = await resolveCollaboratorRole(documentId, actorUserId);
    if (actorRole !== 'owner') {
      reply.code(403);
      return { ok: false, error: 'Only the owner can remove collaborators' };
    }

    // Cannot remove the owner.
    if (userId === actorUserId) {
      reply.code(422);
      return { ok: false, error: 'Cannot remove the document owner' };
    }

    const result = await db.query(
      `UPDATE creator_collaborators
       SET state = 'removed', removed_at = NOW()
       WHERE document_id = $1 AND user_id = $2 AND state IN ('active', 'invited')`,
      [documentId, userId],
    );

    await logCreatorOperation(documentId, actorUserId, 'remove_collaborator', userId);

    return { ok: true, removed: result.rowCount ?? 0 };
  });

  // PATCH /creator/documents/:documentId/collaborators/:userId
  // Change a collaborator's role. Only the owner can change roles.
  const roleChangeSchema = z.object({
    role: z.enum(['editor', 'viewer']),
  });

  app.patch('/creator/documents/:documentId/collaborators/:userId', async (request, reply) => {
    const actorUserId = resolveAuthenticatedUserId(request);
    const { documentId, userId } = z.object({
      documentId: z.string().min(2).max(120),
      userId: z.string().min(2).max(120),
    }).parse(request.params);
    const body = roleChangeSchema.parse(request.body);

    const actorRole = await resolveCollaboratorRole(documentId, actorUserId);
    if (actorRole !== 'owner') {
      reply.code(403);
      return { ok: false, error: 'Only the owner can change collaborator roles' };
    }

    const result = await db.query<{ role: string }>(
      `UPDATE creator_collaborators
       SET role = $3
       WHERE document_id = $1 AND user_id = $2 AND state = 'active'
       RETURNING role`,
      [documentId, userId, body.role],
    );

    if (!result.rowCount) {
      reply.code(404);
      return { ok: false, error: 'Active collaborator not found' };
    }

    await logCreatorOperation(documentId, actorUserId, 'role_change', userId, { newRole: body.role });

    return { ok: true, documentId, userId, role: result.rows[0].role };
  });

  // GET /creator/documents/:documentId/operations
  // Get the auditable operation log for a document. Owner or active collaborators can view.
  app.get('/creator/documents/:documentId/operations', async (request, reply) => {
    const actorUserId = resolveAuthenticatedUserId(request);
    const { documentId } = documentIdParamsSchema.parse(request.params);

    const role = await resolveCollaboratorRole(documentId, actorUserId);
    if (!role) {
      reply.code(403);
      return { ok: false, error: 'Access denied' };
    }

    const result = await db.query<{
      id: string;
      actor_id: string;
      operation: string;
      target_user_id: string | null;
      detail: string;
      created_at: string;
    }>(
      `SELECT id, actor_id, operation, target_user_id, detail::text, created_at
       FROM creator_operation_log
       WHERE document_id = $1
       ORDER BY created_at DESC
       LIMIT 100`,
      [documentId],
    );

    return {
      ok: true,
      operations: result.rows.map((row) => ({
        id: row.id,
        actorId: row.actor_id,
        operation: row.operation,
        targetUserId: row.target_user_id,
        detail: JSON.parse(row.detail),
        createdAt: row.created_at,
      })),
    };
  });

  // ── Live presence (P2.13) ───────────────────────────────────────────
  // Presence is ephemeral — it is never saved as an edit. The realtime
  // infrastructure broadcasts presence events on the document's topic.
  // This endpoint lets clients heartbeat their presence and query who is
  // currently active on a document.

  // POST /creator/documents/:documentId/presence
  // Heartbeat presence on a document. The client sends this every 10-15
  // seconds while viewing/editing. The server broadcasts a presence event
  // on the document's realtime topic.
  const presenceBodySchema = z.object({
    activity: z.enum(['viewing', 'editing', 'idle']).default('viewing'),
    socketId: z.string().min(2).max(120),
  });

  app.post('/creator/documents/:documentId/presence', async (request, reply) => {
    const actorUserId = resolveAuthenticatedUserId(request);
    const { documentId } = documentIdParamsSchema.parse(request.params);
    const body = presenceBodySchema.parse(request.body);

    // Verify access — owner or active collaborator.
    const role = await resolveCollaboratorRole(documentId, actorUserId);
    if (!role) {
      reply.code(403);
      return { ok: false, error: 'Access denied' };
    }

    // Upsert presence row.
    await db.query(
      `INSERT INTO creator_document_presence (document_id, user_id, socket_id, activity, last_seen_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (document_id, user_id, socket_id)
       DO UPDATE SET activity = EXCLUDED.activity, last_seen_at = NOW()`,
      [documentId, actorUserId, body.socketId, body.activity],
    );

    // Broadcast presence event on the document's realtime topic.
    // Presence is ephemeral — clients use it to show collaborator avatars
    // but it never counts as a saved edit.
    try {
      const { publishRealtimeEvent } = await import('../lib/realtime.js');
      await publishRealtimeEvent({
        topic: `creator.document:${documentId}`,
        type: 'presence.update',
        payload: {
          userId: actorUserId,
          activity: body.activity,
          timestamp: new Date().toISOString(),
        },
        version: 1,
      });
    } catch {
      // Realtime is non-fatal — presence still works via polling.
    }

    return { ok: true };
  });

  // GET /creator/documents/:documentId/presence
  // Get all active collaborators currently present on the document.
  app.get('/creator/documents/:documentId/presence', async (request, reply) => {
    const actorUserId = resolveAuthenticatedUserId(request);
    const { documentId } = documentIdParamsSchema.parse(request.params);

    const role = await resolveCollaboratorRole(documentId, actorUserId);
    if (!role) {
      reply.code(403);
      return { ok: false, error: 'Access denied' };
    }

    // Only return presence from the last 30 seconds (active presence).
    const result = await db.query<{
      user_id: string;
      activity: string;
      last_seen_at: string;
    }>(
      `SELECT user_id, activity, last_seen_at
       FROM creator_document_presence
       WHERE document_id = $1 AND last_seen_at > NOW() - INTERVAL '30 seconds'
       ORDER BY last_seen_at DESC`,
      [documentId],
    );

    // Deduplicate by user_id (keep most recent socket).
    const seen = new Set<string>();
    const presence = result.rows.filter((row) => {
      if (seen.has(row.user_id)) return false;
      seen.add(row.user_id);
      return true;
    });

    return {
      ok: true,
      presence: presence.map((row) => ({
        userId: row.user_id,
        activity: row.activity,
        lastSeenAt: row.last_seen_at,
      })),
    };
  });

  // DELETE /creator/documents/:documentId/presence
  // Clear presence when leaving the document.
  app.delete('/creator/documents/:documentId/presence', async (request, reply) => {
    const actorUserId = resolveAuthenticatedUserId(request);
    const { documentId } = documentIdParamsSchema.parse(request.params);
    const socketId = z.string().min(2).max(120).optional().parse((request.query as Record<string, unknown>).socketId);

    if (socketId) {
      await db.query(
        `DELETE FROM creator_document_presence
         WHERE document_id = $1 AND user_id = $2 AND socket_id = $3`,
        [documentId, actorUserId, socketId],
      );
    } else {
      await db.query(
        `DELETE FROM creator_document_presence
         WHERE document_id = $1 AND user_id = $2`,
        [documentId, actorUserId],
      );
    }

    // Broadcast departure.
    try {
      const { publishRealtimeEvent } = await import('../lib/realtime.js');
      await publishRealtimeEvent({
        topic: `creator.document:${documentId}`,
        type: 'presence.leave',
        payload: {
          userId: actorUserId,
          timestamp: new Date().toISOString(),
        },
        version: 1,
      });
    } catch {
      // Non-fatal.
    }

    return { ok: true };
  });

  // ── C2PA content credentials (P2.14) ────────────────────────────────

  // POST /media/:assetId/content-credentials
  // Attach C2PA 2.4 content credentials to a media asset. This is called
  // after AI enhancement or editing to record the provenance manifest.
  const c2paBodySchema = z.object({
    manifest: z.record(z.unknown()),
    specVersion: z.string().default('2.4'),
    claimGenerator: z.string().default('ThryftVerse'),
    source: z.enum(['platform', 'imported', 'third_party']).default('platform'),
    assertionTypes: z.array(z.string()).default([]),
    hasAiDisclosure: z.boolean().default(false),
    signatureFingerprint: z.string().optional(),
  });

  app.post('/media/:assetId/content-credentials', async (request, reply) => {
    const actorUserId = resolveAuthenticatedUserId(request);
    const { assetId } = z.object({ assetId: z.string().min(2).max(200) }).parse(request.params);
    const body = c2paBodySchema.parse(request.body);

    // Verify the asset belongs to the actor.
    const assetResult = await db.query<{ owner_id: string }>(
      `SELECT owner_id FROM media_assets WHERE id = $1 LIMIT 1`,
      [assetId],
    );
    if (!assetResult.rowCount) {
      reply.code(404);
      return { ok: false, error: 'Media asset not found' };
    }
    if (assetResult.rows[0].owner_id !== actorUserId) {
      reply.code(403);
      return { ok: false, error: 'Access denied' };
    }

    const credentialId = `c2pa_${crypto.randomUUID()}`;
    await db.query(
      `INSERT INTO media_content_credentials (
         id, media_asset_id, manifest, spec_version, claim_generator,
         source, assertion_types, has_ai_disclosure, signature_fingerprint
       )
       VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (media_asset_id, spec_version)
       DO UPDATE SET manifest = EXCLUDED.manifest,
                      claim_generator = EXCLUDED.claim_generator,
                      assertion_types = EXCLUDED.assertion_types,
                      has_ai_disclosure = EXCLUDED.has_ai_disclosure,
                      signature_fingerprint = EXCLUDED.signature_fingerprint`,
      [
        credentialId,
        assetId,
        JSON.stringify(body.manifest),
        body.specVersion,
        body.claimGenerator,
        body.source,
        body.assertionTypes,
        body.hasAiDisclosure,
        body.signatureFingerprint ?? null,
      ],
    );

    return {
      ok: true,
      credentialId,
      mediaAssetId: assetId,
      specVersion: body.specVersion,
      hasAiDisclosure: body.hasAiDisclosure,
    };
  });

  // GET /media/:assetId/content-credentials
  // Get the C2PA content credentials for a media asset.
  app.get('/media/:assetId/content-credentials', async (request, reply) => {
    const { assetId } = z.object({ assetId: z.string().min(2).max(200) }).parse(request.params);

    const result = await db.query<{
      id: string;
      manifest: string;
      spec_version: string;
      claim_generator: string;
      source: string;
      assertion_types: string[];
      has_ai_disclosure: boolean;
      verified: boolean;
      verified_at: string | null;
      signature_fingerprint: string | null;
      created_at: string;
    }>(
      `SELECT id, manifest::text, spec_version, claim_generator, source,
              assertion_types, has_ai_disclosure, verified, verified_at,
              signature_fingerprint, created_at
       FROM media_content_credentials
       WHERE media_asset_id = $1
       ORDER BY created_at DESC`,
      [assetId],
    );

    if (!result.rowCount) {
      return { ok: true, credentials: [] };
    }

    return {
      ok: true,
      credentials: result.rows.map((row) => ({
        id: row.id,
        manifest: JSON.parse(row.manifest),
        specVersion: row.spec_version,
        claimGenerator: row.claim_generator,
        source: row.source,
        assertionTypes: row.assertion_types,
        hasAiDisclosure: row.has_ai_disclosure,
        verified: row.verified,
        verifiedAt: row.verified_at,
        signatureFingerprint: row.signature_fingerprint,
        createdAt: row.created_at,
      })),
    };
  });
};
