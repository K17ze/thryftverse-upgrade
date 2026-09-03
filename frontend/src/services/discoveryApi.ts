import { fetchJson } from '../lib/apiClient';

export type DiscoveryMode = 'ambient' | 'explicit' | 'category' | 'editorial' | 'visual';
export type ServeMode = 'personalized' | 'non_profiled' | 'cold_start' | 'degraded_lexical';
export type DiscoverySort = 'relevance' | 'recent' | 'price_asc' | 'price_desc' | 'most_liked' | 'ending_soon';

export interface DiscoveryFilters {
  category?: string;
  condition?: string;
  size?: string;
  brand?: string;
  minPrice?: number;
  maxPrice?: number;
  sustainableOnly?: boolean;
}

export interface DiscoveryEntity {
  entityType: 'listing';
  id: string;
  score: number;
  rank: number;
  title: string;
  brand: string | null;
  category: string | null;
  condition: string | null;
  size: string | null;
  price: number;
  currency: string;
  imageUrl: string | null;
  createdAt: string;
  sellerId: string;
  sellerUsername: string | null;
  sellerRating: number | null;
  reasonCodes: string[];
  componentScores: Record<string, number>;
}

export interface RetrievalMeta {
  method: string;
  fallbackReason?: string;
  embedderConfigured: boolean;
  searchEngineVersion?: string;
}

export interface DiscoveryPage {
  sessionId: string;
  requestId: string;
  serveMode: ServeMode;
  totalRelation: 'exact' | 'lower_bound' | 'unknown';
  entities: DiscoveryEntity[];
  cursor: string | null;
  retrievalMeta: RetrievalMeta;
  appliedRelaxations: string[];
  generatedAt: string;
}

export interface DiscoverySession {
  id: string;
  mode: DiscoveryMode;
  serveMode: ServeMode;
  policyVersion: string;
  createdAt: string;
  expiresAt: string;
}

interface CreateSessionResponse {
  id: string;
  mode: DiscoveryMode;
  serveMode: ServeMode;
  policyVersion: string;
  createdAt: string;
  expiresAt: string;
}

interface SearchSessionResponse extends DiscoveryPage {}

export async function createDiscoverySession(params: {
  entryPoint: string;
  mode: DiscoveryMode;
}): Promise<DiscoverySession> {
  const data = await fetchJson<CreateSessionResponse>('/v1/discovery/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return data;
}

export async function discoverySearch(
  sessionId: string,
  params: {
    query: string;
    filters?: DiscoveryFilters;
    sort?: DiscoverySort;
    limit?: number;
    cursor?: string;
  },
): Promise<DiscoveryPage> {
  const data = await fetchJson<SearchSessionResponse>(
    `/v1/discovery/sessions/${encodeURIComponent(sessionId)}/search`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    },
  );
  return data;
}
