import { fetchJson } from '../lib/apiClient';

export type OrderReviewAutoReason = 'buyer_silence';

export interface OrderReview {
  id: string;
  orderId: string;
  rating: number;
  comment: string | null;
  /** Photo URLs attached by the buyer — persisted in review_media table */
  photoUrls?: string[];
  /** Seller response if present — persisted in review_responses table */
  sellerResponse?: {
    text: string;
    createdAt: string;
  } | null;
  /**
   * Provenance: TRUE when the row is platform-generated feedback (the buyer
   * never submitted a review before the feedback window elapsed). Surfaces
   * must render this as automatic — never as a buyer-authored review.
   */
  isAuto?: boolean;
  autoReason?: OrderReviewAutoReason | null;
  createdAt: string;
  updatedAt: string;
}

interface GetReviewResponse {
  ok: true;
  review: OrderReview | null;
}

interface CreateReviewResponse {
  ok: true;
  review: OrderReview;
}

interface ReviewResponseResult {
  ok: true;
  response: {
    reviewId: string;
    text: string;
    createdAt: string;
  };
}

export async function getOrderReview(orderId: string): Promise<OrderReview | null> {
  const res = await fetchJson<GetReviewResponse>(`/orders/${encodeURIComponent(orderId)}/review`);
  return res.review;
}

export async function createOrderReview(
  orderId: string,
  rating: number,
  comment?: string,
  photoUrls?: string[],
  idempotencyKey?: string
): Promise<OrderReview> {
  const headers: Record<string, string> = {};
  // The backend dedupes on this key — a network drop followed by a retry
  // returns the already-created review instead of REVIEW_ALREADY_EXISTS.
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  const res = await fetchJson<CreateReviewResponse>(
    `/orders/${encodeURIComponent(orderId)}/review`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({ rating, comment, photoUrls }),
    }
  );
  return res.review;
}

export async function respondToReview(
  reviewId: string,
  text: string
): Promise<ReviewResponseResult> {
  const res = await fetchJson<ReviewResponseResult>(
    `/reviews/${encodeURIComponent(reviewId)}/response`,
    {
      method: 'POST',
      body: JSON.stringify({ text }),
    }
  );
  return res;
}

export type ReviewReportReason =
  | 'fake_or_incentivized'
  | 'harmful_or_abusive'
  | 'personal_data'
  | 'spam'
  | 'off_topic'
  | 'other';

interface ReviewReportResult {
  ok: true;
  reportId: string;
}

export async function reportReview(
  reviewId: string,
  reason: ReviewReportReason,
  details?: string
): Promise<ReviewReportResult> {
  return fetchJson<ReviewReportResult>(
    `/reviews/${encodeURIComponent(reviewId)}/report`,
    {
      method: 'POST',
      body: JSON.stringify({ reason, details }),
    }
  );
}
