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
import { allCommerceOrders, orderEnrichmentFor } from '@/lib/data/fixtures-commerce';
import type { CommerceOrder, OrderAuthentication } from '@/lib/contracts/domain';
import { isTerminalStatus } from '@/components/orders/orderCapabilities';

// Native polling cadence (frontend/src/hooks/orders/useOrderDetail.ts):
// orders keep refreshing after payment — carrier scans, return cases and
// extensions move server-side — 30s while live, 300s once terminal.
const LIVE_POLL_MS = 30_000;
const TERMINAL_POLL_MS = 300_000;

/**
 * The order itself — live reads GET /orders/:id (404 folds to null, the
 * verdict); fixture mode resolves the same composed session set the
 * orders list reads, so locally created orders resolve identically on
 * both surfaces.
 *
 * Live mode polls on the native cadence: every 30s while the order can
 * still move, every 300s after a terminal status. Fixture rows only move
 * on local writes (which invalidate explicitly), so they never poll.
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
    refetchInterval:
      DATA_MODE === 'live'
        ? (query) => {
            // A resolved null is the 404 verdict — stable, stop polling.
            if (query.state.data === null) return false;
            const status = query.state.data?.status;
            return status && isTerminalStatus(status)
              ? TERMINAL_POLL_MS
              : LIVE_POLL_MS;
          }
        : undefined,
  });
}

/**
 * GET /orders/:id/authentication — the live verification-pipeline read.
 * The pipeline is Redis-backed and ephemeral: `request_pending` is the
 * honest state for "the durable flag exists but no pipeline record is
 * live yet" — it is never presented as a check already running.
 *
 * Fixture mode resolves the session enrichment so locally requested
 * verification round-trips identically.
 */
export function useOrderAuthentication(orderId: string) {
  return useQuery<OrderAuthentication | null>({
    queryKey: ['order', orderId, 'authentication'],
    queryFn: async ({ signal }) => {
      if (DATA_MODE === 'live') {
        return commerceService.fetchOrderAuthentication(orderId, signal);
      }
      return orderEnrichmentFor(orderId).authentication ?? null;
    },
    // Pipeline transitions are server-driven — ride the same cadence as
    // the order read while the check can still move; a terminal verdict
    // drops to the slow lane and 'not_requested' stops polling entirely.
    refetchInterval:
      DATA_MODE === 'live'
        ? (query) => {
            const status = query.state.data?.status;
            if (status === 'not_requested') return false;
            if (
              status === 'authenticated' ||
              status === 'counterfeit' ||
              status === 'inconclusive' ||
              status === 'cancelled'
            ) {
              return TERMINAL_POLL_MS;
            }
            return LIVE_POLL_MS;
          }
        : undefined,
  });
}
