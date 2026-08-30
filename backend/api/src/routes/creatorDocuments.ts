import crypto from "node:crypto";
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import { appendDomainEvent } from '../lib/domainOutbox.js';

type CreatorDocumentsRouteDependencies = {
  app: FastifyInstance;
  db: Pool;
  resolveAuthenticatedUserId: (request: FastifyRequest) => string;
};

// ── Canonical JSON serialisation ─────────────────────────────────────
// Produces a stable string with object keys sorted recursively so the
// SHA-256 digest is independent of property enumeration order. Both the
// save and publish endpoints use this so the document hash is consistent
// across the lifecycle.

function canonicalizeValue(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(canonicalizeValue);
  const sortedKeys = Object.keys(value as Record<string, unknown>).sort();
  const result: Record<string, unknown> = {};
  for (const key of sortedKeys) {
    const v = (value as Record<string, unknown>)[key];
    if (v !== undefined) {
      result[key] = canonicalizeValue(v);
    }
  }
  return result;
}

function canonicalizeJson(value: unknown): string {
  return JSON.stringify(canonicalizeValue(value));
}

// ── Layer payload schemas (parity with frontend composition.ts) ──────

// Effect node — a single adjustment/filter step in a media layer's effect stack.
const EffectNodeSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('filter'),
    id: z.string(),
    amount: z.number(),
  }),
  z.object({
    type: z.literal('adjust'),
    exposure: z.number().optional(),
    contrast: z.number().optional(),
    highlights: z.number().optional(),
    shadows: z.number().optional(),
    saturation: z.number().optional(),
    temperature: z.number().optional(),
    tint: z.number().optional(),
    fade: z.number().optional(),
    vignette: z.number().optional(),
    sharpness: z.number().optional(),
  }),
  z.object({
    type: z.literal('blur'),
    radius: z.number(),
  }),
  z.object({
    type: z.literal('vignette'),
    amount: z.number(),
  }),
]);

// Structured RGBA color (CreatorColor)
const ColorSchema = z.object({
  space: z.literal('srgb'),
  r: z.number().min(0).max(1),
  g: z.number().min(0).max(1),
  b: z.number().min(0).max(1),
  a: z.number().min(0).max(1).default(1),
});

const TextLayerPayloadSchema = z.object({
  text: z.string().min(1).max(500),
  textStyle: z.enum(['headline', 'editorial', 'clean', 'compact', 'handwritten', 'bubble', 'deco', 'poster', 'squeeze', 'signature']).default('clean'),
  // Canonical fill as structured RGBA
  fill: ColorSchema.optional(),
  // Backward compat: legacy textColor string
  textColor: z.string().optional(),
  // Background/pill with real color + padding + radius
  background: z.object({
    color: ColorSchema,
    radius: z.number().min(0).default(4),
    paddingX: z.number().min(0).default(8),
    paddingY: z.number().min(0).default(4),
  }).optional(),
  // Backward compat: legacy backgroundColor string
  backgroundColor: z.string().optional(),
  // Stroke (outline)
  stroke: z.object({
    color: ColorSchema,
    width: z.number().min(0).max(20).default(2),
  }).optional(),
  // Shadow
  shadow: z.object({
    color: ColorSchema,
    blur: z.number().min(0).max(30).default(4),
    offsetX: z.number().default(0),
    offsetY: z.number().default(2),
  }).optional(),
  // Backward compat: legacy textEffect enum
  textEffect: z.enum(['none', 'shadow', 'neon', 'outline', 'glow']).optional(),
  // Typography
  fontFamilyId: z.string().optional(),
  fontWeight: z.union([z.string(), z.number()]).optional(),
  italic: z.boolean().optional(),
  underline: z.boolean().optional(),
  letterSpacing: z.number().optional(),
  lineHeight: z.number().min(0.8).max(3).optional(),
  alignment: z.enum(['left', 'center', 'right', 'justify']).default('center'),
  opacity: z.number().min(0).max(1).default(1),
  textAnimation: z.enum(['none', 'typewriter', 'bounce', 'fade', 'slide']).optional(),
  // Animation timing for text layer entrance
  animation: z.object({
    type: z.enum(['fade', 'rise', 'type', 'pop', 'slide']),
    durationMs: z.number().min(0),
    delayMs: z.number().min(0).optional(),
  }).optional(),
});

const MediaLayerPayloadSchema = z.object({
  mediaUri: z.string(),
  // Durable upload evidence
  mediaFinalizationId: z.string().optional(),
  mediaAssetId: z.string().optional(),
  mediaType: z.enum(['image', 'video']).default('image'),
  contentFit: z.enum(['cover', 'contain', 'fill']).default('cover'),
  thumbnailUri: z.string().optional(),
  thumbnailFinalizationId: z.string().optional(),
  thumbnailMediaAssetId: z.string().optional(),
  videoDurationMs: z.number().nullable().optional(),
  filterId: z.string().optional(),
  // Timeline operations
  trimStartMs: z.number().min(0).optional(),
  trimEndMs: z.number().min(0).optional(),
  opacity: z.number().min(0).max(1).default(1),
  speed: z.number().min(0.25).max(4).optional(),
  volume: z.number().min(0).max(1).optional(),
  // Variable speed curve
  speedCurve: z.object({
    points: z.array(z.object({
      id: z.string(),
      position: z.number().min(0).max(1),
      speed: z.number().min(0.01).max(4),
    })),
    easing: z.enum(['linear', 'smooth', 'hold']),
  }).optional(),
  // Reverse playback
  reversed: z.boolean().optional(),
  // Freeze frame
  freezeFrameMs: z.number().min(0).optional(),
  freezeDurationMs: z.number().min(0).max(10000).optional(),
  // Effect stack
  effects: z.array(EffectNodeSchema).optional(),
});

const ProductLayerPayloadSchema = z.object({
  listingId: z.string().min(1),
  snapshotTitle: z.string().default(''),
  snapshotImageUrl: z.string().optional(),
  snapshotMediaFinalizationId: z.string().optional(),
  snapshotMediaAssetId: z.string().optional(),
  snapshotPriceGbp: z.number().optional(),
  availability: z.enum(['active', 'sold', 'deleted']).default('active'),
  hotspotLabel: z.string().optional(),
});

const MentionLayerPayloadSchema = z.object({
  userId: z.string().min(1),
  username: z.string().min(1),
});

const LookLayerPayloadSchema = z.object({
  lookId: z.string().min(1),
  snapshotCaption: z.string().default(''),
  snapshotImageUrl: z.string().optional(),
  snapshotMediaFinalizationId: z.string().optional(),
  snapshotMediaAssetId: z.string().optional(),
});

const VoteLayerPayloadSchema = z.object({
  question: z.string().min(1).max(100),
  options: z.array(z.object({ id: z.string(), label: z.string().min(1).max(50) })).length(2),
});

const QuizLayerPayloadSchema = z.object({
  question: z.string().min(1).max(100),
  options: z.array(z.object({ id: z.string(), label: z.string().min(1).max(50) })).min(2).max(4),
  correctOptionId: z.string(),
});

const QuestionLayerPayloadSchema = z.object({
  prompt: z.string().min(1).max(200),
  placeholder: z.string().max(100).optional(),
});

const EmojiSliderLayerPayloadSchema = z.object({
  question: z.string().min(1).max(100),
  emoji: z.string().default('😍'),
});

const CountdownLayerPayloadSchema = z.object({
  label: z.string().max(50).optional(),
  endDateTime: z.string(),
  endLabel: z.string().max(50).optional(),
});

const DrawLayerPayloadSchema = z.object({
  strokes: z.array(z.object({
    points: z.array(z.object({ x: z.number(), y: z.number() })),
    color: z.string().default('#ffffff'),
    width: z.number().min(1).max(50).default(4),
    opacity: z.number().min(0).max(1).default(1),
  })),
  width: z.number().min(1).default(1080),
  height: z.number().min(1).default(1920),
});

const GifLayerPayloadSchema = z.object({
  gifUri: z.string(),
  stickerId: z.string().optional(),
});

const MusicLayerPayloadSchema = z.object({
  trackId: z.string().min(1),
  trackName: z.string().max(120).optional(),
  artistName: z.string().max(120).optional(),
  artworkUrl: z.string().optional(),
  previewUrl: z.string().optional(),
  startTimeMs: z.number().min(0).optional(),
  durationMs: z.number().min(0).optional(),
  volume: z.number().min(0).max(1).default(1),
});

const LinkLayerPayloadSchema = z.object({
  url: z.string().url(),
  title: z.string().max(200).optional(),
  description: z.string().max(300).optional(),
  imageUrl: z.string().optional(),
});

const LocationLayerPayloadSchema = z.object({
  name: z.string().min(1).max(120),
  lat: z.number().optional(),
  lng: z.number().optional(),
  placeId: z.string().optional(),
});

const HashtagLayerPayloadSchema = z.object({
  tag: z.string().min(1).max(100),
});

const DecorativeLayerPayloadSchema = z.object({
  shape: z.enum(['circle', 'square', 'line', 'arrow', 'star', 'heart']),
  color: z.string().default('#ffffff'),
  opacity: z.number().min(0).max(1).default(1),
});

const BaseLayerSchema = z.object({
  id: z.string().min(1),
  x: z.number().min(-0.5).max(1.5).default(0.5),
  y: z.number().min(-0.5).max(1.5).default(0.5),
  width: z.number().min(0.05).max(2).default(0.4),
  height: z.number().min(0.05).max(2).default(0.4),
  scale: z.number().min(0.2).max(5).default(1),
  rotation: z.number().min(-360).max(360).default(0),
  zIndex: z.number().int().default(0),
  locked: z.boolean().default(false),
  hidden: z.boolean().default(false),
  opacity: z.number().min(0).max(1).default(1),
});

const CreatorLayerSchema = z.discriminatedUnion('type', [
  BaseLayerSchema.extend({ type: z.literal('media'), payload: MediaLayerPayloadSchema }),
  BaseLayerSchema.extend({ type: z.literal('text'), payload: TextLayerPayloadSchema }),
  BaseLayerSchema.extend({ type: z.literal('product'), payload: ProductLayerPayloadSchema }),
  BaseLayerSchema.extend({ type: z.literal('mention'), payload: MentionLayerPayloadSchema }),
  BaseLayerSchema.extend({ type: z.literal('look'), payload: LookLayerPayloadSchema }),
  BaseLayerSchema.extend({ type: z.literal('vote'), payload: VoteLayerPayloadSchema }),
  BaseLayerSchema.extend({ type: z.literal('quiz'), payload: QuizLayerPayloadSchema }),
  BaseLayerSchema.extend({ type: z.literal('question'), payload: QuestionLayerPayloadSchema }),
  BaseLayerSchema.extend({ type: z.literal('emojiSlider'), payload: EmojiSliderLayerPayloadSchema }),
  BaseLayerSchema.extend({ type: z.literal('countdown'), payload: CountdownLayerPayloadSchema }),
  BaseLayerSchema.extend({ type: z.literal('decorative'), payload: DecorativeLayerPayloadSchema }),
  BaseLayerSchema.extend({ type: z.literal('draw'), payload: DrawLayerPayloadSchema }),
  BaseLayerSchema.extend({ type: z.literal('gif'), payload: GifLayerPayloadSchema }),
  BaseLayerSchema.extend({ type: z.literal('music'), payload: MusicLayerPayloadSchema }),
  BaseLayerSchema.extend({ type: z.literal('link'), payload: LinkLayerPayloadSchema }),
  BaseLayerSchema.extend({ type: z.literal('location'), payload: LocationLayerPayloadSchema }),
  BaseLayerSchema.extend({ type: z.literal('hashtag'), payload: HashtagLayerPayloadSchema }),
]);

const CreatorPageSchema = z.object({
  id: z.string().min(1).max(120),
  durationMs: z.number().int().min(500).max(60_000).optional(),
  layers: z.array(CreatorLayerSchema).default([]),
});

const creatorDocumentBodySchema = z.object({
  id: z.string().min(2).max(120),
  type: z.enum(['look', 'poster']),
  version: z.number().int().min(1).max(10),
  canvas: z.object({
    aspectRatio: z.number().min(0.3).max(3),
    background: z.object({
      type: z.enum(['color', 'gradient', 'image']),
      value: z.string().max(500),
    }),
  }),
  pages: z.array(CreatorPageSchema).min(1).max(10),
  metadata: z.object({
    title: z.string().max(120).default(''),
    caption: z.string().max(2200).default(''),
    visibility: z.enum(['public', 'private', 'closeFriends']).default('public'),
    allowReplies: z.boolean().default(true),
    allowReactions: z.boolean().default(true),
    expiresInHours: z.number().int().min(1).max(168).optional(),
    accessibilityDescription: z.string().max(300).optional(),
    allowRemix: z.boolean().default(false),
    sourceDocumentId: z.string().max(120).optional(),
    sourceCreatorId: z.string().max(120).optional(),
  }),
  // Server-owned timestamps — optional in the request body so the client
  // never reconstructs authoritative metadata from new Date(). The server
  // injects createdAt (preserved across updates) and updatedAt (this commit).
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

const documentIdParamsSchema = z.object({
  documentId: z.string().min(2).max(120),
});

const remixBodySchema = z.object({
  newDocumentId: z.string().min(2).max(120),
});

const publishBodySchema = z.object({
  idempotencyKey: z.string().trim().min(8).max(160).optional(),
});

function parseIfMatchVersion(request: FastifyRequest): number | null {
  const raw = Array.isArray(request.headers['if-match'])
    ? request.headers['if-match'][0]
    : request.headers['if-match'];
  if (!raw) {
    return null;
  }
  const normalized = raw.trim().replace(/^W\//, '').replace(/^"|"$/g, '');
  const value = Number(normalized);
  return Number.isInteger(value) && value > 0 ? value : null;
}

const LOCAL_URI_PREFIXES = ['file://', 'ph://', 'asset://', 'data:', 'content://', 'assets-library://'];

function isLocalUri(uri: string): boolean {
  return LOCAL_URI_PREFIXES.some((prefix) => uri.startsWith(prefix));
}

function validateForPublish(doc: z.infer<typeof creatorDocumentBodySchema>): string[] {
  const errors: string[] = [];

  if (doc.pages.length === 0) {
    errors.push('Document must have at least one page');
  }

  if (doc.type === 'look' && doc.pages.length !== 1) {
    errors.push('Look documents must have exactly one page');
  }

  if (doc.pages.length > 10) {
    errors.push('Documents cannot have more than 10 pages');
  }

  for (const page of doc.pages) {
    for (const layer of page.layers) {
      if (layer.type === 'media') {
        if (isLocalUri(layer.payload.mediaUri)) {
          errors.push(`Layer ${layer.id}: mediaUri is a local URI — must be uploaded before publish`);
        }
        if (layer.payload.thumbnailUri && isLocalUri(layer.payload.thumbnailUri)) {
          errors.push(`Layer ${layer.id}: thumbnailUri is a local URI — must be uploaded before publish`);
        }
      }
      if (layer.type === 'product' && layer.payload.snapshotImageUrl) {
        if (isLocalUri(layer.payload.snapshotImageUrl)) {
          errors.push(`Layer ${layer.id}: product snapshotImageUrl is a local URI`);
        }
      }
      if (layer.type === 'look' && layer.payload.snapshotImageUrl) {
        if (isLocalUri(layer.payload.snapshotImageUrl)) {
          errors.push(`Layer ${layer.id}: look snapshotImageUrl is a local URI`);
        }
      }
    }
  }

  if (doc.type === 'look') {
    const hasMedia = doc.pages[0]?.layers.some((l) => l.type === 'media') ?? false;
    if (!hasMedia) {
      errors.push('Look documents must contain at least one media layer');
    }
  }

  if (doc.type === 'poster') {
    for (const page of doc.pages) {
      const hasContent = page.layers.some((l) => l.type === 'media' || l.type === 'text');
      if (!hasContent) {
        errors.push(`Page ${page.id}: must contain at least one media or text layer`);
      }
    }
  }

  return errors;
}

export const registerCreatorDocumentRoutes = ({
  app,
  db,
  resolveAuthenticatedUserId,
}: CreatorDocumentsRouteDependencies) => {
  app.post('/creator/documents', async (request, reply) => {
    const actorUserId = resolveAuthenticatedUserId(request);
    const payload = creatorDocumentBodySchema.parse(request.body);

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const existing = await client.query<{
        creator_id: string;
        status: string;
        lock_version: number;
        created_at: Date;
      }>(
        `SELECT creator_id, status, lock_version, created_at
         FROM creator_documents
         WHERE id = $1
         LIMIT 1
         FOR UPDATE`,
        [payload.id]
      );

      if (existing.rowCount && existing.rows[0].creator_id !== actorUserId) {
        await client.query('ROLLBACK');
        reply.code(403);
        return { ok: false, error: 'Document belongs to another user' };
      }

      // ── Server-owned canonical timestamps ────────────────────────
      // The server injects createdAt/updatedAt so the client never
      // reconstructs authoritative metadata from new Date(). createdAt
      // is preserved across updates; updatedAt always reflects this commit.
      const now = new Date();
      const createdAt = existing.rowCount && existing.rows[0].created_at
        ? new Date(existing.rows[0].created_at).toISOString()
        : now.toISOString();
      const canonicalDoc = { ...payload, createdAt, updatedAt: now.toISOString() };
      const documentJson = JSON.stringify(canonicalDoc);
      const documentHash = crypto
        .createHash('sha256')
        .update(canonicalizeJson(canonicalDoc))
        .digest('hex');

      let serverVersion = 1;
      let headRevision = 0;
      if (existing.rowCount) {
        if (existing.rows[0].status !== 'draft') {
          await client.query('ROLLBACK');
          reply.code(409);
          return {
            ok: false,
            error: 'Published or archived documents are immutable; create a new draft',
            code: 'CREATOR_DOCUMENT_IMMUTABLE',
          };
        }
        const expectedVersion = parseIfMatchVersion(request);
        if (expectedVersion === null) {
          await client.query('ROLLBACK');
          reply.code(428);
          return {
            ok: false,
            error: 'If-Match with the current server version is required',
            code: 'CREATOR_DOCUMENT_VERSION_REQUIRED',
            serverVersion: existing.rows[0].lock_version,
          };
        }
        if (expectedVersion !== existing.rows[0].lock_version) {
          await client.query('ROLLBACK');
          reply.code(409);
          return {
            ok: false,
            error: 'The document changed on another device',
            code: 'CREATOR_DOCUMENT_VERSION_CONFLICT',
            serverVersion: existing.rows[0].lock_version,
          };
        }
        const updated = await client.query<{ lock_version: number; head_revision: number }>(
          `UPDATE creator_documents
           SET type = $3,
               version = $4,
               document_json = $5,
               lock_version = lock_version + 1,
               updated_at = NOW()
           WHERE id = $1 AND creator_id = $2 AND status = 'draft' AND lock_version = $6
           RETURNING lock_version, head_revision`,
          [
            payload.id,
            actorUserId,
            payload.type,
            payload.version,
            documentJson,
            expectedVersion,
          ],
        );
        if (!updated.rowCount) {
          await client.query('ROLLBACK');
          reply.code(409);
          return {
            ok: false,
            error: 'The document changed while it was being saved',
            code: 'CREATOR_DOCUMENT_VERSION_CONFLICT',
          };
        }
        serverVersion = updated.rows[0].lock_version;
        headRevision = updated.rows[0].head_revision;
      } else {
        const inserted = await client.query<{ lock_version: number; head_revision: number }>(
          `INSERT INTO creator_documents (
             id, creator_id, type, version, document_json, lock_version, updated_at
           )
           VALUES ($1, $2, $3, $4, $5, 1, NOW())
           RETURNING lock_version, head_revision`,
          [payload.id, actorUserId, payload.type, payload.version, documentJson],
        );
        serverVersion = inserted.rows[0].lock_version;
        headRevision = inserted.rows[0].head_revision;
      }

      await client.query('COMMIT');
      return {
        ok: true,
        documentId: payload.id,
        serverVersion,
        documentHash,
        headRevision,
        etag: String(serverVersion),
        updatedAt: now.toISOString(),
      };
    } catch (error) {
      await client.query('ROLLBACK');
      app.log.error({ err: error }, 'Failed to save creator document');
      reply.code(500);
      return { ok: false, error: 'Failed to save document' };
    } finally {
      client.release();
    }
  });

  app.get('/creator/documents', async (request) => {
    const actorUserId = resolveAuthenticatedUserId(request);

    const result = await db.query<{
      id: string;
      type: string;
      document_json: string;
      status: string;
      lock_version: number;
      updated_at: string;
    }>(
      `SELECT id, type, document_json, status, lock_version, updated_at
       FROM creator_documents
       WHERE creator_id = $1
       ORDER BY updated_at DESC
       LIMIT 100`,
      [actorUserId]
    );

    const documents = result.rows.map((row) => ({
      ...JSON.parse(row.document_json),
      status: row.status,
      serverVersion: row.lock_version,
      serverUpdatedAt: row.updated_at,
    }));

    return { ok: true, documents };
  });

  app.get('/creator/documents/:documentId', async (request, reply) => {
    const actorUserId = resolveAuthenticatedUserId(request);
    const { documentId } = documentIdParamsSchema.parse(request.params);

    const result = await db.query<{
      id: string;
      creator_id: string;
      document_json: string;
      status: string;
      lock_version: number;
      head_revision: number;
      updated_at: string;
    }>(
      `SELECT id, creator_id, document_json, status, lock_version, head_revision, updated_at
       FROM creator_documents
       WHERE id = $1 LIMIT 1`,
      [documentId]
    );

    if (!result.rowCount) {
      reply.code(404);
      return { ok: false, error: 'Document not found' };
    }

    if (result.rows[0].creator_id !== actorUserId) {
      reply.code(403);
      return { ok: false, error: 'Access denied' };
    }

    const storedDoc = JSON.parse(result.rows[0].document_json);
    const documentHash = crypto
      .createHash('sha256')
      .update(canonicalizeJson(storedDoc))
      .digest('hex');

    return {
      ok: true,
      document: {
        ...storedDoc,
        status: result.rows[0].status,
        serverVersion: result.rows[0].lock_version,
        serverUpdatedAt: result.rows[0].updated_at,
        documentHash,
        headRevision: result.rows[0].head_revision,
      },
    };
  });

  app.delete('/creator/documents/:documentId', async (request, reply) => {
    const actorUserId = resolveAuthenticatedUserId(request);
    const { documentId } = documentIdParamsSchema.parse(request.params);

    const result = await db.query<{ creator_id: string; status: string }>(
      `SELECT creator_id, status FROM creator_documents WHERE id = $1 LIMIT 1`,
      [documentId]
    );

    if (!result.rowCount) {
      reply.code(404);
      return { ok: false, error: 'Document not found' };
    }

    if (result.rows[0].creator_id !== actorUserId) {
      reply.code(403);
      return { ok: false, error: 'Access denied' };
    }
    if (result.rows[0].status !== 'draft') {
      reply.code(409);
      return {
        ok: false,
        error: 'Published or archived documents cannot be deleted',
        code: 'CREATOR_DOCUMENT_IMMUTABLE',
      };
    }

    await db.query(`DELETE FROM creator_documents WHERE id = $1`, [documentId]);
    return { ok: true };
  });

  // POST /creator/documents/:documentId/publish — DEPRECATED.
  //
  // This endpoint records an internal revision and flips the document status
  // to 'published', but it does NOT create a public Look or Poster projection.
  // It was the source of the P0 architectural disconnect identified in the
  // publishing-lifecycle research report (23): the native publisher bypassed
  // it, and calling it 'publish' created two divergent truths — "document
  // status is published" and "content is publicly available" — which could
  // drift apart.
  //
  // The canonical publish command is now:
  //   POST /creator/documents/:documentId/publications
  // (see routes/creatorPublications.ts), which creates the public projection
  // transactionally inside the same commit that writes the publication row.
  //
  // This legacy endpoint is retained for backward compatibility but is
  // clearly labelled as revision-only. New clients must use the publications
  // orchestrator. The response includes a `deprecation` notice.
  app.post('/creator/documents/:documentId/publish', async (request, reply) => {
    const actorUserId = resolveAuthenticatedUserId(request);
    const { documentId } = documentIdParamsSchema.parse(request.params);
    const body = publishBodySchema.parse(request.body ?? {});
    const rawHeaderKey = Array.isArray(request.headers['idempotency-key'])
      ? request.headers['idempotency-key'][0]
      : request.headers['idempotency-key'];
    const headerKey = rawHeaderKey
      ? z.string().trim().min(8).max(160).parse(rawHeaderKey)
      : undefined;

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      // Lock the owner row before validation and revision allocation. This
      // serializes concurrent publish attempts for the same document.
      const result = await client.query<{
        creator_id: string;
        document_json: string;
        lock_version: number;
        head_revision: number;
      }>(
        `SELECT creator_id, document_json, lock_version, head_revision
         FROM creator_documents
         WHERE id = $1
         LIMIT 1
         FOR UPDATE`,
        [documentId]
      );

      if (!result.rowCount) {
        await client.query('ROLLBACK');
        reply.code(404);
        return { ok: false, error: 'Document not found' };
      }
      if (result.rows[0].creator_id !== actorUserId) {
        await client.query('ROLLBACK');
        reply.code(403);
        return { ok: false, error: 'Access denied' };
      }

      const doc = creatorDocumentBodySchema.parse(JSON.parse(result.rows[0].document_json));
      const publishErrors = validateForPublish(doc);
      if (publishErrors.length > 0) {
        await client.query('ROLLBACK');
        reply.code(422);
        return { ok: false, error: 'Publish validation failed', details: publishErrors };
      }

      const documentJson = JSON.stringify(doc);
      const documentHash = crypto.createHash('sha256').update(canonicalizeJson(doc)).digest('hex');
      const publishKey = body.idempotencyKey ?? headerKey ?? `content:${documentHash}`;

      const existingRevision = await client.query<{
        id: string;
        revision_number: number;
      }>(
        `SELECT id, revision_number
         FROM creator_document_revisions
         WHERE document_id = $1 AND publish_key = $2
         LIMIT 1`,
        [documentId, publishKey],
      );
      if (existingRevision.rowCount) {
        await client.query('COMMIT');
        reply.header('Deprecation', 'true');
        reply.header('Link', '</creator/documents/' + documentId + '/publications>; rel="successor-version"');
        return {
          ok: true,
          documentId,
          status: 'published',
          revisionNumber: existingRevision.rows[0].revision_number,
          idempotentReplay: true,
          deprecation: 'Use POST /creator/documents/:id/publications to create a public projection',
        };
      }

      const headRevision = result.rows[0].head_revision;
      const nextRevision = headRevision + 1;
      const revisionId = `rev_${crypto.randomUUID()}`;

      await client.query(
        `UPDATE creator_documents
         SET next_revision_number = $2 + 1,
             head_revision = $2,
             published_revision = $2,
             status = 'published',
             lock_version = lock_version + 1,
             published_at = COALESCE(published_at, NOW()),
             updated_at = NOW()
         WHERE id = $1`,
        [documentId, nextRevision],
      );

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
          nextRevision,
          documentJson,
          publishKey,
          documentHash,
        ],
      );

      // Emit a content.published domain event inside the same transaction.
      // Analytics subscribes to this via the outbox drain — it does NOT
      // accept forgeable client POSTs for content lifecycle events.
      await appendDomainEvent(client, {
        aggregateType: 'creator_document',
        aggregateId: documentId,
        eventType: 'content.published',
        payload: {
          documentId,
          revisionId,
          revisionNumber: nextRevision,
          creatorId: actorUserId,
          contentType: doc.type,
          publishedAt: new Date().toISOString(),
        },
        actorId: actorUserId,
        idempotencyKey: publishKey,
        deduplicationKey: `content.published:${documentId}:${publishKey}`,
      });

      await client.query('COMMIT');

      reply.header('Deprecation', 'true');
      reply.header('Link', '</creator/documents/' + documentId + '/publications>; rel="successor-version"');
      return {
        ok: true,
        documentId,
        status: 'published',
        revisionNumber: nextRevision,
        idempotentReplay: false,
        deprecation: 'Use POST /creator/documents/:id/publications to create a public projection',
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

  app.get('/creator/documents/:documentId/revisions', async (request, reply) => {
    const actorUserId = resolveAuthenticatedUserId(request);
    const { documentId } = documentIdParamsSchema.parse(request.params);

    const docResult = await db.query<{ creator_id: string }>(
      `SELECT creator_id FROM creator_documents WHERE id = $1 LIMIT 1`,
      [documentId]
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
      revision_number: string;
      published_at: string;
    }>(
      `SELECT id, revision_number::text, published_at
       FROM creator_document_revisions
       WHERE document_id = $1
       ORDER BY revision_number DESC`,
      [documentId]
    );

    return {
      ok: true,
      revisions: result.rows.map((row) => ({
        id: row.id,
        revisionNumber: parseInt(row.revision_number, 10),
        publishedAt: row.published_at,
      })),
    };
  });

  app.post('/creator/documents/:documentId/remix', async (request, reply) => {
    const actorUserId = resolveAuthenticatedUserId(request);
    const { documentId } = documentIdParamsSchema.parse(request.params);
    const { newDocumentId } = remixBodySchema.parse(request.body);

    const result = await db.query<{
      creator_id: string;
      document_json: string;
    }>(
      `SELECT creator_id, document_json FROM creator_documents WHERE id = $1 LIMIT 1`,
      [documentId]
    );

    if (!result.rowCount) {
      reply.code(404);
      return { ok: false, error: 'Source document not found' };
    }

    const sourceDoc = JSON.parse(result.rows[0].document_json);
    if (!sourceDoc.metadata?.allowRemix) {
      reply.code(403);
      return { ok: false, error: 'Remix not allowed for this document' };
    }

    const remixedDoc = {
      ...sourceDoc,
      id: newDocumentId,
      metadata: {
        ...sourceDoc.metadata,
        sourceDocumentId: documentId,
        sourceCreatorId: result.rows[0].creator_id,
        allowRemix: false,
        title: `Remix of ${sourceDoc.metadata?.title || 'Untitled'}`,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const client = await db.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO creator_documents (id, creator_id, type, version, document_json, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [
          newDocumentId,
          actorUserId,
          remixedDoc.type,
          remixedDoc.version,
          JSON.stringify(remixedDoc),
        ]
      );
      await client.query('COMMIT');
      return { ok: true, document: remixedDoc };
    } catch (error) {
      await client.query('ROLLBACK');
      app.log.error({ err: error }, 'Failed to create remix');
      reply.code(500);
      return { ok: false, error: 'Failed to create remix' };
    } finally {
      client.release();
    }
  });
};
