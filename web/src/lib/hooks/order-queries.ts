'use client';

/**
 * Order-detail queries — the single-order read the order surfaces own.
 *
 * GET /orders/:id is the truth for one order. The list endpoint is
 * paginated (limit 100), so resolving a detail page by list-find
 * fabricated "Order not found" for any order outside the fetched page —
 * a deep link to a real order must never depend on what a list page
 * happened to load.
 */

import { useQuery } from '@tanstack/react-query';
import { data, DATA_MODE } from '@/lib/api/client';
import * as commerceService from '@/lib/api/services/commerce';
import { allCommerceOrders } from '@/lib/data/fixtures-commerce';
import type { CommerceOrder } from '@/lib/contracts/domain';

/**
 * The order itself — live reads GET /orders/:id (404 folds to null, the
 * verdict); fixture mode resolves the same composed session set the
 * orders list reads, so locally created orders resolve identically on
 * both surfaces.
 */
export function useOrder(orderId: string) {
  return useQuery<CommerceOrder | null>({
    queryKey: ['order', orderId],
    queryFn: async ({ signal }) => {
      if (DATA_MODE === 'live') {
        return commerceService.fetchOrderById(orderId, signal);
      }
      const base = await data.orders(signal);
      return allCommerceOrders(base).find((o) => o.id === orderId) ?? null;
    },
  });
}
