/**
 * Server-side composition renderer (P0-8).
 *
 * Reads a `composition_document` (the CreatorDocument JSONB the frontend
 * already sends) and burns the authored layers — crop, focal point,
 * filters/adjustments, text, stickers — into a single flattened image using
 * the existing `sharp` pipeline. The rendered image replaces the source
 * upload as the canonical `media_url` so feed/carousel discovery surfaces
 * show the authored composition rather than the raw source.
 *
 * Image compositions are rendered fully. Video compositions burn authored
 * trim and speed edits into an MP4 via FFmpeg; a plain video with no edits
 * (or any render failure) falls back to the source URL.
 *
 * The renderer is defensive by contract: a malformed document, an
 * unreachable source, or any render error returns `null` so the
 * publication flow falls back to the source media URL rather than failing
 * the publication.
 *
 * @packageDocumentation
 */

import { randomUUID } from 'node:crypto';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { logger } from '../logger.js';
import { runFfmpeg } from './ffmpeg.js';
import { probeMedia } from './ffprobe.js';

/** The sharp pipeline instance type (avoids relying on the sharp namespace). */
type SharpPipeline = ReturnType<typeof sharp>;
/** The metadata object returned by `sharp#metadata()`. */
type SharpMetadata = Awaited<ReturnType<SharpPipeline['metadata']>>;

export interface RenderedComposition {
  buffer: Buffer;
  contentType: string;
  width: number;
  height: number;
}

export interface RenderCompositionOptions {
  /** Page index to render (defaults to the cover page). */
  pageIndex?: number;
  /**
   * Optional progress callback receiving a 0–1 fraction. Currently used by
   * the video render path (FFmpeg burn-in); the image path does not report
   * progress.
   */
  onProgress?: (fraction: number) => void;
}

// ── Defensive document types ───────────────────────────────────────────
// The canonical CreatorDocument schema lives on the frontend (Zod
// discriminated union of 20 layer types). The backend does not import it;
// instead it parses defensively so an unknown/forward-compatible layer
// type degrades gracefully rather than failing the render.

interface EffectNode {
  type: string;
  exposure?: number;
  contrast?: number;
  saturation?: number;
  temperature?: number;
  tint?: number;
  fade?: number;
  vignette?: number;
  sharpness?: number;
  highlights?: number;
  shadows?: number;
  amount?: number;
  radius?: number;
  id?: string;
}

interface CompositionLayer {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
  rotation: number;
  zIndex: number;
  hidden: boolean;
  opacity: number;
  payload: Record<string, unknown>;
}

interface CompositionPage {
  id: string;
  layers: CompositionLayer[];
}

interface CompositionBackground {
  type: string;
  value: string;
  secondaryValue?: string;
  gradientStops?: Array<{ position: number; color: string }>;
  gradientAngle?: number;
}

interface CompositionDocument {
  type: string;
  canvas: {
    aspectRatio: number;
    background: CompositionBackground;
  };
  pages: CompositionPage[];
  metadata?: { coverPageIndex?: number };
}

// ── Render constants ───────────────────────────────────────────────────

const RENDER_WIDTH = 1080;
const MIN_DIMENSION = 200;
const MAX_DIMENSION = 4096;
const OUTPUT_QUALITY = 90;

// ── Filter preset color matrices ───────────────────────────────────────
// IMPORTANT: These 10 flagship filter ColorMatrix definitions are EXACT
// copies of the `colorMatrix` field of each entry in the `FILTERS` array
// in `frontend/src/components/poster/filters/filterConfig.ts` and the
// inlined `FILTER_PRESET_MATRICES` in
// `frontend/modules/thryft-media-export/src/index.ts`. They are inlined
// here — rather than imported — because the backend must not depend on
// frontend modules. If the source filter definitions in filterConfig.ts
// change, these matrices MUST be updated to match exactly so the server
// render produces the same visual result as the live preview and the JS
// export fallback.
//
// Format: 4×5 row-major (20 floats). SVG feColorMatrix operates in the
// normalised 0–1 range, matching Skia's ColorMatrix semantics.
//   R' = R*m[0] + G*m[1] + B*m[2] + A*m[3] + m[4]
//   G' = R*m[5] + G*m[6] + B*m[7] + A*m[8] + m[9]
//   B' = R*m[10] + G*m[11] + B*m[12] + A*m[13] + m[14]
//   A' = R*m[15] + G*m[16] + B*m[17] + A*m[18] + m[19]

const IDENTITY_MATRIX: number[] = [
  1, 0, 0, 0, 0,
  0, 1, 0, 0, 0,
  0, 0, 1, 0, 0,
  0, 0, 0, 1, 0,
];

export const FILTER_PRESET_MATRICES: Record<string, number[]> = {
  normal: IDENTITY_MATRIX,
  warm: [
    1.12, 0, 0, 0, 0.02,
    0, 1.02, 0, 0, 0,
    0, 0, 0.88, 0, -0.02,
    0, 0, 0, 1, 0,
  ],
  cool: [
    0.88, 0, 0, 0, -0.02,
    0, 1.02, 0, 0, 0,
    0, 0, 1.12, 0, 0.02,
    0, 0, 0, 1, 0,
  ],
  vintage: [
    0.575, 0.538, 0.132, 0, 0,
    0.544, 0.480, 0.118, 0, 0,
    0.390, 0.374, 0.092, 0, 0,
    0, 0, 0, 1, 0,
  ],
  bw: [
    0.329, 0.646, 0.125, 0, -0.05,
    0.329, 0.646, 0.125, 0, -0.05,
    0.329, 0.646, 0.125, 0, -0.05,
    0, 0, 0, 1, 0,
  ],
  cinematic: [
    1.15, 0, 0, 0, -0.075,
    0, 1.15, 0, 0, -0.075,
    0, 0, 1.20, 0, -0.10,
    0, 0, 0, 1, 0,
  ],
  fade: [
    0.82, 0.08, 0.08, 0, 0.06,
    0.08, 0.82, 0.08, 0, 0.06,
    0.08, 0.08, 0.82, 0, 0.06,
    0, 0, 0, 1, 0,
  ],
  vivid: [
    1.331, -0.194, -0.038, 0, -0.05,
    -0.099, 1.236, -0.038, 0, -0.05,
    -0.099, -0.194, 1.392, 0, -0.05,
    0, 0, 0, 1, 0,
  ],
  noir: [
    0.389, 0.763, 0.148, 0, -0.15,
    0.389, 0.763, 0.148, 0, -0.15,
    0.389, 0.763, 0.148, 0, -0.15,
    0, 0, 0, 1, 0,
  ],
  golden: [
    1.15, 0.05, 0, 0, 0.03,
    0.05, 1.05, 0.02, 0, 0.01,
    0, 0.02, 0.82, 0, -0.02,
    0, 0, 0, 1, 0,
  ],
};

/**
 * Interpolate between the identity matrix and a filter's target matrix
 * by intensity (0..1). At intensity 0 the result is identity (original),
 * at intensity 1 the result is the full filter effect. Mirrors
 * `interpolateColorMatrix` in filterConfig.ts and `interpolateMatrix` in
 * the JS export module exactly.
 *
 * Formula: matrix[i] = identity[i] + (target[i] - identity[i]) * intensity
 */
export function interpolateMatrix(target: number[], intensity: number): number[] {
  const t = Math.max(0, Math.min(1, intensity));
  return IDENTITY_MATRIX.map((id, i) => id + (target[i] - id) * t);
}

/** Returns true when the matrix is effectively the identity (no-op). */
function isIdentityMatrix(m: number[]): boolean {
  return m.every((v, i) => Math.abs(v - IDENTITY_MATRIX[i]) < 1e-6);
}

/**
 * Multiply two 4×5 color matrices (row-major). Used to combine multiple
 * filter preset effects into a single matrix before applying via SVG.
 * Mirrors `multiplyMatrix` in the JS export module.
 */
function multiplyMatrix(a: readonly number[], b: readonly number[]): number[] {
  const result = new Array(20).fill(0);
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 5; col++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) {
        sum += a[row * 5 + k] * b[k * 5 + col];
      }
      if (col === 4) sum += a[row * 5 + 4];
      result[row * 5 + col] = sum;
    }
  }
  return result;
}

/**
 * Apply a 4×5 color matrix to an image buffer via an SVG `feColorMatrix`
 * filter. The image is embedded as a base64 PNG data URI inside the SVG,
 * the filter is applied, and the SVG is rasterised back to a PNG buffer.
 * This is then composited over the original buffer with `blend: 'over'`
 * so the filtered result replaces the source pixels.
 *
 * SVG `feColorMatrix` operates in the normalised 0–1 range, matching the
 * Skia ColorMatrix semantics used by the frontend preview.
 */
async function applyColorMatrixViaSvg(
  buffer: Buffer,
  width: number,
  height: number,
  matrix: number[],
): Promise<Buffer> {
  const matrixStr = matrix.map((v) => v.toFixed(6)).join(' ');
  const base64 = buffer.toString('base64');
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
  <defs>
    <filter id="cm" x="0%" y="0%" width="100%" height="100%">
      <feColorMatrix type="matrix" values="${matrixStr}"/>
    </filter>
  </defs>
  <image x="0" y="0" width="${width}" height="${height}" xlink:href="data:image/png;base64,${base64}" filter="url(#cm)"/>
</svg>`;
  const filtered = await sharp(Buffer.from(svg)).png().toBuffer();
  // Composite the filtered result over the original so the filtered
  // pixels replace the source (blend: 'over' with an opaque overlay).
  return sharp(buffer)
    .composite([{ input: filtered, blend: 'over' }])
    .png()
    .toBuffer();
}

// ── Helpers ────────────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function num(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function bool(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function parseDocument(doc: unknown): CompositionDocument | null {
  if (!doc || typeof doc !== 'object') return null;
  const root = doc as Record<string, unknown>;
  const canvas = root['canvas'];
  const pages = root['pages'];
  if (!canvas || typeof canvas !== 'object' || !Array.isArray(pages)) return null;

  const c = canvas as Record<string, unknown>;
  const aspectRatio = num(c['aspectRatio'], 0.8);
  const background = (c['background'] ?? { type: 'color', value: '#1a1a1a' }) as CompositionBackground;

  const parsedPages: CompositionPage[] = pages.map((raw) => {
    const page = raw as Record<string, unknown>;
    const layers = Array.isArray(page['layers']) ? page['layers'] : [];
    return {
      id: str(page['id'], 'page'),
      layers: layers.map(parseLayer).filter((l): l is CompositionLayer => l !== null),
    };
  });

  return {
    type: str(root['type'], 'look'),
    canvas: { aspectRatio, background },
    pages: parsedPages,
    metadata: root['metadata'] as CompositionDocument['metadata'] | undefined,
  };
}

function parseLayer(raw: unknown): CompositionLayer | null {
  if (!raw || typeof raw !== 'object') return null;
  const l = raw as Record<string, unknown>;
  const payload = l['payload'];
  return {
    id: str(l['id'], 'layer'),
    type: str(l['type'], 'unknown'),
    x: num(l['x'], 0.5),
    y: num(l['y'], 0.5),
    width: num(l['width'], 0.4),
    height: num(l['height'], 0.4),
    scale: num(l['scale'], 1),
    rotation: num(l['rotation'], 0),
    zIndex: num(l['zIndex'], 0),
    hidden: bool(l['hidden'], false),
    opacity: num(l['opacity'], 1),
    payload: payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {},
  };
}

function parseEffects(payload: Record<string, unknown>): EffectNode[] {
  const raw = payload['effects'];
  if (!Array.isArray(raw)) return [];
  return raw.filter((e): e is EffectNode => e !== null && typeof e === 'object') as EffectNode[];
}

/**
 * A composition is "non-trivial" when it carries authored edits that would
 * be lost if the source URL were served directly: overlay layers (text,
 * stickers, draw, gif), media adjustments (effects, non-center focal point,
 * non-cover fit, reduced opacity), multiple media layers, or a non-solid
 * background. The publication flow uses this to skip rendering for plain
 * single-image posts where burning would be a wasteful re-encode.
 */
export function isCompositionNonTrivial(doc: unknown): boolean {
  const parsed = parseDocument(doc);
  if (!parsed) return false;

  const bg = parsed.canvas.background;
  if (bg.type !== 'color' || (bg.value && bg.value !== '#1a1a1a' && bg.value !== '#000000')) {
    return true;
  }

  const mediaLayers = parsed.pages.flatMap((p) => p.layers.filter((l) => l.type === 'media'));
  if (mediaLayers.length !== 1) return mediaLayers.length > 1;

  const overlayTypes = new Set([
    'text', 'decorative', 'draw', 'gif', 'mention', 'vote', 'quiz',
    'question', 'emojiSlider', 'countdown', 'link', 'location', 'hashtag',
    'time', 'weather', 'product', 'look',
  ]);
  for (const page of parsed.pages) {
    for (const layer of page.layers) {
      if (layer.hidden) continue;
      if (overlayTypes.has(layer.type)) return true;
    }
  }

  const media = mediaLayers[0];
  if (!media) return false;
  if (media.opacity < 1) return true;

  const focal = media.payload['focalPoint'];
  if (focal && typeof focal === 'object') {
    const f = focal as Record<string, unknown>;
    if (num(f['x'], 0.5) !== 0.5 || num(f['y'], 0.5) !== 0.5) return true;
  }
  if (str(media.payload['contentFit'], 'cover') !== 'cover') return true;
  if (parseEffects(media.payload).length > 0) return true;

  // Video trim/speed edits are non-trivial: they require an FFmpeg burn-in
  // to be reflected in the published media. A plain video with no authored
  // timeline edits is trivial (the source URL can be served directly).
  if (str(media.payload['mediaType'], 'image') === 'video') {
    const trimStartMs = num(media.payload['trimStartMs'], 0);
    const trimEndMs = num(media.payload['trimEndMs'], 0);
    const speed = num(media.payload['speed'], 1);
    const durationMs = num(media.payload['videoDurationMs'], 0);
    if (trimStartMs > 0) return true;
    if (durationMs > 0 && trimEndMs > 0 && trimEndMs < durationMs) return true;
    if (speed !== 1) return true;
  }

  return false;
}

/**
 * The set of layer types that count as authored overlays (burn-in required).
 * Mirrors the set in {@link isCompositionNonTrivial} so the two checks stay
 * aligned on what constitutes a non-trivial visual edit.
 */
const OVERLAY_LAYER_TYPES = new Set([
  'text', 'decorative', 'draw', 'gif', 'mention', 'vote', 'quiz',
  'question', 'emojiSlider', 'countdown', 'link', 'location', 'hashtag',
  'time', 'weather', 'product', 'look',
]);

/**
 * Classify a composition document into the cheapest FFmpeg render path that
 * can faithfully reproduce the authored edits. This is a finer-grained
 * refinement of {@link isCompositionNonTrivial} (which the publication
 * service keeps using as its fail-closed "does this need rendering at all?"
 * gate): `trivial` corresponds to a non-non-trivial document, while `remux`
 * and `transcode` are both non-trivial.
 *
 * - `'trivial'` — a single full-frame video with no authored edits. The
 *   source URL can be served directly (no render at all).
 * - `'remux'` — a single video whose only edits are trim and/or mute. These
 *   can be applied with a stream copy (`-c copy`) remux: trim via input-seek
 *   (`-ss`/`-t`), mute via `-an`. No re-encode, ~10x faster, lossless.
 * - `'transcode'` — anything else (speed change, overlays, filters, reverse,
 *   freeze frame, variable speed curve, audio fades, partial volume,
 *   multi-clip). Requires a full re-encode.
 *
 * Defensive by contract: a malformed, unknown, or forward-compatible shape
 * degrades to `'transcode'` (fail safe, not fail open) so an unrecognised
 * edit never silently publishes the unedited source.
 */
export function getVideoRenderPath(doc: unknown): 'trivial' | 'remux' | 'transcode' {
  const parsed = parseDocument(doc);
  if (!parsed) return 'transcode';

  // A non-solid background is a visual edit (it can show around a contained
  // video) and is not remuxable.
  const bg = parsed.canvas.background;
  if (bg.type !== 'color' || (bg.value && bg.value !== '#1a1a1a' && bg.value !== '#000000')) {
    return 'transcode';
  }

  const mediaLayers = parsed.pages.flatMap((p) => p.layers.filter((l) => l.type === 'media'));
  // Multi-clip compositions require compositing → transcode.
  if (mediaLayers.length !== 1) return 'transcode';

  // Any visible overlay layer (text, stickers, draw, gif, …) needs a
  // burn-in → transcode.
  for (const page of parsed.pages) {
    for (const layer of page.layers) {
      if (layer.hidden) continue;
      if (OVERLAY_LAYER_TYPES.has(layer.type)) return 'transcode';
    }
  }

  const media = mediaLayers[0];
  if (!media) return 'transcode';

  // Only video compositions are classified here; an image-only document has
  // no remux path (it is handled by the sharp image renderer).
  if (str(media.payload['mediaType'], 'image') !== 'video') return 'transcode';

  // Visual adjustments to the media layer itself require a re-encode.
  if (media.opacity < 1) return 'transcode';
  const focal = media.payload['focalPoint'];
  if (focal && typeof focal === 'object') {
    const f = focal as Record<string, unknown>;
    if (num(f['x'], 0.5) !== 0.5 || num(f['y'], 0.5) !== 0.5) return 'transcode';
  }
  if (str(media.payload['contentFit'], 'cover') !== 'cover') return 'transcode';
  if (parseEffects(media.payload).length > 0) return 'transcode';

  // Timeline edits that fundamentally alter the stream and cannot be done
  // with a stream copy.
  const speed = num(media.payload['speed'], 1);
  if (speed !== 1) return 'transcode';
  if (bool(media.payload['reversed'], false)) return 'transcode';
  if (media.payload['freezeFrameMs'] !== undefined || media.payload['freezeDurationMs'] !== undefined) {
    return 'transcode';
  }
  if (media.payload['speedCurve'] !== undefined) return 'transcode';
  // Audio fades and partial volume require an audio re-encode/filter.
  if (media.payload['fadeInMs'] !== undefined || media.payload['fadeOutMs'] !== undefined) {
    return 'transcode';
  }
  const volume = num(media.payload['volume'], 1);
  if (volume > 0 && volume < 1) return 'transcode';

  // Trim: a non-zero start, or an end earlier than the source duration.
  const trimStartMs = num(media.payload['trimStartMs'], 0);
  const trimEndMs = num(media.payload['trimEndMs'], 0);
  const durationMs = num(media.payload['videoDurationMs'], 0);
  const hasTrim = trimStartMs > 0
    || (durationMs > 0 && trimEndMs > 0 && trimEndMs < durationMs);

  // Mute is authored as `volume === 0` (the composition schema has no
  // dedicated mute flag; the timeline audio panel writes volume 0).
  const hasMute = volume === 0;

  if (!hasTrim && !hasMute) return 'trivial';
  return 'remux';
}

// ── Source fetching ────────────────────────────────────────────────────

async function fetchSourceBuffer(url: string): Promise<Buffer> {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) {
    throw new Error(`fetch failed: HTTP ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// ── Focal-point crop ───────────────────────────────────────────────────

/**
 * Compute the source crop region for an art-directed cover crop that keeps
 * the focal point in frame. Mirrors the frontend's focal-point crop logic:
 * the crop window matches the target aspect ratio and is centred on the
 * focal point, clamped to the source bounds.
 */
function computeFocalCrop(
  srcW: number,
  srcH: number,
  targetW: number,
  targetH: number,
  focalX: number,
  focalY: number,
): { left: number; top: number; width: number; height: number } {
  const srcAspect = srcW / srcH;
  const targetAspect = targetW / targetH;
  let cropW: number;
  let cropH: number;
  if (srcAspect > targetAspect) {
    cropH = srcH;
    cropW = cropH * targetAspect;
  } else {
    cropW = srcW;
    cropH = cropW / targetAspect;
  }
  let left = focalX * srcW - cropW / 2;
  let top = focalY * srcH - cropH / 2;
  left = clamp(left, 0, srcW - cropW);
  top = clamp(top, 0, srcH - cropH);
  return {
    left: Math.round(left),
    top: Math.round(top),
    width: Math.round(cropW),
    height: Math.round(cropH),
  };
}

// ── Effect application ─────────────────────────────────────────────────

/**
 * Apply pixel-level effects (brightness/exposure, saturation, contrast,
 * blur, sharpen, filter presets) to a sharp pipeline. Vignette/
 * temperature/fade are applied as SVG overlays after compositing because
 * they are spatial or tonal blends that sharp cannot express as a single
 * pixel operation.
 *
 * Filter preset effects (`effect.type === 'filter'`) apply the 10 flagship
 * color matrices via an SVG `feColorMatrix` overlay. The matrices are
 * inlined from `filterConfig.ts` (see {@link FILTER_PRESET_MATRICES}).
 * Unknown or retired filter IDs fail closed to identity (no effect).
 *
 * The function is async because filter application requires rasterising
 * an intermediate buffer through an SVG pipeline.
 */
async function applyPixelEffects(
  image: SharpPipeline,
  effects: EffectNode[],
  width: number,
  height: number,
): Promise<SharpPipeline> {
  let result = image;
  let filterMatrix: number[] | undefined;

  for (const effect of effects) {
    if (effect.type === 'adjust') {
      const brightness = effect.exposure !== undefined
        ? clamp(1 + effect.exposure * 0.5, 0.1, 3)
        : undefined;
      const saturation = effect.saturation !== undefined
        ? clamp(1 + effect.saturation, 0, 3)
        : undefined;
      if (brightness !== undefined || saturation !== undefined) {
        result = result.modulate({ brightness, saturation });
      }
      if (effect.contrast !== undefined) {
        const c = clamp(effect.contrast, -1, 1);
        const slope = 1 + c;
        result = result.linear(slope, -128 * c);
      }
      if (effect.sharpness !== undefined && effect.sharpness > 0) {
        result = result.sharpen({ sigma: clamp(effect.sharpness * 2, 0.1, 5) });
      }
    } else if (effect.type === 'blur') {
      const radius = clamp(num(effect.radius, 1), 0.3, 100);
      result = result.blur(radius);
    } else if (effect.type === 'filter') {
      // Look up the inlined filter preset matrix by the effect's id (the
      // filter preset name). Interpolate by the effect's amount (clamped
      // 0..1) and multiply into the running color matrix. Unknown or
      // retired filter IDs fail closed to identity (no effect).
      const filterId = str(effect.id, '');
      const target = FILTER_PRESET_MATRICES[filterId];
      if (target) {
        const intensity = clamp(num(effect.amount, 0), 0, 1);
        const m = interpolateMatrix(target, intensity);
        filterMatrix = filterMatrix ? multiplyMatrix(filterMatrix, m) : m;
      }
    }
  }

  // Apply the accumulated filter color matrix via SVG feColorMatrix.
  // Sharp has no direct 4×5 color-matrix API, so we rasterise the pipeline
  // to a PNG buffer, embed it in an SVG with feColorMatrix, and composite
  // the filtered result back over the original.
  if (filterMatrix && !isIdentityMatrix(filterMatrix) && width > 0 && height > 0) {
    try {
      const buffer = await result.ensureAlpha().png().toBuffer();
      const filtered = await applyColorMatrixViaSvg(buffer, width, height, filterMatrix);
      result = sharp(filtered);
    } catch (error) {
      // A filter application failure must not blank the render — log and
      // fall through with the unfiltered pipeline so the rest of the
      // composition (crop, text, stickers) still publishes.
      logger.warn(
        { error: String(error) },
        '[compositionRenderer] filter color matrix application failed — skipping filter',
      );
    }
  }

  return result;
}

/**
 * Build an SVG overlay for spatial/tonal effects (vignette, temperature,
 * fade) that cannot be expressed as a single sharp pixel operation.
 * Returns null when no overlay effect is present.
 */
function buildEffectOverlay(
  width: number,
  height: number,
  effects: EffectNode[],
): Buffer | null {
  const overlays: string[] = [];
  for (const effect of effects) {
    if (effect.type === 'vignette' && effect.amount !== undefined) {
      const amount = clamp(effect.amount, 0, 1);
      const cx = width / 2;
      const cy = height / 2;
      const r = Math.sqrt(cx * cx + cy * cy);
      overlays.push(
        `<radialGradient id="vig" cx="${cx}" cy="${cy}" r="${r}" gradientUnits="userSpaceOnUse">
          <stop offset="${Math.round((1 - amount) * 100)}%" stop-color="black" stop-opacity="0"/>
          <stop offset="100%" stop-color="black" stop-opacity="${amount.toFixed(3)}"/>
        </radialGradient>
        <rect width="${width}" height="${height}" fill="url(#vig)"/>`,
      );
    } else if (effect.type === 'adjust') {
      if (effect.temperature !== undefined && effect.temperature !== 0) {
        const t = clamp(effect.temperature, -1, 1);
        const color = t > 0 ? '255,140,0' : '0,140,255';
        const opacity = Math.abs(t) * 0.25;
        overlays.push(
          `<rect width="${width}" height="${height}" fill="rgb(${color})" opacity="${opacity.toFixed(3)}"/>`,
        );
      }
      if (effect.fade !== undefined && effect.fade > 0) {
        const opacity = clamp(effect.fade, 0, 1) * 0.4;
        overlays.push(
          `<rect width="${width}" height="${height}" fill="white" opacity="${opacity.toFixed(3)}"/>`,
        );
      }
    }
  }
  if (overlays.length === 0) return null;
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${overlays.join('')}</svg>`;
  return Buffer.from(svg);
}

// ── Colour helpers ─────────────────────────────────────────────────────

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const cleaned = hex.trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]+$/.test(cleaned)) return { r: 26, g: 26, b: 26 };
  if (cleaned.length === 3) {
    return {
      r: parseInt(cleaned[0]! + cleaned[0]!, 16),
      g: parseInt(cleaned[1]! + cleaned[1]!, 16),
      b: parseInt(cleaned[2]! + cleaned[2]!, 16),
    };
  }
  if (cleaned.length >= 6) {
    return {
      r: parseInt(cleaned.slice(0, 2), 16),
      g: parseInt(cleaned.slice(2, 4), 16),
      b: parseInt(cleaned.slice(4, 6), 16),
    };
  }
  return { r: 26, g: 26, b: 26 };
}

function creatorColorToRgba(color: unknown, fallback = 'rgba(255,255,255,1)'): string {
  if (!color || typeof color !== 'object') return fallback;
  const c = color as Record<string, unknown>;
  const r = Math.round(num(c['r'], 1) * 255);
  const g = Math.round(num(c['g'], 1) * 255);
  const b = Math.round(num(c['b'], 1) * 255);
  const a = num(c['a'], 1);
  return `rgba(${r},${g},${b},${a})`;
}

// ── Background ─────────────────────────────────────────────────────────

function buildBackgroundSvg(width: number, height: number, bg: CompositionBackground): Buffer {
  const value = bg.value || '#1a1a1a';
  let defs = '';
  let body = '';
  if (bg.type === 'gradient') {
    const stops = bg.gradientStops && bg.gradientStops.length >= 2
      ? bg.gradientStops
      : [
        { position: 0, color: value },
        { position: 1, color: bg.secondaryValue ?? value },
      ];
    const angle = num(bg.gradientAngle, 90);
    const rad = (angle * Math.PI) / 180;
    const x2 = (Math.cos(rad) * 0.5 + 0.5) * 100;
    const y2 = (Math.sin(rad) * 0.5 + 0.5) * 100;
    const stopSvg = stops
      .map((s) => `<stop offset="${(clamp(s.position, 0, 1) * 100).toFixed(2)}%" stop-color="${s.color}"/>`)
      .join('');
    defs = `<linearGradient id="bg" x1="0%" y1="0%" x2="${x2}%" y2="${y2}%">${stopSvg}</linearGradient>`;
    body = `<rect width="${width}" height="${height}" fill="url(#bg)"/>`;
  } else {
    body = `<rect width="${width}" height="${height}" fill="${value}"/>`;
  }
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${defs}${body}</svg>`;
  return Buffer.from(svg);
}

// ── Media layer rendering ──────────────────────────────────────────────

async function renderMediaLayer(
  layer: CompositionLayer,
  canvasWidth: number,
  canvasHeight: number,
  sourceUrl: string,
): Promise<{ buffer: Buffer; width: number; height: number } | null> {
  const mediaType = str(layer.payload['mediaType'], 'image');
  if (mediaType === 'video') return null;

  const layerW = Math.max(1, Math.round(layer.width * canvasWidth * layer.scale));
  const layerH = Math.max(1, Math.round(layer.height * canvasHeight * layer.scale));

  let sourceBuffer: Buffer;
  try {
    sourceBuffer = await fetchSourceBuffer(sourceUrl);
  } catch (error) {
    logger.warn({ sourceUrl, error: String(error) }, '[compositionRenderer] media fetch failed');
    return null;
  }

  let image = sharp(sourceBuffer, { failOn: 'none' });
  let meta: SharpMetadata;
  try {
    meta = await image.metadata();
  } catch (error) {
    logger.warn({ sourceUrl, error: String(error) }, '[compositionRenderer] media decode failed');
    return null;
  }
  const srcW = meta.width ?? 0;
  const srcH = meta.height ?? 0;
  if (srcW === 0 || srcH === 0) return null;

  const contentFit = str(layer.payload['contentFit'], 'cover');
  const focal = layer.payload['focalPoint'];
  const focalX = focal && typeof focal === 'object' ? num((focal as Record<string, unknown>)['x'], 0.5) : 0.5;
  const focalY = focal && typeof focal === 'object' ? num((focal as Record<string, unknown>)['y'], 0.5) : 0.5;

  // Crop/resize to the layer's target dimensions.
  if (contentFit === 'cover') {
    const crop = computeFocalCrop(srcW, srcH, layerW, layerH, focalX, focalY);
    image = image.extract(crop).resize(layerW, layerH, { fit: 'fill' });
  } else if (contentFit === 'contain') {
    image = image.resize(layerW, layerH, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    });
  } else {
    image = image.resize(layerW, layerH, { fit: 'fill' });
  }

  // Apply pixel-level effects.
  const effects = parseEffects(layer.payload);
  image = await applyPixelEffects(image, effects, layerW, layerH);

  // Flatten to a compositable buffer (with alpha for opacity/contain).
  const hasOpacity = layer.opacity < 1;
  const buffer = await image
    .ensureAlpha()
    .png({ quality: 90 })
    .toBuffer();

  // Apply spatial/tonal effect overlays (vignette, temperature, fade).
  const effectOverlay = buildEffectOverlay(layerW, layerH, effects);
  let finalBuffer = buffer;
  if (effectOverlay) {
    finalBuffer = await sharp(buffer)
      .composite([{ input: effectOverlay, blend: 'over' }])
      .png()
      .toBuffer();
  }

  // Apply layer opacity by scaling alpha.
  if (hasOpacity) {
    finalBuffer = await sharp(finalBuffer)
      .composite([{
        input: Buffer.from(
          `<svg width="${layerW}" height="${layerH}" xmlns="http://www.w3.org/2000/svg"><rect width="${layerW}" height="${layerH}" fill="black" opacity="${layer.opacity}"/></svg>`,
        ),
        blend: 'dest-in',
      }])
      .png()
      .toBuffer();
  }

  return { buffer: finalBuffer, width: layerW, height: layerH };
}

// ── Text layer rendering ───────────────────────────────────────────────

function escapeXml(text: string): string {
  // Build XML entities from char codes to avoid the editor decoding the
  // literal entity strings (e.g. & -> &).
  const amp = String.fromCharCode(38); // &
  return text
    .replace(/&/g, amp + 'amp;')
    .replace(/</g, amp + 'lt;')
    .replace(/>/g, amp + 'gt;')
    .replace(/"/g, amp + 'quot;')
    .replace(/'/g, amp + '#39;');
}

function buildTextLayerSvg(
  layer: CompositionLayer,
  canvasWidth: number,
  canvasHeight: number,
): Buffer | null {
  const p = layer.payload;
  const text = str(p['text'], '');
  if (!text) return null;

  const layerW = Math.max(1, Math.round(layer.width * canvasWidth * layer.scale));
  const layerH = Math.max(1, Math.round(layer.height * canvasHeight * layer.scale));

  const fontSizeRaw = num(p['fontSize'], 0);
  const fontPx = fontSizeRaw > 0
    ? Math.min(Math.round(fontSizeRaw * (canvasWidth / 1080)), Math.round(layerH * 0.95))
    : Math.round(layerH * 0.7);

  const fill = p['fill'] !== undefined
    ? creatorColorToRgba(p['fill'], 'rgba(255,255,255,1)')
    : (str(p['textColor'], '#ffffff') || '#ffffff');

  const bold = bool(p['bold'], false);
  const italic = bool(p['italic'], false);
  const fontWeight = p['fontWeight'] !== undefined ? String(p['fontWeight']) : (bold ? 'bold' : 'normal');
  const fontStyle = italic ? 'italic' : 'normal';
  const fontFamily = str(p['fontFamilyId'], 'sans-serif') || 'sans-serif';
  const alignment = str(p['alignment'], 'center');
  const textAnchor = alignment === 'left' ? 'start' : alignment === 'right' ? 'end' : 'middle';
  const x = alignment === 'left' ? 0 : alignment === 'right' ? layerW : layerW / 2;

  const lineHeight = num(p['lineHeight'], 1.2);
  const letterSpacing = num(p['letterSpacing'], 0);
  const opacity = num(p['opacity'], 1);

  // Split into lines for multi-line text.
  const lines = text.split('\n');
  const totalTextHeight = lines.length * fontPx * lineHeight;
  const startY = (layerH - totalTextHeight) / 2 + fontPx * 0.85;

  const stroke = p['stroke'];
  const strokeSvg = stroke && typeof stroke === 'object'
    ? ` stroke="${creatorColorToRgba((stroke as Record<string, unknown>)['color'], 'rgba(0,0,0,1)')}" stroke-width="${num((stroke as Record<string, unknown>)['width'], 2)}" paint-order="stroke"`
    : '';

  const shadow = p['shadow'];
  const shadowFilter = shadow && typeof shadow === 'object'
    ? `<filter id="sh" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur in="SourceAlpha" stdDeviation="${num((shadow as Record<string, unknown>)['blur'], 4)}"/><feOffset dx="${num((shadow as Record<string, unknown>)['offsetX'], 0)}" dy="${num((shadow as Record<string, unknown>)['offsetY'], 2)}" result="off"/><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>`
    : '';

  const background = p['background'];
  let bgRect = '';
  if (background && typeof background === 'object') {
    const bgC = background as Record<string, unknown>;
    const bgRadius = num(bgC['radius'], 4);
    const padX = num(bgC['paddingX'], 8);
    const padY = num(bgC['paddingY'], 4);
    bgRect = `<rect x="${-padX}" y="${startY - fontPx - padY}" width="${layerW + padX * 2}" height="${totalTextHeight + padY * 2}" rx="${bgRadius}" fill="${creatorColorToRgba(bgC['color'], 'rgba(0,0,0,0)')}" opacity="${num((bgC['color'] as Record<string, unknown> | undefined)?.['a'] ?? 1, 1)}"/>`;
  } else if (p['backgroundColor'] !== undefined) {
    bgRect = `<rect x="0" y="${startY - fontPx}" width="${layerW}" height="${totalTextHeight + 8}" rx="4" fill="${str(p['backgroundColor'], 'transparent')}"/>`;
  }

  const textLines = lines.map((line, i) => {
    const y = startY + i * fontPx * lineHeight;
    return `<text x="${x}" y="${y}" font-family="${escapeXml(fontFamily)}" font-size="${fontPx}" font-weight="${escapeXml(fontWeight)}" font-style="${fontStyle}" fill="${fill}" text-anchor="${textAnchor}" letter-spacing="${letterSpacing}"${strokeSvg}${shadowFilter ? ' filter="url(#sh)"' : ''}>${escapeXml(line)}</text>`;
  }).join('');

  const svg = `<svg width="${layerW}" height="${layerH}" xmlns="http://www.w3.org/2000/svg">${shadowFilter}${bgRect}${textLines}</svg>`;
  return Buffer.from(svg);
}

// ── Sticker layer rendering ─────────────────────────────────────────────

function buildStickerLayerSvg(
  layer: CompositionLayer,
  canvasWidth: number,
  canvasHeight: number,
): Buffer | null {
  const layerW = Math.max(1, Math.round(layer.width * canvasWidth * layer.scale));
  const layerH = Math.max(1, Math.round(layer.height * canvasHeight * layer.scale));
  const p = layer.payload;
  const opacity = num(p['opacity'], layer.opacity);

  let content = '';
  switch (layer.type) {
    case 'mention': {
      const username = '@' + str(p['username'], 'user');
      content = `<rect width="${layerW}" height="${layerH}" rx="${layerH / 2}" fill="rgba(0,0,0,0.45)"/><text x="${layerW / 2}" y="${layerH * 0.68}" font-family="sans-serif" font-size="${Math.round(layerH * 0.5)}" font-weight="600" fill="white" text-anchor="middle">${escapeXml(username)}</text>`;
      break;
    }
    case 'vote': {
      const question = str(p['question'], 'Vote');
      content = `<rect width="${layerW}" height="${layerH}" rx="12" fill="rgba(155,2,2,0.85)"/><text x="${layerW / 2}" y="${layerH * 0.6}" font-family="sans-serif" font-size="${Math.round(layerH * 0.32)}" font-weight="700" fill="white" text-anchor="middle">${escapeXml(question)}</text>`;
      break;
    }
    case 'quiz': {
      const question = str(p['question'], 'Quiz');
      content = `<rect width="${layerW}" height="${layerH}" rx="12" fill="rgba(0,0,0,0.6)"/><text x="${layerW / 2}" y="${layerH * 0.6}" font-family="sans-serif" font-size="${Math.round(layerH * 0.3)}" font-weight="700" fill="white" text-anchor="middle">${escapeXml(question)}</text>`;
      break;
    }
    case 'question': {
      const prompt = str(p['prompt'], 'Ask me');
      content = `<rect width="${layerW}" height="${layerH}" rx="12" fill="${str(p['backgroundColor'], '#9b0202')}"/><text x="${layerW / 2}" y="${layerH * 0.6}" font-family="sans-serif" font-size="${Math.round(layerH * 0.3)}" fill="${str(p['textColor'], '#ffffff')}" text-anchor="middle">${escapeXml(prompt)}</text>`;
      break;
    }
    case 'countdown': {
      const label = str(p['label'], 'Countdown');
      content = `<rect width="${layerW}" height="${layerH}" rx="12" fill="${str(p['color'], '#C9A46A')}"/><text x="${layerW / 2}" y="${layerH * 0.6}" font-family="sans-serif" font-size="${Math.round(layerH * 0.32)}" font-weight="700" fill="${str(p['textColor'], '#ffffff')}" text-anchor="middle">${escapeXml(label)}</text>`;
      break;
    }
    case 'link': {
      const cta = str(p['ctaText'], 'Link');
      content = `<rect width="${layerW}" height="${layerH}" rx="${layerH / 2}" fill="${str(p['backgroundColor'], '#C9A46A')}"/><text x="${layerW / 2}" y="${layerH * 0.68}" font-family="sans-serif" font-size="${Math.round(layerH * 0.45)}" font-weight="600" fill="${str(p['textColor'], '#ffffff')}" text-anchor="middle">${escapeXml(cta)}</text>`;
      break;
    }
    case 'location': {
      const place = str(p['placeName'], 'Location');
      content = `<rect width="${layerW}" height="${layerH}" rx="${layerH / 2}" fill="rgba(0,0,0,0.45)"/><text x="${layerW / 2}" y="${layerH * 0.68}" font-family="sans-serif" font-size="${Math.round(layerH * 0.42)}" fill="white" text-anchor="middle">${escapeXml(place)}</text>`;
      break;
    }
    case 'hashtag': {
      const tag = '#' + str(p['tag'], 'tag');
      content = `<rect width="${layerW}" height="${layerH}" rx="${layerH / 2}" fill="${str(p['backgroundColor'], '#C9A46A')}"/><text x="${layerW / 2}" y="${layerH * 0.68}" font-family="sans-serif" font-size="${Math.round(layerH * 0.42)}" font-weight="600" fill="${str(p['textColor'], '#ffffff')}" text-anchor="middle">${escapeXml(tag)}</text>`;
      break;
    }
    case 'emojiSlider': {
      const emoji = str(p['emoji'], '😍');
      const question = str(p['question'], '');
      content = `<text x="${layerH * 0.5}" y="${layerH * 0.75}" font-size="${Math.round(layerH * 0.6)}">${escapeXml(emoji)}</text><text x="${layerH + 4}" y="${layerH * 0.6}" font-family="sans-serif" font-size="${Math.round(layerH * 0.3)}" fill="white">${escapeXml(question)}</text>`;
      break;
    }
    case 'decorative': {
      const shape = str(p['shape'], 'circle');
      const color = str(p['color'], '#ffffff');
      const fillColor = p['fillColor'] !== undefined ? str(p['fillColor']) : 'none';
      if (shape === 'circle') {
        content = `<circle cx="${layerW / 2}" cy="${layerH / 2}" r="${Math.min(layerW, layerH) / 2}" fill="${fillColor}" stroke="${color}" stroke-width="3"/>`;
      } else if (shape === 'square') {
        content = `<rect width="${layerW}" height="${layerH}" fill="${fillColor}" stroke="${color}" stroke-width="3"/>`;
      } else if (shape === 'line') {
        content = `<line x1="0" y1="${layerH / 2}" x2="${layerW}" y2="${layerH / 2}" stroke="${color}" stroke-width="3"/>`;
      } else if (shape === 'arrow') {
        content = `<line x1="0" y1="${layerH / 2}" x2="${layerW - 10}" y2="${layerH / 2}" stroke="${color}" stroke-width="3"/><polyline points="${layerW - 14},${layerH / 2 - 8} ${layerW - 4},${layerH / 2} ${layerW - 14},${layerH / 2 + 8}" fill="none" stroke="${color}" stroke-width="3"/>`;
      } else {
        content = `<rect width="${layerW}" height="${layerH}" fill="${color}"/>`;
      }
      break;
    }
    case 'draw': {
      const strokes = p['strokes'];
      if (!Array.isArray(strokes)) return null;
      const paths = strokes.map((raw) => {
        const s = raw as Record<string, unknown>;
        const pts = Array.isArray(s['points']) ? s['points'] : [];
        const color = str(s['color'], '#ffffff');
        const width = num(s['width'], 4);
        const d = pts
          .map((pt, i) => {
            const point = pt as Record<string, unknown>;
            const px = num(point['x'], 0) * layerW;
            const py = num(point['y'], 0) * layerH;
            return `${i === 0 ? 'M' : 'L'}${px.toFixed(1)},${py.toFixed(1)}`;
          })
          .join(' ');
        return `<path d="${d}" stroke="${color}" stroke-width="${width}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
      }).join('');
      content = paths;
      break;
    }
    case 'product':
    case 'look': {
      const label = str(p['snapshotTitle'] ?? p['snapshotCaption'] ?? p['hotspotLabel'], layer.type === 'product' ? 'Product' : 'Look');
      content = `<circle cx="${layerW / 2}" cy="${layerH / 2}" r="${Math.min(layerW, layerH) / 2}" fill="rgba(201,164,106,0.9)"/><text x="${layerW / 2}" y="${layerH * 0.68}" font-family="sans-serif" font-size="${Math.round(layerH * 0.35)}" font-weight="600" fill="white" text-anchor="middle">${escapeXml(label)}</text>`;
      break;
    }
    default:
      return null;
  }

  const svg = `<svg width="${layerW}" height="${layerH}" xmlns="http://www.w3.org/2000/svg" opacity="${opacity}">${content}</svg>`;
  return Buffer.from(svg);
}

// ── Layer compositing ──────────────────────────────────────────────────

interface CompositeLayer {
  input: Buffer;
  /** Top-left position in canvas pixels. */
  left: number;
  top: number;
}

function layerTopLeft(layer: CompositionLayer, canvasWidth: number, canvasHeight: number): { left: number; top: number } {
  const layerW = layer.width * canvasWidth * layer.scale;
  const layerH = layer.height * canvasHeight * layer.scale;
  // x,y are layer-centre coordinates in normalized 0-1 space.
  const left = Math.round(layer.x * canvasWidth - layerW / 2);
  const top = Math.round(layer.y * canvasHeight - layerH / 2);
  return { left, top };
}

// ── Video composition rendering ────────────────────────────────────────

/**
 * Build an `atempo` filter chain for an arbitrary playback speed. `atempo`
 * only accepts factors in the 0.5–2.0 range, so speeds outside that band are
 * decomposed into a product of in-range factors (e.g. 4× → 2×,2×;
 * 0.25× → 0.5×,0.5×).
 */
function buildAtempoChain(speed: number): string {
  const factors: number[] = [];
  let remaining = speed;
  while (remaining > 2.0) {
    factors.push(2.0);
    remaining /= 2.0;
  }
  while (remaining < 0.5) {
    factors.push(0.5);
    remaining /= 0.5;
  }
  factors.push(clamp(remaining, 0.5, 2.0));
  return factors.map((f) => `atempo=${f.toFixed(6)}`).join(',');
}

// ── Video overlay burn-in helpers ──────────────────────────────────────

/**
 * Font file path for FFmpeg `drawtext`. The `drawtext` filter requires a
 * concrete font file (`fontfile`) when libfontconfig is unavailable (the
 * default in the Alpine runtime image). Overridable via env so deployments
 * can point at an installed font. When the file is absent, the drawtext
 * filter fails and the render is retried without overlays (see
 * {@link renderVideoComposition}).
 */
const DRAWTEXT_FONT_PATH =
  process.env['FFMPEG_DRAWTEXT_FONT_PATH'] ?? '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';

function toHex2(value: number): string {
  return clamp(Math.round(value), 0, 255).toString(16).padStart(2, '0');
}

/**
 * Resolve a text layer's fill colour to an FFmpeg `drawtext` `fontcolor`
 * value (`0xRRGGBB`, with an `@alpha` suffix when semi-transparent). Mirrors
 * the SVG path's colour resolution: a Creator colour object takes
 * precedence, falling back to the `textColor` hex string.
 */
function drawtextFontColor(layer: CompositionLayer): string {
  const p = layer.payload;
  if (p['fill'] !== undefined && typeof p['fill'] === 'object') {
    const c = p['fill'] as Record<string, unknown>;
    const r = num(c['r'], 1) * 255;
    const g = num(c['g'], 1) * 255;
    const b = num(c['b'], 1) * 255;
    const a = num(c['a'], 1);
    const hex = `0x${toHex2(r)}${toHex2(g)}${toHex2(b)}`;
    return a < 1 ? `${hex}@${a.toFixed(3)}` : hex;
  }
  const hex = str(p['textColor'], '#ffffff') || '#ffffff';
  return `0x${hex.replace(/^#/, '')}`;
}

/**
 * Escape a string for use as the `text` value of an FFmpeg `drawtext`
 * filter. The value is wrapped in single quotes (so `:`, `,`, `;` and spaces
 * are literal); a literal single quote is emitted as `'\''` (close, escape,
 * reopen) and `%` is backslash-escaped so drawtext does not interpret it as
 * a variable expansion. Newlines collapse to spaces (drawtext renders a
 * single line per filter).
 */
function escapeDrawtextText(text: string): string {
  return `'${text.replace(/\n/g, ' ').replace(/'/g, "'\\''").replace(/%/g, '\\%')}'`;
}

/**
 * Build a single `drawtext` filter string for a text overlay layer. Maps
 * the layer's normalized position/size to pixel coordinates based on the
 * video dimensions, scales the authored font size to the video resolution,
 * and honours horizontal alignment via drawtext `text_w` expressions.
 * Returns `null` when the layer has no text or a non-positive font size.
 */
function buildDrawtextFilter(
  layer: CompositionLayer,
  videoWidth: number,
  videoHeight: number,
  canvasWidth: number,
): string | null {
  const p = layer.payload;
  const text = str(p['text'], '');
  if (!text) return null;

  const layerW = layer.width * videoWidth * layer.scale;
  const layerH = layer.height * videoHeight * layer.scale;
  const left = layer.x * videoWidth - layerW / 2;
  const top = layer.y * videoHeight - layerH / 2;

  const fontSizeRaw = num(p['fontSize'], 0);
  const fontPx = fontSizeRaw > 0
    ? Math.min(Math.round(fontSizeRaw * (videoWidth / canvasWidth)), Math.round(layerH * 0.95))
    : Math.round(layerH * 0.7);
  if (fontPx <= 0) return null;

  const fontColor = drawtextFontColor(layer);
  const alignment = str(p['alignment'], 'center');
  let xExpr: string;
  if (alignment === 'left') {
    xExpr = String(Math.round(left));
  } else if (alignment === 'right') {
    xExpr = `${Math.round(left + layerW)}-text_w`;
  } else {
    xExpr = `${Math.round(left + layerW / 2)}-text_w/2`;
  }
  const yExpr = String(Math.round(top));

  return (
    `drawtext=fontfile='${DRAWTEXT_FONT_PATH}'` +
    `:text=${escapeDrawtextText(text)}` +
    `:fontcolor=${fontColor}:fontsize=${fontPx}:x=${xExpr}:y=${yExpr}`
  );
}

/**
 * Rasterise every sticker overlay layer into a single transparent PNG the
 * size of the video frame, positioned at each layer's authored location.
 * Sticker SVGs are produced by {@link buildStickerLayerSvg} (reused from the
 * image path) and converted to PNG with sharp, then composited onto a
 * transparent canvas. Any individual sticker that fails to rasterise is
 * skipped so one bad layer cannot blank the whole overlay. Returns `null`
 * when no sticker could be rendered.
 */
async function buildStickerOverlayPng(
  layers: CompositionLayer[],
  videoWidth: number,
  videoHeight: number,
): Promise<Buffer | null> {
  if (layers.length === 0 || videoWidth <= 0 || videoHeight <= 0) return null;

  const composites: Array<{ input: Buffer; left: number; top: number }> = [];
  for (const layer of layers) {
    try {
      const svg = buildStickerLayerSvg(layer, videoWidth, videoHeight);
      if (!svg) continue;
      const png = await sharp(svg).png().toBuffer();
      const { left, top } = layerTopLeft(layer, videoWidth, videoHeight);
      composites.push({ input: png, left, top });
    } catch (error) {
      logger.warn(
        { layerId: layer.id, layerType: layer.type, error: String(error) },
        '[compositionRenderer] sticker overlay render failed — skipping layer',
      );
    }
  }
  if (composites.length === 0) return null;

  const canvas = await sharp({
    create: {
      width: Math.max(1, Math.round(videoWidth)),
      height: Math.max(1, Math.round(videoHeight)),
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  }).png().toBuffer();

  return sharp(canvas)
    .composite(
      composites.map((c) => ({ input: c.input, left: c.left, top: c.top, blend: 'over' })),
    )
    .png()
    .toBuffer();
}

/**
 * Burn authored trim and speed edits from a video media layer into a single
 * MP4 using FFmpeg. Downloads the source to a temp file, applies input-seek
 * trim (`-ss`/`-t`) and a `setpts`/`atempo` speed filter chain, then encodes
 * to H.264 + AAC for standard web playback.
 *
 * Text overlays are burned in via FFmpeg `drawtext` filters and sticker
 * overlays via a composited PNG burned in with the `overlay` filter. The
 * `setpts` speed filter always leads the video filter chain, followed by
 * `drawtext` and then `overlay`. When sticker overlays are present the
 * whole graph is expressed with `-filter_complex` (the `overlay` filter
 * needs a second input); otherwise a simple `-vf` chain is used.
 *
 * Defensive by contract: any failure (fetch, probe, transcode, I/O) is logged
 * and returns `null` so the publication flow falls back to the source URL.
 * If the overlay burn-in itself fails, the render is retried once with
 * trim/speed only so the video still publishes. Temp files are cleaned up
 * in a `finally` block on every path.
 */
async function renderVideoComposition(
  layer: CompositionLayer,
  overlayLayers: CompositionLayer[],
  canvasWidth: number,
  sourceUrl: string,
  onProgress?: (fraction: number) => void,
): Promise<RenderedComposition | null> {
  const trimStartMs = num(layer.payload['trimStartMs'], 0);
  const trimEndMs = num(layer.payload['trimEndMs'], 0);
  const speed = clamp(num(layer.payload['speed'], 1), 0.25, 4);
  const sourceDurationMs = num(layer.payload['videoDurationMs'], 0);
  // Mute is authored as `volume === 0` (the composition schema has no
  // dedicated mute flag; the timeline audio panel writes volume 0).
  const muted = num(layer.payload['volume'], 1) === 0;

  // Resolve the trimmed window. When trimEndMs is unset, the window extends
  // to the end of the source (use the probed/source duration if known).
  const effectiveEndMs = trimEndMs > trimStartMs ? trimEndMs : sourceDurationMs;
  const trimmedDurationMs = effectiveEndMs > trimStartMs
    ? effectiveEndMs - trimStartMs
    : 0;

  // Pick the cheapest render path. The media + overlay layers are
  // reconstructed into a minimal document so getVideoRenderPath can classify
  // defensively (it parses the same shape the publication flow produces).
  // The background is irrelevant for a full-frame video, so a solid default
  // is supplied — only the media layer and overlays drive the classification.
  const renderPath = getVideoRenderPath({
    type: 'look',
    canvas: { aspectRatio: 1, background: { type: 'color', value: '#1a1a1a' } },
    pages: [{ id: 'page', layers: [layer, ...overlayLayers] }],
  });

  let inputPath: string | null = null;
  let outputPath: string | null = null;
  let overlayPngPath: string | null = null;
  try {
    // Download the source video to a temp file.
    let sourceBuffer: Buffer;
    try {
      sourceBuffer = await fetchSourceBuffer(sourceUrl);
    } catch (error) {
      logger.warn({ sourceUrl, error: String(error) }, '[compositionRenderer] video source fetch failed');
      return null;
    }

    inputPath = path.join(tmpdir(), `comp-video-in-${randomUUID()}.mp4`);
    await writeFile(inputPath, sourceBuffer);

    // Probe for dimensions, audio presence, and duration. Best-effort: a
    // probe failure does not abort the render (ffmpeg can transcode formats
    // ffprobe occasionally misreports), but we lose progress + dimensions.
    let width = 0;
    let height = 0;
    let hasAudio = false;
    let durationMs = sourceDurationMs;
    try {
      const probe = await probeMedia(inputPath);
      width = probe.width ?? 0;
      height = probe.height ?? 0;
      hasAudio = probe.audioCodec !== null;
      if (probe.durationMs && probe.durationMs > 0) durationMs = probe.durationMs;
    } catch (error) {
      logger.warn({ sourceUrl, error: String(error) }, '[compositionRenderer] video probe failed');
    }

    outputPath = path.join(tmpdir(), `comp-video-out-${randomUUID()}.mp4`);

    // ── Remux path (fast, lossless) ───────────────────────────────────
    // When the only edits are trim and/or mute, the source streams can be
    // copied verbatim (`-c copy`) into a new container with input-seek trim
    // (`-ss`/`-t`) and audio dropped (`-an`) when muted. No re-encode, no
    // filter graph — ~10x faster than the transcode path and lossless.
    if (renderPath === 'remux') {
      const buildRemuxArgs = (): string[] => {
        const a: string[] = ['-y'];
        // Input-seek trim. -ss before -i is a fast input seek; -t limits
        // the read duration so the trim window is exact.
        if (trimStartMs > 0) {
          a.push('-ss', (trimStartMs / 1000).toFixed(3));
        }
        if (trimmedDurationMs > 0) {
          a.push('-t', (trimmedDurationMs / 1000).toFixed(3));
        }
        a.push('-i', inputPath!);
        // Stream copy: pass video (and audio, unless muted) through without
        // re-encoding. -an drops the audio stream entirely when muted.
        a.push('-c', 'copy');
        if (muted) {
          a.push('-an');
        }
        a.push('-movflags', '+faststart', outputPath!);
        return a;
      };

      const outputDurationMs = trimmedDurationMs > 0 ? trimmedDurationMs : durationMs;
      await runFfmpeg(buildRemuxArgs(), onProgress, { totalDurationMs: outputDurationMs });

      const buffer = await readFile(outputPath);

      logger.info(
        {
          sourceUrl,
          width,
          height,
          trimStartMs,
          trimEndMs,
          muted,
          size: buffer.length,
        },
        '[compositionRenderer] video composition remuxed (stream copy)',
      );

      return {
        buffer,
        contentType: 'video/mp4',
        width,
        height,
      };
    }

    // ── Transcode path (re-encode) ────────────────────────────────────
    // Build overlay burn-in: text layers → drawtext filters, sticker layers
    // → a single composited PNG overlaid via the `overlay` filter. Each
    // layer is built defensively so one bad overlay never blanks the rest.
    const textLayers = overlayLayers.filter((l) => l.type === 'text');
    const stickerLayers = overlayLayers.filter((l) => l.type !== 'text');

    const drawtextFilters: string[] = [];
    for (const tl of textLayers) {
      try {
        const filter = width > 0 && height > 0
          ? buildDrawtextFilter(tl, width, height, canvasWidth)
          : null;
        if (filter) drawtextFilters.push(filter);
      } catch (error) {
        logger.warn(
          { layerId: tl.id, error: String(error) },
          '[compositionRenderer] text overlay build failed — skipping layer',
        );
      }
    }

    let stickerPng: Buffer | null = null;
    if (stickerLayers.length > 0 && width > 0 && height > 0) {
      try {
        stickerPng = await buildStickerOverlayPng(stickerLayers, width, height);
      } catch (error) {
        logger.warn(
          { error: String(error) },
          '[compositionRenderer] sticker overlay build failed — skipping stickers',
        );
        stickerPng = null;
      }
    }
    const hasOverlays = drawtextFilters.length > 0 || stickerPng !== null;

    if (stickerPng) {
      overlayPngPath = path.join(tmpdir(), `comp-overlay-${randomUUID()}.png`);
      await writeFile(overlayPngPath, stickerPng);
    }

    // Build the FFmpeg argument vector. `withOverlays` toggles the
    // drawtext/overlay burn-in so the same builder powers the initial
    // render and the defensive retry (trim/speed only).
    const buildArgs = (withOverlays: boolean): string[] => {
      const a: string[] = ['-y'];
      // Input-seek trim. -ss before -i is a fast input seek; -t before -i
      // limits the input read duration so the trim window is exact
      // regardless of subsequent speed filtering.
      if (trimStartMs > 0) {
        a.push('-ss', (trimStartMs / 1000).toFixed(3));
      }
      if (trimmedDurationMs > 0) {
        a.push('-t', (trimmedDurationMs / 1000).toFixed(3));
      }
      a.push('-i', inputPath!);

      const useStickers = withOverlays && stickerPng !== null;
      const useDrawtext = withOverlays;

      if (useStickers) {
        // The overlay PNG is the second input.
        a.push('-i', overlayPngPath!);
      }

      // Video filter chain: setpts leads, then drawtext, then overlay.
      const vChain: string[] = [];
      if (speed !== 1) vChain.push(`setpts=PTS/${speed}`);
      if (useDrawtext) vChain.push(...drawtextFilters);

      if (useStickers) {
        // `overlay` needs a second input, so the whole graph is expressed
        // with -filter_complex. Audio speed (atempo) is handled here too so
        // -af and -filter_complex never interact.
        const parts: string[] = [];
        if (vChain.length > 0) {
          parts.push(`[0:v]${vChain.join(',')}[v0]`);
          parts.push('[v0][1:v]overlay=0:0[v1]');
        } else {
          parts.push('[0:v][1:v]overlay=0:0[v1]');
        }
        if (speed !== 1 && hasAudio) {
          parts.push(`[0:a]${buildAtempoChain(speed)}[a0]`);
        }
        a.push('-filter_complex', parts.join(';'));
        a.push('-map', '[v1]');
        if (hasAudio) {
          a.push('-map', speed !== 1 ? '[a0]' : '0:a?');
        }
      } else if (vChain.length > 0) {
        // Text/speed only: a simple -vf chain (drawtext is single-input).
        a.push('-vf', vChain.join(','));
        if (speed !== 1 && hasAudio) {
          a.push('-af', buildAtempoChain(speed));
        }
      }

      // Encode to H.264 + AAC for broad web playback compatibility.
      a.push(
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-crf', '23',
        '-pix_fmt', 'yuv420p',
      );
      if (hasAudio) {
        a.push('-c:a', 'aac', '-b:a', '128k');
      } else {
        a.push('-an');
      }
      a.push('-movflags', '+faststart', outputPath!);
      return a;
    };

    // Progress total: the expected output duration after the speed change.
    // Trim/speed/overlays do not alter dimensions, so the probed source
    // width/height are the output dimensions.
    const outputDurationMs = speed !== 1 && trimmedDurationMs > 0
      ? trimmedDurationMs / speed
      : (trimmedDurationMs > 0 ? trimmedDurationMs : durationMs);

    try {
      await runFfmpeg(buildArgs(true), onProgress, { totalDurationMs: outputDurationMs });
    } catch (error) {
      if (!hasOverlays) throw error;
      // The overlay burn-in failed (e.g. missing font, bad filter). Retry
      // with trim/speed only so the video still publishes without overlays
      // rather than falling back to the unedited source.
      logger.warn(
        { sourceUrl, error: String(error) },
        '[compositionRenderer] video render with overlays failed — retrying without overlays',
      );
      await runFfmpeg(buildArgs(false), onProgress, { totalDurationMs: outputDurationMs });
    }

    const buffer = await readFile(outputPath);

    logger.info(
      {
        sourceUrl,
        width,
        height,
        speed,
        trimStartMs,
        trimEndMs,
        overlayCount: drawtextFilters.length + (stickerPng ? 1 : 0),
        size: buffer.length,
      },
      '[compositionRenderer] video composition rendered',
    );

    return {
      buffer,
      contentType: 'video/mp4',
      width,
      height,
    };
  } catch (error) {
    logger.warn(
      { sourceUrl, error: String(error) },
      '[compositionRenderer] video render failed — falling back to source',
    );
    return null;
  } finally {
    if (inputPath) {
      await rm(inputPath, { force: true }).catch(() => {});
    }
    if (outputPath) {
      await rm(outputPath, { force: true }).catch(() => {});
    }
    if (overlayPngPath) {
      await rm(overlayPngPath, { force: true }).catch(() => {});
    }
  }
}

// ── Public API ─────────────────────────────────────────────────────────

/**
 * Render a composition document into a flattened image.
 *
 * @param compositionDocument - The CreatorDocument JSONB (opaque on the
 *   backend; parsed defensively).
 * @param sourceMediaUrl - The primary media layer's resolved public URL.
 *   Used as the source for the cover media layer.
 * @param options - Optional render overrides (e.g. page index).
 * @returns The rendered buffer + content type, or `null` when the
 *   document is malformed or rendering fails. The caller must fall back to
 *   the source URL on `null`.
 */
export async function renderComposition(
  compositionDocument: unknown,
  sourceMediaUrl: string,
  options?: RenderCompositionOptions,
): Promise<RenderedComposition | null> {
  const doc = parseDocument(compositionDocument);
  if (!doc) {
    logger.warn('[compositionRenderer] document is malformed — skipping render');
    return null;
  }

  const aspectRatio = clamp(doc.canvas.aspectRatio, 0.3, 3);
  const canvasWidth = RENDER_WIDTH;
  const canvasHeight = clamp(Math.round(RENDER_WIDTH / aspectRatio), MIN_DIMENSION, MAX_DIMENSION);

  const pageIndex = options?.pageIndex ?? doc.metadata?.coverPageIndex ?? 0;
  const page = doc.pages[pageIndex] ?? doc.pages[0];
  if (!page) {
    logger.warn('[compositionRenderer] document has no pages — skipping render');
    return null;
  }

  // Determine whether the primary media is a video — if so, burn authored
  // trim/speed edits AND text/sticker overlays into an MP4 via FFmpeg. Any
  // failure inside the video renderer returns null so the caller falls
  // back to the source URL.
  const primaryMedia = page.layers.find((l) => l.type === 'media');
  if (primaryMedia && str(primaryMedia.payload['mediaType'], 'image') === 'video') {
    // Non-media layers (text, stickers) on this page are burned into the
    // video as drawtext/overlay filters. Hidden layers are skipped.
    const overlayLayers = page.layers.filter(
      (l) => l !== primaryMedia && !l.hidden && l.type !== 'media',
    );
    return renderVideoComposition(
      primaryMedia,
      overlayLayers,
      canvasWidth,
      sourceMediaUrl,
      options?.onProgress,
    );
  }

  try {
    // Build the background base as a PNG so layers with alpha composite
    // correctly over it before the final JPEG flatten.
    const backgroundSvg = buildBackgroundSvg(canvasWidth, canvasHeight, doc.canvas.background);
    const basePng = await sharp(backgroundSvg).png().toBuffer();

    // Sort visible layers by zIndex (painter's order).
    const visibleLayers = page.layers
      .filter((l) => !l.hidden)
      .sort((a, b) => a.zIndex - b.zIndex);

    const composites: CompositeLayer[] = [];

    for (const layer of visibleLayers) {
      try {
        if (layer.type === 'media') {
          // Use the supplied source URL for the primary media layer; for
          // secondary media layers, fall back to the layer's own mediaUri
          // when available (best-effort — non-primary fetches may fail and
          // are skipped defensively).
          const isPrimary = layer === primaryMedia;
          const url = isPrimary
            ? sourceMediaUrl
            : str(layer.payload['mediaUri'], '');
          if (!url) continue;
          const rendered = await renderMediaLayer(layer, canvasWidth, canvasHeight, url);
          if (rendered) {
            const { left, top } = layerTopLeft(layer, canvasWidth, canvasHeight);
            composites.push({ input: rendered.buffer, left, top });
          }
        } else if (layer.type === 'text') {
          const svg = buildTextLayerSvg(layer, canvasWidth, canvasHeight);
          if (svg) {
            const { left, top } = layerTopLeft(layer, canvasWidth, canvasHeight);
            const png = await sharp(svg).png().toBuffer();
            composites.push({ input: png, left, top });
          }
        } else if (layer.type === 'gif') {
          const stillUrl = str(layer.payload['stillUrl'], '');
          if (stillUrl) {
            const rendered = await renderMediaLayer(layer, canvasWidth, canvasHeight, stillUrl);
            if (rendered) {
              const { left, top } = layerTopLeft(layer, canvasWidth, canvasHeight);
              composites.push({ input: rendered.buffer, left, top });
            }
          }
        } else {
          const svg = buildStickerLayerSvg(layer, canvasWidth, canvasHeight);
          if (svg) {
            const { left, top } = layerTopLeft(layer, canvasWidth, canvasHeight);
            const png = await sharp(svg).png().toBuffer();
            composites.push({ input: png, left, top });
          }
        }
      } catch (error) {
        // A single bad layer must not fail the whole render.
        logger.warn(
          { layerId: layer.id, layerType: layer.type, error: String(error) },
          '[compositionRenderer] layer render failed — skipping layer',
        );
      }
    }

    // Composite all layers onto the background.
    let pipeline = sharp(basePng);
    if (composites.length > 0) {
      pipeline = pipeline.composite(
        composites.map((c) => ({ input: c.input, left: c.left, top: c.top, blend: 'over' })),
      );
    }

    const buffer = await pipeline
      .flatten({ background: hexToRgb(doc.canvas.background.value || '#1a1a1a') })
      .jpeg({ quality: OUTPUT_QUALITY, mozjpeg: true })
      .toBuffer();

    const meta = await sharp(buffer).metadata();

    logger.info(
      {
        width: meta.width,
        height: meta.height,
        layerCount: composites.length,
        pageSize: buffer.length,
      },
      '[compositionRenderer] composition rendered',
    );

    return {
      buffer,
      contentType: 'image/jpeg',
      width: meta.width ?? canvasWidth,
      height: meta.height ?? canvasHeight,
    };
  } catch (error) {
    logger.warn({ error: String(error) }, '[compositionRenderer] render failed — falling back to source');
    return null;
  }
}
