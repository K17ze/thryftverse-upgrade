import { fetchJson } from '../lib/apiClient';

export interface OrderReview {
  id: string;
  orderId: string;
  rating: number;
  comment: string | null;
  /** Photo URLs attached by the buyer */
  photoUrls?: string[];
  /** Seller response if present */
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
): Promise<OrderReview> {
  const res = await fetchJson<CreateReviewResponse>(
    `/reviews/${encodeURIComponent(reviewId)}/response`,
    {
      method: 'POST',
      body: JSON.stringify({ text }),
    }
  );
  return res.review;
}
