/**
 * Web visual-search service — POST /visual-search, mirroring the mobile
 * visualSearchApi. Accepts an image URL or base64 payload plus optional
 * facet/region scoping; returns ranked listing rows mapped through the
 * canonical listing mapper.
 */

import { fetchJson } from '../http';
import {
  mapBackendListings,
  type BackendListingRow,
} from '../mappers';
import type { Listing } from '@/lib/contracts/domain';

export interface VisualSearchRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface VisualSearchFacets {
  color?: string;
  style?: string;
}

export interface VisualSearchRequest {
  imageUrl?: string;
  imageBase64?: string;
  query?: string;
  category?: string;
  brand?: string;
  size?: string;
  condition?: string;
  minPrice?: number;
  maxPrice?: number;
  facets?: VisualSearchFacets;
  region?: VisualSearchRegion;
  sort?: 'newest' | 'price_asc' | 'price_desc' | 'similarity';
  limit?: number;
}

/**
 * Structured capability metadata the backend attaches to every
 * POST /visual-search response (lib/retrievalMeta.ts). `method` names
 * what actually produced the results — 'heuristic_color_features' is the
 * deterministic colour-and-layout heuristic, 'filter_only' the no-usable-
 * image fallback; `fallbackReason` says why image scoring did not run.
 */
export interface VisualSearchRetrievalMeta {
  method: string;
  fallbackReason?: string;
  embedderConfigured: boolean;
  searchEngineVersion?: string;
  /** 'region' only when a supplied ROI rect actually cropped feature
   *  extraction; 'whole_image' otherwise. */
  queryScope?: 'whole_image' | 'region';
}

/** Per-facet-value candidate counts within the retrieval scope (F08). */
export interface VisualSearchFacetCounts {
  colors: { value: string; count: number }[];
  styles: { value: string; count: number }[];
}

/** Full POST /visual-search result — the ranked listings plus the
 *  serve's own disclosures. Native surfaces all of this; dropping it
 *  would let the UI imply visual matching that never ran. */
export interface VisualSearchResult {
  items: Listing[];
  /** True only when real visual feature scoring ran server-side. */
  visualMatching: boolean;
  similarityMethod?: string;
  retrievalMeta?: VisualSearchRetrievalMeta;
  /** Per-facet-value match counts (`facets` on the wire). */
  facetCounts?: VisualSearchFacetCounts;
  /** Total listings matching the full filter scope, before the
   *  candidate cap / limit trim. */
  matchCount?: number;
  /** The backend's own disclosure line — preferred over composed copy. */
  note?: string;
}

interface VisualSearchResponse {
  ok: boolean;
  items?: BackendListingRow[];
  results?: BackendListingRow[];
  visualMatching?: boolean;
  similarityMethod?: string;
  retrievalMeta?: VisualSearchRetrievalMeta;
  facets?: VisualSearchFacetCounts;
  matchCount?: number;
  note?: string;
  error?: string;
}

export async function runVisualSearch(
  input: VisualSearchRequest,
  signal?: AbortSignal,
): Promise<VisualSearchResult> {
  const res = await fetchJson<VisualSearchResponse>('/visual-search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    // Visual search is a heavy remote operation — allow a longer timeout and
    // skip the GET-dedup path (it's a POST, but explicit for clarity).
    signal,
  }, { timeoutMs: 30_000, skipDedup: true });
  if (!res.ok) throw new Error(res.error ?? 'Visual search failed');
  return {
    items: mapBackendListings(res.items ?? res.results ?? []),
    visualMatching: res.visualMatching === true,
    similarityMethod: res.similarityMethod,
    retrievalMeta: res.retrievalMeta,
    facetCounts: res.facets,
    matchCount: res.matchCount,
    note: res.note,
  };
}
