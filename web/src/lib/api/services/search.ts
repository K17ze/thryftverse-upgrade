/**
 * Web search service — /search/autocomplete + /search/conversational.
 * Mirrors frontend/src/services/searchAutocompleteApi.ts and
 * conversationalSearchApi.ts: backend-first, and the backend's own
 * disclosure fields (method / retrievalMeta / serveMode) surface to the
 * caller — the honest capability contract, never a fabricated payload.
 */

import { fetchJson } from '../http';

// ---------------------------------------------------------------------------
// GET /search/autocomplete — auth-optional; q ≥ 1, limit ≤ 20 (search.ts).
// The route has emitted two suggestion shapes (string[] and
// {text,type,score}[]) — both normalise here, same as mobile.
// ---------------------------------------------------------------------------

export interface AutocompleteSuggestion {
  text: string;
  /** Backend bucket — 'query' | 'brand' | 'category' | 'item'. */
  type?: string;
  score?: number;
}

export interface AutocompleteResult {
  suggestions: AutocompleteSuggestion[];
  /** e.g. 'personalized' | 'degraded_lexical' | 'cold_start'. */
  serveMode?: string;
  /** retrievalMeta.method — e.g. 'lexical'. */
  retrievalMethod?: string;
}

export async function fetchAutocompleteSuggestions(
  query: string,
  limit = 8,
  signal?: AbortSignal,
): Promise<AutocompleteResult> {
  const q = query.trim();
  if (!q) return { suggestions: [] };
  const params = new URLSearchParams({
    q,
    limit: String(Math.min(Math.max(limit, 1), 20)),
  });
  const payload = await fetchJson<{
    ok: boolean;
    query?: string;
    suggestions?: Array<string | { text?: string; type?: string; score?: number }>;
    retrievalMeta?: { method?: string };
    serveMode?: string;
    error?: string;
  }>(`/search/autocomplete?${params.toString()}`, undefined, { signal });
  if (!payload.ok) {
    throw new Error(payload.error ?? 'Autocomplete failed');
  }
  const suggestions = (payload.suggestions ?? [])
    .map((raw): AutocompleteSuggestion | null => {
      if (typeof raw === 'string') {
        const text = raw.trim();
        return text ? { text } : null;
      }
      const text = typeof raw.text === 'string' ? raw.text.trim() : '';
      return text ? { text, type: raw.type, score: raw.score } : null;
    })
    .filter((s): s is AutocompleteSuggestion => s !== null)
    .slice(0, limit);
  return {
    suggestions,
    serveMode: payload.serveMode,
    retrievalMethod: payload.retrievalMeta?.method,
  };
}

// ---------------------------------------------------------------------------
// POST /search/conversational — auth-optional; body { query, limit }.
// The response's `items` are search-index documents, not listing rows —
// callers resolve real listings through the normal listing-fetch path
// driven by `parsedFilters`. `method`/`retrievalMeta` are the backend's
// own disclosure (keyword rules, not AI) and must be surfaced verbatim.
// ---------------------------------------------------------------------------

export interface ConversationalParsedFilters {
  brands?: string[];
  categories?: string[];
  sizes?: string[];
  conditions?: string[];
  priceRange?: { min?: number; max?: number };
  colors?: string[];
  styles?: string[];
  sustainableOnly?: boolean;
}

export interface ConversationalSearchResult {
  query: string;
  /** Server-authored disclosure — e.g. 'heuristic keyword matching, not AI'. */
  method?: string;
  /** retrievalMeta.method — e.g. 'keyword_parser'. */
  retrievalMethod?: string;
  parsedFilters: ConversationalParsedFilters;
  /** Backend's own match count for the parsed filters. */
  total?: number;
}

export async function runConversationalSearch(
  query: string,
  limit = 24,
  signal?: AbortSignal,
): Promise<ConversationalSearchResult> {
  const payload = await fetchJson<{
    ok: boolean;
    query?: string;
    method?: string;
    retrievalMeta?: { method?: string; fallbackReason?: string };
    parsedFilters?: ConversationalParsedFilters;
    total?: number;
    error?: string;
  }>(
    '/search/conversational',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, limit }),
    },
    { signal },
  );
  if (!payload.ok) {
    throw new Error(payload.error ?? 'Conversational search failed');
  }
  return {
    query: payload.query ?? query,
    method: payload.method,
    retrievalMethod: payload.retrievalMeta?.method,
    parsedFilters: payload.parsedFilters ?? {},
    total: typeof payload.total === 'number' ? payload.total : undefined,
  };
}
