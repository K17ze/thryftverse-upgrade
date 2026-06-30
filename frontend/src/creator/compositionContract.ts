import {
  CreatorDocumentSchema,
  CreatorDocument,
  CreatorLayer,
  safeValidateDocument,
} from './composition';
import type { LookCreateBody, LookCreateTag } from '../services/looksApi';
import type { PosterStoryCreateBody } from '../services/postersApi';
import type { CreatorStoryCreateFrame } from './publishTypes';

// ── Schema version strategy ───────────────────────────────────────
export const COMPOSITION_SCHEMA_VERSION = 1;

export const MIN_SUPPORTED_SCHEMA_VERSION = 1;
export const MAX_SUPPORTED_SCHEMA_VERSION = 1;

// ── Local URI detection ───────────────────────────────────────────
const LOCAL_URI_PREFIXES = ['file://', 'ph://', 'asset://', 'data:', 'content://', 'assets-library://'];

function isLocalUri(uri: string): boolean {
  return LOCAL_URI_PREFIXES.some((prefix) => uri.startsWith(prefix));
}

// ── Contract validation result ────────────────────────────────────
export interface ContractValidationResult {
  valid: boolean;
  errors: string[];
  sanitizedDoc?: CreatorDocument;
}

// ── Core contract validation ──────────────────────────────────────
export function validateForPublish(doc: CreatorDocument): ContractValidationResult {
  const errors: string[] = [];

  // 1. Schema validation via Zod
  const schemaResult = safeValidateDocument(doc);
  if (!schemaResult.success || !schemaResult.data) {
    errors.push(`Schema validation failed: ${schemaResult.error}`);
    return { valid: false, errors };
  }

  const validated = schemaResult.data;

  // 2. Schema version check
  if (
    validated.version < MIN_SUPPORTED_SCHEMA_VERSION ||
    validated.version > MAX_SUPPORTED_SCHEMA_VERSION
  ) {
    errors.push(
      `Unsupported schema version ${validated.version}. Supported: ${MIN_SUPPORTED_SCHEMA_VERSION}-${MAX_SUPPORTED_SCHEMA_VERSION}`,
    );
  }

  // 3. Document type check
  if (validated.type !== 'look' && validated.type !== 'poster') {
    errors.push(`Invalid document type: ${validated.type}`);
  }

  // 4. Pages check
  if (validated.pages.length === 0) {
    errors.push('Document must have at least one page');
  }

  if (validated.type === 'look' && validated.pages.length !== 1) {
    errors.push('Look documents must have exactly one page');
  }

  if (validated.pages.length > 10) {
    errors.push('Documents cannot have more than 10 pages');
  }

  // 5. Local URI rejection — no local device URIs in published payload
  for (const page of validated.pages) {
    for (const layer of page.layers) {
      if (layer.type === 'media') {
        if (isLocalUri(layer.payload.mediaUri)) {
          errors.push(
            `Layer ${layer.id}: mediaUri is a local URI — must be uploaded before publish`,
          );
        }
        if (layer.payload.thumbnailUri && isLocalUri(layer.payload.thumbnailUri)) {
          errors.push(
            `Layer ${layer.id}: thumbnailUri is a local URI — must be uploaded before publish`,
          );
        }
      }
      if (layer.type === 'product' && layer.payload.snapshotImageUrl) {
        if (isLocalUri(layer.payload.snapshotImageUrl)) {
          errors.push(
            `Layer ${layer.id}: product snapshotImageUrl is a local URI`,
          );
        }
      }
      if (layer.type === 'look' && layer.payload.snapshotImageUrl) {
        if (isLocalUri(layer.payload.snapshotImageUrl)) {
          errors.push(
            `Layer ${layer.id}: look snapshotImageUrl is a local URI`,
          );
        }
      }
    }
  }

  // 6. Look-specific: must have at least one media layer
  if (validated.type === 'look') {
    const hasMedia = validated.pages[0].layers.some((l) => l.type === 'media');
    if (!hasMedia) {
      errors.push('Look documents must contain at least one media layer');
    }
  }

  // 7. Poster-specific: each page must have media or text content
  if (validated.type === 'poster') {
    for (const page of validated.pages) {
      const hasContent = page.layers.some(
        (l) => l.type === 'media' || l.type === 'text',
      );
      if (!hasContent) {
        errors.push(`Page ${page.id}: must contain at least one media or text layer`);
      }
    }
  }

  // 8. Vote layer validation
  for (const page of validated.pages) {
    for (const layer of page.layers) {
      if (layer.type === 'vote') {
        if (layer.payload.options.length !== 2) {
          errors.push(`Layer ${layer.id}: vote must have exactly 2 options`);
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    sanitizedDoc: errors.length === 0 ? validated : undefined,
  };
}

// ── Serialisation: CreatorDocument → Look API payload ─────────────
export function serialiseToLookPayload(doc: CreatorDocument): {
  payload: LookCreateBody;
  remixAttribution: { sourceDocumentId?: string; sourceCreatorId?: string };
} {
  if (doc.type !== 'look') {
    throw new Error('Cannot serialise non-look document to look payload');
  }

  const page = doc.pages[0];
  const mediaLayers = page.layers.filter((l) => l.type === 'media');

  if (mediaLayers.length === 0) {
    throw new Error('Look document must have a media layer');
  }

  // For collage looks with multiple media layers, use the largest as primary
  const mediaLayer = mediaLayers.reduce((largest, current) => {
    const currentArea = (current as any).width * (current as any).height;
    const largestArea = (largest as any).width * (largest as any).height;
    return currentArea > largestArea ? current : largest;
  });

  const tags: LookCreateTag[] = page.layers
    .filter((l) => l.type === 'product')
    .map((l) => ({
      id: l.id,
      listingId: l.type === 'product' ? l.payload.listingId : undefined,
      label: l.type === 'product' ? l.payload.snapshotTitle : '',
      x: l.x,
      y: l.y,
    }));

  // Include full composition document for collage looks so backend can persist editable layers
  const hasMultipleMedia = mediaLayers.length > 1;

  return {
    payload: {
      id: doc.id,
      title: doc.metadata.title || 'Untitled Look',
      caption: doc.metadata.caption,
      mediaUrl: mediaLayer.type === 'media' ? mediaLayer.payload.mediaUri : '',
      visibility: doc.metadata.visibility,
      tags,
      status: 'published',
      ...(hasMultipleMedia ? { compositionDocument: doc } : {}),
    },
    remixAttribution: {
      sourceDocumentId: doc.metadata.sourceDocumentId,
      sourceCreatorId: doc.metadata.sourceCreatorId,
    },
  };
}

// ── Serialisation: CreatorDocument → Poster Story API payload ─────
export function serialiseToPosterPayload(doc: CreatorDocument): {
  payload: PosterStoryCreateBody;
  remixAttribution: { sourceDocumentId?: string; sourceCreatorId?: string };
} {
  if (doc.type !== 'poster') {
    throw new Error('Cannot serialise non-poster document to poster payload');
  }

  const frames: CreatorStoryCreateFrame[] = doc.pages.map((page, i) => {
    const mediaLayer = page.layers.find((l) => l.type === 'media');
    const textLayer = page.layers.find(
      (l) => l.type === 'text' && l.id.startsWith('caption_'),
    );

    return {
      id: page.id,
      mediaType: mediaLayer?.type === 'media'
        ? mediaLayer.payload.mediaType
        : 'text',
      mediaUrl: mediaLayer?.type === 'media'
        ? mediaLayer.payload.mediaUri
        : undefined,
      caption: textLayer?.type === 'text'
        ? textLayer.payload.text
        : '',
      durationMs: page.durationMs ?? 5000,
      sortOrder: i,
      stickers: page.layers
        .filter((l) => l.type !== 'media' && !(l.type === 'text' && l.id.startsWith('caption_')))
        .map((l, si) => ({
          id: l.id,
          type: mapLayerTypeToStickerType(l.type),
          x: l.x,
          y: l.y,
          scale: l.scale,
          rotation: l.rotation,
          payload: extractStickerPayload(l),
          sortOrder: si,
        })),
    };
  });

  return {
    payload: {
      id: doc.id,
      audience: doc.metadata.visibility,
      allowReplies: doc.metadata.allowReplies,
      allowReactions: doc.metadata.allowReactions,
      expiresInHours: doc.metadata.expiresInHours ?? 24,
      posterMode: doc.type,
      frames,
    },
    remixAttribution: {
      sourceDocumentId: doc.metadata.sourceDocumentId,
      sourceCreatorId: doc.metadata.sourceCreatorId,
    },
  };
}

// ── Helpers ───────────────────────────────────────────────────────
function mapLayerTypeToStickerType(
  type: string,
): 'text' | 'mention' | 'listing' | 'look' | 'style_vote' {
  switch (type) {
    case 'text': return 'text';
    case 'mention': return 'mention';
    case 'product': return 'listing';
    case 'look': return 'look';
    case 'vote': return 'style_vote';
    default: return 'text';
  }
}

function extractStickerPayload(layer: CreatorLayer): Record<string, unknown> {
  return layer.payload as Record<string, unknown>;
}

// ── Duplicate submission guard ─────────────────────────────────────
export class PublishGuard {
  private inFlight = false;
  private completedId: string | null = null;

  begin(documentId: string): boolean {
    if (this.inFlight) return false;
    if (this.completedId === documentId) return false;
    this.inFlight = true;
    return true;
  }

  complete(documentId: string): void {
    this.inFlight = false;
    this.completedId = documentId;
  }

  fail(): void {
    this.inFlight = false;
  }

  reset(): void {
    this.inFlight = false;
    this.completedId = null;
  }

  get isInFlight(): boolean {
    return this.inFlight;
  }
}
