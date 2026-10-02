import type { Listing } from '@/lib/contracts/domain';
import { LISTINGS } from '@/lib/data/fixtures';
import { categoryCanonicalKey } from '@/components/search/categoryDirectoryStore';
import {
  COLOR_VOCAB,
  FILENAME_CATEGORY_CUES,
  type DetectedAttribute,
  type ImageFeatures,
} from '../visualSearchTypes';
import { colourDistance } from './colorFeatures';

// ── Listing colour table (module-static over fixtures) ───────────────────

/** Colours each listing names in its own text — scanned once. */
export const LISTING_COLOURS: Map<string, string[]> = (() => {
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

export const KNOWN_BRANDS = [...new Set(LISTINGS.map((l) => l.brand).filter((b): b is string => !!b))];

// ── Detected attributes ──────────────────────────────────────────────────

/** Category/brand cues from the file name — honest signal the user gave us. */
export function filenameCues(fileName: string): { category?: DetectedAttribute; brand?: DetectedAttribute } {
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
export function modalValue<T>(items: T[], key: (item: T) => string | null, minShare: number): string | null {
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

export function colourAffinity(listing: Listing, features: ImageFeatures): number {
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

export function colourRankedListings(features: ImageFeatures): { listing: Listing; affinity: number }[] {
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

export function categoryMatches(listing: Listing, value: string): boolean {
  const v = value.toLowerCase();
  if (listing.category.toLowerCase() === v) return true;
  // Mixed-vocabulary rows ('women-clothing' stored under a 'women' chip)
  // resolve through the shared canonical-key map — same rule as the
  // browse facets.
  if (
    categoryCanonicalKey(listing.category) === categoryCanonicalKey(value)
  ) {
    return true;
  }
  // Word-boundary match on subcategory + title — raw substring here let
  // 'men' hit "women's jacket"; the optional trailing s keeps the plural
  // tolerance ('jacket' → 'Leather jackets') the cue table relies on.
  const hay = `${listing.subcategory ?? ''} ${listing.title}`.toLowerCase();
  const re = new RegExp(
    `\\b${v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}s?\\b`,
  );
  return re.test(hay);
}
