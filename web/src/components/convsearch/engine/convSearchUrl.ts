import type { Listing, ListingCondition } from '@/lib/contracts/domain';
import { CONDITION_OPTIONS } from '@/components/filters/filterTypes';
import { COLOR_VOCAB } from '@/components/visualsearch/visualSearchTypes';
import { constraintCount, newIntent, type ParsedIntent } from './convSearchTypes';
import { BRAND_ALIASES, normalize } from './convSearchVocab';
import { parseIntent } from './convSearchParser';

// ---------------------------------------------------------------------------
// URL hand-off — same contract filterTypes.filtersFromParams parses:
//   ?q= &category=a,b &condition=a|b &size= &brand= &colour= &min= &max=
// Multi-value facet params are comma-joined with each value URI-encoded —
// the whole set replays on the /search surface, not just the first pick.
// q carries the freest term so the surface's own text filter keeps the set.
// ---------------------------------------------------------------------------

export const joinParamList = (values: string[]): string =>
  values.map((v) => encodeURIComponent(v)).join(',');

export const splitParamList = (raw: string | null): string[] => {
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
};

/** Facet-only queries still need a q so /search renders the surface —
 *  the modal category of the matched set is the honest label for it. */
export function modalCategory(results: Listing[]): string | null {
  const counts = new Map<string, number>();
  for (const l of results) counts.set(l.category, (counts.get(l.category) ?? 0) + 1);
  let best: string | null = null;
  let bestCount = 0;
  for (const [k, c] of counts) {
    if (c > bestCount) {
      best = k;
      bestCount = c;
    }
  }
  return best;
}

export function searchHref(
  intent: ParsedIntent,
  results: Listing[],
  rawQuery: string,
): string {
  const params = new URLSearchParams();
  const slug = intent.categorySlugs[0];
  const q =
    intent.itemTerms[0]?.toLowerCase() ||
    intent.keywords.join(' ') ||
    slug ||
    intent.brands[0]?.toLowerCase() ||
    modalCategory(results) ||
    normalize(rawQuery) ||
    'browse';
  params.set('q', q);
  if (intent.categorySlugs.length > 0) {
    params.set('category', joinParamList(intent.categorySlugs));
  }
  if (intent.brands.length > 0) params.set('brand', joinParamList(intent.brands));
  if (intent.sizes.length > 0) {
    params.set('size', joinParamList(intent.sizes.map((s) => s.toUpperCase())));
  }
  if (intent.colours.length > 0) {
    params.set('colour', joinParamList(intent.colours));
  }
  if (intent.conditions.length > 0) params.set('condition', intent.conditions.join('|'));
  if (intent.priceMin != null) params.set('min', String(intent.priceMin));
  if (intent.priceMax != null) params.set('max', String(intent.priceMax));
  return `/search?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// Seed — rebuild an intent from the /search facet params so "Refine in chat"
// carries the user's live filters into the thread.
// ---------------------------------------------------------------------------

export function intentFromParams(
  params: Pick<URLSearchParams, 'get'>,
): { intent: ParsedIntent | null; queryText: string } {
  const q = (params.get('q') ?? '').trim();
  const intent = q ? parseIntent(q) : newIntent();

  // Facet params are comma-joined multi-value lists — replay every entry.
  for (const slug of splitParamList(params.get('category'))) {
    if (!intent.categorySlugs.includes(slug)) intent.categorySlugs.push(slug);
  }
  for (const brand of splitParamList(params.get('brand'))) {
    const canonical =
      BRAND_ALIASES.find(([, c]) => c.toLowerCase() === brand.toLowerCase())?.[1] ?? brand;
    if (!intent.brands.includes(canonical)) intent.brands.push(canonical);
  }
  for (const size of splitParamList(params.get('size'))) {
    if (!intent.sizes.some((s) => s.toLowerCase() === size.toLowerCase())) {
      intent.sizes.push(size);
    }
  }
  for (const colour of splitParamList(params.get('colour'))) {
    const canonical =
      COLOR_VOCAB.find((c) => c.name.toLowerCase() === colour.toLowerCase())?.name ??
      null;
    if (canonical && !intent.colours.includes(canonical)) {
      intent.colours.push(canonical);
    }
  }
  const rawConditions = params.get('condition');
  for (const c of rawConditions?.split('|') ?? []) {
    if ((CONDITION_OPTIONS as string[]).includes(c)) {
      const cond = c as ListingCondition;
      if (!intent.conditions.includes(cond)) intent.conditions.push(cond);
    }
  }
  const min = params.get('min');
  const max = params.get('max');
  if (min != null && !Number.isNaN(Number(min))) intent.priceMin = Number(min);
  if (max != null && !Number.isNaN(Number(max))) intent.priceMax = Number(max);

  return { intent: constraintCount(intent) > 0 || q ? intent : null, queryText: q };
}
