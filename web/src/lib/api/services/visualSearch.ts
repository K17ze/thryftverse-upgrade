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

interface VisualSearchResponse {
  ok: boolean;
  items?: BackendListingRow[];
  results?: BackendListingRow[];
  error?: string;
}

export async function runVisualSearch(
  input: VisualSearchRequest,
  signal?: AbortSignal,
): Promise<Listing[]> {
  const res = await fetchJson<VisualSearchResponse>('/visual-search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    // Visual search is a heavy remote operation — allow a longer timeout and
    // skip the GET-dedup path (it's a POST, but explicit for clarity).
    signal,
  }, { timeoutMs: 30_000, skipDedup: true });
  if (!res.ok) throw new Error(res.error ?? 'Visual search failed');
  return mapBackendListings(res.items ?? res.results ?? []);
}
