import { Listing } from '../../data/mockData';
import { fetchJson } from '../../lib/apiClient';
import type {
  RecommendationResponse,
  RecommendationRequest,
  RecommendationSection,
  RecommendationItem,
  RecommendationLook,
} from './recommendationTypes';

interface ApiListingRow {
  id: string;
  sellerId: string;
  title: string;
  description: string;
  priceGbp: number;
  imageUrl: string | null;
  images: string[];
  status: string;
  category: string | null;
  brand: string | null;
  size: string | null;
  condition: string | null;
  originalPriceGbp: number | null;
  createdAt: string;
  seller?: {
    id: string;
    username: string | null;
    avatar: string | null;
    rating: number | null;
    reviewCount: number | null;
    location: string | null;
  } | null;
}

interface ApiLookRow {
  id: string;
  type: 'look';
  title: string;
  coverImage: string;
  creatorId: string;
  creatorUsername: string | null;
}

function mapApiListingToListing(row: ApiListingRow): Listing {
  const price = Number(row.priceGbp ?? 0);
  return {
    id: row.id,
    title: row.title || 'Untitled listing',
    brand: row.brand || row.title?.split(' ').slice(0, 2).join(' ') || 'Thryftverse',
    size: row.size || 'One size',
    condition: (row.condition as Listing['condition']) || 'Very good',
    price,
    images: row.images?.length ? row.images : row.imageUrl ? [row.imageUrl] : [],
    likes: 0,
    isSold: row.status === 'sold',
    sellerId: row.sellerId || 'u1',
    seller: row.seller ?? null,
    category: row.category || 'women',
    subcategory: 'Clothing',
    description: row.description || '',
    createdAt: row.createdAt,
    originalPrice: row.originalPriceGbp != null ? Number(row.originalPriceGbp) : undefined,
  };
}

function mapApiLookToRecommendationLook(row: ApiLookRow): RecommendationLook {
  return {
    id: row.id,
    type: 'look',
    title: row.title,
    coverImage: row.coverImage,
    creatorId: row.creatorId,
    creatorUsername: row.creatorUsername,
  };
}

function mapApiItemToRecommendationItem(item: ApiListingRow | ApiLookRow): RecommendationItem {
  if ((item as ApiLookRow).type === 'look') {
    return mapApiLookToRecommendationLook(item as ApiLookRow);
  }
  return mapApiListingToListing(item as ApiListingRow);
}

export async function fetchRecommendations(
  request: RecommendationRequest
): Promise<RecommendationResponse> {
  const params = new URLSearchParams();
  if (request.sections?.length) params.set('sections', request.sections.join(','));
  if (request.limit) params.set('limit', String(request.limit));
  if (request.cursor) params.set('cursor', request.cursor);
  if (request.sessionId) params.set('sessionId', request.sessionId);
  const qs = params.toString();

  const payload = await fetchJson<{
    listingId: string;
    sections: Array<{
      key: string;
      title: string;
      subtitle?: string;
      reason?: string;
      personalised: boolean;
      items: Array<ApiListingRow | ApiLookRow>;
      nextCursor?: string;
    }>;
  }>(`/listings/${request.listingId}/recommendations${qs ? `?${qs}` : ''}`);

  return {
    listingId: payload.listingId,
    sections: (payload.sections ?? []).map((s) => ({
      key: s.key as RecommendationSection['key'],
      title: s.title,
      subtitle: s.subtitle,
      reason: s.reason,
      personalised: s.personalised,
      items: (s.items ?? []).map(mapApiItemToRecommendationItem),
      nextCursor: s.nextCursor,
    })),
  };
}
