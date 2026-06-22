import { fetchJson } from '../lib/apiClient';

export interface OrderReview {
  id: string;
  orderId: string;
  rating: number;
  comment: string | null;
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
  comment?: string
): Promise<OrderReview> {
  const res = await fetchJson<CreateReviewResponse>(
    `/orders/${encodeURIComponent(orderId)}/review`,
    {
      method: 'POST',
      body: JSON.stringify({ rating, comment }),
    }
  );
  return res.review;
}
