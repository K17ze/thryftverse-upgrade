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
 * Tokens that don't literal-match also resolve through the shared
 * synonym vocabulary — the conversational-search parser's dictionaries
 * (item terms, category slugs, brand aliases, colour words) are the
 * single source, bridged canonically both directions rather than
 * duplicated here ("pants" and "trousers" both land on Trousers).
 *
 * Every match carries a relevance score (field-tiered token hits plus a
 * small engagement signal) — the Best-match sort reads it. When the
 * result set is empty OR weak (a few hits while a canonical correction
 * yields strictly more), `suggestion` carries that correction — each
 * unmatched token is resolved against fixture brands, categories and
 * catalogue terms (singular/plural leniency, then Levenshtein ≤ 2 or
 * bigram-Dice ≥ 0.5). Deterministic, no dependencies.
 */

import type { Listing } from '@/lib/contracts/domain';
import { CATEGORIES, LISTINGS } from '@/lib/data/fixtures';
import { TAXONOMY_SEED } from '@/lib/contracts/taxonomy';
import { parseIntent } from '@/components/convsearch/convSearchEngine';
import { categoryLabel, categoryMatches } from './categoryDirectoryStore';
import type { AppIconName } from '@/components/ui/Icon';
import {
  CATEGORY_TREE,
  POPULAR_BRANDS,
  TRENDING_SEARCHES,
} from './taxonomy';

/** lowercase, fold diacritics ("Stüssy"→"stussy"), punctuation→space. */
export function normalizeTerm(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tokenize(input: string): string[] {
  const normalized = normalizeTerm(input);
  return normalized ? normalized.split(' ') : [];
}

/** Naive singular candidates — "dresses"→"dress", "bodies"→"body". */
function singularForms(token: string): string[] {
  const out: string[] = [];
  if (token.endsWith('ies') && token.length > 4) out.push(`${token.slice(0, -3)}y`);
  if (token.endsWith('es') && token.length > 3) out.push(token.slice(0, -2));
  if (token.endsWith('s') && token.length > 3) out.push(token.slice(0, -1));
  return out;
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = new Array<number>(n + 1);
  let curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

/** Bigram-Dice coefficient — cheap fuzzy score for short tokens. */
function diceCoefficient(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const bigrams = new Set<string>();
  for (let i = 0; i < a.length - 1; i++) bigrams.add(a.slice(i, i + 2));
  let shared = 0;
  for (let i = 0; i < b.length - 1; i++) {
    if (bigrams.has(b.slice(i, i + 2))) shared++;
  }
  return (2 * shared) / (a.length - 1 + (b.length - 1));
}

// Category display names resolve through the shared directory store —
// l.category is mixed-vocabulary (fixture slug, live node id, or display
// name), and only the directory knows all three spellings.
const categoryName = (value: string | undefined) =>
  value ? categoryLabel(value) : undefined;

/**
 * Search vocabulary — normalized token → canonical display token.
 * Brands and taxonomy are indexed before catalogue terms so they win
 * ties. Canonical keeps the original casing, apostrophes and diacritics
 * ("Levi's", "Stüssy") so a corrected query still literal-matches a
 * backend that doesn't normalize.
 */
const VOCAB = (() => {
  const map = new Map<string, string>();
  const add = (phrase: string) => {
    for (const rawToken of phrase.split(/\s+/)) {
      const token = normalizeTerm(rawToken);
      if (!token) continue;
      const canonical = rawToken.replace(/^[^A-Za-z0-9À-ÿ']+|[^A-Za-z0-9À-ÿ']+$/g, '');
      if (token.length >= 3 && !map.has(token)) map.set(token, canonical);
      // Punctuation-joined tokens ("A.P.C.", "Levi's") also index their
      // collapsed form so "apc" / "levis" resolve.
      const collapsed = token.replace(/\s+/g, '');
      if (collapsed.length >= 3 && collapsed !== token && !map.has(collapsed)) {
        map.set(collapsed, canonical);
      }
    }
  };
  for (const l of LISTINGS) if (l.brand) add(l.brand);
  for (const c of CATEGORIES) {
    add(c.name);
    add(c.slug);
  }
  // Canonical taxonomy — ids, display names and synonyms cover the live
  // vocabulary (kids, hobbies…) even where the fixture set doesn't.
  for (const node of TAXONOMY_SEED.categories) {
    add(node.id);
    add(node.name);
    for (const syn of node.synonyms ?? []) add(syn);
  }
  for (const subs of Object.values(CATEGORY_TREE)) for (const s of subs) add(s);
  for (const l of LISTINGS) {
    add(l.title);
    if (l.subcategory) add(l.subcategory);
  }
  return map;
})();

/** Canonical token for a query token — exact or plural-form vocab hit. */
function vocabLookup(token: string): string | null {
  const direct = VOCAB.get(token);
  if (direct) return direct;
  for (const form of [`${token}s`, `${token}es`, ...singularForms(token)]) {
    const hit = VOCAB.get(form);
    if (hit) return hit;
  }
  return null;
}

/**
 * Best fuzzy correction for a token — Levenshtein ≤ 2 (tokens ≥ 4 chars)
 * or bigram-Dice ≥ 0.5. First-best wins on ties, so vocabulary order
 * (brands → categories → catalogue terms) keeps it deterministic.
 */
function fuzzyLookup(token: string): string | null {
  if (token.length < 3 || /^\d+$/.test(token)) return null;
  let best: string | null = null;
  let bestScore = 0.5;
  for (const [norm, canonical] of VOCAB) {
    let score = diceCoefficient(token, norm);
    if (token.length >= 4) {
      const distance = levenshtein(token, norm);
      if (distance <= 2) {
        score = Math.max(score, 1 - distance / Math.max(token.length, norm.length));
      }
    }
    if (score >= 0.5 && (best === null || score > bestScore)) {
      best = canonical;
      bestScore = score;
    }
  }
  return best;
}

/** Canonical correction for a query, or null when nothing changed. */
export function suggestCorrection(query: string): string | null {
  const tokens = tokenize(query);
  if (tokens.length === 0) return null;
  let changed = false;
  const resolved = tokens.map((token) => {
    const canonical = vocabLookup(token) ?? fuzzyLookup(token);
    if (canonical !== null && canonical !== token) {
      changed = true;
      return canonical;
    }
    return token;
  });
  return changed ? resolved.join(' ') : null;
}

/** Per-field token sets — the field a token hits is what it scores on. */
interface ListingTokenFields {
  title: Set<string>;
  brand: Set<string>;
  detail: Set<string>; // subcategory + category slug + category name
}

function listingFields(l: Listing): ListingTokenFields {
  return {
    title: new Set(tokenize(l.title)),
    brand: new Set(tokenize(l.brand ?? '')),
    detail: new Set(
      tokenize(
        `${l.subcategory ?? ''} ${l.category} ${categoryName(l.category) ?? ''}`,
      ),
    ),
  };
}

/** 'exact' covers singular/plural forms; 'prefix' is the >=4-char stem hit. */
function fieldHit(
  token: string,
  field: Set<string>,
): 'exact' | 'prefix' | null {
  if (field.has(token)) return 'exact';
  for (const form of [`${token}s`, `${token}es`, ...singularForms(token)]) {
    if (field.has(form)) return 'exact';
  }
  // Prefix leniency — "swea" still finds "sweater".
  if (token.length >= 4) {
    for (const f of field) {
      if (f.startsWith(token)) return 'prefix';
    }
  }
  return null;
}

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

/**
 * Canonical semantic vocabulary for a text span — delegated to the
 * conversational-search parser, which owns the shared synonym
 * dictionaries. Item terms, category slugs, brand canonicals and colour
 * names are reduced to normalized tokens so a query word and a listing
 * meet on the same canonical ground ("khaki"→Sage, "ysl"→Yves Saint
 * Laurent, "trainers"→sneakers). One-char tokens are dropped — "t" from
 * "T-shirt" is noise, not signal.
 */
function semanticTokens(text: string): Set<string> {
  const intent = parseIntent(text);
  const out = new Set<string>();
  const addWords = (phrase: string) => {
    for (const token of tokenize(phrase)) {
      if (token.length > 1) out.add(token);
    }
  };
  for (const term of intent.itemTerms) addWords(term);
  for (const slug of intent.categorySlugs) out.add(slug);
  for (const brand of intent.brands) addWords(brand);
  for (const colour of intent.colours) addWords(colour);
  return out;
}

/** Listing-side canonicals — same vocabulary, plus the category slug
 *  the catalogue itself assigns (a listing needn't name its own
 *  department for "trainers" to find it). */
function listingSemanticTokens(l: Listing): Set<string> {
  const semantics = semanticTokens(
    [l.title, l.brand ?? '', l.subcategory ?? ''].join(' '),
  );
  semantics.add(l.category.toLowerCase());
  return semantics;
}

/** Field-tier weights — a title hit outranks a subcategory hit, which
 *  outranks a synonym-only expansion. Prefix hits are discounted. */
const TIER_WEIGHT = {
  title: 4,
  brand: 3.5,
  detail: 2.5,
  semantic: 1,
} as const;
const PREFIX_DISCOUNT = 0.65;

/**
 * Score one listing against the tokenized query — null when any token
 * fails to resolve (AND semantics: every token must hit). The score is
 * sum of per-token field weights plus a bounded engagement signal
 * (log-scaled likes/views, bump boost) so popularity breaks ties rather
 * than producing matches.
 */
function scoreListing(
  l: Listing,
  tokens: string[],
  fields: ListingTokenFields,
  querySemantics: Map<string, Set<string>>,
  semantics: Set<string> | null,
): number | null {
  let sem = semantics;
  let score = 0;
  for (const token of tokens) {
    let tier: number | null = null;
    for (const [field, weight] of [
      [fields.title, TIER_WEIGHT.title],
      [fields.brand, TIER_WEIGHT.brand],
      [fields.detail, TIER_WEIGHT.detail],
    ] as const) {
      const hit = fieldHit(token, field);
      if (hit !== null) {
        tier = weight * (hit === 'prefix' ? PREFIX_DISCOUNT : 1);
        break;
      }
    }
    if (tier === null) {
      const expanded = querySemantics.get(token);
      if (expanded && expanded.size > 0) {
        sem ??= listingSemanticTokens(l);
        for (const canonical of expanded) {
          if (sem.has(canonical)) {
            tier = TIER_WEIGHT.semantic;
            break;
          }
        }
      }
    }
    if (tier === null) return null;
    score += tier;
  }
  // Engagement is a tiebreak signal, not a gate — a perfect match on an
  // unliked listing still outranks a fuzzy hit on a popular one.
  return (
    score +
    Math.log1p(l.likes) * 0.35 +
    Math.log1p(l.views ?? 0) * 0.15 +
    (l.isBumped ? 0.3 : 0)
  );
}

/**
 * Token-AND match: every query token must resolve against the listing's
 * title/brand/category/subcategory tokens. A token that fails the
 * literal/plural/prefix pass can still land through the shared synonym
 * vocabulary — its canonical form must intersect the listing's own
 * canonicals, so "sneakers" matches a trainer listing but never a
 * random one. Empty query passes through.
 */
function matchCore(
  listings: Listing[],
  tokens: string[],
): { matched: Listing[]; scores: Map<string, number> } {
  const querySemantics = new Map(
    tokens.map((token) => [token, semanticTokens(token)]),
  );
  const matched: Listing[] = [];
  const scores = new Map<string, number>();
  for (const l of listings) {
    const fields = listingFields(l);
    const score = scoreListing(l, tokens, fields, querySemantics, null);
    if (score === null) continue;
    matched.push(l);
    scores.set(l.id, score);
  }
  return { matched, scores };
}

/** A result set this small is worth a "Did you mean" check. */
const WEAK_RESULT_MAX = 3;

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
