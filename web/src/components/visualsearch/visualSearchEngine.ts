/**
 * Visual-search matching engine — fixture mode, all on-device.
 *
 * Honest port of backend/api/src/lib/visualSimilarity.ts intent:
 * the photo is decoded to a tiny canvas sample and reduced to a dominant
 * colour + luminance/contrast/aspect signature. Fixture listings can't be
 * pixel-matched (remote media, no offline features), so the match is
 * deterministic: each listing contributes the colour words its own text
 * names, and agreement is the distance between the detected dominant colour
 * and that vocabulary colour's canonical anchor. Category/brand cues come
 * from the filename or the modal values of the colour-ranked candidate set.
 *
 * Nothing here claims ML. The UI labels this "colour-similarity heuristic".
 */

import type { Listing } from '@/lib/contracts/domain';
import { LISTINGS } from '@/lib/data/fixtures';
import {
  COLOR_VOCAB,
  FILENAME_CATEGORY_CUES,
  type DetectedAttribute,
  type ImageFeatures,
  type VisualSearchRegion,
} from './visualSearchTypes';

const SAMPLE = 16; // 16×16 histogram sample, same as the backend heuristic.

// ── Image decode ─────────────────────────────────────────────────────────

export interface DecodedImage {
  /** Canvas-drawable source for feature extraction. */
  source: CanvasImageSource;
  width: number;
  height: number;
  /** Release decoded resources (ImageBitmap.close). */
  dispose: () => void;
}

/** Decode a File into a drawable source. Prefers createImageBitmap; falls
 *  back to an HTMLImageElement over a blob URL for older engines. Throws on
 *  undecodable input — the caller maps that to the 'decode' error state. */
export async function decodeImage(file: File, blobUrl: string): Promise<DecodedImage> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file);
      return {
        source: bmp,
        width: bmp.width,
        height: bmp.height,
        dispose: () => bmp.close(),
      };
    } catch {
      // Fall through to the HTMLImageElement path — some engines reject
      // formats via createImageBitmap that <img> still renders.
    }
  }
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('decode failed'));
    el.src = blobUrl;
  });
  if (!img.naturalWidth || !img.naturalHeight) throw new Error('decode failed');
  return {
    source: img,
    width: img.naturalWidth,
    height: img.naturalHeight,
    dispose: () => undefined,
  };
}

// ── Feature extraction ───────────────────────────────────────────────────

function nearestColour(rgb: [number, number, number]): { name: string; confidence: number } {
  let best = COLOR_VOCAB[0];
  let bestDist = Infinity;
  for (const c of COLOR_VOCAB) {
    const d = colourDistance(rgb, c.rgb);
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  // d≈0 → 1; d≈140 (adjacent vocab anchors) → ~0.3; far anchors → ~0.
  const confidence = Math.exp(-(bestDist * bestDist) / (2 * 85 * 85));
  return { name: best.name, confidence };
}

/** Weighted RGB distance — green channel carries more perceptual weight. */
function colourDistance(a: [number, number, number], b: [number, number, number]): number {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt(0.3 * dr * dr + 0.59 * dg * dg + 0.11 * db * db) * Math.sqrt(3);
}

/**
 * Extract the compact feature signature. When `region` is set the canvas
 * samples only that rect (drawImage source crop) — the exact behaviour the
 * mobile cropper pays the backend for, done locally.
 */
export function extractFeatures(
  image: DecodedImage,
  region: VisualSearchRegion | null,
): ImageFeatures {
  const canvas = document.createElement('canvas');
  canvas.width = SAMPLE;
  canvas.height = SAMPLE;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('no canvas context');

  let sx = 0;
  let sy = 0;
  let sw = image.width;
  let sh = image.height;
  if (region) {
    sx = Math.round(region.x * image.width);
    sy = Math.round(region.y * image.height);
    sw = Math.max(1, Math.round(region.width * image.width));
    sh = Math.max(1, Math.round(region.height * image.height));
  }
  ctx.drawImage(image.source, sx, sy, sw, sh, 0, 0, SAMPLE, SAMPLE);
  const { data } = ctx.getImageData(0, 0, SAMPLE, SAMPLE);

  const bins = new Float64Array(64);
  const binSum = new Float64Array(64 * 3);
  let lumSum = 0;
  let lumSq = 0;
  let satSum = 0;
  const px = SAMPLE * SAMPLE;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const bin = Math.min(3, r >> 6) * 16 + Math.min(3, g >> 6) * 4 + Math.min(3, b >> 6);
    bins[bin] += 1;
    binSum[bin * 3] += r;
    binSum[bin * 3 + 1] += g;
    binSum[bin * 3 + 2] += b;
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    lumSum += lum;
    lumSq += lum * lum;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    satSum += max === 0 ? 0 : (max - min) / max;
  }

  // Dominant cluster = fullest histogram bin; its member mean is the
  // palette anchor (a plain global mean gets dragged by the background).
  let topBin = 0;
  for (let i = 1; i < 64; i++) if (bins[i] > bins[topBin]) topBin = i;
  const n = Math.max(1, bins[topBin]);
  const rgb: [number, number, number] = [
    Math.round(binSum[topBin * 3] / n),
    Math.round(binSum[topBin * 3 + 1] / n),
    Math.round(binSum[topBin * 3 + 2] / n),
  ];

  const luminance = lumSum / px;
  const contrast = Math.min(1, Math.sqrt(Math.max(0, lumSq / px - luminance * luminance)) / 0.5);
  const { name, confidence } = nearestColour(rgb);

  return {
    rgb,
    colorName: name,
    colorConfidence: confidence,
    luminance,
    contrast,
    saturation: satSum / px,
    aspectRatio: sw / sh,
  };
}

// ── Listing colour table (module-static over fixtures) ───────────────────

/** Colours each listing names in its own text — scanned once. */
const LISTING_COLOURS: Map<string, string[]> = (() => {
  const map = new Map<string, string[]>();
  for (const l of LISTINGS) {
    const text = `${l.title} ${l.description} ${l.subcategory ?? ''}`.toLowerCase();
    const found: string[] = [];
    for (const c of COLOR_VOCAB) {
      if (c.aliases.some((a) => text.includes(a))) found.push(c.name);
    }
    map.set(l.id, found);
  }
  return map;
})();

const KNOWN_BRANDS = [...new Set(LISTINGS.map((l) => l.brand).filter((b): b is string => !!b))];

// ── Detected attributes ──────────────────────────────────────────────────

/** Category/brand cues from the file name — honest signal the user gave us. */
function filenameCues(fileName: string): { category?: DetectedAttribute; brand?: DetectedAttribute } {
  const stem = fileName.replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ');
  let category: DetectedAttribute | undefined;
  for (const [re, value, label] of FILENAME_CATEGORY_CUES) {
    if (re.test(stem)) {
      category = { kind: 'category', value, label, source: 'filename' };
      break;
    }
  }
  let brand: DetectedAttribute | undefined;
  const hay = ` ${stem.toLowerCase()} `;
  for (const b of KNOWN_BRANDS) {
    const needle = b.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    if (needle.length >= 3 && hay.includes(` ${needle} `)) {
      brand = { kind: 'brand', value: b.toLowerCase(), label: b, source: 'filename' };
      break;
    }
  }
  return { category, brand };
}

/** Modal value among the top colour-ranked candidates — an honest guess
 *  labelled "results" so the UI can mark it weaker than a filename cue. */
function modalValue<T>(items: T[], key: (item: T) => string | null, minShare: number): string | null {
  const counts = new Map<string, number>();
  for (const item of items) {
    const v = key(item);
    if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [v, c] of counts) {
    if (c > bestCount) {
      best = v;
      bestCount = c;
    }
  }
  return bestCount >= minShare ? best : null;
}

function colourRankedListings(features: ImageFeatures): { listing: Listing; affinity: number }[] {
  return LISTINGS.map((listing) => ({ listing, affinity: colourAffinity(listing, features) }))
    .sort((a, b) => b.affinity - a.affinity);
}

/**
 * Detected attributes — the removable refinement chips. Colour always
 * comes from the pixels; category/brand come from filename cues first,
 * then the modal values of the colour-ranked candidates (a guess, marked
 * as such via `source: 'results'`).
 */
export function detectAttributes(
  fileName: string,
  features: ImageFeatures,
): DetectedAttribute[] {
  const attrs: DetectedAttribute[] = [
    {
      kind: 'color',
      value: features.colorName.toLowerCase(),
      label: features.colorName,
      source: 'image',
      rgb: features.rgb,
    },
  ];

  const cues = filenameCues(fileName);
  if (cues.category) {
    attrs.push(cues.category);
  } else {
    const modal = modalValue(colourRankedListings(features).slice(0, 8), (r) => r.listing.category, 3);
    if (modal) {
      attrs.push({
        kind: 'category',
        value: modal,
        label: modal.charAt(0).toUpperCase() + modal.slice(1),
        source: 'results',
      });
    }
  }
  if (cues.brand) {
    attrs.push(cues.brand);
  } else {
    const modalBrand = modalValue(
      colourRankedListings(features).slice(0, 6),
      (r) => r.listing.brand,
      2,
    );
    if (modalBrand) {
      attrs.push({
        kind: 'brand',
        value: modalBrand.toLowerCase(),
        label: modalBrand,
        source: 'results',
      });
    }
  }
  return attrs;
}

// ── Matching ─────────────────────────────────────────────────────────────

function colourAffinity(listing: Listing, features: ImageFeatures): number {
  const names = LISTING_COLOURS.get(listing.id) ?? [];
  if (names.length === 0) return -1; // no colour info — handled by the caller
  let best = 0;
  for (const name of names) {
    const vocab = COLOR_VOCAB.find((c) => c.name === name);
    if (!vocab) continue;
    const d = colourDistance(features.rgb, vocab.rgb);
    best = Math.max(best, Math.exp(-(d * d) / (2 * 85 * 85)));
  }
  return best;
}

function categoryMatches(listing: Listing, value: string): boolean {
  const v = value.toLowerCase();
  if (listing.category.toLowerCase() === v) return true;
  const sub = (listing.subcategory ?? '').toLowerCase();
  const title = listing.title.toLowerCase();
  return (
    sub.includes(v) ||
    (!v.endsWith('s') && sub.includes(`${v}s`)) ||
    title.includes(v)
  );
}

export interface MatchOptions {
  /** Kinds the user removed — present attributes are hard filters. */
  inactive: ReadonlySet<DetectedAttribute['kind']>;
  attributes: DetectedAttribute[];
  regionApplied: boolean;
}

/**
 * Deterministic fixture matcher. Active attributes are hard filters —
 * colour is lenient toward listings that name no colour (can't disprove);
 * category/brand are exact textual matches. Ranking = weighted colour
 * affinity + attribute hits + a small popularity tiebreak. A framed region
 * shifts weight onto colour, since the user told us where to look.
 */
export function matchListings(
  features: ImageFeatures,
  { inactive, attributes, regionApplied }: MatchOptions,
): Listing[] {
  const colorAttr = attributes.find((a) => a.kind === 'color');
  const categoryAttr = attributes.find((a) => a.kind === 'category');
  const brandAttr = attributes.find((a) => a.kind === 'brand');
  const colorOn = !!colorAttr && !inactive.has('color');
  const categoryOn = !!categoryAttr && !inactive.has('category');
  const brandOn = !!brandAttr && !inactive.has('brand');

  const w = regionApplied
    ? { color: 0.7, category: 0.15, brand: 0.1, popularity: 0.05 }
    : { color: 0.55, category: 0.25, brand: 0.15, popularity: 0.05 };

  const scored: { listing: Listing; score: number }[] = [];
  for (const listing of LISTINGS) {
    const affinity = colourAffinity(listing, features);
    const catHit = categoryAttr ? categoryMatches(listing, categoryAttr.value) : false;
    const brandHit =
      brandAttr && listing.brand ? listing.brand.toLowerCase() === brandAttr.value : false;

    if (colorOn && affinity >= 0 && affinity < 0.3) continue; // names a far colour
    if (categoryOn && !catHit) continue;
    if (brandOn && !brandHit) continue;

    // Listings with no colour word rank on a neutral base — included, but
    // below confident colour matches.
    const colourScore = affinity >= 0 ? affinity : 0.35;
    const popularity = Math.min(1, (listing.likes ?? 0) / 130);
    const score =
      w.color * colourScore +
      (catHit ? w.category : 0) +
      (brandHit ? w.brand : 0) +
      w.popularity * popularity;
    scored.push({ listing, score });
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 24)
    .map((s) => s.listing);
}

/** Truthful summary line for the results header — same voice as mobile's
 *  honestNoteText. */
export function honestMatchNote(regionApplied: boolean): string {
  return regionApplied
    ? 'Matched by colour similarity within the framed area — deterministic heuristic, not AI.'
    : 'Matched by colour similarity — deterministic heuristic, not AI. Fixture catalogue.';
}
