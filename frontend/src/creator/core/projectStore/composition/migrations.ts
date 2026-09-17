import type { OutfitTag } from '../../../../components/look/LookMediaComposer';
import type { PosterStickerType } from '../../../../services/postersApi';
import type { CreatorDocument } from './document';
import type { CreatorLayer } from './layers';
import type { CreatorPage } from './pages';
import {
  LEGACY_POSTER_LANDSCAPE_RATIO,
  LOOK_DEFAULT_ASPECT_RATIO,
  LOOK_DEFAULT_BACKGROUND,
  POSTER_DEFAULT_ASPECT_RATIO,
  POSTER_DEFAULT_BACKGROUND,
} from './constants';

// ── Legacy poster frame type (migrated from PosterFrameStrip.tsx) ──
export interface ComposerFrame {
  id: string;
  mediaType: 'image' | 'video' | 'text';
  mediaUri: string | null;
  backgroundColor: string | null;
  caption: string;
  durationMs: number;
  videoDurationMs?: number | null;
  thumbnailUri?: string | null;
  stickers: Array<{
    id: string;
    type: PosterStickerType;
    x: number;
    y: number;
    scale: number;
    rotation: number;
    payload: Record<string, unknown>;
    sortOrder: number;
  }>;
}

// ── Text layer migration (spec 06_TEXT_TYPOGRAPHY §1) ───────────────

/**
 * Convert a hex color string (#RRGGBB or #RRGGBBAA) to a CreatorColor
 * object. Returns white if the string is invalid.
 */
function hexToCreatorColor(hex: string): { space: 'srgb'; r: number; g: number; b: number; a: number } {
  const cleaned = hex.trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]+$/.test(cleaned)) {
    return { space: 'srgb', r: 1, g: 1, b: 1, a: 1 };
  }
  let r = 1, g = 1, b = 1, a = 1;
  if (cleaned.length === 3) {
    r = parseInt(cleaned[0]! + cleaned[0]!, 16) / 255;
    g = parseInt(cleaned[1]! + cleaned[1]!, 16) / 255;
    b = parseInt(cleaned[2]! + cleaned[2]!, 16) / 255;
  } else if (cleaned.length === 6) {
    r = parseInt(cleaned.slice(0, 2), 16) / 255;
    g = parseInt(cleaned.slice(2, 4), 16) / 255;
    b = parseInt(cleaned.slice(4, 6), 16) / 255;
  } else if (cleaned.length === 8) {
    r = parseInt(cleaned.slice(0, 2), 16) / 255;
    g = parseInt(cleaned.slice(2, 4), 16) / 255;
    b = parseInt(cleaned.slice(4, 6), 16) / 255;
    a = parseInt(cleaned.slice(6, 8), 16) / 255;
  }
  return { space: 'srgb', r, g, b, a };
}

/**
 * Migrate a legacy text layer payload to the new schema format.
 *
 * Converts:
 *  - `textColor` (hex string) → `fill` (CreatorColor)
 *  - `backgroundColor` (hex string) → `background` (with color, radius, padding)
 *  - `textEffect` ('shadow' | 'outline' | 'neon' | 'glow') → `shadow` / `stroke`
 *
 * If the payload already has the new fields (`fill`, `stroke`, `shadow`,
 * `background`), they are preserved. The legacy fields are kept for
 * backward compatibility but the new fields take precedence.
 *
 * @returns A new payload object with the new fields populated.
 */
export function migrateTextLayerPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = { ...payload };

  // Migrate textColor → fill (only if fill is not already set)
  if (!result['fill'] && typeof result['textColor'] === 'string') {
    result['fill'] = hexToCreatorColor(result['textColor']);
  }

  // Migrate backgroundColor → background (only if background is not already set)
  if (!result['background'] && typeof result['backgroundColor'] === 'string') {
    result['background'] = {
      color: hexToCreatorColor(result['backgroundColor']),
      radius: 4,
      paddingX: 8,
      paddingY: 4,
    };
  }

  // Migrate textEffect → stroke / shadow (only if not already set)
  if (result['textEffect'] && typeof result['textEffect'] === 'string') {
    const effect = result['textEffect'];
    if ((effect === 'outline' || effect === 'glow') && !result['stroke']) {
      result['stroke'] = {
        color: { space: 'srgb', r: 0, g: 0, b: 0, a: 1 },
        width: effect === 'glow' ? 4 : 2,
      };
    }
    if ((effect === 'shadow' || effect === 'neon') && !result['shadow']) {
      result['shadow'] = {
        color: effect === 'neon'
          ? { space: 'srgb', r: 1, g: 1, b: 1, a: 0.8 }
          : { space: 'srgb', r: 0, g: 0, b: 0, a: 0.8 },
        blur: effect === 'neon' ? 12 : 4,
        offsetX: 0,
        offsetY: 2,
      };
    }
  }

  return result;
}

// ── Migration helpers ──────────────────────────────────────────────

export function migrateLookToDocument(params: {
  id: string;
  imageUri: string | null;
  imageMediaUrl?: string;
  caption: string;
  tags: OutfitTag[];
  visibility: 'public' | 'closeFriends' | 'private';
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
      aspectRatio: LOOK_DEFAULT_ASPECT_RATIO,
      background: { type: 'color', value: LOOK_DEFAULT_BACKGROUND },
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
          fill: { space: 'srgb', r: 1, g: 1, b: 1, a: 1 },
          textColor: '#ffffff',
          alignment: 'center',
          opacity: 1,
          isCaption: true,
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
              text: pStr(sticker.payload, 'text'),
              textStyle: mapTextStyle(pStrOpt(sticker.payload, 'textStyle')),
              fill: { space: 'srgb', r: 1, g: 1, b: 1, a: 1 },
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
              snapshotTitle: pStr(sticker.payload, 'snapshotTitle'),
              snapshotImageUrl: pStrOpt(sticker.payload, 'snapshotImageUrl'),
              snapshotPriceGbp: pNumOpt(sticker.payload, 'snapshotPriceGbp'),
              availability: 'active',
            },
          });
          break;
        case 'look':
          layers.push({
            ...baseFields,
            type: 'look',
            payload: {
              lookId: pStr(sticker.payload, 'lookId'),
              snapshotCaption: pStr(sticker.payload, 'snapshotCaption'),
              snapshotImageUrl: pStrOpt(sticker.payload, 'snapshotImageUrl'),
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
    id: params.id,
    type: 'poster',
    version: 1,
    canvas: {
      aspectRatio: POSTER_DEFAULT_ASPECT_RATIO,
      background: { type: 'color', value: POSTER_DEFAULT_BACKGROUND },
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

// ── Document migration ─────────────────────────────────────────────

type DocumentMigration = {
  fromVersion: number;
  migrate: (doc: CreatorDocument) => CreatorDocument;
};

const MIGRATIONS: DocumentMigration[] = [
  {
    fromVersion: 1,
    migrate: (doc) => {
      if (
        doc.type === 'poster' &&
        Math.abs(doc.canvas.aspectRatio - LEGACY_POSTER_LANDSCAPE_RATIO) < 0.001
      ) {
        return {
          ...doc,
          canvas: {
            ...doc.canvas,
            aspectRatio: POSTER_DEFAULT_ASPECT_RATIO,
          },
        };
      }
      return doc;
    },
  },
];

export const LATEST_DOCUMENT_VERSION = MIGRATIONS.length + 1;

export function migrateDocument(doc: CreatorDocument): CreatorDocument {
  const startVersion = doc.version ?? 1;
  if (startVersion >= LATEST_DOCUMENT_VERSION) {
    return doc;
  }
  let current = { ...doc };
  for (const migration of MIGRATIONS) {
    if (migration.fromVersion >= startVersion) {
      current = migration.migrate(current);
      current = { ...current, version: migration.fromVersion + 1 };
    }
  }
  return current;
}
