/**
 * imageEdit — honest local photo transforms for the media studio.
 *
 * Every operation writes real pixels through canvas: the exported blob IS
 * the transformed image, never a fake preview. Adjustment ops run through
 * manual getImageData passes (not ctx.filter) so behaviour is identical in
 * every supported browser, including Safari versions without canvas filter
 * support.
 */

/** Crop region in normalized 0..1 space, measured on the post-rotate frame. */
export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ImageEdits {
  /** Clockwise quarter-turns. */
  rotate: 0 | 90 | 180 | 270;
  flipH: boolean;
  flipV: boolean;
  /** Normalized crop in the rotated frame. Null = full frame. */
  crop: CropRect | null;
  /** Percent adjustments — 100 = unchanged. */
  brightness: number;
  contrast: number;
  saturation: number;
  /** Luminance histogram stretch computed from the real pixels. */
  autoLighting: boolean;
}

export const DEFAULT_IMAGE_EDITS: ImageEdits = {
  rotate: 0,
  flipH: false,
  flipV: false,
  crop: null,
  brightness: 100,
  contrast: 100,
  saturation: 100,
  autoLighting: false,
};

/** Full-resolution ceiling for the exported file — keeps uploads sane. */
export const EDITED_PHOTO_MAX_EDGE = 2048;

/** Smallest crop edge as a fraction of the frame — below this the crop is noise. */
export const MIN_CROP_FRACTION = 0.08;

export function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('The photo could not be read'));
    img.src = src;
  });
}

export function rotatedSize(
  width: number,
  height: number,
  rotate: ImageEdits['rotate'],
): { width: number; height: number } {
  return rotate === 90 || rotate === 270
    ? { width: height, height: width }
    : { width, height };
}

/** Whether the draft edits change pixels at all — drives Apply enablement. */
export function hasPixelEdits(e: ImageEdits): boolean {
  return (
    e.rotate !== 0 ||
    e.flipH ||
    e.flipV ||
    e.crop != null ||
    e.brightness !== 100 ||
    e.contrast !== 100 ||
    e.saturation !== 100 ||
    e.autoLighting
  );
}

/**
 * Largest rect of `aspect` (w/h) centred inside a frame, normalized.
 * Returns the full frame when the requested aspect matches or exceeds it.
 */
export function centeredCropFor(
  aspect: number,
  frameWidth: number,
  frameHeight: number,
): CropRect {
  const frameAspect = frameWidth / frameHeight;
  let w = 1;
  let h = 1;
  if (aspect > frameAspect) {
    h = frameAspect / aspect;
  } else if (aspect < frameAspect) {
    w = aspect / frameAspect;
  }
  return { x: (1 - w) / 2, y: (1 - h) / 2, width: w, height: h };
}

/**
 * Draw the source through rotate + flip into a stage canvas at `scale`.
 * The stage holds the full post-transform frame — crop is applied by the
 * caller as a source rect on the stage.
 */
function drawTransformed(
  img: HTMLImageElement,
  edits: ImageEdits,
  scale: number,
): HTMLCanvasElement {
  const rot = rotatedSize(img.naturalWidth, img.naturalHeight, edits.rotate);
  const stage = document.createElement('canvas');
  stage.width = Math.max(1, Math.round(rot.width * scale));
  stage.height = Math.max(1, Math.round(rot.height * scale));
  const ctx = stage.getContext('2d');
  if (!ctx) return stage;

  const w = img.naturalWidth * scale;
  const h = img.naturalHeight * scale;
  ctx.save();
  ctx.translate(stage.width / 2, stage.height / 2);
  ctx.rotate((edits.rotate * Math.PI) / 180);
  ctx.scale(edits.flipH ? -1 : 1, edits.flipV ? -1 : 1);
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  ctx.restore();
  return stage;
}

/**
 * Pixel adjustments — brightness (multiply), contrast (around mid-grey),
 * saturation (distance from luma), and the auto-lighting luminance stretch.
 * One getImageData pass; alpha is preserved.
 */
function applyPixelAdjustments(
  canvas: HTMLCanvasElement,
  edits: ImageEdits,
): void {
  const needsStretch = edits.autoLighting;
  const needsChannel =
    edits.brightness !== 100 || edits.contrast !== 100 || edits.saturation !== 100;
  if (!needsStretch && !needsChannel) return;

  const ctx = canvas.getContext('2d');
  if (!ctx || !canvas.width || !canvas.height) return;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = imageData.data;

  // Luminance histogram → 1st/99th percentile stretch. A flat image
  // (lo≈hi) skips the stretch — stretching noise would just posterize it.
  let lo = 0;
  let hi = 255;
  if (needsStretch) {
    const bins = new Uint32Array(256);
    for (let i = 0; i < d.length; i += 4) {
      const luma =
        (0.2126 * (d[i] ?? 0) + 0.7152 * (d[i + 1] ?? 0) + 0.0722 * (d[i + 2] ?? 0)) | 0;
      bins[luma] = (bins[luma] ?? 0) + 1;
    }
    const total = d.length / 4;
    const lowCut = total * 0.01;
    const highCut = total * 0.99;
    let acc = 0;
    for (let i = 0; i < 256; i++) {
      acc += bins[i] ?? 0;
      if (acc >= lowCut) {
        lo = i;
        break;
      }
    }
    acc = 0;
    for (let i = 0; i < 256; i++) {
      acc += bins[i] ?? 0;
      if (acc >= highCut) {
        hi = i;
        break;
      }
    }
    if (hi - lo < 24) {
      lo = 0;
      hi = 255;
    }
  }
  const stretch = needsStretch && hi > lo ? 255 / (hi - lo) : 1;

  const b = edits.brightness / 100;
  const c = edits.contrast / 100;
  const s = edits.saturation / 100;

  for (let i = 0; i < d.length; i += 4) {
    let r = d[i] ?? 0;
    let g = d[i + 1] ?? 0;
    let bl = d[i + 2] ?? 0;
    if (needsStretch) {
      r = (r - lo) * stretch;
      g = (g - lo) * stretch;
      bl = (bl - lo) * stretch;
    }
    r = (r * b - 128) * c + 128;
    g = (g * b - 128) * c + 128;
    bl = (bl * b - 128) * c + 128;
    if (s !== 1) {
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * bl;
      r = luma + (r - luma) * s;
      g = luma + (g - luma) * s;
      bl = luma + (bl - luma) * s;
    }
    d[i] = r < 0 ? 0 : r > 255 ? 255 : r;
    d[i + 1] = g < 0 ? 0 : g > 255 ? 255 : g;
    d[i + 2] = bl < 0 ? 0 : bl > 255 ? 255 : bl;
  }
  ctx.putImageData(imageData, 0, 0);
}

/**
 * Render the edited image into `target`.
 *
 * `applyCrop: false` draws the full post-rotate/flip frame (the crop tool's
 * working view); `true` draws the final look — crop then pixel adjustments
 * on the visible result only. `maxEdge` caps the output bitmap.
 */
export function renderEdits(
  img: HTMLImageElement,
  edits: ImageEdits,
  target: HTMLCanvasElement,
  opts: { applyCrop: boolean; maxEdge: number },
): void {
  const rot = rotatedSize(img.naturalWidth, img.naturalHeight, edits.rotate);
  const crop =
    opts.applyCrop && edits.crop
      ? edits.crop
      : { x: 0, y: 0, width: 1, height: 1 };
  const outW = Math.max(1, Math.round(rot.width * crop.width));
  const outH = Math.max(1, Math.round(rot.height * crop.height));
  const scale = Math.min(1, opts.maxEdge / Math.max(outW, outH));

  const stage = drawTransformed(img, edits, scale);

  target.width = Math.max(1, Math.round(outW * scale));
  target.height = Math.max(1, Math.round(outH * scale));
  const ctx = target.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, target.width, target.height);
  ctx.drawImage(
    stage,
    crop.x * stage.width,
    crop.y * stage.height,
    crop.width * stage.width,
    crop.height * stage.height,
    0,
    0,
    target.width,
    target.height,
  );
  applyPixelAdjustments(target, edits);
}

/**
 * Produce the real transformed file — JPEG for photographs. Returns null
 * only when the canvas itself fails (e.g. zero-size output), which the
 * caller surfaces as an honest error.
 */
export function exportEditedImage(
  img: HTMLImageElement,
  edits: ImageEdits,
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  renderEdits(img, edits, canvas, {
    applyCrop: true,
    maxEdge: EDITED_PHOTO_MAX_EDGE,
  });
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(new Error('The edited photo could not be encoded')),
      'image/jpeg',
      0.92,
    );
  });
}

/**
 * Grab the current frame of a live camera stream as a JPEG blob — the same
 * canvas path as the edit pipeline, so captures and edits share behaviour.
 */
export function captureVideoFrame(
  video: HTMLVideoElement,
  maxEdge = EDITED_PHOTO_MAX_EDGE,
): Promise<Blob> {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) {
    return Promise.reject(new Error('The camera frame is not ready yet'));
  }
  const scale = Math.min(1, maxEdge / Math.max(vw, vh));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(vw * scale);
  canvas.height = Math.round(vh * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.reject(new Error('Capture is not available'));
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(new Error('The photo could not be captured')),
      'image/jpeg',
      0.92,
    );
  });
}
