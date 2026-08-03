import type { CreatorDocument, CreatorLayer, CreatorPage } from './composition';
import { POSTER_DEFAULT_ASPECT_RATIO, LOOK_DEFAULT_ASPECT_RATIO } from './composition';

// ── Look viewer adapter ────────────────────────────────────────────

export interface LookViewData {
  id: string;
  title: string;
  caption: string;
  mediaUrl: string;
  tags: Array<{
    id: string;
    label: string;
    listingId?: string | null;
    x: number;
    y: number;
  }>;
}

export function lookToDocument(look: LookViewData): CreatorDocument {
  const layers: CreatorLayer[] = [];

  layers.push({
    id: 'media_primary',
    type: 'media',
    x: 0.5,
    y: 0.5,
    width: 1,
    height: 1,
    scale: 1,
    rotation: 0,
    zIndex: 0,
    locked: true,
    hidden: false,
    opacity: 1,
    payload: {
      mediaUri: look.mediaUrl,
      mediaType: 'image',
      contentFit: 'cover',
      opacity: 1,
    },
  });

  for (const tag of look.tags) {
    layers.push({
      id: tag.id,
      type: 'product',
      x: tag.x,
      y: tag.y,
      width: 0.08,
      height: 0.08,
      scale: 1,
      rotation: 0,
      zIndex: layers.length + 1,
      locked: true,
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
    id: look.id,
    type: 'look',
    version: 1,
    canvas: {
      aspectRatio: LOOK_DEFAULT_ASPECT_RATIO,
      background: { type: 'color', value: '#000000' },
    },
    pages: [{ id: 'page_1', layers }],
    metadata: {
      caption: look.caption,
      title: look.title,
      visibility: 'public',
      allowReplies: true,
      allowReactions: true,
      allowRemix: false,
    },
    updatedAt: new Date().toISOString(),
  };
}

// ── Poster viewer adapter ──────────────────────────────────────────

export interface PosterFrameViewData {
  id: string;
  mediaType: 'image' | 'video' | 'text';
  mediaUrl?: string;
  caption?: string;
  backgroundColor?: string | null;
  durationMs?: number;
  stickers: Array<{
    id: string;
    type: 'text' | 'mention' | 'listing' | 'look' | 'style_vote';
    x: number;
    y: number;
    scale?: number;
    rotation?: number;
    payload: Record<string, unknown>;
    sortOrder?: number;
  }>;
}

export interface PosterStoryViewData {
  id: string;
  frames: PosterFrameViewData[];
  audience?: 'public' | 'private';
  allowReplies?: boolean;
  allowReactions?: boolean;
}

// ── Payload extraction helpers for Record<string, unknown> sticker payloads ──
function pStr(p: Record<string, unknown>, key: string, fallback = ''): string {
  const v = p[key];
  return typeof v === 'string' ? v : fallback;
}

function pStrOpt(p: Record<string, unknown>, key: string): string | undefined {
  const v = p[key];
  return typeof v === 'string' ? v : undefined;
}

function pNumOpt(p: Record<string, unknown>, key: string): number | undefined {
  const v = p[key];
  return typeof v === 'number' ? v : undefined;
}

function pOptions(p: Record<string, unknown>): Array<{ id: string; label: string }> {
  const v = p['options'];
  if (!Array.isArray(v)) return [];
  return v.filter(
    (item): item is { id: string; label: string } =>
      typeof item === 'object' && item !== null &&
      typeof item.id === 'string' && typeof item.label === 'string',
  );
}

export function posterStoryToDocument(story: PosterStoryViewData): CreatorDocument {
  const pages: CreatorPage[] = story.frames.map((frame) => {
    const layers: CreatorLayer[] = [];

    if (frame.mediaUrl) {
      layers.push({
        id: `media_${frame.id}`,
        type: 'media',
        x: 0.5,
        y: 0.5,
        width: 1,
        height: 1,
        scale: 1,
        rotation: 0,
        zIndex: 0,
        locked: true,
        hidden: false,
        opacity: 1,
        payload: {
          mediaUri: frame.mediaUrl,
          mediaType: frame.mediaType === 'video' ? 'video' : 'image',
          contentFit: 'cover',
          opacity: 1,
        },
      });
    }

    if (frame.caption && frame.caption.trim()) {
      layers.push({
        id: `caption_${frame.id}`,
        type: 'text',
        x: 0.5,
        y: frame.mediaUrl ? 0.85 : 0.5,
        width: 0.9,
        height: 0.15,
        scale: 1,
        rotation: 0,
        zIndex: 100,
        locked: true,
        hidden: false,
        opacity: 1,
        payload: {
          text: frame.caption,
          textStyle: 'clean',
          textColor: '#ffffff',
          backgroundColor: frame.backgroundColor ?? undefined,
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
        scale: sticker.scale ?? 1,
        rotation: sticker.rotation ?? 0,
        zIndex: (sticker.sortOrder ?? 0) + 10,
        locked: true,
        hidden: false,
        opacity: 1,
      };

      switch (sticker.type) {
        case 'text':
          layers.push({
            ...baseFields,
            type: 'text',
            payload: {
              text: pStr(sticker.payload, 'text'),
              textStyle: mapTextStyle(pStrOpt(sticker.payload, 'textStyle')),
              textColor: pStr(sticker.payload, 'textColor', '#ffffff'),
              backgroundColor: pStrOpt(sticker.payload, 'backgroundColor'),
              alignment: pStr(sticker.payload, 'alignment', 'center') as 'left' | 'center' | 'right',
              opacity: 1,
            },
          });
          break;
        case 'mention':
          layers.push({
            ...baseFields,
            type: 'mention',
            payload: {
              userId: pStr(sticker.payload, 'userId'),
              username: pStr(sticker.payload, 'username'),
            },
          });
          break;
        case 'listing':
          layers.push({
            ...baseFields,
            type: 'product',
            payload: {
              listingId: pStr(sticker.payload, 'listingId'),
              snapshotTitle: pStr(sticker.payload, 'snapshotTitle') || pStr(sticker.payload, 'title'),
              snapshotImageUrl: pStrOpt(sticker.payload, 'snapshotImageUrl') ?? pStrOpt(sticker.payload, 'imageUrl'),
              snapshotPriceGbp: pNumOpt(sticker.payload, 'snapshotPriceGbp') ?? pNumOpt(sticker.payload, 'priceGbp'),
              availability: pStr(sticker.payload, 'availability', 'active') as 'active' | 'sold' | 'deleted',
            },
          });
          break;
        case 'look':
          layers.push({
            ...baseFields,
            type: 'look',
            payload: {
              lookId: pStr(sticker.payload, 'lookId'),
              snapshotCaption: pStr(sticker.payload, 'snapshotCaption') || pStr(sticker.payload, 'caption'),
              snapshotImageUrl: pStrOpt(sticker.payload, 'snapshotImageUrl') ?? pStrOpt(sticker.payload, 'imageUrl'),
            },
          });
          break;
        case 'style_vote':
          layers.push({
            ...baseFields,
            type: 'vote',
            payload: {
              question: pStr(sticker.payload, 'question'),
              options: pOptions(sticker.payload),
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
    id: story.id,
    type: 'poster',
    version: 1,
    canvas: {
      aspectRatio: POSTER_DEFAULT_ASPECT_RATIO,
      background: { type: 'color', value: '#1a1a1a' },
    },
    pages,
    metadata: {
      caption: '',
      title: '',
      visibility: story.audience ?? 'public',
      allowReplies: story.allowReplies ?? true,
      allowReactions: story.allowReactions ?? true,
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
