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
  type SkImage,
  type SkCanvas,
  type SkPaint,
  type SkSurface,
  type SkFont,
  type SkPath,
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

interface JsEffectNode {
  type: 'filter' | 'adjust' | 'blur' | 'vignette';
  id?: string;
  amount?: number;
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
  bold?: boolean;
  italic?: boolean;
  background?: { color: { r: number; g: number; b: number; a: number }; radius: number; paddingX: number; paddingY: number };
  backgroundColor?: string;
  stroke?: { color: { r: number; g: number; b: number; a: number }; width: number };
  shadow?: { color: { r: number; g: number; b: number; a: number }; blur: number; offsetX: number; offsetY: number };
  alignment?: 'left' | 'center' | 'right' | 'justify';
  // decorative
  shape?: 'circle' | 'square' | 'line' | 'arrow' | 'star' | 'heart' | 'triangle' | 'hexagon';
  color?: string;
  fillColor?: string;
  // draw
  strokes?: Array<{
    points: Array<{ x: number; y: number }>;
    color: string;
    width: number;
    tool: string;
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

// ── Color matrix math (self-contained, mirrors EffectEvaluator) ──

const IDENTITY_MATRIX = [
  1, 0, 0, 0, 0,
  0, 1, 0, 0, 0,
  0, 0, 1, 0, 0,
  0, 0, 0, 1, 0,
];

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

function isIdentityMatrix(m: number[]): boolean {
  return m.every((v, i) => Math.abs(v - IDENTITY_MATRIX[i]) < 1e-6);
}

// ── Filter preset matrices (inlined from filterConfig.ts) ──────────
// IMPORTANT: These 10 flagship filter ColorMatrix definitions are EXACT
// copies of the `colorMatrix` field of each entry in the `FILTERS` array
// in `frontend/src/components/poster/filters/filterConfig.ts`. They are
// inlined here — rather than imported — to preserve the module's
// independence (the dependency direction is app → module, never
// module → app). If the source filter definitions in filterConfig.ts
// change, these matrices MUST be updated to match exactly so the JS
// export fallback produces the same visual result as the live preview.
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
 * `interpolateColorMatrix` in filterConfig.ts exactly.
 *
 * Formula: matrix[i] = identity[i] + (target[i] - identity[i]) * intensity
 */
export function interpolateMatrix(target: number[], intensity: number): number[] {
  const t = Math.max(0, Math.min(1, intensity));
  return IDENTITY_MATRIX.map((id, i) => id + (target[i] - id) * t);
}

/**
 * Build a 4×5 color matrix from a composition adjust effect node.
 * Mirrors `buildAdjustmentMatrix` in EffectEvaluator.ts so the JS export
 * produces the same color grading as the live preview.
 */
function buildAdjustmentMatrix(adjust: JsEffectNode): number[] {
  let matrix = [...IDENTITY_MATRIX];
  if (adjust.exposure) {
    const gain = Math.pow(2, adjust.exposure);
    matrix = multiplyMatrix(matrix, makeScaleMatrix(gain, gain, gain, 1));
  }
  if (adjust.contrast) {
    matrix = multiplyMatrix(matrix, makeContrastMatrix(1 + adjust.contrast));
  }
  if (adjust.saturation) {
    matrix = multiplyMatrix(matrix, makeSaturationMatrix(1 + adjust.saturation));
  }
  if (adjust.temperature) {
    matrix = multiplyMatrix(matrix, makeTemperatureMatrix(adjust.temperature * 0.15));
  }
  if (adjust.tint) {
    matrix = multiplyMatrix(matrix, makeTintMatrix(adjust.tint * 0.1));
  }
  if (adjust.fade && adjust.fade > 0) {
    matrix = multiplyMatrix(matrix, makeFadeMatrix(adjust.fade));
  }
  return matrix;
}

/**
 * Evaluate a composition effect stack into a single color matrix.
 * Both `adjust` nodes and `filter` preset nodes contribute color matrices.
 * Filter preset matrices are inlined from filterConfig.ts (see
 * FILTER_PRESET_MATRICES above) to keep this module self-contained.
 * `blur` and `vignette` are handled separately (image filter / overlay).
 */
function evaluateEffectColorMatrix(effects: JsEffectNode[] | undefined): number[] | undefined {
  if (!effects || effects.length === 0) return undefined;
  let colorMatrix: number[] | undefined;
  for (const node of effects) {
    if (node.type === 'adjust') {
      const m = buildAdjustmentMatrix(node);
      colorMatrix = colorMatrix ? multiplyMatrix(colorMatrix, m) : m;
    } else if (node.type === 'filter') {
      // Look up the inlined filter preset matrix by the node's id (the
      // filter preset name). Interpolate by the node's amount (clamped
      // 0..1) and multiply into the running color matrix. Unknown or
      // retired filter IDs fail closed to identity (no effect).
      const target = node.id ? FILTER_PRESET_MATRICES[node.id] : undefined;
      if (target) {
        const intensity = clamp(node.amount ?? 0, 0, 1);
        const m = interpolateMatrix(target, intensity);
        colorMatrix = colorMatrix ? multiplyMatrix(colorMatrix, m) : m;
      }
    }
    // 'blur' and 'vignette' are handled separately (image filter / overlay).
  }
  if (colorMatrix && !isIdentityMatrix(colorMatrix)) return colorMatrix;
  return undefined;
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

  // Color matrix from effect stack (adjustments only).
  const colorMatrix = evaluateEffectColorMatrix(p.effects);
  if (colorMatrix) {
    const cf = Skia.ColorFilter.MakeMatrix(colorMatrix);
    if (cf) paint.setColorFilter(cf);
  }

  // Blur image filter.
  const blurNode = p.effects?.find((e) => e.type === 'blur');
  if (blurNode && blurNode.radius && blurNode.radius > 0) {
    const blur = Skia.ImageFilter.MakeBlur(blurNode.radius, blurNode.radius, TileMode.Clamp, null);
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
  canvas.restore();
}

function drawTextLayer(
  canvas: SkCanvas,
  layer: JsLayer,
  canvasW: number,
  canvasH: number,
): void {
  const p = layer.payload;
  const text = p.text;
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

  const fontSize = p.fontSize ?? 32;
  const font = Skia.Font(undefined, fontSize);
  if (p.bold) font.setSize(fontSize); // Skia default font has no weight API; size is the only knob here.

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
    // Other shapes (star, heart, triangle, hexagon, arrow) — draw a
    // filled circle as a simple placeholder. Full path geometry for every
    // decorative shape is beyond the scope of this fallback.
    const r = Math.min(dw, dh) / 2;
    paint.setColor(Skia.Color(p.fillColor ?? color));
    paint.setStyle(PaintStyle.Fill);
    canvas.drawCircle(cx, cy, r, paint);
  }

  canvas.restore();
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

  for (const stroke of strokes) {
    if (stroke.points.length < 1) continue;
    const paint = Skia.Paint();
    paint.setAntiAlias(true);
    paint.setBlendMode(BlendMode.SrcOver);
    paint.setAlphaf(layerOpacity);
    paint.setColor(Skia.Color(stroke.color));
    paint.setStyle(PaintStyle.Stroke);
    paint.setStrokeWidth(stroke.width);
    paint.setStrokeCap(StrokeCap.Round);

    const path = Skia.Path.Make();
    const pts = stroke.points;
    const first = pts[0]!;
    path.moveTo(lx + first.x * lw, ly + first.y * lh);
    for (let i = 1; i < pts.length; i++) {
      const pt = pts[i]!;
      path.lineTo(lx + pt.x * lw, ly + pt.y * lh);
    }
    canvas.drawPath(path, paint);
  }

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
        drawTextLayer(canvas, layer, canvasW, canvasH);
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
