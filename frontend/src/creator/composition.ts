import { z } from 'zod';
import type { OutfitTag } from '../components/look/LookMediaComposer';
import type { ComposerFrame } from '../components/poster/PosterFrameStrip';

// ── Layer payload schemas ──────────────────────────────────────────

const TextLayerPayloadSchema = z.object({
  text: z.string().min(1).max(500),
  textStyle: z.enum(['headline', 'editorial', 'clean', 'compact', 'handwritten']).default('clean'),
  textColor: z.string().default('#ffffff'),
  backgroundColor: z.string().optional(),
  alignment: z.enum(['left', 'center', 'right']).default('center'),
  lineHeight: z.number().min(0.8).max(3).optional(),
  opacity: z.number().min(0).max(1).default(1),
});

const MediaLayerPayloadSchema = z.object({
  mediaUri: z.string(),
  mediaType: z.enum(['image', 'video']).default('image'),
  contentFit: z.enum(['cover', 'contain', 'fill']).default('cover'),
  thumbnailUri: z.string().optional(),
  videoDurationMs: z.number().nullable().optional(),
  opacity: z.number().min(0).max(1).default(1),
});

const ProductLayerPayloadSchema = z.object({
  listingId: z.string().min(1),
  snapshotTitle: z.string().default(''),
  snapshotImageUrl: z.string().optional(),
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
});

const VoteLayerPayloadSchema = z.object({
  question: z.string().min(1).max(100),
  options: z.array(z.object({ id: z.string(), label: z.string().min(1).max(50) })).length(2),
});

const DecorativeLayerPayloadSchema = z.object({
  shape: z.enum(['circle', 'square', 'line', 'arrow', 'star', 'heart']),
  color: z.string().default('#ffffff'),
  opacity: z.number().min(0).max(1).default(1),
});

// ── Base layer schema ──────────────────────────────────────────────

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

// ── Discriminated union of layer types ─────────────────────────────

export const CreatorLayerSchema = z.discriminatedUnion('type', [
  BaseLayerSchema.extend({ type: z.literal('media'), payload: MediaLayerPayloadSchema }),
  BaseLayerSchema.extend({ type: z.literal('text'), payload: TextLayerPayloadSchema }),
  BaseLayerSchema.extend({ type: z.literal('product'), payload: ProductLayerPayloadSchema }),
  BaseLayerSchema.extend({ type: z.literal('mention'), payload: MentionLayerPayloadSchema }),
  BaseLayerSchema.extend({ type: z.literal('look'), payload: LookLayerPayloadSchema }),
  BaseLayerSchema.extend({ type: z.literal('vote'), payload: VoteLayerPayloadSchema }),
  BaseLayerSchema.extend({ type: z.literal('decorative'), payload: DecorativeLayerPayloadSchema }),
]);

export type CreatorLayer = z.infer<typeof CreatorLayerSchema>;

export type LayerType = CreatorLayer['type'];

// ── Page schema ────────────────────────────────────────────────────

export const CreatorPageSchema = z.object({
  id: z.string().min(1),
  durationMs: z.number().int().min(500).max(60000).optional(),
  layers: z.array(CreatorLayerSchema).default([]),
});

export type CreatorPage = z.infer<typeof CreatorPageSchema>;

// ── Background schema ──────────────────────────────────────────────

export const CreatorBackgroundSchema = z.object({
  type: z.enum(['color', 'gradient', 'image']).default('color'),
  value: z.string().default('#1a1a1a'),
  secondaryValue: z.string().optional(),
});

export type CreatorBackground = z.infer<typeof CreatorBackgroundSchema>;

// ── Metadata schema ────────────────────────────────────────────────

export const CreatorMetadataSchema = z.object({
  caption: z.string().max(500).default(''),
  title: z.string().max(120).default(''),
  visibility: z.enum(['public', 'private']).default('public'),
  allowReplies: z.boolean().default(true),
  allowReactions: z.boolean().default(true),
  expiresInHours: z.number().int().min(1).max(168).optional(),
  accessibilityDescription: z.string().max(300).optional(),
  allowRemix: z.boolean().default(false),
  sourceDocumentId: z.string().optional(),
  sourceCreatorId: z.string().optional(),
});

export type CreatorMetadata = z.infer<typeof CreatorMetadataSchema>;

// ── Full document schema ───────────────────────────────────────────

export const CreatorDocumentSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['look', 'poster']),
  version: z.number().int().min(1).default(1),
  canvas: z.object({
    aspectRatio: z.number().min(0.3).max(3).default(0.8),
    background: CreatorBackgroundSchema,
  }),
  pages: z.array(CreatorPageSchema).min(1).max(10),
  metadata: CreatorMetadataSchema,
  updatedAt: z.string().default(() => new Date().toISOString()),
});

export type CreatorDocument = z.infer<typeof CreatorDocumentSchema>;

// ── Validation helpers ─────────────────────────────────────────────

export function validateDocument(doc: unknown): CreatorDocument {
  return CreatorDocumentSchema.parse(doc);
}

export function safeValidateDocument(doc: unknown): { success: boolean; data?: CreatorDocument; error?: string } {
  const result = CreatorDocumentSchema.safeParse(doc);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error.message };
}

// ── Migration helpers ──────────────────────────────────────────────

export function migrateLookToDocument(params: {
  id: string;
  imageUri: string | null;
  imageMediaUrl?: string;
  caption: string;
  tags: OutfitTag[];
  visibility: 'public' | 'private';
}): CreatorDocument {
  const layers: CreatorLayer[] = [];

  if (params.imageUri || params.imageMediaUrl) {
    layers.push({
      type: 'media',
      id: 'media_primary',
      x: 0.5,
      y: 0.5,
      width: 1,
      height: 1,
      scale: 1,
      rotation: 0,
      zIndex: 0,
      locked: false,
      hidden: false,
      opacity: 1,
      payload: {
        mediaUri: params.imageMediaUrl ?? params.imageUri!,
        mediaType: 'image',
        contentFit: 'cover',
        opacity: 1,
      },
    });
  }

  for (const tag of params.tags) {
    layers.push({
      type: 'product',
      id: tag.id,
      x: tag.x,
      y: tag.y,
      width: 0.08,
      height: 0.08,
      scale: 1,
      rotation: 0,
      zIndex: layers.length + 1,
      locked: false,
      hidden: false,
      opacity: 1,
      payload: {
        listingId: tag.listingId ?? '',
        snapshotTitle: tag.label,
        availability: 'active',
        hotspotLabel: tag.label,
      },
    });
  }

  return {
    id: params.id,
    type: 'look',
    version: 1,
    canvas: {
      aspectRatio: 0.8,
      background: { type: 'color', value: '#000000' },
    },
    pages: [{ id: 'page_1', layers }],
    metadata: {
      caption: params.caption,
      title: '',
      visibility: params.visibility,
      allowReplies: true,
      allowReactions: true,
      allowRemix: false,
    },
    updatedAt: new Date().toISOString(),
  };
}

export function migratePosterFramesToDocument(params: {
  id: string;
  frames: ComposerFrame[];
  audience: 'public' | 'private';
  allowReplies: boolean;
  allowReactions: boolean;
}): CreatorDocument {
  const pages: CreatorPage[] = params.frames.map((frame) => {
    const layers: CreatorLayer[] = [];

    if (frame.mediaUri) {
      layers.push({
        type: 'media',
        id: `media_${frame.id}`,
        x: 0.5,
        y: 0.5,
        width: 1,
        height: 1,
        scale: 1,
        rotation: 0,
        zIndex: 0,
        locked: false,
        hidden: false,
        opacity: 1,
        payload: {
          mediaUri: frame.mediaUri,
          mediaType: frame.mediaType === 'video' ? 'video' : 'image',
          contentFit: 'cover',
          thumbnailUri: frame.thumbnailUri ?? undefined,
          videoDurationMs: frame.videoDurationMs ?? undefined,
          opacity: 1,
        },
      });
    }

    if (frame.caption.trim()) {
      layers.push({
        type: 'text',
        id: `caption_${frame.id}`,
        x: 0.5,
        y: frame.mediaUri ? 0.85 : 0.5,
        width: 0.9,
        height: 0.15,
        scale: 1,
        rotation: 0,
        zIndex: 100,
        locked: false,
        hidden: false,
        opacity: 1,
        payload: {
          text: frame.caption,
          textStyle: 'clean',
          textColor: '#ffffff',
          alignment: 'center',
          opacity: 1,
        },
      });
    }

    for (const sticker of frame.stickers) {
      const baseFields = {
        id: sticker.id,
        x: sticker.x,
        y: sticker.y,
        width: 0.15,
        height: 0.08,
        scale: sticker.scale,
        rotation: sticker.rotation,
        zIndex: (sticker.sortOrder ?? 0) + 10,
        locked: false,
        hidden: false,
        opacity: 1,
      };

      switch (sticker.type) {
        case 'text':
          layers.push({
            ...baseFields,
            type: 'text',
            payload: {
              text: (sticker.payload as any).text ?? '',
              textStyle: mapTextStyle((sticker.payload as any).textStyle),
              textColor: (sticker.payload as any).textColor ?? '#ffffff',
              backgroundColor: (sticker.payload as any).backgroundColor,
              alignment: (sticker.payload as any).alignment ?? 'center',
              opacity: 1,
            },
          });
          break;
        case 'mention':
          layers.push({
            ...baseFields,
            type: 'mention',
            payload: {
              userId: (sticker.payload as any).userId ?? '',
              username: (sticker.payload as any).username ?? '',
            },
          });
          break;
        case 'listing':
          layers.push({
            ...baseFields,
            type: 'product',
            payload: {
              listingId: (sticker.payload as any).listingId ?? '',
              snapshotTitle: (sticker.payload as any).snapshotTitle ?? '',
              snapshotImageUrl: (sticker.payload as any).snapshotImageUrl,
              snapshotPriceGbp: (sticker.payload as any).snapshotPriceGbp,
              availability: 'active',
            },
          });
          break;
        case 'look':
          layers.push({
            ...baseFields,
            type: 'look',
            payload: {
              lookId: (sticker.payload as any).lookId ?? '',
              snapshotCaption: (sticker.payload as any).snapshotCaption ?? '',
              snapshotImageUrl: (sticker.payload as any).snapshotImageUrl,
            },
          });
          break;
        case 'style_vote':
          layers.push({
            ...baseFields,
            type: 'vote',
            payload: {
              question: (sticker.payload as any).question ?? '',
              options: (sticker.payload as any).options ?? [],
            },
          });
          break;
      }
    }

    return {
      id: frame.id,
      durationMs: frame.durationMs,
      layers,
    };
  });

  return {
    id: params.id,
    type: 'poster',
    version: 1,
    canvas: {
      aspectRatio: 16 / 9,
      background: { type: 'color', value: '#1a1a1a' },
    },
    pages,
    metadata: {
      caption: '',
      title: '',
      visibility: params.audience,
      allowReplies: params.allowReplies,
      allowReactions: params.allowReactions,
      expiresInHours: 24,
      allowRemix: false,
    },
    updatedAt: new Date().toISOString(),
  };
}

function mapTextStyle(old: string | undefined): 'headline' | 'editorial' | 'clean' | 'compact' | 'handwritten' {
  switch (old) {
    case 'editorial': return 'editorial';
    case 'minimal': return 'clean';
    case 'label': return 'compact';
    case 'outline': return 'headline';
    default: return 'clean';
  }
}

// ── Document operations ────────────────────────────────────────────

export function createEmptyDocument(type: 'look' | 'poster'): CreatorDocument {
  return {
    id: `doc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type,
    version: 1,
    canvas: {
      aspectRatio: type === 'look' ? 0.8 : 16 / 9,
      background: { type: 'color', value: type === 'look' ? '#000000' : '#1a1a1a' },
    },
    pages: [{ id: 'page_1', layers: [] }],
    metadata: {
      caption: '',
      title: '',
      visibility: 'public',
      allowReplies: true,
      allowReactions: true,
      allowRemix: false,
      ...(type === 'poster' ? { expiresInHours: 24 } : {}),
    },
    updatedAt: new Date().toISOString(),
  };
}

export function addLayerToPage(doc: CreatorDocument, pageIndex: number, layer: CreatorLayer): CreatorDocument {
  const pages = [...doc.pages];
  const page = { ...pages[pageIndex] };
  const maxZ = page.layers.reduce((max, l) => Math.max(max, l.zIndex), 0);
  page.layers = [...page.layers, { ...layer, zIndex: maxZ + 1 }];
  pages[pageIndex] = page;
  return { ...doc, pages, updatedAt: new Date().toISOString() };
}

export function updateLayerInPage(
  doc: CreatorDocument,
  pageIndex: number,
  layerId: string,
  updates: Partial<CreatorLayer>,
): CreatorDocument {
  const pages = [...doc.pages];
  const page = { ...pages[pageIndex] };
  page.layers = page.layers.map((l) =>
    l.id === layerId ? { ...l, ...updates } as CreatorLayer : l
  );
  pages[pageIndex] = page;
  return { ...doc, pages, updatedAt: new Date().toISOString() };
}

export function removeLayerFromPage(doc: CreatorDocument, pageIndex: number, layerId: string): CreatorDocument {
  const pages = [...doc.pages];
  const page = { ...pages[pageIndex] };
  page.layers = page.layers.filter((l) => l.id !== layerId);
  pages[pageIndex] = page;
  return { ...doc, pages, updatedAt: new Date().toISOString() };
}

export function reorderLayerZ(
  doc: CreatorDocument,
  pageIndex: number,
  layerId: string,
  direction: 'front' | 'forward' | 'backward' | 'back',
): CreatorDocument {
  const pages = [...doc.pages];
  const page = { ...pages[pageIndex] };
  const sorted = [...page.layers].sort((a, b) => a.zIndex - b.zIndex);

  const idx = sorted.findIndex((l) => l.id === layerId);
  if (idx === -1) return doc;

  switch (direction) {
    case 'front': {
      const [moved] = sorted.splice(idx, 1);
      sorted.push(moved);
      break;
    }
    case 'back': {
      const [moved] = sorted.splice(idx, 1);
      sorted.unshift(moved);
      break;
    }
    case 'forward': {
      if (idx < sorted.length - 1) {
        [sorted[idx], sorted[idx + 1]] = [sorted[idx + 1], sorted[idx]];
      }
      break;
    }
    case 'backward': {
      if (idx > 0) {
        [sorted[idx], sorted[idx - 1]] = [sorted[idx - 1], sorted[idx]];
      }
      break;
    }
  }

  page.layers = sorted.map((l, i) => ({ ...l, zIndex: i }));
  pages[pageIndex] = page;
  return { ...doc, pages, updatedAt: new Date().toISOString() };
}

export function duplicateLayerInPage(doc: CreatorDocument, pageIndex: number, layerId: string): CreatorDocument {
  const pages = [...doc.pages];
  const page = { ...pages[pageIndex] };
  const layer = page.layers.find((l) => l.id === layerId);
  if (!layer) return doc;

  const maxZ = page.layers.reduce((max, l) => Math.max(max, l.zIndex), 0);
  const newLayer: CreatorLayer = {
    ...layer,
    id: `layer_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    x: Math.min(layer.x + 0.05, 0.95),
    y: Math.min(layer.y + 0.05, 0.95),
    zIndex: maxZ + 1,
  };
  page.layers = [...page.layers, newLayer];
  pages[pageIndex] = page;
  return { ...doc, pages, updatedAt: new Date().toISOString() };
}

export function getVisibleLayersSorted(page: CreatorPage): CreatorLayer[] {
  return page.layers
    .filter((l) => !l.hidden)
    .sort((a, b) => a.zIndex - b.zIndex);
}

export function getAllLayersSorted(page: CreatorPage): CreatorLayer[] {
  return [...page.layers].sort((a, b) => a.zIndex - b.zIndex);
}
