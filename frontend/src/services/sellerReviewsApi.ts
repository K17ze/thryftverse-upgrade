import { fetchJson } from '../lib/apiClient';

export interface SellerReviewSummary {
  ratingAverage: number | null;
  reviewCount: number;
  distribution: { rating: number; count: number }[];
}

export interface SellerReviewItem {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  reviewer: {
    id: string | null;
    username: string | null;
    displayName: string | null;
    avatar: string | null;
  };
  listing: {
    id: string;
    title: string | null;
    imageUrl: string | null;
  } | null;
}

export interface SellerReviewsResponse {
  ok: boolean;
  summary: SellerReviewSummary;
  items: SellerReviewItem[];
  nextCursor: string | null;
}

export async function fetchSellerReviews(
  sellerId: string,
  options?: { limit?: number; cursor?: string }
): Promise<SellerReviewsResponse> {
  const params = new URLSearchParams();
  if (options?.limit) params.set('limit', String(options.limit));
  if (options?.cursor) params.set('cursor', options.cursor);
  const qs = params.toString();
  return fetchJson<SellerReviewsResponse>(
    `/sellers/${encodeURIComponent(sellerId)}/reviews${qs ? `?${qs}` : ''}`
  );
}
