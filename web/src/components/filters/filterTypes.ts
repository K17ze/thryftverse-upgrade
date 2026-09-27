/**
 * Filter-domain types + option constants — single source of truth for the
 * search, category and browse surfaces. Mirrors mobile filterTypes.ts:
 * brands/sizes are multi-select arrays (union semantics within a facet,
 * same as Vinted/eBay), sorts include the mobile 'Most liked' option.
 *
 * The module also owns the URL contract for facets — every active
 * refinement serialises into search params (filtersFromParams /
 * writeFilterParams) so a filtered view is shareable and replays exactly
 * on back/forward. The same codec feeds savedSearch.searchHref and the
 * conv-search hand-off, so all three writers agree on the wire shape:
 *
 *   ?category=women,men&condition=Good|Very good&brand=Levi's&size=M,UK%209
 *   &colour=Black,Navy&min=10&max=80&sold=1
 *
 * Multi-value params are comma-joined with each value individually
 * URI-encoded, so a value containing a literal comma still round-trips.
 */

import type { Listing, ListingCondition } from '@/lib/contracts/domain';
import { COLOR_VOCAB } from '@/components/visualsearch/visualSearchTypes';

export type SortKey =
  | 'relevance'
  | 'newest'
  | 'most-liked'
  | 'price-asc'
  | 'price-desc';

// Labels use native casing (frontend filterTypes.ts: 'Newest',
// 'Price: Low to High', 'Most liked'). The rendered label lives in
// SortDropdown — 'relevance' displays as "Best match" only while a query
// supplies real match scores, otherwise "Most liked" (the honest name
// for the engagement fallback the sort actually runs).
export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'relevance', label: 'Relevance' },
  { value: 'newest', label: 'Newest' },
  { value: 'most-liked', label: 'Most liked' },
  { value: 'price-asc', label: 'Price: Low to High' },
  { value: 'price-desc', label: 'Price: High to Low' },
];

export const CONDITION_OPTIONS: ListingCondition[] = [
  'New with tags',
  'New without tags',
  'Very good',
  'Good',
  'Satisfactory',
];

export interface ListingFilters {
  conditions: ListingCondition[];
  priceMin: number | null;
  priceMax: number | null;
  /** Category slugs — empty means any category (multi-select, OR'd). */
  categories: string[];
  /** Size fragments — multi-select, OR'd substring match. */
  sizes: string[];
  /** Brand names — multi-select, OR'd substring match. */
  brands: string[];
  /** Canonical COLOR_VOCAB names — multi-select, OR'd. */
  colours: string[];
  /** Sold listings are excluded unless this is on — eBay "Sold items". */
  includeSold: boolean;
}

export const EMPTY_FILTERS: ListingFilters = {
  conditions: [],
  priceMin: null,
  priceMax: null,
  categories: [],
  sizes: [],
  brands: [],
  colours: [],
  includeSold: false,
};

/** Badge count on the filter entry point — one per selected value. */
export function countActiveFilters(f: ListingFilters): number {
  return (
    f.conditions.length +
    (f.priceMin != null || f.priceMax != null ? 1 : 0) +
    f.categories.length +
    f.sizes.length +
    f.brands.length +
    f.colours.length +
    (f.includeSold ? 1 : 0)
  );
}

export function filtersAreEmpty(f: ListingFilters): boolean {
  return countActiveFilters(f) === 0;
}

// ---------------------------------------------------------------------------
// Listing colour extraction — which canonical colour names a listing's own
// text mentions (title + description + subcategory). Strict semantics: the
// colour facet only keeps listings that provably name the colour — the same
// vocabulary the conv-search parser and the visual-search engine use.
// ---------------------------------------------------------------------------

/** Lowercase, fold diacritics, unify apostrophes, collapse whitespace. */
function normalizeForColour(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/** Substring match requiring non-alphanumeric boundaries on both ends —
 *  so "tan" doesn't match inside "sustainability". */
function mentionsWord(text: string, phrase: string): boolean {
  let from = 0;
  for (;;) {
    const i = text.indexOf(phrase, from);
    if (i === -1) return false;
    const before = i === 0 ? ' ' : text[i - 1];
    const after = i + phrase.length >= text.length ? ' ' : text[i + phrase.length];
    if (!/[a-z0-9]/.test(before) && !/[a-z0-9]/.test(after)) return true;
    from = i + 1;
  }
}

/** Canonical colour names a listing's own text mentions — may be empty. */
export function listingColourNames(l: Listing): string[] {
  const text = normalizeForColour(
    `${l.title} ${l.description} ${l.subcategory ?? ''}`,
  );
  return COLOR_VOCAB.filter((c) =>
    c.aliases.some((a) => mentionsWord(text, a)),
  ).map((c) => c.name);
}

export function applyListingFilters(
  listings: Listing[],
  f: ListingFilters,
): Listing[] {
  const brands = f.brands.map((b) => b.trim().toLowerCase()).filter(Boolean);
  const sizes = f.sizes.map((s) => s.trim().toLowerCase()).filter(Boolean);
  const categories = f.categories.map((c) => c.toLowerCase());
  return listings.filter((l) => {
    if (!f.includeSold && (l.isSold || l.status === 'sold')) return false;
    if (f.conditions.length > 0 && !f.conditions.includes(l.condition)) {
      return false;
    }
    if (f.priceMin != null && l.price < f.priceMin) return false;
    if (f.priceMax != null && l.price > f.priceMax) return false;
    if (
      categories.length > 0 &&
      !categories.includes(l.category.toLowerCase())
    ) {
      return false;
    }
    // Union semantics within a dimension — any selected value suffices.
    if (
      brands.length > 0 &&
      !brands.some((b) => (l.brand ?? '').toLowerCase().includes(b))
    ) {
      return false;
    }
    if (
      sizes.length > 0 &&
      !sizes.some((s) => (l.size ?? '').toLowerCase().includes(s))
    ) {
      return false;
    }
    if (f.colours.length > 0) {
      const named = listingColourNames(l);
      if (!f.colours.some((c) => named.includes(c))) return false;
    }
    return true;
  });
}

// ---------------------------------------------------------------------------
// Sorting — 'relevance' is a real ranking: when the caller supplies query
// match scores (searchMatch) they lead; otherwise popularity is the honest
// default order (Vinted/Depop relevance ≈ engagement). Deterministic — the
// listing id breaks exact ties.
// ---------------------------------------------------------------------------

function engagementScore(l: Listing): number {
  return (
    Math.log1p(l.likes) * 2 +
    Math.log1p(l.views ?? 0) +
    (l.isBumped ? 1 : 0)
  );
}

export function sortListings(
  listings: Listing[],
  sort: SortKey,
  relevanceScores?: ReadonlyMap<string, number>,
): Listing[] {
  const out = [...listings];
  switch (sort) {
    case 'relevance':
      out.sort(
        (a, b) =>
          (relevanceScores?.get(b.id) ?? 0) - (relevanceScores?.get(a.id) ?? 0) ||
          engagementScore(b) - engagementScore(a) ||
          a.id.localeCompare(b.id),
      );
      break;
    case 'newest':
      out.sort(
        (a, b) =>
          new Date(b.createdAt ?? 0).getTime() -
          new Date(a.createdAt ?? 0).getTime(),
      );
      break;
    case 'most-liked':
      out.sort(
        (a, b) =>
          b.likes - a.likes ||
          new Date(b.createdAt ?? 0).getTime() -
            new Date(a.createdAt ?? 0).getTime() ||
          a.id.localeCompare(b.id),
      );
      break;
    case 'price-asc':
      out.sort((a, b) => a.price - b.price || a.id.localeCompare(b.id));
      break;
    case 'price-desc':
      out.sort((a, b) => b.price - a.price || a.id.localeCompare(b.id));
      break;
  }
  return out;
}

// ---------------------------------------------------------------------------
// URL codec — facet params round-trip exactly through these two functions.
// Multi-value params join values with ',' after per-value encoding; the
// legacy shape (scalar brand/size/category, no colour/sold keys) parses to
// the same filter set it described before.
// ---------------------------------------------------------------------------

export const FILTER_PARAM_KEYS = [
  'category',
  'condition',
  'brand',
  'size',
  'colour',
  'min',
  'max',
  'sold',
] as const;

/** ','-joined list where each item was encodeURIComponent'd — a literal
 *  comma inside a value survives the split (it arrives as %2C). */
function splitList(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((piece) => {
      try {
        return decodeURIComponent(piece).trim();
      } catch {
        return piece.trim();
      }
    })
    .filter(Boolean);
}

function joinList(values: string[]): string {
  return values.map((v) => encodeURIComponent(v)).join(',');
}

const COLOUR_NAMES = new Set(COLOR_VOCAB.map((c) => c.name.toLowerCase()));

/**
 * Parse facet params into a full filter set. Unknown values are dropped
 * rather than guessed — a misspelled condition or colour names nothing,
 * so it seeds nothing.
 */
export function filtersFromParams(
  params: Pick<URLSearchParams, 'get'>,
): ListingFilters {
  const rawConditions = params.get('condition');
  const conditions = (rawConditions?.split('|') ?? []).filter(
    (c): c is ListingCondition => (CONDITION_OPTIONS as string[]).includes(c),
  );
  const min = params.get('min');
  const max = params.get('max');
  const rawColours = splitList(params.get('colour'));
  return {
    conditions,
    categories: splitList(params.get('category')),
    brands: splitList(params.get('brand')),
    sizes: splitList(params.get('size')),
    colours: rawColours.filter((c) => COLOUR_NAMES.has(c.toLowerCase())).map(
      (c) => COLOR_VOCAB.find((v) => v.name.toLowerCase() === c.toLowerCase())!.name,
    ),
    priceMin: min != null && !Number.isNaN(Number(min)) ? Number(min) : null,
    priceMax: max != null && !Number.isNaN(Number(max)) ? Number(max) : null,
    includeSold: params.get('sold') === '1' || params.get('sold') === 'true',
  };
}

/**
 * Write the facet params of `f` onto `sp` — existing facet keys are cleared
 * first so the result is exactly the current filter set (non-facet params
 * like q/sort/sub are untouched).
 */
export function writeFilterParams(
  sp: URLSearchParams,
  f: ListingFilters,
): void {
  for (const key of FILTER_PARAM_KEYS) sp.delete(key);
  if (f.categories.length > 0) {
    sp.set('category', joinList(f.categories.map((c) => c.toLowerCase())));
  }
  if (f.conditions.length > 0) sp.set('condition', f.conditions.join('|'));
  if (f.brands.length > 0) sp.set('brand', joinList(f.brands));
  if (f.sizes.length > 0) sp.set('size', joinList(f.sizes));
  if (f.colours.length > 0) sp.set('colour', joinList(f.colours));
  if (f.priceMin != null) sp.set('min', String(f.priceMin));
  if (f.priceMax != null) sp.set('max', String(f.priceMax));
  if (f.includeSold) sp.set('sold', '1');
}

/**
 * Tolerant coercion — legacy persisted shapes (scalar `brand`/`size`/
 * `category`, missing `colours`/`includeSold`, e.g. a saved search stored
 * before multi-select) normalise into the current filter type instead of
 * breaking the reader.
 */
export function coerceFilters(raw: unknown): ListingFilters {
  const r =
    typeof raw === 'object' && raw !== null
      ? (raw as Record<string, unknown>)
      : {};
  const strArr = (v: unknown): string[] =>
    Array.isArray(v)
      ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '')
      : typeof v === 'string' && v.trim() !== ''
        ? [v]
        : [];
  const num = (v: unknown): number | null =>
    typeof v === 'number' && !Number.isNaN(v) ? v : null;
  return {
    conditions: strArr(r.conditions).filter(
      (c): c is ListingCondition => (CONDITION_OPTIONS as string[]).includes(c),
    ),
    priceMin: num(r.priceMin),
    priceMax: num(r.priceMax),
    categories: strArr(r.categories ?? r.category),
    sizes: strArr(r.sizes ?? r.size),
    brands: strArr(r.brands ?? r.brand),
    colours: strArr(r.colours),
    includeSold: r.includeSold === true,
  };
}
