/**
 * Visual similarity — honest heuristic colour-feature matching.
 *
 * This module implements a real, lightweight image-similarity heuristic that
 * does NOT depend on a trained ML model. It extracts a compact visual feature
 * vector from an image using sharp:
 *
 *   - a 4×4×4 (64-bin) RGB colour histogram — captures the dominant palette
 *   - a 2×2 spatial grid of average RGB cells — captures coarse layout
 *   - mean luminance and contrast (stddev of luminance)
 *   - aspect ratio
 *
 * Similarity between two feature vectors is a weighted combination of cosine
 * similarity over the histogram, normalised distance over the spatial grid,
 * and gaussian-style agreement on luminance / contrast / aspect ratio. The
 * result is a score in [0, 1] where 1 means "visually identical by these
 * features" and 0 means "no overlap".
 *
 * This is intentionally NOT advertised as AI or ML. It is a deterministic
 * colour-and-layout heuristic. Callers must label results truthfully via the
 * `similarityMethod` field (e.g. `'heuristic_color_features'`).
 *
 * @packageDocumentation
 */

import sharp, { type Sharp } from 'sharp';

/** Visual feature vector extracted from a single image. */
export interface ImageFeatures {
  /** 64-bin RGB colour histogram, normalised to sum to 1. */
  histogram: number[];
  /** 2×2 spatial grid of average RGB cells (12 values, each in [0,1]). */
  grid: number[];
  /** Mean luminance in [0,1] (Rec. 601 weighted). */
  luminance: number;
  /** Contrast — standard deviation of luminance, normalised to [0,1]. */
  contrast: number;
  /** Aspect ratio = width / height (>= 0). */
  aspectRatio: number;
}

const HISTOGRAM_BINS_PER_CHANNEL = 4;
const HISTOGRAM_BINS = HISTOGRAM_BINS_PER_CHANNEL ** 3; // 64
const GRID_CELLS = 4; // 2×2
const GRID_DIMS = GRID_CELLS * 3; // 12
const THUMBNAIL_SIZE = 16; // 16×16 sample grid for histogram + luminance

/** Per-image download timeout (ms). */
const FETCH_TIMEOUT_MS = 4000;
/** Maximum in-memory feature cache entries (URL → features). */
const FEATURE_CACHE_MAX = 512;

const featureCache = new Map<string, ImageFeatures>();

/**
 * Extract a visual feature vector from an image buffer.
 *
 * The image is decoded once, downscaled to a 16×16 thumbnail for the colour
 * histogram and luminance statistics, and to a 2×2 grid for spatial layout.
 * The original aspect ratio is read from the source metadata.
 */
export async function extractImageFeatures(buffer: Buffer): Promise<ImageFeatures> {
  const source = sharp(buffer, { failOn: 'none' });
  const metadata = await source.metadata();
  const sourceWidth = metadata.width ?? 0;
  const sourceHeight = metadata.height ?? 0;

  if (sourceWidth === 0 || sourceHeight === 0) {
    throw new Error('visualSimilarity: could not decode image dimensions');
  }

  // 16×16 raw RGB pixels for the colour histogram + luminance stats.
  const thumbRaw = await source
    .clone()
    .resize({
      width: THUMBNAIL_SIZE,
      height: THUMBNAIL_SIZE,
      fit: sharp.fit.fill,
      withoutEnlargement: true,
    })
    .removeAlpha()
    .raw()
    .toBuffer();

  const histogram = new Array<number>(HISTOGRAM_BINS).fill(0);
  let lumSum = 0;
  let lumSumSq = 0;
  const pixelCount = THUMBNAIL_SIZE * THUMBNAIL_SIZE;

  for (let i = 0; i < thumbRaw.length; i += 3) {
    const r = thumbRaw[i];
    const g = thumbRaw[i + 1];
    const b = thumbRaw[i + 2];

    // 4-bin per channel: divide 0-255 into 4 buckets.
    const rBin = Math.min(HISTOGRAM_BINS_PER_CHANNEL - 1, (r * HISTOGRAM_BINS_PER_CHANNEL) >> 8);
    const gBin = Math.min(HISTOGRAM_BINS_PER_CHANNEL - 1, (g * HISTOGRAM_BINS_PER_CHANNEL) >> 8);
    const bBin = Math.min(HISTOGRAM_BINS_PER_CHANNEL - 1, (b * HISTOGRAM_BINS_PER_CHANNEL) >> 8);
    histogram[rBin * 16 + gBin * 4 + bBin] += 1;

    // Rec. 601 luminance.
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    lumSum += lum;
    lumSumSq += lum * lum;
  }

  // Normalise histogram to a probability distribution.
  for (let i = 0; i < histogram.length; i++) {
    histogram[i] /= pixelCount;
  }

  const luminance = lumSum / pixelCount;
  const variance = Math.max(0, lumSumSq / pixelCount - luminance * luminance);
  // Stddev of luminance is at most 0.5 for natural 8-bit images; normalise.
  const contrast = Math.min(1, Math.sqrt(variance) / 0.5);

  // 2×2 spatial grid of average RGB (each cell averaged in [0,1]).
  const grid = await computeSpatialGrid(source);

  const aspectRatio = sourceWidth / sourceHeight;

  return { histogram, grid, luminance, contrast, aspectRatio };
}

/** Compute a 2×2 grid of average RGB cells (12 values, each in [0,1]). */
async function computeSpatialGrid(source: Sharp): Promise<number[]> {
  // Downscale to 2×2 and read raw RGB.
  const raw = await source
    .clone()
    .resize({ width: 2, height: 2, fit: sharp.fit.fill, withoutEnlargement: true })
    .removeAlpha()
    .raw()
    .toBuffer();

  const grid: number[] = [];
  for (let i = 0; i < raw.length; i += 3) {
    grid.push(raw[i] / 255);
    grid.push(raw[i + 1] / 255);
    grid.push(raw[i + 2] / 255);
  }
  return grid;
}

/**
 * Compute a similarity score in [0,1] between two feature vectors.
 *
 * Weighting:
 *   - colour histogram (cosine):  0.45
 *   - spatial grid (distance):    0.30
 *   - luminance agreement:        0.10
 *   - contrast agreement:         0.05
 *   - aspect-ratio agreement:     0.10
 */
export function computeSimilarity(a: ImageFeatures, b: ImageFeatures): number {
  const histSim = cosineSimilarity(a.histogram, b.histogram);
  const gridSim = gridAgreement(a.grid, b.grid);
  const lumSim = 1 - Math.abs(a.luminance - b.luminance);
  const contrastSim = 1 - Math.abs(a.contrast - b.contrast);
  const aspectSim = aspectAgreement(a.aspectRatio, b.aspectRatio);

  const score =
    0.45 * histSim +
    0.30 * gridSim +
    0.10 * lumSim +
    0.05 * contrastSim +
    0.10 * aspectSim;

  return Math.max(0, Math.min(1, score));
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function gridAgreement(a: number[], b: number[]): number {
  // Normalised Euclidean distance over 12 dims → agreement in [0,1].
  let sumSq = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    sumSq += d * d;
  }
  const maxDist = Math.sqrt(GRID_DIMS); // each dim diff at most 1
  const dist = Math.sqrt(sumSq);
  return Math.max(0, 1 - dist / maxDist);
}

function aspectAgreement(a: number, b: number): number {
  // Compare in log space so 2:1 vs 1:2 are equally far from 1:1.
  if (a <= 0 || b <= 0) return 0;
  const diff = Math.abs(Math.log(a) - Math.log(b));
  // log(2) ≈ 0.693 — a factor-of-2 difference maps to ~0.5 agreement.
  return Math.max(0, 1 - diff / Math.log(4));
}

/**
 * Fetch an image buffer from a URL with a bounded timeout.
 * Returns null on any failure so callers can skip the candidate.
 */
export async function fetchImageBuffer(url: string): Promise<Buffer | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
    });
    clearTimeout(timer);
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch {
    return null;
  }
}

/**
 * Extract features for a remote image, with an in-memory cache keyed by URL.
 * Returns null if the image cannot be downloaded or decoded.
 */
export async function extractRemoteImageFeatures(url: string): Promise<ImageFeatures | null> {
  const cached = featureCache.get(url);
  if (cached) return cached;

  const buffer = await fetchImageBuffer(url);
  if (!buffer) return null;

  try {
    const features = await extractImageFeatures(buffer);
    if (featureCache.size >= FEATURE_CACHE_MAX) {
      // Evict the oldest entry to bound memory.
      const firstKey = featureCache.keys().next().value;
      if (firstKey) featureCache.delete(firstKey);
    }
    featureCache.set(url, features);
    return features;
  } catch {
    return null;
  }
}

/**
 * Run an async mapper over `items` with a bounded concurrency limit.
 * Failures (null results) are preserved in-place so the output array aligns
 * with the input by index.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function worker(): Promise<void> {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await mapper(items[index], index);
    }
  }

  const workers: Promise<void>[] = [];
  const concurrency = Math.max(1, Math.min(limit, items.length));
  for (let i = 0; i < concurrency; i++) {
    workers.push(worker());
  }
  await Promise.all(workers);
  return results;
}
