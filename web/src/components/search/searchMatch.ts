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
 * When nothing matches, `suggestion` carries a canonical correction —
 * each unmatched token is resolved against fixture brands, categories
 * and catalogue terms (singular/plural leniency, then Levenshtein ≤ 2
 * or bigram-Dice ≥ 0.5). Deterministic, no dependencies.
 */

import type { Listing } from '@/lib/contracts/domain';
import { CATEGORIES, LISTINGS } from '@/lib/data/fixtures';
import { CATEGORY_TREE } from './taxonomy';

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

const CATEGORY_NAMES = new Map(CATEGORIES.map((c) => [c.slug, c.name]));

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

function listingTokens(l: Listing): Set<string> {
  const fields = [
    l.title,
    l.brand ?? '',
    l.category,
    l.subcategory ?? '',
    CATEGORY_NAMES.get(l.category) ?? '',
  ];
  return new Set(tokenize(fields.join(' ')));
}

function tokenMatches(token: string, fieldTokens: Set<string>): boolean {
  if (fieldTokens.has(token)) return true;
  for (const form of [`${token}s`, `${token}es`, ...singularForms(token)]) {
    if (fieldTokens.has(form)) return true;
  }
  // Prefix leniency — "swea" still finds "sweater".
  if (token.length >= 4) {
    for (const field of fieldTokens) {
      if (field.startsWith(token)) return true;
    }
  }
  return false;
}

export interface QueryMatch {
  listings: Listing[];
  /** Canonical corrected query — only set when nothing matched. */
  suggestion: string | null;
}

/**
 * Token-AND match: every query token must resolve against the listing's
 * title/brand/category/subcategory tokens. Empty query passes through.
 */
export function matchListings(listings: Listing[], query: string): QueryMatch {
  const tokens = tokenize(query);
  if (tokens.length === 0) return { listings, suggestion: null };
  const matched = listings.filter((l) => {
    const fields = listingTokens(l);
    return tokens.every((token) => tokenMatches(token, fields));
  });
  return {
    listings: matched,
    suggestion: matched.length === 0 ? suggestCorrection(query) : null,
  };
}
