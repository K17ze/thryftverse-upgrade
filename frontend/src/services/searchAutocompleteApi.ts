/**
 * Search Autocomplete API — autocomplete suggestion service
 *
 * This module provides the contract for ThryftVerse's search autocomplete.
 *
 * Production suggestions are fetched from the backend `/search/autocomplete`
 * endpoint via `fetchAutocompleteSuggestions`. The heuristic client-side
 * catalogue (`fetchAutocomplete`) is retained as a resilience fallback so
 * the typeahead never goes dark when the API is unreachable or returns an
 * error.
 */

import { fetchJson } from '../lib/apiClient';

// ---------------------------------------------------------------------------
// Demo-mode flag — single source of truth
// ---------------------------------------------------------------------------

/**
 * When true, the UI shows a "Demo mode" indicator. Now that the backend
 * endpoint is wired, this is only true in __DEV__ and only when the backend
 * call fails and the heuristic fallback is used.
 */
export const AUTOCOMPLETE_DEMO_MODE = false;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AutocompleteSuggestionType =
  | 'category'
  | 'brand'
  | 'style'
  | 'size'
  | 'color'
  | 'recent';

/** Where the suggestion was ranked from. */
export type AutocompleteSource =
  | 'curated'
  | 'trending'
  | 'recent'
  | 'fuzzy';

export interface AutocompleteSuggestion {
  /** Display text for the suggestion. */
  query: string;
  /** Semantic bucket for icon/metadata rendering. */
  type: AutocompleteSuggestionType;
  /** 0–1 confidence score. Higher = stronger match. */
  confidence: number;
  /** Where the suggestion originated. */
  source: AutocompleteSource;
}

export interface AutocompleteResponse {
  suggestions: AutocompleteSuggestion[];
  /** The raw query the suggestions are for. */
  query: string;
  /** Honest flag — true while this response is mock data. */
  isDemo: boolean;
}

// ---------------------------------------------------------------------------
// Curated fashion / marketplace term catalogue
// ---------------------------------------------------------------------------

interface CatalogueEntry {
  term: string;
  type: AutocompleteSuggestionType;
}

const CATALOGUE: CatalogueEntry[] = [
  // Categories
  { term: 'Dresses', type: 'category' },
  { term: 'Jeans', type: 'category' },
  { term: 'Jackets', type: 'category' },
  { term: 'Coats', type: 'category' },
  { term: 'Sneakers', type: 'category' },
  { term: 'Boots', type: 'category' },
  { term: 'Heels', type: 'category' },
  { term: 'Handbags', type: 'category' },
  { term: 'T-shirts', type: 'category' },
  { term: 'Hoodies', type: 'category' },
  { term: 'Skirts', type: 'category' },
  { term: 'Sweaters', type: 'category' },
  { term: 'Activewear', type: 'category' },
  { term: 'Swimwear', type: 'category' },
  { term: 'Accessories', type: 'category' },
  { term: 'Jewellery', type: 'category' },
  { term: 'Watches', type: 'category' },
  { term: 'Sunglasses', type: 'category' },
  // Brands
  { term: 'Nike', type: 'brand' },
  { term: 'Adidas', type: 'brand' },
  { term: 'Zara', type: 'brand' },
  { term: 'H&M', type: 'brand' },
  { term: 'Gucci', type: 'brand' },
  { term: 'Prada', type: 'brand' },
  { term: 'Louis Vuitton', type: 'brand' },
  { term: 'Burberry', type: 'brand' },
  { term: 'Balenciaga', type: 'brand' },
  { term: 'Uniqlo', type: 'brand' },
  { term: "Levi's", type: 'brand' },
  { term: 'New Balance', type: 'brand' },
  { term: 'Carhartt', type: 'brand' },
  { term: 'Patagonia', type: 'brand' },
  { term: 'The North Face', type: 'brand' },
  { term: 'Supreme', type: 'brand' },
  { term: 'Saint Laurent', type: 'brand' },
  { term: 'Valentino', type: 'brand' },
  // Styles
  { term: 'Vintage', type: 'style' },
  { term: 'Y2K', type: 'style' },
  { term: 'Streetwear', type: 'style' },
  { term: 'Minimalist', type: 'style' },
  { term: 'Bohemian', type: 'style' },
  { term: 'Techwear', type: 'style' },
  { term: 'Preppy', type: 'style' },
  { term: 'Grunge', type: 'style' },
  { term: 'Cottagecore', type: 'style' },
  { term: 'Oversized', type: 'style' },
  { term: 'Retro', type: 'style' },
  // Sizes
  { term: 'XS', type: 'size' },
  { term: 'S', type: 'size' },
  { term: 'M', type: 'size' },
  { term: 'L', type: 'size' },
  { term: 'XL', type: 'size' },
  { term: 'XXL', type: 'size' },
  { term: 'UK 6', type: 'size' },
  { term: 'UK 8', type: 'size' },
  { term: 'UK 10', type: 'size' },
  { term: 'UK 12', type: 'size' },
  { term: 'UK 14', type: 'size' },
  // Colours
  { term: 'Black', type: 'color' },
  { term: 'White', type: 'color' },
  { term: 'Beige', type: 'color' },
  { term: 'Brown', type: 'color' },
  { term: 'Navy', type: 'color' },
  { term: 'Olive', type: 'color' },
  { term: 'Burgundy', type: 'color' },
  { term: 'Cream', type: 'color' },
  { term: 'Grey', type: 'color' },
];

// Curated trending searches — shown when the input is empty and focused.
const TRENDING_SEARCHES: string[] = [
  'Nike', 'Vintage', 'Y2K', 'Streetwear', 'Designer', 'Minimal', 'Summer', 'Denim',
];

// ---------------------------------------------------------------------------
// Matching helpers
// ---------------------------------------------------------------------------

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9&\s]/g, '').trim();
}

/**
 * Levenshtein distance — small-string typo tolerance.
 * Bounded to the query length to keep it cheap for autocomplete QPS.
 */
function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const prev = new Array<number>(n + 1);
  const curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= n; j++) prev[j] = curr[j];
  }
  return prev[n];
}

/**
 * Confidence for a prefix match. Longer shared prefixes score higher.
 */
function prefixConfidence(query: string, term: string): number {
  if (!query) return 0;
  const shared = Math.min(query.length, term.length);
  let matched = 0;
  for (let i = 0; i < shared; i++) {
    if (query[i] === term[i]) matched++;
    else break;
  }
  if (matched === 0) return 0;
  // Full prefix match = 0.9; partial scales down.
  const prefixRatio = matched / query.length;
  const lengthPenalty = Math.min(1, term.length / Math.max(1, query.length));
  return Math.min(0.95, 0.6 * prefixRatio + 0.35 * lengthPenalty);
}

/**
 * Confidence for a fuzzy (typo-tolerant) match.
 * Tolerates up to ~30% edit distance relative to query length.
 */
function fuzzyConfidence(query: string, term: string): number {
  if (!query || !term) return 0;
  const dist = editDistance(query, term.slice(0, Math.max(query.length, term.length)));
  const maxTolerable = Math.ceil(query.length * 0.3);
  if (dist > maxTolerable) return 0;
  // 1 - normalised distance, scaled to keep fuzzy below prefix.
  const ratio = 1 - dist / Math.max(query.length, term.length);
  return Math.max(0, Math.min(0.7, ratio * 0.7));
}

// ---------------------------------------------------------------------------
// In-memory recent-search store (per user, demo mode)
// ---------------------------------------------------------------------------

const recentStore = new Map<string, string[]>();
const RECENT_KEY = (userId: string) => `autocomplete_recent_${userId}`;
const RECENT_MAX = 8;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch autocomplete suggestions for a query.
 *
 * Matching strategy:
 *   1. Prefix matches against the curated catalogue (highest confidence)
 *   2. Fuzzy / typo-tolerant matches (medium confidence)
 *   3. Recent searches that contain the query (lower confidence)
 *
 * Results are de-duplicated and ranked by confidence, then type diversity.
 */
export function fetchAutocomplete(
  query: string,
  userId?: string,
): AutocompleteResponse {
  const normalized = normalize(query);
  if (!normalized) {
    return { suggestions: [], query, isDemo: AUTOCOMPLETE_DEMO_MODE };
  }

  const seen = new Set<string>();
  const ranked: AutocompleteSuggestion[] = [];

  // 1. Prefix + fuzzy matches against the curated catalogue
  for (const entry of CATALOGUE) {
    const termNorm = normalize(entry.term);
    if (!termNorm) continue;
    const key = `${entry.type}_${termNorm}`;
    if (seen.has(key)) continue;

    let confidence = prefixConfidence(normalized, termNorm);
    let source: AutocompleteSource = 'curated';
    if (confidence <= 0) {
      const fuzzy = fuzzyConfidence(normalized, termNorm);
      if (fuzzy > 0) {
        confidence = fuzzy;
        source = 'fuzzy';
      }
    }
    if (confidence <= 0) continue;

    seen.add(key);
    ranked.push({
      query: entry.term,
      type: entry.type,
      confidence,
      source,
    });
  }

  // 2. Recent searches that contain the query
  if (userId) {
    const recents = recentStore.get(RECENT_KEY(userId)) ?? [];
    for (const recent of recents) {
      const recentNorm = normalize(recent);
      if (!recentNorm) continue;
      if (!recentNorm.includes(normalized)) continue;
      const key = `recent_${recentNorm}`;
      if (seen.has(key)) continue;
      seen.add(key);
      ranked.push({
        query: recent,
        type: 'recent',
        confidence: 0.5,
        source: 'recent',
      });
    }
  }

  // Rank: confidence desc, then shorter term first for snappiness.
  ranked.sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return a.query.length - b.query.length;
  });

  return {
    suggestions: ranked.slice(0, 8),
    query,
    isDemo: AUTOCOMPLETE_DEMO_MODE,
  };
}

/**
 * Fetch the curated list of trending searches.
 */
export function fetchTrendingSearches(): string[] {
  return [...TRENDING_SEARCHES];
}

/**
 * Client-side spell correction using Levenshtein distance.
 *
 * Compares the query against the curated catalogue, trending searches, and
 * the user's recent searches. Returns the closest term if the edit distance
 * is small enough to plausibly be a typo (<= 30% of query length, minimum 1).
 *
 * Returns `null` when no confident correction is found -- the caller should
 * only show "Did you mean?" when a suggestion exists.
 */
export function getSpellCorrection(
  query: string,
  recentSearches: string[] = [],
): string | null {
  const normalized = normalize(query);
  if (normalized.length < 3) return null;

  // Candidate pool: catalogue terms + trending + recent searches.
  // De-duplicate by normalized form.
  const seen = new Set<string>();
  const candidates: string[] = [];

  for (const entry of CATALOGUE) {
    const termNorm = normalize(entry.term);
    if (termNorm && !seen.has(termNorm)) {
      seen.add(termNorm);
      candidates.push(entry.term);
    }
  }
  for (const term of TRENDING_SEARCHES) {
    const termNorm = normalize(term);
    if (termNorm && !seen.has(termNorm)) {
      seen.add(termNorm);
      candidates.push(term);
    }
  }
  for (const term of recentSearches) {
    const termNorm = normalize(term);
    if (termNorm && !seen.has(termNorm)) {
      seen.add(termNorm);
      candidates.push(term);
    }
  }

  const maxDist = Math.max(1, Math.ceil(normalized.length * 0.3));
  let bestTerm: string | null = null;
  let bestDist = Infinity;

  for (const candidate of candidates) {
    const candidateNorm = normalize(candidate);
    // Skip exact matches -- no correction needed.
    if (candidateNorm === normalized) continue;
    // Only consider candidates of similar length.
    if (Math.abs(candidateNorm.length - normalized.length) > maxDist) continue;

    const dist = editDistance(normalized, candidateNorm);
    if (dist < bestDist && dist <= maxDist) {
      bestDist = dist;
      bestTerm = candidate;
    }
  }

  return bestTerm;
}

/**
 * Fetch the user's recent searches (demo mode: in-memory store).
 */
export function fetchRecentSearches(userId: string): string[] {
  return [...(recentStore.get(RECENT_KEY(userId)) ?? [])];
}

/**
 * Record a search the user submitted so it can appear in future autocomplete
 * and recent-search surfaces. In demo mode this only updates the in-memory
 * store.
 */
export function recordSearch(query: string, userId: string): void {
  const trimmed = query.trim();
  if (!trimmed) return;
  const key = RECENT_KEY(userId);
  const current = recentStore.get(key) ?? [];
  const next = [trimmed, ...current.filter((s) => s !== trimmed)].slice(0, RECENT_MAX);
  recentStore.set(key, next);
}

// ---------------------------------------------------------------------------
// Backend-backed autocomplete (production)
// ---------------------------------------------------------------------------
//
// Calls GET /search/autocomplete on the ThryftVerse API. The backend has two
// handlers for this route:
//   - search.ts (SearchAdapter): returns suggestions as string[]
//   - searchExtended.ts (postgres): returns suggestions as Array<{ text, type, score }>
// Both shapes are normalised into AutocompleteSuggestion[]. On any error the
// heuristic client-side catalogue is used as a fallback so the typeahead
// never goes dark.

/** Backend suggestion type strings → AutocompleteSuggestionType mapping. */
function mapBackendSuggestionType(
  type: string | undefined,
): AutocompleteSuggestionType {
  switch (type) {
    case 'brand':
      return 'brand';
    case 'category':
      return 'category';
    case 'item':
      return 'style';
    default:
      return 'style';
  }
}

export interface FetchAutocompleteSuggestionsResult {
  suggestions: AutocompleteSuggestion[];
  /** The raw query the suggestions are for. */
  query: string;
  /** True when the backend call failed and the heuristic fallback was used. */
  isDemo: boolean;
  /** Error message when the backend call failed (and fallback was used). */
  error?: string;
}

/**
 * Fetch autocomplete suggestions from the backend `/search/autocomplete`
 * endpoint. Falls back to the heuristic client-side catalogue on any error
 * so the typeahead remains functional offline or during backend issues.
 *
 * @param query  The partial search string.
 * @param userId Optional user id for recent-search enrichment (fallback only).
 * @param limit  Maximum number of suggestions (default 8, clamped 1–20).
 */
export async function fetchAutocompleteSuggestions(
  query: string,
  userId?: string,
  limit: number = 8,
): Promise<FetchAutocompleteSuggestionsResult> {
  const trimmed = query.trim();
  if (trimmed.length < 2) {
    return { suggestions: [], query, isDemo: false };
  }

  const params = new URLSearchParams();
  params.set('q', trimmed);
  params.set('limit', String(Math.min(Math.max(limit, 1), 20)));

  try {
    const payload = await fetchJson<{
      ok: boolean;
      query: string;
      suggestions: Array<string | {
        text: string;
        type?: string;
        score?: number;
      }>;
    }>(`/search/autocomplete?${params.toString()}`);

    const suggestions: AutocompleteSuggestion[] = (payload.suggestions ?? [])
      .map((raw) => {
        if (typeof raw === 'string') {
          return {
            query: raw.trim(),
            type: 'style' as AutocompleteSuggestionType,
            confidence: 0.7,
            source: 'curated' as AutocompleteSource,
          };
        }
        return {
          query: raw.text.trim(),
          type: mapBackendSuggestionType(raw.type),
          confidence: Number.isFinite(raw.score) ? Math.min(1, Number(raw.score) / 100) : 0.7,
          source: 'curated' as AutocompleteSource,
        };
      })
      .filter((s) => s.query.length > 0)
      .slice(0, limit);

    return { suggestions, query, isDemo: false };
  } catch (error) {
    // Graceful fallback to the heuristic client-side catalogue.
    const fallback = fetchAutocomplete(query, userId);
    return {
      suggestions: fallback.suggestions,
      query,
      isDemo: true,
      error: error instanceof Error ? error.message : 'Autocomplete request failed',
    };
  }
}
