import { z } from 'zod';

// ── Layer payload schemas ──────────────────────────────────────────

// Effect node — a single adjustment/filter step in a media layer's effect stack.
// Used by the media layer `effects` field (Phase 8 render pipeline).
/**
 * Recipe nodes — the render-graph subset that registry effects
 * (`tools/effects/AIEffectRegistry`) emit from `render(intensity)`. A
 * `filter` node persists its recipe so registry/composed effects survive
 * export and backend rendering even when the `id` is not one of the 10
 * named `FILTER_PRESET_MATRICES` presets. Without it, an unknown filter
 * id fails closed to identity and the authored effect silently drops.
 */
export const RecipeNodeSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('matrix'),
    matrix: z.array(z.number()).length(20),
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
    type: z.literal('grain'),
    amount: z.number(),
  }),
  z.object({
    type: z.literal('vignette'),
    amount: z.number(),
  }),
]);
export type RecipeNode = z.infer<typeof RecipeNodeSchema>;

export const EffectNodeSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('filter'),
    id: z.string(),
    amount: z.number(),
    /** Baked render recipe (matrix/adjust/blur/grain/vignette nodes at
     *  intensity 1) for registry effects. Absent for the 10 named
     *  presets, which resolve by `id`. */
    recipe: z.array(RecipeNodeSchema).optional(),
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
//
// Per §8.3: mask dimensions, source checksum, model/version, and manual
// refinements are persisted so the cutout is reproducible and auditable.
// The generated cutout is NOT a trustless permanent replacement for the
// original — the source image URI is preserved on the layer and the mask
// is applied non-destructively at render time.
export type MaskRef = {
  type: 'alpha-mask';
  uri: string;            // local mask URI
  sourceAssetId: string;  // original asset
  modelVersion?: string;  // segmentation model version
  featherPx?: number;     // edge feathering
  invert?: boolean;       // invert mask
  maskWidth?: number;     // mask pixel width (persisted for reproducibility)
  maskHeight?: number;    // mask pixel height (persisted for reproducibility)
  sourceChecksum?: string; // checksum of the source image (detect drift)
  strokeCount?: number;   // number of manual refinement strokes applied
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
  fontSize: z.number().min(8).max(200).optional(),
  bold: z.boolean().optional(),
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
  isCaption: z.boolean().optional(),
});

const MediaLayerPayloadSchema = z.object({
  mediaUri: z.string(),
  /** Durable upload evidence for the primary media object. */
  mediaFinalizationId: z.string().optional(),
  mediaAssetId: z.string().optional(),
  mediaType: z.enum(['image', 'video']).default('image'),
  contentFit: z.enum(['cover', 'contain', 'fill']).default('cover'),
  thumbnailUri: z.string().optional(),
  thumbnailFinalizationId: z.string().optional(),
  thumbnailMediaAssetId: z.string().optional(),
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
  // Audio fade in/out (linear ramp) in milliseconds. Applied to the video's
  // embedded audio track. 0 = no fade. Max 5000ms (5s) matches
  // AudioFadeControls. These are committed via the AudioFadeControls sheet
  // and read by the playback pipeline to ramp volume at clip boundaries.
  fadeInMs: z.number().min(0).max(5000).optional(),
  fadeOutMs: z.number().min(0).max(5000).optional(),
  // Focal point for art-directed crops (AGENTS.md §4 — no blind `cover`).
  // Normalized 0–1 for both x and y. When present and contentFit is 'cover',
  // the renderer shifts the crop window so the focal point stays in frame.
  // Defaults to center (0.5, 0.5) when absent.
  focalPoint: z.object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
  }).optional(),
  // Effect stack — ordered list of adjustments/filters applied to the media
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
  /** Ionicons glyph name when the sticker is icon-based (arrows, symbols,
   *  decorative icons). When set, the renderer draws this glyph — the
   *  picked sticker — instead of the generic `shape` primitive. */
  icon: z.string().optional(),
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
  // Logical size of the drawing surface the stroke was authored on — emoji
  // size/spacing are authored in those pixels and scaled by the renderer's
  // layer size. Optional for backward compatibility with strokes saved
  // before the workspace tracked its dimensions.
  sourceWidth: z.number().optional(),
  sourceHeight: z.number().optional(),
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
  // Per §8.3: auto-layout NEVER silently moves a manually positioned
  // object after the creator has edited. This flag is set to true when
  // the user manually drags, scales, or rotates a layer. Auto-layout
  // skips layers with this flag set, preserving authored positions.
  // Optional — absent (undefined) is treated as false (auto-arrangeable).
  manuallyPositioned: z.boolean().optional(),
  // Timed overlay range for Poster timeline (Phase 8). When present, the layer
  // is only visible during this time window within the page's clip.
  timeRange: z.object({
    startMs: z.number(),
    endMs: z.number(),
  }).optional(),
  // Reference to a MaskRef (alpha mask) stored in the document's asset
  // registry, enabling true cutout via segmentation (Phase 8).
  maskRef: z.string().optional(),
  // Upload receipts for the mask PNG — the mask is a media-bearing ref
  // walked by walkMediaReferences (role 'mask'), so the cutout asset is
  // uploaded and coverage-verified like every other media reference.
  maskFinalizationId: z.string().optional(),
  maskMediaAssetId: z.string().optional(),
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
  // Object pin — binds this layer to a normalized anchor point on another
  // (typically media) layer so it follows that point as the target layer
  // moves/scales/rotates over time via keyframes. Optional — absent on
  // layers that are not pinned. The pin-resolution module lives in git
  // history (StickerPinTracker) — reintroduce it when a UI wires pinning
  // end-to-end (anchor pick → render resolve → publish parity).
  pin: z.object({
    layerId: z.string().min(1),
    anchor: z.object({
      x: z.number().min(0).max(1),
      y: z.number().min(0).max(1),
    }),
  }).optional(),
  // Clip anchor — binds this overlay/timed layer to a specific media clip
  // so it follows the clip when the clip is reordered, trimmed, or split.
  // When absent, the overlay's timeRange is relative to the page/clip it
  // lives on (legacy behavior). When present, the overlay's timeRange is
  // relative to the anchored clip's start, and the overlay moves with
  // the clip on reorder. See PosterComposerScreen overlay derivation.
  clipId: z.string().optional(),
});

// Adjustment layer payload — applies an effect stack as an adjustment
// layer across the whole timeline (Meta Edits August 2026 feature).
// Unlike visible layers, an adjustment layer is not rendered directly;
// instead, its effects are merged with each clip's own effects during
// playback. The `scope` field controls which clips the adjustment
// applies to: 'all' for every clip, or an explicit list of clip IDs.
const AdjustmentLayerPayloadSchema = z.object({
  // The ordered effect stack to apply to targeted clips.
  effects: z.array(EffectNodeSchema).default([]),
  // Which clips this adjustment layer applies to.
  // 'all' = every clip in the timeline; { clipIds } = only the listed clips.
  scope: z.union([
    z.literal('all'),
    z.object({ clipIds: z.array(z.string()) }),
  ]).default('all'),
  // Whether the adjustment layer is active.
  enabled: z.boolean().default(true),
  // Blend opacity for the effect (0..1). At 1, the full effect is
  // applied; at 0, no effect is applied. Intermediate values blend
  // the effect with the original via intensity interpolation.
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
  BaseLayerSchema.extend({ type: z.literal('adjustment'), payload: AdjustmentLayerPayloadSchema }),
]);

export type CreatorLayer = z.infer<typeof CreatorLayerSchema>;

export type LayerType = CreatorLayer['type'];

// ── Adjustment layer (Meta Edits August 2026) ───────────────────────
// Convenience type for the adjustment layer payload and the layer itself.
export type AdjustmentLayerPayload = z.infer<typeof AdjustmentLayerPayloadSchema>;
export type AdjustmentLayer = Extract<CreatorLayer, { type: 'adjustment' }>;
