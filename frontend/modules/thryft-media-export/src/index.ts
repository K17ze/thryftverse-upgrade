/**
 * ThryftMediaExport — JS entry point.
 *
 * Wraps the Nitro HybridObject with a graceful fallback when the native
 * module is not linked (Expo Go, web, or during development before
 * Nitrogen codegen has run).
 *
 * When the native module IS linked, `HybridObject.getOrCreate()` returns
 * the singleton instance backed by AVFoundation (iOS) / Media3 (Android).
 * When it is NOT linked, all methods throw with a clear error message
 * directing the developer to run a custom dev client.
 *
 * ── JS offscreen rendering fallback ──
 *
 * When the native module is not linked but `@shopify/react-native-skia`
 * IS available (it is a production dependency), `jsExportImage()` renders
 * a single image composition (poster/look frame) to PNG using an offscreen
 * Skia surface. This is the minimum viable export — it handles image
 * compositions with overlays (text, stickers, filters, adjustments)
 * burned in. Video export remains behind the native module gate.
 *
 * `isMediaExportAvailable()` returns true when EITHER the native module
 * OR the JS Skia path is available, so the publish workflow can gate on
 * a single function regardless of which path will service the request.
 */
import { Image as RNImage } from 'react-native';
import { getHybridObjectConstructor } from 'react-native-nitro-modules';
import type { HybridObject } from 'react-native-nitro-modules';
import type { ThryftMediaExport } from './ThryftMediaExport.nitro';
import type {
  ExportIntentRequest,
  ExportResult,
  ExportCapabilities,
  ThumbnailResult,
} from './ThryftMediaExport.nitro';

// ── Skia (static import — installed as a production dependency) ──
// The import itself is safe: it loads the JS shim; the native binding is
// only probed when a factory like Skia.Paint() is actually called. We wrap
// that probe in a try/catch so environments without the Skia native module
// (e.g. Expo Go without the custom dev client) degrade to "not available"
// rather than crashing at import time.
import {
  Skia,
  BlendMode,
  TileMode,
  ImageFormat,
  PaintStyle,
  StrokeCap,
  StrokeJoin,
  type SkImage,
  type SkCanvas,
  type SkPaint,
  type SkSurface,
  type SkFont,
  type SkPath,
  type SkTypeface,
} from '@shopify/react-native-skia';

const MODULE_NAME = 'ThryftMediaExport';

let cachedInstance: ThryftMediaExport | null = null;
let availabilityChecked = false;
let isAvailable = false;

function checkAvailability(): boolean {
  if (availabilityChecked) return isAvailable;
  availabilityChecked = true;
  try {
    // getHybridObjectConstructor throws if the native class is not registered.
    const Constructor = getHybridObjectConstructor<ThryftMediaExport & HybridObject<{}>>(MODULE_NAME);
    cachedInstance = new Constructor();
    isAvailable = true;
  } catch {
    isAvailable = false;
  }
  return isAvailable;
}

function unavailableError(method: string): Error {
  return new Error(
    `ThryftMediaExport.${method}() requires a custom dev client with the ` +
      `Nitro module built. The native export pipeline (AVFoundation on iOS, ` +
      `Media3 Transformer on Android) is not available in Expo Go. ` +
      `Run 'eas build' or 'npx expo run:ios' / 'npx expo run:android' ` +
      `to build a client with the native module linked.`,
  );
}

// ── JS (Skia) availability probe ───────────────────────────────────

let jsAvailabilityChecked = false;
let jsAvailable = false;

/**
 * Synchronously probe whether the Skia native binding is linked and
 * capable of creating an offscreen surface. Safe to call at any time —
 * wraps the factory calls in a try/catch so a missing native module
 * degrades to `false` instead of throwing.
 */
function checkJsAvailability(): boolean {
  if (jsAvailabilityChecked) return jsAvailable;
  jsAvailabilityChecked = true;
  try {
    jsAvailable = !!(
      Skia &&
      Skia.Surface &&
      typeof Skia.Surface.MakeOffscreen === 'function' &&
      Skia.Paint() &&
      Skia.Path
    );
  } catch {
    jsAvailable = false;
  }
  return jsAvailable;
}

/**
 * Returns true if the JS offscreen Skia rendering path is available.
 * This is the fallback when the native Nitro module is not linked —
 * it can export image compositions (PNG) but not video.
 */
export function isJsExportAvailable(): boolean {
  return checkJsAvailability();
}

/**
 * Get the ThryftMediaExport HybridObject instance, or null if the native
 * module is not linked. Use this to gate UI that offers export options.
 */
export function getMediaExport(): ThryftMediaExport | null {
  return checkAvailability() ? cachedInstance : null;
}

/**
 * Returns true if ANY export path is available — either the native Nitro
 * module (video + image) or the JS Skia fallback (image only). The publish
 * workflow gates on this single function; `exportDocumentImage` in
 * mediaExportService.ts routes to the appropriate path internally.
 */
export function isMediaExportAvailable(): boolean {
  return checkAvailability() || checkJsAvailability();
}

// Re-export the types and the HybridObject interface for consumers.
export type {
  ThryftMediaExport,
  ExportIntentRequest,
  ExportResult,
  ExportCapabilities,
  ThumbnailResult,
} from './ThryftMediaExport.nitro';

// Canonical JS-side filter color matrices. Shared source of truth across
// the JS export renderer, the backend SVG renderer, and the Skia preview.
// See `./filterMatrices.ts` for the cross-renderer agreement contract.
export {
  IDENTITY_MATRIX,
  FILTER_PRESET_MATRICES,
  interpolateMatrix,
  isIdentityMatrix,
  multiplyMatrix,
} from './filterMatrices';

// Internal imports for the JS Skia fallback path below. The re-export
// above is the public API; these imports are private to this module so
// the offscreen renderer can use the same matrices without redefining
// them (single source of truth enforced by filterMatrixAgreement.test.ts).
import {
  IDENTITY_MATRIX as _IDENTITY,
  FILTER_PRESET_MATRICES as _FILTERS,
  interpolateMatrix as _interpolate,
  isIdentityMatrix as _isIdentity,
  multiplyMatrix as _multiply,
} from './filterMatrices';

// Lazy proxy — throws on use if native module is not linked, but allows
// imports at module load time without crashing.
export const ThryftMediaExportModule = new Proxy(
  {} as ThryftMediaExport,
  {
    get(_target, prop: string) {
      if (!checkAvailability()) {
        throw unavailableError(prop);
      }
      return cachedInstance![prop as keyof ThryftMediaExport];
    },
  },
);

// ════════════════════════════════════════════════════════════════════
// JS OFFSCREEN RENDERING PATH (Skia fallback)
// ════════════════════════════════════════════════════════════════════

// ── Minimal document types (decoupled from app composition.ts) ──
// The module defines only the subset of the CreatorDocument shape it
// needs to render. This keeps the module self-contained — it does not
// import from the app's creator domain, preserving the dependency
// direction (app → module, never module → app).

interface JsRecipeNode {
  type: 'matrix' | 'adjust' | 'blur' | 'grain' | 'vignette';
  matrix?: number[];
  amount?: number;
  radius?: number;
  exposure?: number;
  contrast?: number;
  highlights?: number;
  shadows?: number;
  saturation?: number;
  temperature?: number;
  tint?: number;
  fade?: number;
  vignette?: number;
  sharpness?: number;
}

interface JsEffectNode {
  type: 'filter' | 'adjust' | 'blur' | 'vignette';
  id?: string;
  amount?: number;
  recipe?: JsRecipeNode[];
  exposure?: number;
  contrast?: number;
  highlights?: number;
  shadows?: number;
  saturation?: number;
  temperature?: number;
  tint?: number;
  fade?: number;
  vignette?: number;
  sharpness?: number;
  radius?: number;
}

interface JsLayerPayload {
  // media
  mediaUri?: string;
  mediaType?: 'image' | 'video';
  contentFit?: 'cover' | 'contain' | 'fill';
  opacity?: number;
  filterId?: string;
  focalPoint?: { x: number; y: number };
  effects?: JsEffectNode[];
  // text
  text?: string;
  fill?: { r: number; g: number; b: number; a: number };
  textColor?: string;
  fontSize?: number;
  textStyle?: string;
  bold?: boolean;
  italic?: boolean;
  background?: { color: { r: number; g: number; b: number; a: number }; radius: number; paddingX: number; paddingY: number };
  backgroundColor?: string;
  stroke?: { color: { r: number; g: number; b: number; a: number }; width: number };
  shadow?: { color: { r: number; g: number; b: number; a: number }; blur: number; offsetX: number; offsetY: number };
  alignment?: 'left' | 'center' | 'right' | 'justify';
  // decorative
  shape?: 'circle' | 'square' | 'line' | 'arrow' | 'star' | 'heart' | 'triangle' | 'hexagon';
  /** Picked Ionicons glyph for icon stickers — drives arrow direction in
   *  the JS fallback (full icon-glyph rendering requires the native path). */
  icon?: string;
  color?: string;
  fillColor?: string;
  // draw
  strokes?: Array<{
    points: Array<{ x: number; y: number }>;
    color: string;
    width: number;
    tool: string;
    emoji?: string;
    emojiSize?: number;
    emojiSpacing?: number;
    emojiJitter?: number;
    sourceWidth?: number;
    sourceHeight?: number;
  }>;
  // product / look snapshots
  snapshotImageUrl?: string;
  snapshotTitle?: string;
  snapshotPriceGbp?: number;
  hotspotLabel?: string;
  // generic
  [key: string]: unknown;
}

interface JsLayer {
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
  payload: JsLayerPayload;
}

interface JsPage {
  id: string;
  layers: JsLayer[];
}

interface JsBackground {
  type: 'color' | 'gradient' | 'image' | 'blur';
  value: string;
  secondaryValue?: string;
  gradientStops?: Array<{ position: number; color: string }>;
  gradientAngle?: number;
  imageBlur?: number;
}

interface JsDocument {
  id: string;
  type: 'look' | 'poster';
  canvas: {
    aspectRatio: number;
    background: JsBackground;
  };
  pages: JsPage[];
}

// ── Color matrix math ─────────────────────────────────────────────
// IDENTITY_MATRIX, FILTER_PRESET_MATRICES, interpolateMatrix,
// isIdentityMatrix, and multiplyMatrix are imported from
// `./filterMatrices` (see the re-export block above). The inline
// definitions were removed to preserve a single source of truth
// across the JS export renderer, the backend SVG renderer, and the
// Skia preview. The cross-renderer agreement test
// (`filterMatrixAgreement.test.ts`) fails loudly if any copy drifts.

function makeScaleMatrix(r: number, g: number, b: number, a: number): number[] {
  return [r, 0, 0, 0, 0, 0, g, 0, 0, 0, 0, 0, b, 0, 0, 0, 0, 0, a, 0];
}

function makeContrastMatrix(factor: number): number[] {
  const offset = 0.5 * (1 - factor);
  return [
    factor, 0, 0, 0, offset,
    0, factor, 0, 0, offset,
    0, 0, factor, 0, offset,
    0, 0, 0, 1, 0,
  ];
}

function makeSaturationMatrix(s: number): number[] {
  const sr = (1 - s) * 0.213;
  const sg = (1 - s) * 0.715;
  const sb = (1 - s) * 0.072;
  return [
    sr + s, sg, sb, 0, 0,
    sr, sg + s, sb, 0, 0,
    sr, sg, sb + s, 0, 0,
    0, 0, 0, 1, 0,
  ];
}

function makeTemperatureMatrix(t: number): number[] {
  return [
    1 + t, 0, 0, 0, 0,
    0, 1, 0, 0, 0,
    0, 0, 1 - t, 0, 0,
    0, 0, 0, 1, 0,
  ];
}

function makeTintMatrix(t: number): number[] {
  return [
    1 + t, 0, 0, 0, 0,
    0, 1 - t, 0, 0, 0,
    0, 0, 1 + t, 0, 0,
    0, 0, 0, 1, 0,
  ];
}

function makeFadeMatrix(fade: number): number[] {
  const lift = fade * 0.15;
  return [
    1 - lift, 0, 0, 0, lift,
    0, 1 - lift, 0, 0, lift,
    0, 0, 1 - lift, 0, lift,
    0, 0, 0, 1, 0,
  ];
}

// isIdentityMatrix, FILTER_PRESET_MATRICES, and interpolateMatrix are
// imported from ./filterMatrices (see the re-export block near the top
// of this file). The inline copies were removed to preserve a single
// source of truth — the cross-renderer agreement test enforces parity.

/**
 * Build a 4×5 color matrix from a composition adjust effect node.
 * Mirrors `buildAdjustmentMatrix` in EffectEvaluator.ts so the JS export
 * produces the same color grading as the live preview.
 */
function buildAdjustmentMatrix(adjust: Omit<JsRecipeNode, 'type'>): number[] {
  let matrix = [..._IDENTITY];
  if (adjust.exposure) {
    const gain = Math.pow(2, adjust.exposure);
    matrix = _multiply(matrix, makeScaleMatrix(gain, gain, gain, 1));
  }
  if (adjust.contrast) {
    matrix = _multiply(matrix, makeContrastMatrix(1 + adjust.contrast));
  }
  if (adjust.saturation) {
    matrix = _multiply(matrix, makeSaturationMatrix(1 + adjust.saturation));
  }
  if (adjust.temperature) {
    matrix = _multiply(matrix, makeTemperatureMatrix(adjust.temperature * 0.15));
  }
  if (adjust.tint) {
    matrix = _multiply(matrix, makeTintMatrix(adjust.tint * 0.1));
  }
  if (adjust.fade && adjust.fade > 0) {
    matrix = _multiply(matrix, makeFadeMatrix(adjust.fade));
  }
  return matrix;
}

interface JsEvaluatedEffects {
  colorMatrix?: number[];
  blurRadius?: number;
  vignetteAmount?: number;
  grainAmount?: number;
}

/**
 * Evaluate a composition effect stack into renderable parameters.
 * Mirrors `evaluateCompositionEffectStack` in
 * src/creator/core/playback/EffectEvaluator.ts — the two must agree so a
 * published export matches the authored preview (WYSIWYG).
 *
 * `filter` nodes: named presets resolve by `id` against the inlined
 * FILTER_PRESET_MATRICES; registry effects (e.g. `ai:<id>`) persist their
 * baked `recipe` (render(1) nodes) which is folded here — previously the
 * recipe was ignored and registry effects exported as identity.
 * `blur` produces an image-filter radius; `vignette`/`grain` produce
 * overlay amounts drawn over the layer rect.
 */
function evaluateEffects(effects: JsEffectNode[] | undefined): JsEvaluatedEffects {
  if (!effects || effects.length === 0) return {};
  let colorMatrix: number[] | undefined;
  let blurRadius = 0;
  let vignetteAmount = 0;
  let grainAmount = 0;
  let hasBlur = false;
  let hasVignette = false;
  let hasGrain = false;

  const foldRecipe = (recipe: JsRecipeNode[], amount: number): void => {
    for (const rn of recipe) {
      switch (rn.type) {
        case 'matrix': {
          if (!rn.matrix) break;
          const m = _interpolate(rn.matrix, amount);
          colorMatrix = colorMatrix ? _multiply(colorMatrix, m) : m;
          break;
        }
        case 'adjust': {
          const m = buildAdjustmentMatrix(rn);
          colorMatrix = colorMatrix ? _multiply(colorMatrix, m) : m;
          if (rn.vignette !== undefined && rn.vignette > 0) {
            vignetteAmount += rn.vignette * amount;
            hasVignette = true;
          }
          break;
        }
        case 'blur': {
          blurRadius = Math.max(blurRadius, (rn.radius ?? 0) * amount);
          hasBlur = true;
          break;
        }
        case 'grain': {
          grainAmount += (rn.amount ?? 0) * amount;
          hasGrain = true;
          break;
        }
        case 'vignette': {
          vignetteAmount += (rn.amount ?? 0) * amount;
          hasVignette = true;
          break;
        }
      }
    }
  };

  for (const node of effects) {
    if (node.type === 'adjust') {
      const m = buildAdjustmentMatrix(node);
      colorMatrix = colorMatrix ? _multiply(colorMatrix, m) : m;
      if (node.vignette !== undefined && node.vignette > 0) {
        vignetteAmount += node.vignette;
        hasVignette = true;
      }
    } else if (node.type === 'filter') {
      const amount = clamp(node.amount ?? 0, 0, 1);
      if (node.recipe && node.recipe.length > 0) {
        foldRecipe(node.recipe, amount);
      } else {
        // Named preset: resolve by id. Unknown/retired IDs fail closed
        // to identity (no effect).
        const target = node.id ? _FILTERS[node.id] : undefined;
        if (target) {
          const m = _interpolate(target, amount);
          colorMatrix = colorMatrix ? _multiply(colorMatrix, m) : m;
        }
      }
    } else if (node.type === 'blur') {
      blurRadius = Math.max(blurRadius, node.radius ?? 0);
      hasBlur = true;
    } else if (node.type === 'vignette') {
      vignetteAmount += node.amount ?? 0;
      hasVignette = true;
    }
  }

  const result: JsEvaluatedEffects = {};
  if (colorMatrix && !_isIdentity(colorMatrix)) result.colorMatrix = colorMatrix;
  if (hasBlur && blurRadius > 0) result.blurRadius = blurRadius;
  if (hasVignette && vignetteAmount > 0) result.vignetteAmount = Math.min(1, vignetteAmount);
  if (hasGrain && grainAmount > 0) result.grainAmount = Math.min(1, grainAmount);
  return result;
}

// ── Helpers ──

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function creatorColorToHex(c: { r: number; g: number; b: number; a: number }): string {
  const r = Math.round(clamp(c.r, 0, 1) * 255);
  const g = Math.round(clamp(c.g, 0, 1) * 255);
  const b = Math.round(clamp(c.b, 0, 1) * 255);
  const a = clamp(c.a, 0, 1);
  if (a >= 1) {
    const hex = (n: number) => n.toString(16).padStart(2, '0');
    return `#${hex(r)}${hex(g)}${hex(b)}`;
  }
  return `rgba(${r},${g},${b},${a})`;
}

/**
 * Compute the source crop rect for cover-fitting an image into a target
 * rectangle (like CSS `object-fit: cover`), optionally shifted by a focal
 * point so the subject stays in frame.
 */
function coverSrcRect(
  srcW: number,
  srcH: number,
  destW: number,
  destH: number,
  focal?: { x: number; y: number },
): { x: number; y: number; width: number; height: number } {
  const srcRatio = srcW / srcH;
  const destRatio = destW / destH;
  let cropW: number;
  let cropH: number;
  if (srcRatio > destRatio) {
    cropH = srcH;
    cropW = Math.round(srcH * destRatio);
  } else {
    cropW = srcW;
    cropH = Math.round(srcW / destRatio);
  }
  // Default focal point is center (0.5, 0.5).
  const fx = focal ? focal.x : 0.5;
  const fy = focal ? focal.y : 0.5;
  const x = clamp(Math.round((srcW - cropW) * fx), 0, srcW - cropW);
  const y = clamp(Math.round((srcH - cropH) * fy), 0, srcH - cropH);
  return { x, y, width: cropW, height: cropH };
}

/**
 * Compute the destination rect for contain-fitting an image (letterbox,
 * centered within the target rect).
 */
function containDestRect(
  srcW: number,
  srcH: number,
  destX: number,
  destY: number,
  destW: number,
  destH: number,
): { x: number; y: number; width: number; height: number } {
  const srcRatio = srcW / srcH;
  const destRatio = destW / destH;
  let w: number;
  let h: number;
  if (srcRatio > destRatio) {
    w = destW;
    h = Math.round(destW / srcRatio);
  } else {
    h = destH;
    w = Math.round(destH * srcRatio);
  }
  return {
    x: destX + Math.round((destW - w) / 2),
    y: destY + Math.round((destH - h) / 2),
    width: w,
    height: h,
  };
}

// ── File writing (expo-file-system, base64 — type-safe across versions) ──

function uint8ToBase64(bytes: Uint8Array): string {
  const lookup =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const len = bytes.length;
  let output = '';
  let i = 0;
  while (i < len) {
    const b1 = bytes[i++] ?? 0;
    const b2 = bytes[i++] ?? 0;
    const b3 = bytes[i++] ?? 0;
    const e1 = b1 >> 2;
    const e2 = ((b1 & 0x03) << 4) | (b2 >> 4);
    const e3 = ((b2 & 0x0f) << 2) | (b3 >> 6);
    const e4 = b3 & 0x3f;
    output +=
      lookup[e1] +
      lookup[e2] +
      (i > len + 1 ? '=' : lookup[e3]) +
      (i > len ? '=' : lookup[e4]);
  }
  return output;
}

async function writePngToCache(bytes: Uint8Array, filename: string): Promise<string> {
  const FileSystem = await import('expo-file-system');
  const dir = FileSystem.Paths.cache.uri;
  if (!dir) throw new Error('Cache directory is not available.');
  const path = `${dir}${filename}`;
  const base64 = uint8ToBase64(bytes);
  await FileSystem.writeAsStringAsync(path, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return path;
}

// ── Layer rendering ──

function drawBackground(
  canvas: SkCanvas,
  bg: JsBackground,
  width: number,
  height: number,
): void {
  const paint = Skia.Paint();
  paint.setBlendMode(BlendMode.Src);

  if (bg.type === 'color' || bg.type === 'blur') {
    paint.setColor(Skia.Color(bg.value || '#1a1a1a'));
    canvas.drawPaint(paint);
  } else if (bg.type === 'gradient') {
    // Two-stop or multi-stop linear gradient.
    const angle = ((bg.gradientAngle ?? 90) * Math.PI) / 180;
    const cx = width / 2;
    const cy = height / 2;
    const half = Math.max(width, height) / 2;
    const x0 = cx - Math.cos(angle) * half;
    const y0 = cy - Math.sin(angle) * half;
    const x1 = cx + Math.cos(angle) * half;
    const y1 = cy + Math.sin(angle) * half;
    const stops = bg.gradientStops && bg.gradientStops.length >= 2
      ? bg.gradientStops
      : [
          { position: 0, color: bg.value || '#1a1a1a' },
          { position: 1, color: bg.secondaryValue || '#000000' },
        ];
    const colors = stops.map((s) => Skia.Color(s.color));
    const positions = stops.map((s) => s.position);
    const shader = Skia.Shader.MakeLinearGradient(
      { x: x0, y: y0 },
      { x: x1, y: y1 },
      colors,
      positions,
      TileMode.Clamp,
    );
    if (shader) {
      paint.setShader(shader);
    } else {
      paint.setColor(Skia.Color(bg.value || '#1a1a1a'));
    }
    canvas.drawPaint(paint);
  } else {
    // image background — fall back to solid color (image loading is async
    // and handled in the media layer pass; background image is rare for
    // poster/look frames).
    paint.setColor(Skia.Color(bg.value || '#1a1a1a'));
    canvas.drawPaint(paint);
  }
}

async function loadSkImage(uri: string): Promise<SkImage | null> {
  try {
    const data = await Skia.Data.fromURI(uri);
    return Skia.Image.MakeImageFromEncoded(data);
  } catch {
    return null;
  }
}

function drawMediaLayer(
  canvas: SkCanvas,
  layer: JsLayer,
  canvasW: number,
  canvasH: number,
  image: SkImage | null,
): void {
  if (!image) return;
  const p = layer.payload;
  const layerOpacity = clamp(layer.opacity * (p.opacity ?? 1), 0, 1);
  if (layerOpacity <= 0) return;

  // Dest rect in pixels (normalized center → pixel center).
  const dw = layer.width * canvasW * layer.scale;
  const dh = layer.height * canvasH * layer.scale;
  const dx = layer.x * canvasW - dw / 2;
  const dy = layer.y * canvasH - dh / 2;

  const paint = Skia.Paint();
  paint.setAntiAlias(true);
  paint.setBlendMode(BlendMode.SrcOver);
  paint.setAlphaf(layerOpacity);

  // Full effect-stack evaluation — color matrix + blur + vignette + grain,
  // including baked recipes for registry (ai:) effects.
  const evaluated = evaluateEffects(p.effects);
  if (evaluated.colorMatrix) {
    const cf = Skia.ColorFilter.MakeMatrix(evaluated.colorMatrix);
    if (cf) paint.setColorFilter(cf);
  }
  if (evaluated.blurRadius && evaluated.blurRadius > 0) {
    const blur = Skia.ImageFilter.MakeBlur(
      evaluated.blurRadius, evaluated.blurRadius, TileMode.Clamp, null);
    if (blur) paint.setImageFilter(blur);
  }

  const srcW = image.width();
  const srcH = image.height();
  const fit = p.contentFit ?? 'cover';

  canvas.save();
  // Rotate around the layer center.
  if (layer.rotation !== 0) {
    canvas.rotate(layer.rotation, layer.x * canvasW, layer.y * canvasH);
  }

  if (fit === 'fill') {
    canvas.drawImageRect(
      image,
      { x: 0, y: 0, width: srcW, height: srcH },
      { x: dx, y: dy, width: dw, height: dh },
      paint,
    );
  } else if (fit === 'contain') {
    const fitted = containDestRect(srcW, srcH, dx, dy, dw, dh);
    canvas.drawImageRect(
      image,
      { x: 0, y: 0, width: srcW, height: srcH },
      { x: fitted.x, y: fitted.y, width: fitted.width, height: fitted.height },
      paint,
    );
  } else {
    // cover
    const src = coverSrcRect(srcW, srcH, dw, dh, p.focalPoint);
    canvas.drawImageRect(
      image,
      { x: src.x, y: src.y, width: src.width, height: src.height },
      { x: dx, y: dy, width: dw, height: dh },
      paint,
    );
  }

  // Vignette + grain overlays — same parameters as the preview renderer
  // (MediaLayerContent): radial gradient darkening toward the edges, and
  // turbulence noise at overlay blend capped at 40% alpha.
  if (evaluated.vignetteAmount && evaluated.vignetteAmount > 0) {
    const vp = Skia.Paint();
    const shader = Skia.Shader.MakeRadialGradient(
      { x: dx + dw / 2, y: dy + dh / 2 },
      Math.max(dw, dh) * 0.75,
      [Skia.Color('rgba(0,0,0,0)'), Skia.Color('rgba(0,0,0,1)')],
      null,
      TileMode.Clamp,
    );
    vp.setShader(shader);
    vp.setAlphaf(Math.min(1, evaluated.vignetteAmount) * layerOpacity);
    canvas.drawRect({ x: dx, y: dy, width: dw, height: dh }, vp);
  }
  if (evaluated.grainAmount && evaluated.grainAmount > 0) {
    const gp = Skia.Paint();
    const shader = Skia.Shader.MakeTurbulence(0.9, 0.9, 2, 0, 0, 0);
    gp.setShader(shader);
    gp.setBlendMode(BlendMode.Overlay);
    gp.setAlphaf(Math.min(1, evaluated.grainAmount) * 0.4 * layerOpacity);
    canvas.drawRect({ x: dx, y: dy, width: dw, height: dh }, gp);
  }
  canvas.restore();
}

// ── Creator text-style fonts ──────────────────────────────────────────
// The preview (TextLayerContent) maps `textStyle` to a bundled font +
// token-derived size, and the layer container applies `layer.scale` as a
// transform — so the effective size is baseSize × layer.scale. These maps
// replicate that contract; they must stay in sync with the styleMap in
// src/creator/studio/layers/TextLayerContent.tsx.
const TEXT_STYLE_FONT_MODULES: Record<string, number> = {
  headline: require('@expo-google-fonts/anton/400Regular/Anton_400Regular.ttf'),
  deco: require('@expo-google-fonts/anton/400Regular/Anton_400Regular.ttf'),
  editorial: require('@expo-google-fonts/playfair-display/700Bold/PlayfairDisplay_700Bold.ttf'),
  clean: require('@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf'),
  compact: require('@expo-google-fonts/inter/600SemiBold/Inter_600SemiBold.ttf'),
  handwritten: require('@expo-google-fonts/caveat/400Regular/Caveat_400Regular.ttf'),
  bubble: require('@expo-google-fonts/playfair-display/400Regular/PlayfairDisplay_400Regular.ttf'),
  poster: require('@expo-google-fonts/bebas-neue/400Regular/BebasNeue_400Regular.ttf'),
  squeeze: require('@expo-google-fonts/bebas-neue/400Regular/BebasNeue_400Regular.ttf'),
  signature: require('@expo-google-fonts/playfair-display/400Regular_Italic/PlayfairDisplay_400Regular_Italic.ttf'),
};

const TEXT_STYLE_BASE_SIZES: Record<string, number> = {
  headline: 28,
  editorial: 25,
  clean: 15,
  compact: 11,
  handwritten: 16,
  bubble: 21,
  deco: 17,
  poster: 22,
  squeeze: 14,
  signature: 17,
};

/**
 * Preload Skia typefaces for the text styles used by the given layers.
 * Fonts resolve from the bundled @expo-google-fonts assets via the Metro
 * asset pipeline (Image.resolveAssetSource → Skia.Data.fromURI). Any
 * failure falls back to the default typeface so export never hard-fails
 * on a font.
 */
async function loadTextStyleTypefaces(
  layers: JsLayer[],
): Promise<Map<string, SkTypeface>> {
  const typefaces = new Map<string, SkTypeface>();
  const stylesNeeded = new Set(
    layers
      .filter((l) => l.type === 'text' && !l.hidden)
      .map((l) => l.payload.textStyle ?? 'clean'),
  );
  await Promise.all(
    [...stylesNeeded].map(async (style) => {
      const mod = TEXT_STYLE_FONT_MODULES[style];
      if (!mod) return;
      try {
        const uri = RNImage.resolveAssetSource(mod)?.uri;
        if (!uri) return;
        const data = await Skia.Data.fromURI(uri);
        const typeface = Skia.Typeface.MakeFreeTypeFaceFromData(data);
        if (typeface) typefaces.set(style, typeface);
      } catch {
        // Fall back to the default typeface — export must not fail on fonts.
      }
    }),
  );
  return typefaces;
}

function drawTextLayer(
  canvas: SkCanvas,
  layer: JsLayer,
  canvasW: number,
  canvasH: number,
  typefaces: Map<string, SkTypeface>,
): void {
  const p = layer.payload;
  const textStyle = p.textStyle ?? 'clean';
  // The compact style is uppercase by contract (TextLayerContent applies
  // textTransform) — mirror it so export matches the authored preview.
  const text = textStyle === 'compact' ? p.text?.toUpperCase() : p.text;
  if (!text) return;
  const layerOpacity = clamp(layer.opacity, 0, 1);
  if (layerOpacity <= 0) return;

  // Resolve fill color: structured `fill` > legacy `textColor` > white.
  let fillColor = 'rgba(255,255,255,1)';
  if (p.fill) {
    fillColor = creatorColorToHex(p.fill);
  } else if (p.textColor) {
    fillColor = p.textColor;
  }

  // Effective size = style base size × layer scale (the preview applies
  // scale as a container transform). p.fontSize is an explicit override.
  const fontSize = (p.fontSize ?? TEXT_STYLE_BASE_SIZES[textStyle] ?? 32) * layer.scale;
  const font = Skia.Font(typefaces.get(textStyle), fontSize);

  const paint = Skia.Paint();
  paint.setAntiAlias(true);
  paint.setBlendMode(BlendMode.SrcOver);
  paint.setAlphaf(layerOpacity);
  paint.setColor(Skia.Color(fillColor));

  // Layer center in pixels.
  const cx = layer.x * canvasW;
  const cy = layer.y * canvasH;
  const dw = layer.width * canvasW * layer.scale;
  const dh = layer.height * canvasH * layer.scale;
  const dx = cx - dw / 2;
  const dy = cy - dh / 2;

  canvas.save();
  if (layer.rotation !== 0) {
    canvas.rotate(layer.rotation, cx, cy);
  }

  // Measure text for alignment + background pill.
  const measured = font.measureText(text);
  const textW = measured.width;
  const textH = measured.height;

  const alignment = p.alignment ?? 'center';
  let textX: number;
  if (alignment === 'left') {
    textX = dx;
  } else if (alignment === 'right') {
    textX = dx + dw - textW;
  } else {
    textX = dx + (dw - textW) / 2;
  }
  // Baseline: vertically center the text in the dest rect.
  const textY = dy + (dh + textH) / 2;

  // Background pill.
  if (p.background) {
    const bgPaint = Skia.Paint();
    bgPaint.setAntiAlias(true);
    bgPaint.setBlendMode(BlendMode.SrcOver);
    bgPaint.setAlphaf(layerOpacity);
    bgPaint.setColor(Skia.Color(creatorColorToHex(p.background.color)));
    const padX = p.background.paddingX ?? 8;
    const padY = p.background.paddingY ?? 4;
    const radius = p.background.radius ?? 4;
    const rx = textX - padX;
    const ry = textY - textH - padY;
    const rw = textW + padX * 2;
    const rh = textH + padY * 2;
    canvas.drawRRect(
      { rect: { x: rx, y: ry, width: rw, height: rh }, rx: radius, ry: radius },
      bgPaint,
    );
  } else if (p.backgroundColor) {
    const bgPaint = Skia.Paint();
    bgPaint.setAntiAlias(true);
    bgPaint.setBlendMode(BlendMode.SrcOver);
    bgPaint.setAlphaf(layerOpacity);
    bgPaint.setColor(Skia.Color(p.backgroundColor));
    const padX = 8;
    const padY = 4;
    canvas.drawRRect(
      { rect: { x: textX - padX, y: textY - textH - padY, width: textW + padX * 2, height: textH + padY * 2 }, rx: 4, ry: 4 },
      bgPaint,
    );
  }

  // Shadow.
  if (p.shadow) {
    const shadowPaint = Skia.Paint();
    shadowPaint.setAntiAlias(true);
    shadowPaint.setBlendMode(BlendMode.SrcOver);
    shadowPaint.setAlphaf(layerOpacity * (p.shadow.color.a ?? 1));
    shadowPaint.setColor(Skia.Color(creatorColorToHex(p.shadow.color)));
    const blur = p.shadow.blur ?? 4;
    if (blur > 0) {
      const blurFilter = Skia.ImageFilter.MakeBlur(blur, blur, TileMode.Clamp, null);
      if (blurFilter) shadowPaint.setImageFilter(blurFilter);
    }
    canvas.drawText(
      text,
      textX + (p.shadow.offsetX ?? 0),
      textY + (p.shadow.offsetY ?? 0),
      shadowPaint,
      font,
    );
  }

  // Stroke (outline).
  if (p.stroke && p.stroke.width > 0) {
    const strokePaint = Skia.Paint();
    strokePaint.setAntiAlias(true);
    strokePaint.setBlendMode(BlendMode.SrcOver);
    strokePaint.setAlphaf(layerOpacity);
    strokePaint.setColor(Skia.Color(creatorColorToHex(p.stroke.color)));
    strokePaint.setStyle(PaintStyle.Stroke);
    strokePaint.setStrokeWidth(p.stroke.width);
    canvas.drawText(text, textX, textY, strokePaint, font);
  }

  // Main fill.
  canvas.drawText(text, textX, textY, paint, font);

  canvas.restore();
}

function drawDecorativeLayer(
  canvas: SkCanvas,
  layer: JsLayer,
  canvasW: number,
  canvasH: number,
): void {
  const p = layer.payload;
  const shape = p.shape ?? 'circle';
  const color = p.color ?? '#ffffff';
  const layerOpacity = clamp(layer.opacity * (p.opacity ?? 1), 0, 1);
  if (layerOpacity <= 0) return;

  const cx = layer.x * canvasW;
  const cy = layer.y * canvasH;
  const dw = layer.width * canvasW * layer.scale;
  const dh = layer.height * canvasH * layer.scale;

  const paint = Skia.Paint();
  paint.setAntiAlias(true);
  paint.setBlendMode(BlendMode.SrcOver);
  paint.setAlphaf(layerOpacity);

  canvas.save();
  if (layer.rotation !== 0) {
    canvas.rotate(layer.rotation, cx, cy);
  }

  if (shape === 'circle') {
    const r = Math.min(dw, dh) / 2;
    if (p.fillColor) {
      paint.setColor(Skia.Color(p.fillColor));
      paint.setStyle(PaintStyle.Fill);
      canvas.drawCircle(cx, cy, r, paint);
    }
    paint.setColor(Skia.Color(color));
    paint.setStyle(PaintStyle.Stroke);
    paint.setStrokeWidth(2);
    canvas.drawCircle(cx, cy, r, paint);
  } else if (shape === 'square') {
    const rect = { x: cx - dw / 2, y: cy - dh / 2, width: dw, height: dh };
    if (p.fillColor) {
      paint.setColor(Skia.Color(p.fillColor));
      paint.setStyle(PaintStyle.Fill);
      canvas.drawRect(rect, paint);
    }
    paint.setColor(Skia.Color(color));
    paint.setStyle(PaintStyle.Stroke);
    paint.setStrokeWidth(2);
    canvas.drawRect(rect, paint);
  } else if (shape === 'line') {
    paint.setColor(Skia.Color(color));
    paint.setStyle(PaintStyle.Stroke);
    paint.setStrokeWidth(Math.max(2, dh));
    canvas.drawLine(cx - dw / 2, cy, cx + dw / 2, cy, paint);
  } else {
    // Shape primitives drawn as real paths — star, triangle, hexagon,
    // heart, and arrow. Icon stickers persist their direction via
    // `icon` (e.g. 'arrow-down'), so arrows honor the picked direction.
    const fill = p.fillColor ?? color;
    paint.setColor(Skia.Color(fill));
    paint.setStyle(PaintStyle.Fill);
    const path = Skia.Path.Make();
    const x0 = cx - dw / 2;
    const y0 = cy - dh / 2;

    if (shape === 'star') {
      const rOut = Math.min(dw, dh) / 2;
      const rIn = rOut * 0.4;
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? rOut : rIn;
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const px = cx + r * Math.cos(a);
        const py = cy + r * Math.sin(a);
        if (i === 0) path.moveTo(px, py); else path.lineTo(px, py);
      }
      path.close();
    } else if (shape === 'triangle') {
      path.moveTo(cx, y0);
      path.lineTo(x0 + dw, y0 + dh);
      path.lineTo(x0, y0 + dh);
      path.close();
    } else if (shape === 'hexagon') {
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3;
        const px = cx + (dw / 2) * Math.cos(a);
        const py = cy + (dh / 2) * Math.sin(a);
        if (i === 0) path.moveTo(px, py); else path.lineTo(px, py);
      }
      path.close();
    } else if (shape === 'heart') {
      // Two lobes + tapered bottom — standard heart silhouette.
      const w = dw;
      const h = dh;
      path.moveTo(cx, y0 + h * 0.3);
      path.cubicTo(cx - w * 0.55, y0 - h * 0.15, x0 - w * 0.05, y0 + h * 0.45, cx, y0 + h);
      path.cubicTo(x0 + w * 1.05, y0 + h * 0.45, cx + w * 0.55, y0 - h * 0.15, cx, y0 + h * 0.3);
      path.close();
    } else {
      // arrow — shaft + head pointing up; the persisted icon name
      // determines the direction (arrow stickers pick a direction).
      const ARROW_ROTATION: Record<string, number> = {
        'arrow-up': 0,
        'arrow-up-right-box': 45,
        'arrow-forward': 90,
        'arrow-down-right-box': 135,
        'arrow-down': 180,
        'arrow-back': 270,
      };
      const shaftW = dw * 0.18;
      const headH = dh * 0.4;
      path.moveTo(cx - shaftW / 2, y0 + dh);
      path.lineTo(cx - shaftW / 2, y0 + headH);
      path.lineTo(cx - dw * 0.32, y0 + headH);
      path.lineTo(cx, y0);
      path.lineTo(cx + dw * 0.32, y0 + headH);
      path.lineTo(cx + shaftW / 2, y0 + headH);
      path.lineTo(cx + shaftW / 2, y0 + dh);
      path.close();
      const dir = ARROW_ROTATION[p.icon ?? ''] ?? 0;
      if (dir !== 0) canvas.rotate(dir, cx, cy);
    }
    canvas.drawPath(path, paint);
  }

  canvas.restore();
}

// ── Emoji stamp layout — replicated from
// src/creator/tools/drawing/emojiStampLayout.ts (this module cannot import
// app code). Must stay in lockstep: the deterministic seeded walk is what
// keeps export identical to authoring preview and canvas replay.
function seededJitter(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function layoutEmojiStamps(
  points: { x: number; y: number }[],
  spacing: number,
  jitter: number,
  stampSize: number,
  seedBase = 0,
): { x: number; y: number; rotation: number }[] {
  if (points.length === 0) return [];
  const stamps: { x: number; y: number; rotation: number }[] = [];
  const jitterRange = jitter * stampSize * 0.5;
  const makeStamp = (x: number, y: number, j: number) => ({
    x: x + (seededJitter(seedBase * 997 + j * 13) - 0.5) * jitterRange,
    y: y + (seededJitter(seedBase * 997 + j * 29) - 0.5) * jitterRange,
    rotation: (seededJitter(seedBase * 997 + j * 41) - 0.5) * 30,
  });
  stamps.push(makeStamp(points[0]!.x, points[0]!.y, 0));
  if (points.length === 1) return stamps;
  let accumulated = 0;
  let stampIndex = 0;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]!;
    const curr = points[i]!;
    const dx = curr.x - prev.x;
    const dy = curr.y - prev.y;
    const segLen = Math.sqrt(dx * dx + dy * dy);
    if (segLen === 0) continue;
    accumulated += segLen;
    while (accumulated >= spacing) {
      const overshoot = accumulated - spacing;
      const t = 1 - overshoot / segLen;
      stampIndex += 1;
      stamps.push(makeStamp(prev.x + dx * t, prev.y + dy * t, stampIndex));
      accumulated -= spacing;
    }
  }
  return stamps;
}

function drawDrawLayer(
  canvas: SkCanvas,
  layer: JsLayer,
  canvasW: number,
  canvasH: number,
): void {
  const p = layer.payload;
  const strokes = p.strokes;
  if (!strokes || strokes.length === 0) return;
  const layerOpacity = clamp(layer.opacity * (p.opacity ?? 1), 0, 1);
  if (layerOpacity <= 0) return;

  // Draw strokes are normalized 0-1 relative to the layer bounds.
  const lx = layer.x * canvasW - (layer.width * canvasW * layer.scale) / 2;
  const ly = layer.y * canvasH - (layer.height * canvasH * layer.scale) / 2;
  const lw = layer.width * canvasW * layer.scale;
  const lh = layer.height * canvasH * layer.scale;

  canvas.save();
  if (layer.rotation !== 0) {
    canvas.rotate(layer.rotation, layer.x * canvasW, layer.y * canvasH);
  }

  // saveLayer: eraser strokes clear within the draw layer's own buffer —
  // they must subtract earlier strokes, not punch through the media below.
  canvas.saveLayer();

  for (let i = 0; i < strokes.length; i++) {
    const stroke = strokes[i]!;
    if (stroke.points.length < 1) continue;
    const tool = stroke.tool ?? 'pen';

    if (tool === 'emoji') {
      // Emoji-brush stroke: stamp the glyph along the polyline using the
      // shared deterministic layout. Spacing/size are authored in
      // source-canvas pixels; scale to the rendered layer bounds.
      if (!stroke.emoji) continue;
      const scale = stroke.sourceWidth ? lw / stroke.sourceWidth : 1;
      const size = (stroke.emojiSize ?? 32) * scale;
      const spacing = Math.max(4, (stroke.emojiSpacing ?? 48) * scale);
      const jitter = stroke.emojiJitter ?? 0;
      const pxPoints = stroke.points.map((pt) => ({
        x: lx + pt.x * lw,
        y: ly + pt.y * lh,
      }));
      const font = Skia.Font(undefined, size);
      const paint = Skia.Paint();
      paint.setAntiAlias(true);
      paint.setAlphaf(layerOpacity);
      paint.setColor(Skia.Color(stroke.color || '#ffffff'));
      for (const stamp of layoutEmojiStamps(pxPoints, spacing, jitter, size, i)) {
        canvas.save();
        canvas.translate(stamp.x, stamp.y);
        canvas.rotate(stamp.rotation, 0, 0);
        canvas.drawText(stroke.emoji, -size * 0.4, size * 0.8, paint, font);
        canvas.restore();
      }
      continue;
    }

    const makePaint = (alpha: number, widthScale: number, blend: BlendMode): SkPaint => {
      const paint = Skia.Paint();
      paint.setAntiAlias(true);
      paint.setBlendMode(blend);
      paint.setAlphaf(alpha * layerOpacity);
      paint.setColor(Skia.Color(stroke.color));
      paint.setStyle(PaintStyle.Stroke);
      paint.setStrokeWidth(stroke.width * widthScale);
      paint.setStrokeCap(tool === 'highlighter' ? StrokeCap.Butt : StrokeCap.Round);
      paint.setStrokeJoin(StrokeJoin.Round);
      return paint;
    };

    const path = Skia.Path.Make();
    const pts = stroke.points;
    const first = pts[0]!;
    path.moveTo(lx + first.x * lw, ly + first.y * lh);
    for (let j = 1; j < pts.length; j++) {
      const pt = pts[j]!;
      path.lineTo(lx + pt.x * lw, ly + pt.y * lh);
    }

    if (tool === 'eraser') {
      const paint = makePaint(1, 2, BlendMode.Clear);
      canvas.drawPath(path, paint);
    } else if (tool === 'neon') {
      canvas.drawPath(path, makePaint(0.15, 3, BlendMode.Plus));
      canvas.drawPath(path, makePaint(0.3, 2, BlendMode.Plus));
      canvas.drawPath(path, makePaint(1, 1, BlendMode.SrcOver));
    } else if (tool === 'highlighter') {
      canvas.drawPath(path, makePaint(0.3, 1.8, BlendMode.Multiply));
    } else if (tool === 'marker') {
      canvas.drawPath(path, makePaint(0.6, 1.25, BlendMode.SrcOver));
    } else {
      canvas.drawPath(path, makePaint(1, 1, BlendMode.SrcOver));
    }
  }

  canvas.restore(); // saveLayer → composite buffer
  canvas.restore();
}

/**
 * Render a single image composition (poster/look frame) to a PNG file
 * using an offscreen Skia surface. This is the JS fallback for the native
 * `exportImage` method — it handles image layers with overlays (text,
 * stickers, filters, adjustments) burned in.
 *
 * @param documentJson  Serialised CreatorDocument (JSON string).
 * @param pageId        Which page to render.
 * @param intent        ExportIntent (format/resolution). Only `maxWidth`
 *                      and `maxHeight` are honoured; format is always PNG.
 * @param jobId         Stable id (unused in the JS path — no cancellation).
 * @param onProgress    Optional (0..1) progress callback.
 * @returns ExportResult with local file URI + dimensions.
 */
export async function jsExportImage(
  documentJson: string,
  pageId: string,
  intent: ExportIntentRequest,
  _jobId: string,
  onProgress?: (progress: number) => void,
): Promise<ExportResult> {
  if (!checkJsAvailability()) {
    throw new Error(
      'jsExportImage: Skia offscreen rendering is not available. ' +
        'Ensure @shopify/react-native-skia is installed and the native ' +
        'module is linked (custom dev client).',
    );
  }

  onProgress?.(0.05);

  // Parse the document (lenient — only the subset we need is typed).
  let doc: JsDocument;
  try {
    doc = JSON.parse(documentJson) as JsDocument;
  } catch {
    throw new Error('jsExportImage: Failed to parse document JSON.');
  }

  const page = doc.pages.find((p) => p.id === pageId);
  if (!page) {
    throw new Error(`jsExportImage: Page "${pageId}" not found in document.`);
  }

  // Compute canvas pixel dimensions from the intent + document aspect ratio.
  // aspectRatio = width / height. Clamp to intent bounds.
  const aspectRatio = doc.canvas.aspectRatio ?? 0.8;
  const maxW = intent.maxWidth ?? 1080;
  const maxH = intent.maxHeight ?? 1350;
  let canvasW: number;
  let canvasH: number;
  if (aspectRatio >= maxW / maxH) {
    canvasW = maxW;
    canvasH = Math.round(maxW / aspectRatio);
  } else {
    canvasH = maxH;
    canvasW = Math.round(maxH * aspectRatio);
  }
  // Ensure even dimensions (some encoders prefer it).
  canvasW = Math.round(canvasW / 2) * 2;
  canvasH = Math.round(canvasH / 2) * 2;

  onProgress?.(0.1);

  const surface = Skia.Surface.MakeOffscreen(canvasW, canvasH) as SkSurface | null;
  if (!surface) {
    throw new Error('jsExportImage: Failed to create offscreen Skia surface.');
  }
  const canvas = surface.getCanvas();

  // ── 1. Background ──
  drawBackground(canvas, doc.canvas.background, canvasW, canvasH);

  onProgress?.(0.15);

  // ── 2. Layers (sorted by zIndex, hidden layers skipped) ──
  const visibleLayers = page.layers
    .filter((l) => !l.hidden)
    .sort((a, b) => a.zIndex - b.zIndex);

  // Preload all media images in parallel for efficiency.
  const mediaLayers = visibleLayers.filter(
    (l) => l.type === 'media' && l.payload.mediaUri,
  );
  const imageMap = new Map<string, SkImage | null>();
  if (mediaLayers.length > 0) {
    const images = await Promise.all(
      mediaLayers.map(async (l) => {
        const img = await loadSkImage(l.payload.mediaUri!);
        return [l.id, img] as [string, SkImage | null];
      }),
    );
    for (const [id, img] of images) {
      imageMap.set(id, img);
    }
  }

  // Preload the bundled text-style typefaces so exported text uses the
  // authored font (previously every style rendered in the default face).
  const typefaces = await loadTextStyleTypefaces(visibleLayers);

  onProgress?.(0.3);

  const totalLayers = visibleLayers.length;
  for (let i = 0; i < totalLayers; i++) {
    const layer = visibleLayers[i]!;
    const progress = 0.3 + (i / Math.max(totalLayers, 1)) * 0.6;

    switch (layer.type) {
      case 'media': {
        const image = imageMap.get(layer.id) ?? null;
        drawMediaLayer(canvas, layer, canvasW, canvasH, image);
        break;
      }
      case 'text':
        drawTextLayer(canvas, layer, canvasW, canvasH, typefaces);
        break;
      case 'decorative':
        drawDecorativeLayer(canvas, layer, canvasW, canvasH);
        break;
      case 'draw':
        drawDrawLayer(canvas, layer, canvasW, canvasH);
        break;
      // Interactive sticker layers (vote, quiz, question, mention, link,
      // location, hashtag, time, weather, emojiSlider, countdown, music,
      // gif, product, look, adjustment) are not rendered in the static
      // poster fallback — they are interactive elements that don't belong
      // in a burned-in image. The native module handles the full pipeline.
      default:
        break;
    }

    onProgress?.(progress);
  }

  onProgress?.(0.9);

  // ── 3. Snapshot + encode + write ──
  surface.flush();
  const snapshot = surface.makeImageSnapshot();
  if (!snapshot) {
    throw new Error('jsExportImage: Failed to snapshot offscreen surface.');
  }
  const bytes = snapshot.encodeToBytes(ImageFormat.PNG, 100);

  const filename = `export_${doc.id}_${pageId}_${Date.now()}.png`;
  const uri = await writePngToCache(bytes, filename);

  onProgress?.(1);

  return {
    uri,
    width: canvasW,
    height: canvasH,
    sizeBytes: bytes.length,
    colorMode: 'sdr',
    codec: 'png',
  };
}
