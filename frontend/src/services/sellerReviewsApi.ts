import { fetchJson } from '../lib/apiClient';

export interface SellerReviewSummary {
  ratingAverage: number | null;
  reviewCount: number;
  /** Count of reviews that satisfy eligibility rules (API contract only — not rendered). */
  eligibleCount?: number;
  distribution: { rating: number; count: number }[];
  /** ISO timestamp of when this summary was computed (rendered as "Updated 25 Aug"). */
  asOf?: string | null;
  /** Snapshot version for cache invalidation (API contract only — not rendered). */
  snapshotVersion?: number;
  /** How the summary was produced, e.g. "live_aggregate" (API contract only — not rendered). */
  computationNote?: string;
}

export interface SellerReviewItem {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  /** Photo URLs persisted in review_media table (migration 165) */
  photoUrls?: string[];
  /** Seller response persisted in review_responses table (migration 165) */
  sellerResponse?: {
    text: string;
    createdAt: string;
  } | null;
  reviewer: {
    /** Real reviewer ID from backend — enables public profile navigation */
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
