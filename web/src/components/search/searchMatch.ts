/**
 * Query matching — the tolerant normalization layer behind /search.
 *
 * The fixture backend does literal substring matching, which misses
 * honest queries ("mohair cardigan" is never that exact string — the
 * listing is "Mohair Blend Cardigan"). This module normalizes
 * (lowercase, strip punctuation + diacritics) and matches per-token
 * against the same fields the data layer searches, so "levis" finds
 * Levi's and word order stops mattering.
 *
 * Decomposed into modular domain units:
 * - match/searchTokens.ts: Tokenization, diacritics, edit-distances
 * - match/searchVocab.ts: Vocabulary index, fuzzy corrections
 * - match/searchScoring.ts: Per-field scoring, semantics, token-AND core
 */

import type { Listing } from '@/lib/contracts/domain';
import { LISTINGS } from '@/lib/data/fixtures';
import type { AppIconName } from '@/components/ui/Icon';
import { POPULAR_BRANDS, TRENDING_SEARCHES } from './taxonomy';
import { categoryLabel, categoryMatches } from './categoryDirectoryStore';
import { normalizeTerm, tokenize } from './match/searchTokens';
import { suggestCorrection, VOCAB } from './match/searchVocab';
import { categoryName, matchCore } from './match/searchScoring';

export { normalizeTerm } from './match/searchTokens';
export { suggestCorrection } from './match/searchVocab';

export interface QueryMatch {
  listings: Listing[];
  /**
   * Canonical corrected query — set when nothing matched, OR when the set
   * is weak (≤ WEAK_RESULT_MAX hits and the correction yields strictly
   * more). The surface decides whether to swap (empty) or offer
   * ("Did you mean", weak).
   */
  suggestion: string | null;
  /**
   * Best-match relevance per matched listing — field-tiered token hits
   * (title > brand > detail > semantic) plus a small engagement signal.
   * The default sort ranks on it; missing ids order by engagement alone.
   */
  scores: ReadonlyMap<string, number>;
}

/** A result set this small is worth a "Did you mean" check. */
export const WEAK_RESULT_MAX = 3;

export function matchListings(listings: Listing[], query: string): QueryMatch {
  const tokens = tokenize(query);
  if (tokens.length === 0) {
    return { listings, suggestion: null, scores: new Map() };
  }
  const { matched, scores } = matchCore(listings, tokens);
  let suggestion: string | null = null;
  if (matched.length === 0) {
    suggestion = suggestCorrection(query);
  } else if (matched.length <= WEAK_RESULT_MAX) {
    // Weak-set correction — Google grammar: only offer it when the
    // canonical query genuinely lands a bigger set.
    const correction = suggestCorrection(query);
    if (correction) {
      const alt = matchCore(listings, tokenize(correction)).matched;
      if (alt.length > matched.length) suggestion = correction;
    }
  }
  return { listings: matched, suggestion, scores };
}

/**
 * Related searches — terms the current result set itself surfaces:
 * the brands, subcategories and category names actually present in the
 * matches, busiest first, minus whatever the query already names. Every
 * emitted term is one the matcher resolves (it came from listing fields),
 * so the row is recovery trail, not decoration.
 */
export function relatedSearches(
  results: Listing[],
  query: string,
  limit = 6,
): string[] {
  if (results.length === 0) return [];
  const queryNorm = normalizeTerm(query);
  const queryCollapsed = queryNorm.replace(/\s+/g, '');
  const counts = new Map<string, { label: string; count: number }>();
  const add = (label: string | null | undefined) => {
    const trimmed = label?.trim();
    if (!trimmed) return;
    const norm = normalizeTerm(trimmed);
    // Skip terms the query already covers and single-letter noise —
    // collapsed comparison so "levis" covers "Levi's".
    if (!norm || norm.length < 2) return;
    if (norm === queryNorm || norm.replace(/\s+/g, '') === queryCollapsed) {
      return;
    }
    if (queryNorm && queryNorm.includes(norm)) return;
    const existing = counts.get(norm);
    if (existing) existing.count += 1;
    else counts.set(norm, { label: trimmed, count: 1 });
  };
  for (const l of results) {
    add(l.brand);
    add(l.subcategory);
    add(categoryName(l.category));
  }
  return [...counts.values()]
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, limit)
    .map((x) => x.label);
}

// ---------------------------------------------------------------------------
// Query suggestions — the landing autocomplete. Sources are the same honest
// vocabulary the surfaces already publish: recent searches, trending terms,
// popular brands, then canonical catalogue tokens completing the fragment.
// Every suggestion is a term the matcher can actually resolve; when a
// category facet is active the leading rows carry a category scope
// ("boots in Women" — Vinted grammar), verified against that department's
// listings so a scoped suggestion never lands on an empty department.
// ---------------------------------------------------------------------------

export interface QuerySuggestion {
  term: string;
  /** Leading glyph — 'clock' history, 'trending' curated, 'search' catalogue. */
  icon: AppIconName;
  /** Category scope — the row submits `term` filtered to this department. */
  category?: { slug: string; name: string };
}

/** Does the term resolve to at least one listing inside the category? */
function matchesCategory(term: string, categorySlug: string): boolean {
  const tokens = tokenize(term);
  if (tokens.length === 0) return false;
  const scoped = LISTINGS.filter((l) =>
    categoryMatches(l.category, categorySlug),
  );
  return matchCore(scoped, tokens).matched.length > 0;
}

export function suggestQueries(
  input: string,
  recent: string[],
  limit = 7,
  /** Active category facet — scoped "X in <Dept>" rows lead the list. */
  categorySlug?: string | null,
): QuerySuggestion[] {
  const norm = normalizeTerm(input);
  if (!norm) return [];
  const out: QuerySuggestion[] = [];
  const seen = new Set<string>();
  const push = (term: string, icon: AppIconName, category?: { slug: string; name: string }) => {
    const key = `${term.toLowerCase()}|${category?.slug ?? ''}`;
    if (seen.has(key) || normalizeTerm(term) === norm) return;
    seen.add(key);
    out.push({ term, icon, category });
  };

  // Whole-term pools — prefix hits first, then contains (Vinted grammar).
  const pools: { terms: string[]; icon: AppIconName }[] = [
    { terms: recent, icon: 'clock' },
    { terms: TRENDING_SEARCHES, icon: 'trending' },
    { terms: POPULAR_BRANDS, icon: 'search' },
  ];
  for (const pool of pools) {
    const prefix = pool.terms.filter((t) => normalizeTerm(t).startsWith(norm));
    const contains = pool.terms.filter(
      (t) =>
        !normalizeTerm(t).startsWith(norm) && normalizeTerm(t).includes(norm),
    );
    for (const term of [...prefix, ...contains]) push(term, pool.icon);
  }

  // Catalogue completions — the trailing token completes against the same
  // canonical vocabulary the matcher corrects to (brands, subcategories,
  // title terms); earlier words carry through so "vintage le" completes
  // to "vintage Levi's".
  const tokens = norm.split(' ');
  const last = tokens[tokens.length - 1];
  if (last.length >= 2) {
    const head = tokens.slice(0, -1).join(' ');
    const completions = [...VOCAB.entries()]
      .filter(([key]) => key.startsWith(last) && key !== last)
      .map(([, canonical]) => (head ? `${head} ${canonical}` : canonical))
      .sort();
    for (const term of completions) push(term, 'search');
  }

  // Category-scoped variants lead when a category facet is active — the
  // same terms, verified to have hits inside that department (no scoped
  // row is emitted for a term the category can't satisfy).
  if (categorySlug) {
    const name = categoryLabel(categorySlug);
    const scope = { slug: categorySlug, name };
    const scoped: QuerySuggestion[] = [];
    for (const s of out) {
      if (scoped.length >= 3) break;
      if (matchesCategory(s.term, categorySlug)) {
        scoped.push({ term: s.term, icon: s.icon, category: scope });
      }
    }
    return [...scoped, ...out].slice(0, limit);
  }

  return out.slice(0, limit);
}
