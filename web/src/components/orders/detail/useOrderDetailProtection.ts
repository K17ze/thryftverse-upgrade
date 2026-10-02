import { useQuery } from '@tanstack/react-query';
import { DATA_MODE } from '@/lib/api/client';
import * as commerceService from '@/lib/api/services/commerce';
import type { ProtectionCoverage } from '@/components/orders/BuyerProtectionSheet';
import type { CommerceOrder } from '@/lib/contracts/domain';
import type { SupportTicket } from '@/lib/contracts/support';
import type { OrderDetailInfo } from '@/lib/data/fixtures-commerce';

export interface UseOrderDetailProtectionParams {
  orderId: string;
  order: CommerceOrder | null | undefined;
  isBuyer: boolean;
  protectionOpen: boolean;
  detail: OrderDetailInfo | null;
  tickets?: SupportTicket[];
}

export function useOrderDetailProtection({
  orderId,
  order,
  isBuyer,
  protectionOpen,
  detail,
  tickets,
}: UseOrderDetailProtectionParams) {
  const protectionQuery = useQuery({
    queryKey: ['order', orderId, 'protection'],
    queryFn: ({ signal }) => commerceService.fetchOrderProtection(orderId, signal),
    enabled: DATA_MODE === 'live' && protectionOpen && !!order && isBuyer,
  });

  const protectionCoverage: ProtectionCoverage | null =
    DATA_MODE === 'live'
      ? protectionQuery.data
        ? {
            covered: protectionQuery.data.status === 'covered',
            feeGbp: protectionQuery.data.feeGbpMinor / 100,
            coverageCapGbp: protectionQuery.data.coverageAmountGbpMinor / 100,
            eligibleUntil: protectionQuery.data.eligibleUntil,
            claims: protectionQuery.data.claims.map((c) => ({
              ticketId: c.ticketId,
              label: c.topicLabel,
              status: c.status,
              createdAt: c.createdAt,
            })),
          }
        : null
      : detail && order
        ? {
            covered: detail.protectionFee > 0,
            feeGbp: detail.protectionFee,
            coverageCapGbp: Math.min(order.totalPrice, 500),
            eligibleUntil: order.deliveredAt
              ? new Date(Date.parse(order.deliveredAt) + 30 * 86_400_000).toISOString()
              : new Date(Date.parse(order.createdAt) + 60 * 86_400_000).toISOString(),
            claims: (tickets ?? [])
              .filter(
                (t) =>
                  t.orderId === order.id &&
                  (t.topicId === 'order_issue' || t.topicId === 'refund'),
              )
              .map((t) => ({
                ticketId: t.id,
                label: t.topicLabel,
                status: t.status,
                createdAt: t.createdAt,
              })),
          }
        : null;

  return {
    protectionQuery,
    protectionCoverage,
    protectionLoading: protectionQuery.isLoading,
    isProtectionError: DATA_MODE === 'live' && protectionQuery.isError,
  };
}
