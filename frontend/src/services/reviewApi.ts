import { fetchJson } from '../lib/apiClient';

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
  photoUrls?: string[]
): Promise<OrderReview> {
  const res = await fetchJson<CreateReviewResponse>(
    `/orders/${encodeURIComponent(orderId)}/review`,
    {
      method: 'POST',
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
