/**
 * MaskRenderer — Skia-based offscreen mask rasterization utilities.
 *
 * This module provides the real pixel-level mask operations that the
 * CutoutService delegates to. It uses `@shopify/react-native-skia`
 * (already in package.json) to create an offscreen surface, rasterize
 * brush strokes into the alpha channel, apply feather (blur) and invert,
 * and export the result as a PNG file via expo-file-system.
 *
 * Mask convention (alpha mask):
 *   - White / opaque  = KEEP (subject visible)
 *   - Transparent     = ERASE (background removed)
 *
 * The initial mask is fully opaque (the entire image is kept). The user
 * erases background regions with the erase brush and restores accidental
 * erasures with the keep/restore brush. This is the honest, real
 * refinement pipeline required by spec 08 (Keep / Erase / Restore /
 * feather / invert / undo).
 *
 * No new native dependencies are added. Skia, expo-image-manipulator and
 * expo-file-system are already in frontend/package.json.
 */
import {
  Skia,
  BlendMode,
  StrokeCap,
  StrokeJoin,
  TileMode,
  ClipOp,
  ImageFormat,
  type SkPath,
  type SkImage,
  type SkSurface,
  type SkPaint,
} from '@shopify/react-native-skia';
import * as FileSystem from 'expo-file-system';

// ── Skia availability guard ─────────────────────────────────────────
// A runtime guard prevents a hard crash if the native Skia module is not
// linked. When unavailable, mask operations throw an explicit error so the
// caller can show an honest message rather than silently faking a result
// (AGENTS.md §11).
let _skiaAvailable: boolean | null = null;

function isSkiaAvailable(): boolean {
  if (_skiaAvailable !== null) return _skiaAvailable;
  try {
    // Probe the native binding by actually invoking a factory. If the
    // native Skia module is not linked, Skia.Paint() throws — caught below.
    _skiaAvailable = !!(Skia && Skia.Surface && Skia.Paint() && Skia.Path);
  } catch {
    _skiaAvailable = false;
  }
  return _skiaAvailable;
}

// ── Types ───────────────────────────────────────────────────────────

export type Point = { x: number; y: number };

/**
 * A committed brush stroke in the mask's coordinate space (px).
 * - keep   → paint opaque white (restore / add to mask)
 * - erase  → clear alpha to transparent (remove from mask)
 */
export type MaskStroke = {
  mode: 'keep' | 'erase';
  points: Point[];
  brushSize: number;
};

/**
 * An opaque handle to an offscreen Skia surface that holds the mask.
 * The surface is mutable — strokes are rasterized into it in place.
 */
export interface MaskSurface {
  readonly width: number;
  readonly height: number;
  /** The underlying Skia surface holding the current mask. */
  surface: SkSurface | null;
}

// ── Path smoothing (Catmull-Rom → cubic Bézier) ─────────────────────
// Reused from the drawing workspace pattern for GPU-smooth strokes.

function smoothPath(points: Point[], tension = 0.5): SkPath | null {
  if (!isSkiaAvailable() || points.length === 0) return null;
  const path = Skia.Path.Make();
  if (!path) return null;
  if (points.length === 1) {
    path.moveTo(points[0].x, points[0].y);
    return path;
  }
  if (points.length === 2) {
    path.moveTo(points[0].x, points[0].y);
    path.lineTo(points[1].x, points[1].y);
    return path;
  }
  path.moveTo(points[0].x, points[0].y);
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;
    const cp1x = p1.x + ((p2.x - p0.x) / 6) * tension;
    const cp1y = p1.y + ((p2.y - p0.y) / 6) * tension;
    const cp2x = p2.x - ((p3.x - p1.x) / 6) * tension;
    const cp2y = p2.y - ((p3.y - p1.y) / 6) * tension;
    path.cubicTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
  }
  return path;
}

// ── Surface creation ────────────────────────────────────────────────

/**
 * Create a new offscreen mask surface of the given dimensions.
 * The mask is initialized to fully opaque white (everything kept).
 *
 * Returns a MaskSurface handle. Throws if Skia is unavailable.
 */
export function createMaskSurface(width: number, height: number): MaskSurface {
  if (!isSkiaAvailable()) {
    throw new Error('Skia is not available — cannot create mask surface.');
  }
  const surface = Skia.Surface.MakeOffscreen(width, height);
  if (!surface) {
    throw new Error('Failed to create offscreen Skia surface.');
  }
  const canvas = surface.getCanvas();
  // Fill with opaque white = everything kept.
  const fillPaint = Skia.Paint();
  fillPaint.setColor(Skia.Color('white'));
  fillPaint.setBlendMode(BlendMode.Src);
  canvas.drawPaint(fillPaint);
  surface.flush();

  return { width, height, surface };
}

// ── Stroke rasterization ────────────────────────────────────────────

/**
 * Build a configured paint for a brush stroke of the given mode and size.
 */
function makeStrokePaint(mode: 'keep' | 'erase', brushSize: number): SkPaint {
  const paint = Skia.Paint();
  paint.setAntiAlias(true);
  paint.setStrokeCap(StrokeCap.Round);
  paint.setStrokeJoin(StrokeJoin.Round);
  paint.setStrokeWidth(brushSize);
  if (mode === 'erase') {
    // Clear blend mode zeroes the alpha channel — removes from mask.
    paint.setBlendMode(BlendMode.Clear);
  } else {
    // keep — paint opaque white onto the mask.
    paint.setColor(Skia.Color('white'));
    paint.setBlendMode(BlendMode.SrcOver);
  }
  return paint;
}

/**
 * Rasterize a single brush stroke into the mask surface.
 *
 * - keep  → paint opaque white (SrcOver) — restores / adds to the mask.
 * - erase → clear alpha to transparent (Clear blend) — removes from the mask.
 *
 * The stroke is drawn with round caps/joins and Catmull-Rom smoothing
 * for a natural brush feel. A single-point stroke draws a filled circle
 * so a tap still marks the mask.
 */
export function rasterizeStroke(mask: MaskSurface, stroke: MaskStroke): void {
  if (!mask.surface) return;
  const canvas = mask.surface.getCanvas();
  const paint = makeStrokePaint(stroke.mode, stroke.brushSize);

  if (stroke.points.length === 1) {
    // Tap — draw a filled circle.
    const p = stroke.points[0];
    canvas.drawCircle(p.x, p.y, stroke.brushSize / 2, paint);
  } else {
    const path = smoothPath(stroke.points);
    if (path) {
      canvas.drawPath(path, paint);
    }
  }
  mask.surface.flush();
}

/**
 * Restore a stroke — paint opaque white back into the regions covered by
 * the brush.
 *
 * For a brush-only mask (no automatic segmentation), the baseline is
 * fully opaque white, so restore is functionally identical to keep: it
 * paints opaque white over the brushed region, reverting erasures to the
 * "everything kept" baseline. This is the honest Restore semantic for
 * the current capability (spec 08: Restore = restore from original).
 *
 * When an automatic segmentation backend is installed in the future,
 * restore will instead paint the auto-generated mask baseline through
 * the brush clip.
 */
export function rasterizeRestore(
  mask: MaskSurface,
  points: Point[],
  brushSize: number,
): void {
  if (!mask.surface) return;
  const canvas = mask.surface.getCanvas();
  const paint = makeStrokePaint('keep', brushSize);

  if (points.length === 1) {
    const p = points[0];
    canvas.drawCircle(p.x, p.y, brushSize / 2, paint);
  } else {
    const path = smoothPath(points);
    if (path) {
      canvas.drawPath(path, paint);
    }
  }
  mask.surface.flush();
}

// ── Feather (edge blur) ─────────────────────────────────────────────

/**
 * Feather the mask edges by blurring the alpha channel.
 *
 * This creates a new surface, draws the current mask through a blur
 * image filter (TileMode.Clamp so edges are not shrunk), and replaces
 * the mask surface with the softened result. A radius of 0 is a no-op.
 */
export function featherMask(mask: MaskSurface, radius: number): void {
  if (!mask.surface || radius <= 0) return;
  const { width, height } = mask;
  const blurred = Skia.Surface.MakeOffscreen(width, height);
  if (!blurred) return;
  const canvas = blurred.getCanvas();
  const paint = Skia.Paint();
  paint.setAntiAlias(true);
  paint.setBlendMode(BlendMode.Src);
  // Apply a blur image filter to soften the alpha edge.
  const blurFilter = Skia.ImageFilter.MakeBlur(radius, radius, TileMode.Clamp, null);
  if (blurFilter) {
    paint.setImageFilter(blurFilter);
  }
  const snapshot = mask.surface.makeImageSnapshot();
  if (snapshot) {
    canvas.drawImage(snapshot, 0, 0, paint);
  }
  blurred.flush();
  // Replace the surface with the blurred result.
  mask.surface = blurred;
}

// ── Invert mask ─────────────────────────────────────────────────────

/**
 * Invert the mask alpha: opaque → transparent, transparent → opaque.
 *
 * Implemented by creating a new fully-opaque-white surface and drawing
 * the current mask with DstOut blend mode — this punches out the opaque
 * regions, leaving white only where the original was transparent.
 */
export function invertMask(mask: MaskSurface): void {
  if (!mask.surface) return;
  const { width, height } = mask;
  const inverted = Skia.Surface.MakeOffscreen(width, height);
  if (!inverted) return;
  const canvas = inverted.getCanvas();

  // Start fully opaque white.
  const fillPaint = Skia.Paint();
  fillPaint.setColor(Skia.Color('white'));
  fillPaint.setBlendMode(BlendMode.Src);
  canvas.drawPaint(fillPaint);

  // Punch out where the original mask was opaque (DstOut removes dst
  // pixels covered by the source's alpha).
  const dstOutPaint = Skia.Paint();
  dstOutPaint.setBlendMode(BlendMode.DstOut);
  const snapshot = mask.surface.makeImageSnapshot();
  if (snapshot) {
    canvas.drawImage(snapshot, 0, 0, dstOutPaint);
  }
  inverted.flush();
  mask.surface = inverted;
}

// ── Export mask as PNG ──────────────────────────────────────────────

/**
 * Export the current mask surface as a PNG file in the document directory.
 *
 * Returns the local file URI of the written PNG. The caller stores this
 * URI as a project asset and references it non-destructively from the
 * media layer via MaskRef (spec 08: store mask as a separate asset).
 */
export async function exportMaskAsPng(
  mask: MaskSurface,
  filename: string,
): Promise<string> {
  if (!mask.surface) {
    throw new Error('Mask surface is not available.');
  }
  mask.surface.flush();
  const image = mask.surface.makeImageSnapshot();
  if (!image) {
    throw new Error('Failed to snapshot mask surface.');
  }
  const bytes = image.encodeToBytes(ImageFormat.PNG, 100);
  // expo-file-system 57 removed the top-level `documentDirectory` export.
  // The document directory is now accessed via `Paths.document` (a Directory
  // instance) whose `uri` is the `file://` URI string.
  const dir = FileSystem.Paths.document.uri;
  if (!dir) {
    throw new Error('File system document directory is not available.');
  }
  const path = `${dir}${filename}`;
  // encodeToBytes returns a Uint8Array; write as base64.
  const base64 = uint8ToBase64(bytes);
  await FileSystem.writeAsStringAsync(path, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return path;
}

// ── Snapshot to SkImage (for in-app preview without file I/O) ───────

/**
 * Snapshot the current mask surface as an SkImage for use in a Skia
 * Canvas preview (e.g. MaskCompositor). The image is a texture image
 * bound to the surface's GPU context.
 */
export function snapshotMaskImage(mask: MaskSurface): SkImage | null {
  if (!mask.surface) return null;
  mask.surface.flush();
  return mask.surface.makeImageSnapshot();
}

// ── Helpers ─────────────────────────────────────────────────────────

/**
 * Convert a Uint8Array to a base64 string without relying on Node Buffer
 * (React Native runtime). Uses chunked encoding to avoid call-stack
 * limits on large arrays.
 */
function uint8ToBase64(bytes: Uint8Array): string {
  const lookup = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
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

// ── Public re-exports for callers ───────────────────────────────────

export { isSkiaAvailable as isMaskRendererAvailable };
