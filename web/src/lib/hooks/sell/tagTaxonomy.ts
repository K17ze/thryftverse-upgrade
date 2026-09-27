/**
 * Tag taxonomy — the fixture catalogue the sell flow's tag autocomplete
 * ranks against. Mirrors the curated catalogue in mobile's
 * services/searchAutocompleteApi.ts (styles / materials / colours / brands),
 * scoped to terms that work as listing discovery tags.
 */

import { LISTINGS } from '@/lib/data/fixtures';

const STYLE_TAGS = [
  'vintage', 'y2k', 'streetwear', 'minimalist', 'gorpcore', 'cottagecore',
  'grunge', 'preppy', 'techwear', 'retro', 'boho', 'oversized', '90s', '80s',
  '70s', 'indie', 'skater', 'normcore', 'quiet luxury', 'old money',
  'coquette', 'blokecore', 'workwear', 'archive', 'designer',
];

const MATERIAL_TAGS = [
  'denim', 'leather', 'wool', 'cashmere', 'silk', 'linen', 'corduroy',
  'mohair', 'suede', 'satin', 'cotton', 'knit', 'crochet', 'lace', 'velvet',
  'fleece',
];

const COLOUR_TAGS = [
  'black', 'white', 'cream', 'beige', 'navy', 'grey', 'brown', 'red',
  'green', 'pink', 'blue', 'burgundy', 'olive', 'pastel', 'monochrome',
];

const FIT_TAGS = [
  'slim fit', 'relaxed', 'cropped', 'wide leg', 'high waisted', 'low rise',
  'pleated', 'embroidered', 'graphic', 'distressed', 'floral', 'striped',
  'checked', 'rare', 'limited edition', 'deadstock', 'handmade', 'upcycled',
  'festival', 'wedding guest', 'office', 'summer', 'winter', 'layering',
  'statement',
];

/** Brands that appear in the fixture catalogue — discovery tags buyers search. */
const BRAND_TAGS = (() => {
  const seen = new Set<string>();
  const brands: string[] = [];
  for (const l of LISTINGS) {
    const brand = l.brand?.trim().toLowerCase();
    if (brand && !seen.has(brand)) {
      seen.add(brand);
      brands.push(brand);
    }
  }
  return brands;
})();

export const TAG_CATALOGUE: string[] = [
  ...new Set([
    ...STYLE_TAGS,
    ...MATERIAL_TAGS,
    ...COLOUR_TAGS,
    ...FIT_TAGS,
    ...BRAND_TAGS,
  ]),
];

/**
 * Rank tag suggestions for a query: prefix matches first, then substring
 * matches, shorter terms first within a tier. Excludes tags already added.
 */
export function matchTagSuggestions(
  query: string,
  taken: readonly string[],
  limit = 6,
): string[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const takenSet = new Set(taken.map((t) => t.toLowerCase()));
  const prefix: string[] = [];
  const substring: string[] = [];
  for (const term of TAG_CATALOGUE) {
    if (takenSet.has(term)) continue;
    if (term.startsWith(q)) prefix.push(term);
    else if (term.includes(q)) substring.push(term);
  }
  const byLength = (a: string, b: string) => a.length - b.length;
  prefix.sort(byLength);
  substring.sort(byLength);
  return [...prefix, ...substring].slice(0, limit);
}

/** Split free input into canonical tags (mirrors mobile handleTagSubmit). */
export function parseTagInput(raw: string): string[] {
  return raw
    .trim()
    .toLowerCase()
    .split(/[,\s]+/)
    .filter(Boolean);
}
