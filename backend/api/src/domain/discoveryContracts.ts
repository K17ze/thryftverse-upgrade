import type { RetrievalMeta } from '../lib/retrievalMeta.js';

export type DiscoveryMode = 'ambient' | 'explicit' | 'category' | 'editorial' | 'visual';
export type ServeMode = 'personalized' | 'non_profiled' | 'cold_start' | 'degraded_lexical';
export type DiscoveryVertical = 'all' | 'listing' | 'person' | 'look' | 'moodboard' | 'editorial';
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
