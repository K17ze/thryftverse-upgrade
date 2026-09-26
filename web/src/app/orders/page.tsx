'use client';

/**
 * /orders — purchases and sales in one list surface. On the All tab a
 * "Needs attention" lane leads: orders whose capability resolution lands
 * the ball in the viewer's court (pay, dispatch, extension response,
 * inspect/confirm, review) bubble out of the chronological list — the
 * lane collapses when empty. Below it everything stays chronological.
 * Classification tab rail (All / Needs action / Active / Completed /
 * Cancelled) driven by the same canonical capability model, plus a
 * Filters sheet (role, status, year). Skeleton and per-tab empty states.
 */

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconButton } from '@/components/ui/IconButton';
import { OrderRow } from '@/components/orders/OrderRow';
import { RowSkeleton } from '@/components/orders/RowSkeleton';
import { OrdersTabRail, type OrdersTab } from '@/components/orders/OrdersTabRail';
import {
  OrdersFilterSheet,
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
import { useCommerceOrders } from '@/lib/hooks/queries';
import { useSession } from '@/lib/session/SessionProvider';
import type { CommerceOrder } from '@/lib/contracts/domain';

const EMPTY_COPY: Record<OrdersTab, { title: string; subtitle: string }> = {
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

export default function OrdersPage() {
  const router = useRouter();
  const { user } = useSession();
  const {
    data: orders,
    isLoading,
    isError,
    refetch,
  } = useCommerceOrders();
  const [tab, setTab] = useState<OrdersTab>('all');
  const [filter, setFilter] = useState<OrdersFilterState>(EMPTY_ORDERS_FILTER);
  const [filterOpen, setFilterOpen] = useState(false);

  const viewerId = user?.id ?? 'me';

  const roleOf = (buyerId: string): OrderRole =>
    buyerId === viewerId ? 'buyer' : 'seller';

  /**
   * The capability projection for one order — same context the detail
   * surface resolves, so the lane and the row never disagree about whose
   * move it is.
   */
  const attentionOf = (order: CommerceOrder): OrderAttention | null => {
    const enr = orderEnrichmentFor(order.id);
    const rc = enr.returnCase ?? null;
    return orderAttention({
      status: order.status,
      role: roleOf(order.buyerId),
      hasOpenResolution:
        rc != null && rc.status !== 'closed' && rc.status !== 'refund_confirmed',
      hasReview: enr.hasReview === true,
      reviewIsAuto: enr.reviewIsAuto === true,
      hasTracking:
        !!order.trackingNumber || (enr.trackingEvents?.length ?? 0) > 0,
      fulfilmentSnapshot: order.fulfilmentSnapshot ?? enr.fulfilmentSnapshot ?? null,
      shipByDate: order.shipByDate ?? enr.shipByDate ?? null,
      dispatchExtension:
        enr.dispatchExtension !== undefined
          ? enr.dispatchExtension
          : (order.dispatchExtension ?? null),
    });
  };

  /** Facets applied before tab classification. */
  const faceted = useMemo(() => {
    return (orders ?? []).filter((o) => {
      if (filter.role === 'buying' && o.buyerId !== viewerId) return false;
      if (filter.role === 'selling' && o.sellerId !== viewerId) return false;
      if (filter.statuses.length > 0 && !filter.statuses.includes(normaliseOrderStatus(o.status)))
        return false;
      if (filter.year != null && new Date(o.createdAt).getFullYear() !== filter.year) return false;
      return true;
    });
  }, [orders, filter, viewerId]);

  const counts = useMemo(() => {
    const out: Partial<Record<OrdersTab, number>> = { all: faceted.length };
    for (const o of faceted) {
      const cls = classifyOrderForRole(o.status, roleOf(o.buyerId));
      if (cls !== 'unknown') out[cls] = (out[cls] ?? 0) + 1;
    }
    return out;
  }, [faceted, viewerId]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Needs-attention lane membership — every faceted order whose ball is in
   * the viewer's court, urgency-ranked (money first, deadlines before
   * reviews). Renders only on the All tab; collapses when empty.
   */
  const attentionItems = useMemo(() => {
    const items: { order: CommerceOrder; attention: OrderAttention }[] = [];
    for (const o of faceted) {
      const attention = attentionOf(o);
      if (attention) items.push({ order: o, attention });
    }
    items.sort((a, b) => {
      if (a.attention.rank !== b.attention.rank) {
        return a.attention.rank - b.attention.rank;
      }
      // Same rank — the nearer ship-by deadline wins, then recency.
      const da = a.order.shipByDate ? Date.parse(a.order.shipByDate) : null;
      const db = b.order.shipByDate ? Date.parse(b.order.shipByDate) : null;
      if (da != null && db != null && da !== db) return da - db;
      return Date.parse(b.order.createdAt) - Date.parse(a.order.createdAt);
    });
    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [faceted, viewerId]);

  const attentionIds = useMemo(
    () => new Set(attentionItems.map((i) => i.order.id)),
    [attentionItems],
  );

  const visible = useMemo(() => {
    const mine = tab === 'all'
      // Lane members lead above; the rest stays strictly chronological.
      ? faceted.filter((o) => !attentionIds.has(o.id))
      : faceted.filter((o) => classifyOrderForRole(o.status, roleOf(o.buyerId)) === tab);
    return [...mine].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }, [faceted, tab, viewerId, attentionIds]); // eslint-disable-line react-hooks/exhaustive-deps

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

  return (
    <div className="mx-auto max-w-[820px] px-4 py-8 sm:px-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-screen-title font-bold text-text-primary">Orders</h1>
        <IconButton
          name="filter"
          aria-label="Filter orders"
          onClick={() => setFilterOpen(true)}
          contained={filterActive}
        />
      </div>

      <div className="mt-4">
        <OrdersTabRail activeTab={tab} onChange={setTab} counts={counts} />
      </div>

      <div className="mt-5">
        {isLoading ? (
          <RowSkeleton />
        ) : isError ? (
          <EmptyState
            icon="alert"
            title="Couldn't load orders"
            subtitle="Check your connection and try again — your orders are safe."
            actionLabel="Try again"
            onAction={() => void refetch()}
          />
        ) : visible.length === 0 && (tab !== 'all' || attentionItems.length === 0) ? (
          <EmptyState
            icon="bag"
            title={EMPTY_COPY[tab].title}
            subtitle={
              filterActive
                ? 'No orders match these filters.'
                : EMPTY_COPY[tab].subtitle
            }
            actionLabel={
              tab === 'all' && !filterActive
                ? 'Start shopping'
                : filterActive
                  ? 'Clear filters'
                  : undefined
            }
            onAction={
              tab === 'all' && !filterActive
                ? () => router.push('/explore')
                : filterActive
                  ? () => setFilter(EMPTY_ORDERS_FILTER)
                  : undefined
            }
          />
        ) : (
          <>
            {/* Needs-attention lane — collapses entirely when nothing is
                in the viewer's court. */}
            {tab === 'all' && attentionItems.length > 0 ? (
              <section>
                <h2 className="text-caption font-semibold text-text-secondary">
                  Needs attention{' '}
                  <span className="tnum text-text-muted">{attentionItems.length}</span>
                </h2>
                <ul className="mt-1 divide-y divide-border-subtle border-y border-border-subtle">
                  {attentionItems.map(({ order, attention }) => (
                    <OrderRow
                      key={order.id}
                      order={order}
                      isBuyer={order.buyerId === viewerId}
                      attention={attention}
                    />
                  ))}
                </ul>
              </section>
            ) : null}
            {visible.length > 0 ? (
              <ul
                className={`divide-y divide-border-subtle border-border-subtle ${
                  tab === 'all' && attentionItems.length > 0 ? 'mt-5 border-y' : 'border-y'
                }`}
              >
                {visible.map((order) => (
                  <OrderRow
                    key={order.id}
                    order={order}
                    isBuyer={order.buyerId === viewerId}
                  />
                ))}
              </ul>
            ) : null}
          </>
        )}
      </div>

      <OrdersFilterSheet
        open={filterOpen}
        currentFilter={filter}
        statusOptions={statusOptions}
        availableYears={availableYears}
        onApply={setFilter}
        onClose={() => setFilterOpen(false)}
      />
    </div>
  );
}
