import { z } from 'zod';
import type { OutfitTag } from '../components/look/LookMediaComposer';
import type { PosterStickerType } from '../services/postersApi';
import { makeStableId } from '../utils/createStableId';

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

// ── Layer payload schemas ──────────────────────────────────────────

// Effect node — a single adjustment/filter step in a media layer's effect stack.
// Used by the media layer `effects` field (Phase 8 render pipeline).
export const EffectNodeSchema = z.discriminatedUnion('type', [
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

export type EffectNode = z.infer<typeof EffectNodeSchema>;

// Mask ref — alpha mask for true cutout (Phase 8 segmentation).
// Stored by ID in the document's asset registry; layers reference it via `maskRef`.
export type MaskRef = {
  type: 'alpha-mask';
  uri: string;            // local mask URI
  sourceAssetId: string;  // original asset
  modelVersion?: string;  // segmentation model version
  featherPx?: number;     // edge feathering
  invert?: boolean;       // invert mask
};

const TextLayerPayloadSchema = z.object({
  text: z.string().min(1).max(500),
  textStyle: z.enum(['headline', 'editorial', 'clean', 'compact', 'handwritten', 'bubble', 'deco', 'poster', 'squeeze', 'signature']).default('clean'),
  // Canonical fill as structured RGBA (CreatorColor). Source of truth for
  // text color (spec 06_TEXT_TYPOGRAPHY §1). Optional — the migration
  // function and renderer default to white when absent, preserving
  // backward compat with legacy text layers that only have textColor.
  fill: z.object({
    space: z.literal('srgb'),
    r: z.number().min(0).max(1),
    g: z.number().min(0).max(1),
    b: z.number().min(0).max(1),
    a: z.number().min(0).max(1).default(1),
  }).optional(),
  // Backward compat: legacy textColor string. Migrated to `fill` on load
  // by migrateTextLayerPayload. Kept optional so old documents validate.
  textColor: z.string().optional(),
  // Background/pill with real color + padding + radius (spec §1).
  background: z.object({
    color: z.object({
      space: z.literal('srgb'),
      r: z.number(),
      g: z.number(),
      b: z.number(),
      a: z.number(),
    }),
    radius: z.number().min(0).default(4),
    paddingX: z.number().min(0).default(8),
    paddingY: z.number().min(0).default(4),
  }).optional(),
  // Backward compat: legacy backgroundColor string.
  backgroundColor: z.string().optional(),
  // Stroke (outline) with real width + color (spec §1).
  stroke: z.object({
    color: z.object({
      space: z.literal('srgb'),
      r: z.number(),
      g: z.number(),
      b: z.number(),
      a: z.number(),
    }),
    width: z.number().min(0).max(20).default(2),
  }).optional(),
  // Shadow with real blur + offset + color (spec §1).
  shadow: z.object({
    color: z.object({
      space: z.literal('srgb'),
      r: z.number(),
      g: z.number(),
      b: z.number(),
      a: z.number(),
    }),
    blur: z.number().min(0).max(30).default(4),
    offsetX: z.number().default(0),
    offsetY: z.number().default(2),
  }).optional(),
  // Backward compat: legacy textEffect enum. Migrated to stroke/shadow
  // on load by migrateTextLayerPayload.
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
  // Animation timing for text layer entrance (Phase 8 motion)
  animation: z.object({
    type: z.enum(['fade', 'rise', 'type', 'pop', 'slide']),
    durationMs: z.number().min(0),
    delayMs: z.number().min(0).optional(),
  }).optional(),
});

const MediaLayerPayloadSchema = z.object({
  mediaUri: z.string(),
  mediaType: z.enum(['image', 'video']).default('image'),
  contentFit: z.enum(['cover', 'contain', 'fill']).default('cover'),
  thumbnailUri: z.string().optional(),
  videoDurationMs: z.number().nullable().optional(),
  filterId: z.string().optional(),
  trimStartMs: z.number().min(0).optional(),
  trimEndMs: z.number().min(0).optional(),
  opacity: z.number().min(0).max(1).default(1),
  // Timeline operations (speed/volume) — Phase 8 timeline foundation
  speed: z.number().min(0.25).max(4).optional(),      // playback speed 0.25-4.0, default 1.0
  volume: z.number().min(0).max(1).optional(),         // audio volume 0.0-1.0, default 1.0
  // Variable speed curve — precise, dynamic speed ramping along a
  // customizable curve (Instagram Edits parity, August 2026). When present,
  // the renderer samples the curve to compute instantaneous speed at each
  // timeline position. Optional — absent on clips with a single constant speed.
  speedCurve: z.object({
    points: z.array(z.object({
      id: z.string(),
      position: z.number().min(0).max(1),
      speed: z.number().min(0.01).max(4),
    })),
    easing: z.enum(['linear', 'smooth', 'hold']),
  }).optional(),
  // Reverse playback (P1). When true, the clip plays from end to start.
  reversed: z.boolean().optional(),
  // Freeze frame (P1). When set, the clip holds on this timestamp (ms from
  // clip start) for `freezeDurationMs` before continuing playback. Used for
  // dramatic emphasis (Snapchat/Instagram Edits parity).
  freezeFrameMs: z.number().min(0).optional(),
  freezeDurationMs: z.number().min(0).max(10000).optional(),
  // Effect stack — ordered list of adjustments/filters applied to the media
  effects: z.array(EffectNodeSchema).optional(),
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
  options: z.array(z.object({ id: z.string(), label: z.string().min(1).max(50) })).min(2).max(4),
  votes: z.array(z.number()).optional(),
  timerMs: z.number().min(1000).max(604800000).optional(),
  backgroundColor: z.string().optional(),
});

// Quiz sticker — multiple-choice with a correct answer (Instagram 2026 parity)
const QuizLayerPayloadSchema = z.object({
  question: z.string().min(1).max(100),
  options: z.array(z.object({ id: z.string(), label: z.string().min(1).max(50) })).min(2).max(4),
  correctOptionId: z.string().min(1),
  emoji: z.string().default('🎯'),
  timerMs: z.number().min(1000).max(604800000).optional(),
});

// Question box sticker — open-ended text responses (Instagram 2026 parity)
const QuestionLayerPayloadSchema = z.object({
  prompt: z.string().min(1).max(100),
  placeholder: z.string().max(80).default('Type something...'),
  backgroundColor: z.string().default('#9b0202'),
  textColor: z.string().default('#ffffff'),
  timerMs: z.number().min(1000).max(604800000).optional(),
});

// Emoji slider sticker — intensity measurement (Instagram 2026 parity)
const EmojiSliderLayerPayloadSchema = z.object({
  question: z.string().min(1).max(80),
  emoji: z.string().default('😍'),
  endLabel: z.string().max(20).default(''),
  sliderColor: z.string().default('#C9A46A'),
});

// Countdown sticker — count down to a date/time (Instagram 2026 parity)
const CountdownLayerPayloadSchema = z.object({
  label: z.string().min(1).max(40),
  endDateTime: z.string().datetime(),
  color: z.string().default('#C9A46A'),
  textColor: z.string().default('#ffffff'),
});

// Link sticker — clickable URL with custom CTA text (Instagram 2026 parity)
const LinkLayerPayloadSchema = z.object({
  url: z.string().url(),
  ctaText: z.string().max(40).default('Link'),
  backgroundColor: z.string().default('#C9A46A'),
  textColor: z.string().default('#ffffff'),
});

// Location sticker — place name with optional place ID (Instagram/Snapchat parity)
const LocationLayerPayloadSchema = z.object({
  placeName: z.string().min(1).max(80),
  placeId: z.string().optional(),
  countryCode: z.string().max(3).optional(),
});

// Hashtag sticker — clickable hashtag (Instagram parity)
const HashtagLayerPayloadSchema = z.object({
  tag: z.string().min(1).max(100),
  backgroundColor: z.string().default('#C9A46A'),
  textColor: z.string().default('#ffffff'),
});

// Time sticker — current timestamp, live-updating (Instagram/Snapchat parity)
const TimeLayerPayloadSchema = z.object({
  displayTime: z.string().default(() => new Date().toISOString()),
  format: z.enum(['time', 'date', 'datetime']).default('time'),
  textColor: z.string().default('#ffffff'),
  backgroundColor: z.string().optional(),
});

// Weather sticker — current conditions at a location (Instagram/Snapchat parity)
const WeatherLayerPayloadSchema = z.object({
  temperature: z.number(),
  condition: z.string().min(1).max(40),
  locationName: z.string().max(80).default(''),
  emoji: z.string().default('☀️'),
  textColor: z.string().default('#ffffff'),
  backgroundColor: z.string().optional(),
});

const DecorativeLayerPayloadSchema = z.object({
  shape: z.enum(['circle', 'square', 'line', 'arrow', 'star', 'heart', 'triangle', 'hexagon']),
  color: z.string().default('#ffffff'),
  fillColor: z.string().optional(),
  opacity: z.number().min(0).max(1).default(1),
});

// Draw layer — freehand strokes (Instagram/Snapchat parity: pen, marker,
// highlighter, neon, eraser, emoji). Points are normalized 0-1 relative to layer bounds.
const DrawStrokeSchema = z.object({
  points: z.array(z.object({ x: z.number(), y: z.number() })),
  color: z.string().default('#ffffff'),
  width: z.number().min(1).max(50).default(4),
  tool: z.enum(['pen', 'marker', 'highlighter', 'neon', 'eraser', 'emoji']).default('pen'),
  // Emoji brush config — present only when tool === 'emoji'.
  emoji: z.string().optional(),
  emojiSize: z.number().min(8).max(120).default(32),
  emojiSpacing: z.number().min(4).max(100).default(24),
  emojiJitter: z.number().min(0).max(1).default(0),
});

const DrawLayerPayloadSchema = z.object({
  strokes: z.array(DrawStrokeSchema).default([]),
  opacity: z.number().min(0).max(1).default(1),
});

// GIF layer — animated sticker from GIPHY search
const GifLayerPayloadSchema = z.object({
  gifUrl: z.string(),
  stillUrl: z.string().optional(),
  altText: z.string().max(100).default(''),
  source: z.string().optional(),
  opacity: z.number().min(0).max(1).default(1),
});

// Music layer — track sticker (Instagram-style music sticker) and
// timeline audio citizen (spec 09_POSTER_TIMELINE_CAMERA_AUDIO §10).
// Extended for timeline integration: volume, fades, trim, and a
// timeRange so the music track is a real timeline citizen rather than
// just a sticker.
const MusicLayerPayloadSchema = z.object({
  trackName: z.string().min(1).max(120),
  artistName: z.string().max(120).default(''),
  artworkUrl: z.string().optional(),
  previewUrl: z.string().optional(),
  trackId: z.string().optional(),
  startOffsetMs: z.number().min(0).optional(),
  durationMs: z.number().min(1000).optional(),
  isExplicit: z.boolean().optional(),
  opacity: z.number().min(0).max(1).default(1),
  // ── Timeline integration (spec 09 §10 P0) ──
  // Volume for the music track, separate from the original video audio.
  volume: z.number().min(0).max(1).default(1),
  // Fade in/out (linear ramp) in milliseconds.
  fadeInMs: z.number().min(0).default(0),
  fadeOutMs: z.number().min(0).default(0),
  // Trim: where in the source track playback starts/ends.
  trimStartMs: z.number().min(0).optional(),
  trimEndMs: z.number().min(0).optional(),
  // Timeline time range — when the music track is visible/audible
  // within the composition. Inherits from BaseLayerSchema.timeRange
  // but duplicated here for explicit music-layer access.
  timeRange: z.object({
    startMs: z.number(),
    endMs: z.number(),
  }).optional(),
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
  // Timed overlay range for Poster timeline (Phase 8). When present, the layer
  // is only visible during this time window within the page's clip.
  timeRange: z.object({
    startMs: z.number(),
    endMs: z.number(),
  }).optional(),
  // Reference to a MaskRef (alpha mask) stored in the document's asset
  // registry, enabling true cutout via segmentation (Phase 8).
  maskRef: z.string().optional(),
  // Per-layer animation keyframes (Phase 9). When present, the composer
  // interpolates the keyed properties between keyframes over the layer's
  // timeline. Optional — absent on layers without keyframe animation.
  keyframes: z.array(z.object({
    id: z.string(),
    layerId: z.string(),
    property: z.enum(['position', 'scale', 'rotation', 'opacity']),
    timeMs: z.number().min(0),
    value: z.number(),
    easing: z.enum(['linear', 'ease-in', 'ease-out', 'ease-in-out', 'spring']),
  })).optional(),
});

// ── Discriminated union of layer types ─────────────────────────────

export const CreatorLayerSchema = z.discriminatedUnion('type', [
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
  BaseLayerSchema.extend({ type: z.literal('time'), payload: TimeLayerPayloadSchema }),
  BaseLayerSchema.extend({ type: z.literal('weather'), payload: WeatherLayerPayloadSchema }),
]);

export type CreatorLayer = z.infer<typeof CreatorLayerSchema>;

export type LayerType = CreatorLayer['type'];

// ── Page schema ────────────────────────────────────────────────────

export const CreatorPageSchema = z.object({
  id: z.string().min(1),
  durationMs: z.number().int().min(500).max(60000).optional(),
  layers: z.array(CreatorLayerSchema).default([]),
  // Transition applied between this page and the next (Phase 9).
  // References a TransitionPreset id from TransitionPresets.ts.
  transitionId: z.string().optional(),
});

export type CreatorPage = z.infer<typeof CreatorPageSchema>;

// ── Background schema ──────────────────────────────────────────────

export const CreatorBackgroundSchema = z.object({
  type: z.enum(['color', 'gradient', 'image', 'blur']).default('color'),
  value: z.string().default('#1a1a1a'),
  secondaryValue: z.string().optional(),
  // Custom gradient stops — when type='gradient' and the user has edited
  // stops via the GradientEditor. Each stop has a 0..1 position and a hex
  // color string (#RRGGBB or #RRGGBBAA). When absent, the renderer falls
  // back to value/secondaryValue (two-stop preset gradient).
  gradientStops: z.array(z.object({
    position: z.number().min(0).max(1),
    color: z.string(),
  })).optional(),
  // Gradient angle in degrees (0..360). Used when type='gradient'.
  gradientAngle: z.number().min(0).max(360).optional(),
  // For 'blur' type — the asset ID of the source image to blur.
  // The renderer blurs this image and uses it as the canvas background.
  blurAssetId: z.string().optional(),
  blurRadius: z.number().min(0).max(50).optional(),
});

export type CreatorBackground = z.infer<typeof CreatorBackgroundSchema>;

// ── Metadata schema ────────────────────────────────────────────────

export const CreatorMetadataSchema = z.object({
  caption: z.string().max(500).default(''),
  title: z.string().max(120).default(''),
  visibility: z.enum(['public', 'closeFriends', 'private']).default('public'),
  allowReplies: z.boolean().default(true),
  allowReactions: z.boolean().default(true),
  expiresInHours: z.number().int().min(1).max(168).optional(),
  accessibilityDescription: z.string().max(300).optional(),
  allowRemix: z.boolean().default(false),
  sourceDocumentId: z.string().optional(),
  sourceCreatorId: z.string().optional(),
  scheduledFor: z.string().datetime().optional(),
});

export type CreatorMetadata = z.infer<typeof CreatorMetadataSchema>;

// ── Full document schema ───────────────────────────────────────────

export const CreatorDocumentSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['look', 'poster']),
  version: z.number().int().min(1).default(1),
  // WYSIWYG render contract version — identifies the render pipeline revision
  // the authored document targets (Phase 8). Optional; absent on legacy docs.
  renderVersion: z.string().optional(),
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

// ── Look layout helper ──────────────────────────────────────────────
// Computes initial positions/sizes for N media layers on a Look canvas
// so that multi-select never produces N identical full-bleed overlaps.
// Mirrors the layout logic in CreatorContext.autoArrangeLook but is a
// pure function usable during document seeding (before state settles).

export function computeLookLayout(layers: CreatorLayer[]): CreatorLayer[] {
  const mediaLayers = layers.filter((l) => l.type === 'media');
  const otherLayers = layers.filter((l) => l.type !== 'media');
  if (mediaLayers.length === 0) return layers;

  let arranged: CreatorLayer[];
  const n = mediaLayers.length;

  if (n === 1) {
    // 1 → hero composition
    arranged = [{ ...mediaLayers[0], x: 0.5, y: 0.5, width: 0.9, height: 0.9, scale: 1, rotation: 0 }];
  } else if (n === 2) {
    // 2 → balanced editorial pairing
    arranged = [
      { ...mediaLayers[0], x: 0.27, y: 0.5, width: 0.44, height: 0.8, scale: 1, rotation: 0 },
      { ...mediaLayers[1], x: 0.73, y: 0.5, width: 0.44, height: 0.8, scale: 1, rotation: 0 },
    ];
  } else if (n === 3) {
    // 3 → dominant + two supporting
    arranged = [
      { ...mediaLayers[0], x: 0.5, y: 0.42, width: 0.7, height: 0.7, scale: 1, rotation: 0 },
      { ...mediaLayers[1], x: 0.22, y: 0.82, width: 0.3, height: 0.3, scale: 1, rotation: 0 },
      { ...mediaLayers[2], x: 0.78, y: 0.82, width: 0.3, height: 0.3, scale: 1, rotation: 0 },
    ];
  } else {
    // 4+ → scattered collage with collision avoidance
    arranged = mediaLayers.map((layer, i) => {
      const angle = (i / n) * Math.PI * 2;
      const radius = 0.28;
      const cx = 0.5 + Math.cos(angle) * radius;
      const cy = 0.5 + Math.sin(angle) * radius;
      const size = 0.34;
      return {
        ...layer,
        x: Math.max(0.18, Math.min(0.82, cx)),
        y: Math.max(0.18, Math.min(0.82, cy)),
        width: size,
        height: size,
        scale: 1,
        rotation: (i % 2 === 0 ? 1 : -1) * 4,
      };
    });
  }

  // Reassign zIndex in order, preserve non-media layers
  return [...arranged, ...otherLayers].map((l, i) => ({ ...l, zIndex: i }));
}

// ── Canonical aspect-ratio constants ───────────────────────────────
// aspectRatio is ALWAYS width / height.
// Poster (Stories) default: 9:16 portrait → 9 / 16 = 0.5625
// Look default: 4:5 portrait → 4 / 5 = 0.8
export const POSTER_DEFAULT_ASPECT_RATIO = 9 / 16; // 0.5625
export const LOOK_DEFAULT_ASPECT_RATIO = 4 / 5; // 0.8

// Legacy Poster ratio that some old drafts may carry (16:9 landscape).
// Used by the migration path to detect and correct stale documents.
export const LEGACY_POSTER_LANDSCAPE_RATIO = 16 / 9; // 1.777…

// ── Document operations ────────────────────────────────────────────

export function createEmptyDocument(type: 'look' | 'poster'): CreatorDocument {
  return {
    id: makeStableId('doc'),
    type,
    version: 1,
    canvas: {
      aspectRatio: type === 'look' ? LOOK_DEFAULT_ASPECT_RATIO : POSTER_DEFAULT_ASPECT_RATIO,
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
    id: makeStableId('layer', 6),
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

// ── Document migration ─────────────────────────────────────────────

/**
 * Migrate a potentially stale document to the current schema conventions.
 *
 * Currently handles:
 * - Poster documents created with the legacy 16:9 landscape ratio (1.777…)
 *   are corrected to the canonical 9:16 portrait ratio (0.5625).
 *
 * Returns a new document object; does not mutate the input.
 */
export function migrateDocument(doc: CreatorDocument): CreatorDocument {
  let migrated = { ...doc };

  // P0.1: Fix legacy Poster 16:9 landscape ratio → 9:16 portrait
  if (
    migrated.type === 'poster' &&
    Math.abs(migrated.canvas.aspectRatio - LEGACY_POSTER_LANDSCAPE_RATIO) < 0.001
  ) {
    migrated = {
      ...migrated,
      canvas: {
        ...migrated.canvas,
        aspectRatio: POSTER_DEFAULT_ASPECT_RATIO,
      },
    };
  }

  return migrated;
}

// ── Golden composition fixtures ────────────────────────────────────
// Used by editor, preview, serializer, and viewer tests to prove
// editor-to-viewer parity (WYSIWYG). These fixtures exercise the full
// range of layer types, geometry, styles, and canvas properties.

/**
 * Golden Look fixture: a 4:5 portrait collage with two media layers,
 * a cutout placeholder (decorative), text, and a product tag.
 */
export function goldenLookFixture(): CreatorDocument {
  return {
    id: 'golden_look_001',
    type: 'look',
    version: 1,
    canvas: {
      aspectRatio: LOOK_DEFAULT_ASPECT_RATIO, // 4:5 = 0.8
      background: { type: 'color', value: '#0d0d0d' },
    },
    pages: [{
      id: 'page_1',
      layers: [
        // Primary media — full-cover background image
        {
          id: 'media_primary',
          type: 'media',
          x: 0.5, y: 0.5,
          width: 1, height: 1,
          scale: 1, rotation: 0,
          zIndex: 0, locked: false, hidden: false, opacity: 1,
          payload: {
            mediaUri: 'https://cdn.thryftverse.com/golden/look-primary.jpg',
            mediaType: 'image',
            contentFit: 'cover',
            opacity: 1,
          },
        },
        // Secondary media — a cutout-style image positioned upper-right
        {
          id: 'media_secondary',
          type: 'media',
          x: 0.72, y: 0.28,
          width: 0.35, height: 0.35,
          scale: 1.1, rotation: -5,
          zIndex: 2, locked: false, hidden: false, opacity: 0.95,
          payload: {
            mediaUri: 'https://cdn.thryftverse.com/golden/look-cutout.png',
            mediaType: 'image',
            contentFit: 'contain',
            opacity: 0.95,
          },
        },
        // Decorative shape — a circle accent
        {
          id: 'decor_accent',
          type: 'decorative',
          x: 0.2, y: 0.75,
          width: 0.12, height: 0.12,
          scale: 1, rotation: 0,
          zIndex: 3, locked: false, hidden: false, opacity: 0.8,
          payload: {
            shape: 'circle',
            color: '#8b7355',
            opacity: 0.8,
          },
        },
        // Text — editorial headline
        {
          id: 'text_headline',
          type: 'text',
          x: 0.5, y: 0.88,
          width: 0.85, height: 0.08,
          scale: 1, rotation: 0,
          zIndex: 4, locked: false, hidden: false, opacity: 1,
          payload: {
            text: 'Summer Edit',
            textStyle: 'editorial',
            fill: { space: 'srgb', r: 1, g: 1, b: 1, a: 1 },
            textColor: '#ffffff',
            alignment: 'center',
            opacity: 1,
          },
        },
        // Product tag — shoppable hotspot
        {
          id: 'prod_jacket',
          type: 'product',
          x: 0.35, y: 0.45,
          width: 0.08, height: 0.08,
          scale: 1, rotation: 0,
          zIndex: 5, locked: false, hidden: false, opacity: 1,
          payload: {
            listingId: 'listing_golden_001',
            snapshotTitle: 'Vintage Leather Jacket',
            snapshotImageUrl: 'https://cdn.thryftverse.com/golden/jacket.jpg',
            snapshotPriceGbp: 85,
            availability: 'active',
            hotspotLabel: 'Vintage Leather Jacket',
          },
        },
      ],
    }],
    metadata: {
      caption: 'Golden look fixture — do not modify',
      title: 'Golden Look',
      visibility: 'public',
      allowReplies: true,
      allowReactions: true,
      allowRemix: true,
    },
    updatedAt: '2026-07-14T00:00:00.000Z',
  };
}

/**
 * Golden Poster fixture: a 9:16 portrait story with one page containing
 * an image, styled text, a product sticker, rotation, opacity, and duration.
 */
export function goldenPosterFixture(): CreatorDocument {
  return {
    id: 'golden_poster_001',
    type: 'poster',
    version: 1,
    canvas: {
      aspectRatio: POSTER_DEFAULT_ASPECT_RATIO, // 9:16 = 0.5625
      background: { type: 'color', value: '#1a1a1a' },
    },
    pages: [{
      id: 'page_1',
      durationMs: 5000,
      layers: [
        // Full-cover media background
        {
          id: 'media_p1',
          type: 'media',
          x: 0.5, y: 0.5,
          width: 1, height: 1,
          scale: 1, rotation: 0,
          zIndex: 0, locked: false, hidden: false, opacity: 1,
          payload: {
            mediaUri: 'https://cdn.thryftverse.com/golden/poster-bg.jpg',
            mediaType: 'image',
            contentFit: 'cover',
            opacity: 1,
          },
        },
        // Styled text — headline with rotation and partial opacity
        {
          id: 'text_styled_1',
          type: 'text',
          x: 0.5, y: 0.18,
          width: 0.8, height: 0.12,
          scale: 1.2, rotation: -3,
          zIndex: 10, locked: false, hidden: false, opacity: 0.9,
          payload: {
            text: 'New Drop',
            textStyle: 'headline',
            fill: { space: 'srgb', r: 1, g: 1, b: 1, a: 1 },
            textColor: '#ffffff',
            alignment: 'center',
            opacity: 0.9,
          },
        },
        // Caption text
        {
          id: 'caption_p1',
          type: 'text',
          x: 0.5, y: 0.85,
          width: 0.9, height: 0.1,
          scale: 1, rotation: 0,
          zIndex: 11, locked: false, hidden: false, opacity: 1,
          payload: {
            text: 'Available now — link in bio',
            textStyle: 'clean',
            fill: { space: 'srgb', r: 1, g: 1, b: 1, a: 1 },
            textColor: '#ffffff',
            alignment: 'center',
            opacity: 1,
          },
        },
        // Product sticker
        {
          id: 'prod_sticker_1',
          type: 'product',
          x: 0.5, y: 0.5,
          width: 0.2, height: 0.1,
          scale: 1, rotation: 0,
          zIndex: 15, locked: false, hidden: false, opacity: 1,
          payload: {
            listingId: 'listing_golden_002',
            snapshotTitle: 'Limited Edition Tee',
            snapshotImageUrl: 'https://cdn.thryftverse.com/golden/tee.jpg',
            snapshotPriceGbp: 35,
            availability: 'active',
          },
        },
      ],
    }],
    metadata: {
      caption: '',
      title: 'Golden Poster',
      visibility: 'public',
      allowReplies: true,
      allowReactions: true,
      expiresInHours: 24,
      allowRemix: false,
    },
    updatedAt: '2026-07-14T00:00:00.000Z',
  };
}


