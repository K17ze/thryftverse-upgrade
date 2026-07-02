import { Listing } from '../../data/mockData';
import { fetchJson } from '../../lib/apiClient';
import { mapBackendListingToListing } from '../../services/listingMapper';
import type {
  RecommendationResponse,
  RecommendationRequest,
  RecommendationSection,
  RecommendationItem,
  RecommendationLook,
} from './recommendationTypes';

interface ApiLookRow {
  id: string;
  type: 'look';
  title: string;
  coverImage: string;
  creatorId: string;
  creatorUsername: string | null;
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

function mapApiItemToRecommendationItem(item: any): RecommendationItem {
  if (item && item.type === 'look') {
    return mapApiLookToRecommendationLook(item as ApiLookRow);
  }
  return mapBackendListingToListing(item);
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
      items: Array<ApiLookRow | Record<string, unknown>>;
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
