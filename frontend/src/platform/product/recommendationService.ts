import { fetchJson } from '../../lib/apiClient';
import {
  isDisplayReadyListing,
  mapBackendListingToListing,
} from '../../services/listingMapper';
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

function mapApiItemToRecommendationItem(item: any): RecommendationItem | null {
  if (item && item.type === 'look') {
    return mapApiLookToRecommendationLook(item as ApiLookRow);
  }
  const listing = mapBackendListingToListing(item);
  return isDisplayReadyListing(listing) ? listing : null;
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
    decision?: {
      policyVersion: string;
      capabilityLevel: 'heuristic_baseline';
      trainedModel: false;
      generatedAt: string;
    };
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
    decision: payload.decision,
    sections: (payload.sections ?? []).map((s) => ({
      key: s.key as RecommendationSection['key'],
      title: s.title,
      subtitle: s.subtitle,
      reason: s.reason,
      personalised: s.personalised,
      items: (s.items ?? [])
        .map(mapApiItemToRecommendationItem)
        .filter((item): item is RecommendationItem => item !== null),
      nextCursor: s.nextCursor,
    })),
  };
}
