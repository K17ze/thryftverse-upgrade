'use client';

import { useMemo, useState } from 'react';
import type { OrdersTab } from '@/components/orders/OrdersTabRail';
import {
  EMPTY_ORDERS_FILTER,
  type OrdersFilterState,
} from '@/components/orders/OrdersFilterSheet';
import {
  classifyOrderForRole,
  humaniseStatus,
  normaliseOrderStatus,
  orderAttention,
  type OrderAttention,
  type OrderRole,
} from '@/components/orders/orderCapabilities';
import { orderEnrichmentFor } from '@/lib/data/fixtures-commerce';
import { listingById, userById } from '@/lib/data/fixtures';
import { DATA_MODE } from '@/lib/api/client';
import { useCommerceOrders, useCommerceOrderRows } from '@/lib/hooks/queries';
import { useSession } from '@/lib/session/SessionProvider';
import type { CommerceOrder } from '@/lib/contracts/domain';
import type { CommerceUserOrderApi } from '@/lib/api/mappers';

const LIVE = DATA_MODE === 'live';

export interface DateGroup {
  key: string;
  label: string;
  data: CommerceOrder[];
}

/** Month-group labels — port of the mobile MyOrdersScreen grammar:
 *  "This month" / "September 2026" / bare year for older orders. */
export function monthGroupLabel(date: Date): string {
  const now = new Date();
  const sameYear = date.getFullYear() === now.getFullYear();
  const sameMonth = sameYear && date.getMonth() === now.getMonth();
  if (sameMonth) return 'This month';
  if (sameYear) {
    return date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  }
  return String(date.getFullYear());
}

export function groupOrdersByMonth(orders: CommerceOrder[]): DateGroup[] {
  const groups = new Map<string, DateGroup>();
  for (const order of orders) {
    const date = new Date(order.createdAt);
    if (!Number.isFinite(date.getTime())) continue;
    const key = `${date.getFullYear()}-${date.getMonth()}`;
    const group = groups.get(key);
    if (group) group.data.push(order);
    else groups.set(key, { key, label: monthGroupLabel(date), data: [order] });
  }
  return [...groups.values()];
}

export const EMPTY_COPY: Record<OrdersTab, { title: string; subtitle: string }> = {
  all: {
    title: 'No orders yet',
    subtitle: 'When you buy or sell something, it shows up here with tracking.',
  },
  needs_action: {
    title: 'Nothing needs you right now',
    subtitle: 'Orders waiting on your action — payment, dispatch, a response — land here.',
  },
  active: {
    title: 'No orders in flight',
    subtitle: 'Paid, packed and in-transit orders appear here while money is moving.',
  },
  completed: {
    title: 'No completed orders yet',
    subtitle: 'Delivered and completed orders settle here.',
  },
  cancelled: {
    title: 'No cancelled orders',
    subtitle: 'Cancelled, refunded and returned orders land here.',
  },
};

export function useOrdersListWorkflow() {
  const { user, sessionLoading } = useSession();
  const {
    data: orders,
    isLoading,
    isError,
    refetch,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
  } = useCommerceOrders();

  const { data: orderRows } = useCommerceOrderRows();
  const rowById = useMemo(() => {
    const map = new Map<string, CommerceUserOrderApi>();
    for (const r of orderRows ?? []) map.set(r.id, r);
    return map;
  }, [orderRows]);

  const [tab, setTab] = useState<OrdersTab>('all');
  const [filter, setFilter] = useState<OrdersFilterState>(EMPTY_ORDERS_FILTER);
  const [filterOpen, setFilterOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [refreshFailed, setRefreshFailed] = useState(false);

  const viewerId = user?.id ?? '';

  const roleOf = (buyerId: string): OrderRole =>
    buyerId === viewerId ? 'buyer' : 'seller';

  const attentionOf = (order: CommerceOrder): OrderAttention | null => {
    const row = rowById.get(order.id);
    const enr = LIVE ? null : orderEnrichmentFor(order.id);
    const rc = enr?.returnCase ?? null;
    return orderAttention({
      status: order.status,
      role: roleOf(order.buyerId),
      hasOpenResolution:
        row?.hasOpenResolution === true ||
        (rc != null && rc.status !== 'closed' && rc.status !== 'refund_confirmed'),
      hasReview: row?.hasReview ?? enr?.hasReview === true,
      reviewIsAuto: enr?.reviewIsAuto === true,
      hasTracking:
        !!order.trackingNumber || (enr?.trackingEvents?.length ?? 0) > 0,
      fulfilmentSnapshot: order.fulfilmentSnapshot ?? enr?.fulfilmentSnapshot ?? null,
      shipByDate: order.shipByDate ?? enr?.shipByDate ?? null,
      dispatchExtension:
        enr?.dispatchExtension !== undefined
          ? enr.dispatchExtension
          : (order.dispatchExtension ?? null),
    });
  };

  const faceted = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (orders ?? []).filter((o) => {
      if (filter.role === 'buying' && o.buyerId !== viewerId) return false;
      if (filter.role === 'selling' && o.sellerId !== viewerId) return false;
      if (filter.statuses.length > 0 && !filter.statuses.includes(normaliseOrderStatus(o.status)))
        return false;
      if (filter.year != null && new Date(o.createdAt).getFullYear() !== filter.year) return false;
      if (q) {
        const row = rowById.get(o.id);
        const listing = LIVE ? undefined : listingById(o.listingId);
        const counterparty = row
          ? (o.buyerId === viewerId ? row.sellerUsername : row.buyerUsername) ?? ''
          : o.buyerId === viewerId
            ? (listing?.seller?.username ?? userById(o.sellerId)?.username ?? '')
            : (userById(o.buyerId)?.username ?? '');
        const haystack = [
          o.id,
          row?.listingTitle ?? listing?.title ?? '',
          listing?.brand ?? '',
          counterparty,
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [orders, filter, viewerId, query, rowById]);

  const attentionMap = useMemo(() => {
    const map = new Map<string, OrderAttention>();
    for (const o of faceted) {
      const attention = attentionOf(o);
      if (attention) map.set(o.id, attention);
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [faceted, viewerId]);

  const counts = useMemo(() => {
    const out: Partial<Record<OrdersTab, number>> = {
      all: faceted.length,
      needs_action: attentionMap.size,
    };
    for (const o of faceted) {
      const cls = classifyOrderForRole(o.status, roleOf(o.buyerId));
      if (cls !== 'unknown' && cls !== 'needs_action') {
        out[cls] = (out[cls] ?? 0) + 1;
      }
    }
    return out;
  }, [faceted, viewerId, attentionMap]); // eslint-disable-line react-hooks/exhaustive-deps

  const attentionItems = useMemo(() => {
    const items: { order: CommerceOrder; attention: OrderAttention }[] = [];
    for (const o of faceted) {
      const attention = attentionMap.get(o.id);
      if (attention) items.push({ order: o, attention });
    }
    items.sort((a, b) => {
      if (a.attention.rank !== b.attention.rank) {
        return a.attention.rank - b.attention.rank;
      }
      const da = a.order.shipByDate ? Date.parse(a.order.shipByDate) : null;
      const db = b.order.shipByDate ? Date.parse(b.order.shipByDate) : null;
      if (da != null && db != null && da !== db) return da - db;
      return Date.parse(b.order.createdAt) - Date.parse(a.order.createdAt);
    });
    return items;
  }, [faceted, attentionMap]);

  const attentionIds = useMemo(
    () => new Set(attentionItems.map((i) => i.order.id)),
    [attentionItems],
  );

  const visible = useMemo(() => {
    const mine = tab === 'all'
      ? faceted.filter((o) => !attentionIds.has(o.id))
      : tab === 'needs_action'
        ? faceted.filter((o) => attentionMap.has(o.id))
        : faceted.filter((o) => classifyOrderForRole(o.status, roleOf(o.buyerId)) === tab);
    return [...mine].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }, [faceted, tab, viewerId, attentionIds, attentionMap]); // eslint-disable-line react-hooks/exhaustive-deps

  const groups = useMemo(() => groupOrdersByMonth(visible), [visible]);

  const handleRefresh = () => {
    setRefreshing(true);
    setRefreshFailed(false);
    void refetch()
      .then((res) => setRefreshFailed(res.isError === true))
      .catch(() => setRefreshFailed(true))
      .finally(() => setRefreshing(false));
  };

  const statusOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const o of orders ?? []) {
      const key = normaliseOrderStatus(o.status);
      if (!seen.has(key)) seen.set(key, humaniseStatus(key));
    }
    return [...seen.entries()].map(([key, label]) => ({ key, label }));
  }, [orders]);

  const availableYears = useMemo(() => {
    const years = new Set<number>();
    for (const o of orders ?? []) {
      const y = new Date(o.createdAt).getFullYear();
      if (!Number.isNaN(y)) years.add(y);
    }
    return [...years].sort((a, b) => b - a);
  }, [orders]);

  const filterActive =
    filter.role !== 'all' || filter.statuses.length > 0 || filter.year != null;

  return {
    user,
    sessionLoading,
    viewerId,
    orders,
    isLoading,
    isError,
    refetch,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
    rowById,
    tab,
    setTab,
    filter,
    setFilter,
    filterOpen,
    setFilterOpen,
    query,
    setQuery,
    refreshing,
    refreshFailed,
    counts,
    attentionItems,
    attentionMap,
    groups,
    visible,
    handleRefresh,
    statusOptions,
    availableYears,
    filterActive,
  };
}
