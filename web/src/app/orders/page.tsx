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

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { StateGate } from '@/components/flagship/StateGate';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { OrderRow } from '@/components/orders/OrderRow';
import { RowSkeleton } from '@/components/orders/RowSkeleton';
import { OrdersTabRail, ORDERS_TABS, type OrdersTab } from '@/components/orders/OrdersTabRail';
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
import { listingById, userById } from '@/lib/data/fixtures';
import { DATA_MODE } from '@/lib/api/client';
import { useCommerceOrders, useCommerceOrderRows } from '@/lib/hooks/queries';
import { useSession } from '@/lib/session/SessionProvider';
import type { CommerceOrder } from '@/lib/contracts/domain';
import type { CommerceUserOrderApi } from '@/lib/api/mappers';

const LIVE = DATA_MODE === 'live';

interface DateGroup {
  key: string;
  label: string;
  data: CommerceOrder[];
}

/** Month-group labels — port of the mobile MyOrdersScreen grammar:
 *  "This month" / "September 2026" / bare year for older orders. */
function monthGroupLabel(date: Date): string {
  const now = new Date();
  const sameYear = date.getFullYear() === now.getFullYear();
  const sameMonth = sameYear && date.getMonth() === now.getMonth();
  if (sameMonth) return 'This month';
  if (sameYear) {
    return date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  }
  return String(date.getFullYear());
}

function groupOrdersByMonth(orders: CommerceOrder[]): DateGroup[] {
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

function isOrdersTab(value: string | null): value is OrdersTab {
  return !!value && ORDERS_TABS.some((t) => t.key === value);
}

/**
 * Deep link — /orders?tab=needs_action|active|completed|cancelled lands
 * on the matching segment (Settings → Orders links here; same grammar as
 * /inbox?tab=). Isolated under Suspense so the search-param read never
 * deopts the page.
 */
function TabFromUrl({ onTab }: { onTab: (tab: OrdersTab) => void }) {
  const searchParams = useSearchParams();
  const param = searchParams.get('tab');
  useEffect(() => {
    if (isOrdersTab(param)) onTab(param);
  }, [param, onTab]);
  return null;
}

const EMPTY_COPY: Record<OrdersTab, { title: string; subtitle: string }> = {  all: {
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
  // Live wire rows — the backend already returns listingTitle, counterparty
  // usernames, hasReview and hasOpenResolution; fixture enrichment never
  // fabricates live order context.
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

  // Orders are account-bound — a guest has no buyer/seller identity, so
  // the render gate below replaces the list with a sign-in state rather
  // than attributing orders to a fixture 'me'.
  const viewerId = user?.id ?? '';

  const roleOf = (buyerId: string): OrderRole =>
    buyerId === viewerId ? 'buyer' : 'seller';

  /**
   * The capability projection for one order — same context the detail
   * surface resolves, so the lane and the row never disagree about whose
   * move it is.
   */
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

  /** Facets applied before tab classification — role/status/year, then
   *  the search query (eBay purchase-history grammar: title, order id,
   *  counterparty). */
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

  /**
   * The ONE needs-attention classifier — resolved once per order and
   * shared by the tab counts, the lane and the Needs action tab so no
   * surface can disagree about whose move it is.
   */
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

  /**
   * Needs-attention lane membership — every faceted order whose ball is in
   * the viewer's court, urgency-ranked (money first, deadlines before
   * reviews). Renders only on the All tab; collapses when empty. The
   * Needs action tab reads the same membership — one classifier.
   */
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
      // Same rank — the nearer ship-by deadline wins, then recency.
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
      // Lane members lead above; the rest stays strictly chronological.
      ? faceted.filter((o) => !attentionIds.has(o.id))
      : tab === 'needs_action'
        // Same classifier as the lane — Needs action IS the attention set.
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

  return (
    <div className="mx-auto max-w-[820px] px-4 py-8 sm:px-6 lg:max-w-[1280px]">
      {/* ?tab= deep link — the param reader renders nothing; the boundary
          keeps the search-param read off the page's prerender path. */}
      <Suspense fallback={null}>
        <TabFromUrl onTab={setTab} />
      </Suspense>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-screen-title text-text-primary">Orders</h1>
        <div className="flex items-center gap-1">
          <IconButton
            name="refresh"
            aria-label="Refresh orders"
            onClick={handleRefresh}
            disabled={refreshing || isLoading}
            className={refreshing ? 'animate-spin' : undefined}
          />
          <IconButton
            name="filter"
            aria-label="Filter orders"
            onClick={() => setFilterOpen(true)}
            contained={filterActive}
          />
        </div>
      </div>

      {/* Search — eBay purchase-history grammar: title, order id,
          counterparty. Client-side over the loaded page, honest scope. */}
      <div className="mt-4 flex h-11 items-center rounded-lg border border-border bg-input px-3.5 focus-within:border-text-muted lg:max-w-md">
        <Icon name="search" size={16} className="shrink-0 text-text-muted" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search orders — item, order number, seller"
          aria-label="Search orders"
          className="ml-2 w-full bg-transparent text-body text-input-text placeholder:text-text-muted focus:outline-none [&::-webkit-search-cancel-button]:hidden"
        />
        {query ? (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label="Clear search"
            className="pressable -mr-2 flex h-11 w-11 shrink-0 items-center justify-center text-text-muted hover:text-text-primary"
          >
            <Icon name="close" size={16} />
          </button>
        ) : null}
      </div>

      <div className="mt-4">
        <OrdersTabRail activeTab={tab} onChange={setTab} counts={counts} />
      </div>

      {/* States — registry copy via StateGate: the skeleton mirrors the
          list, a fetch error resolves to the orders error/offline copy
          (offline reads "You're offline", not "Couldn't load"), and a
          failed manual refresh keeps the cached list under the stale
          pill. The sign-in gate and per-tab empties stay bespoke — they
          carry context the registry doesn't have. */}
      <StateGate
        domain="orders"
        className="mt-5"
        isLoading={sessionLoading || isLoading}
        isError={!!user && isError}
        stale={refreshFailed}
        skeleton={<RowSkeleton />}
        onRetry={handleRefresh}
      >
        {!user ? (
          <EmptyState
            icon="profile"
            title="Sign in to view your orders"
            subtitle="Purchases and sales are tied to your account."
            actionLabel="Sign in"
            onAction={() => router.push('/auth')}
          />
        ) : visible.length === 0 && (tab !== 'all' || attentionItems.length === 0) ? (
          <EmptyState
            icon={query ? 'search' : 'bag'}
            title={query ? 'No orders match your search' : EMPTY_COPY[tab].title}
            subtitle={
              query
                ? 'Try a different item name, order number or seller.'
                : filterActive
                  ? 'No orders match these filters.'
                  : EMPTY_COPY[tab].subtitle
            }
            actionLabel={
              query || filterActive
                ? query
                  ? 'Clear search'
                  : 'Clear filters'
                : tab === 'all'
                  ? 'Start shopping'
                  : undefined
            }
            onAction={
              query
                ? () => setQuery('')
                : filterActive
                  ? () => setFilter(EMPTY_ORDERS_FILTER)
                  : tab === 'all'
                    ? () => router.push('/explore')
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
                      meta={rowById.get(order.id)}
                    />
                  ))}
                </ul>
              </section>
            ) : null}
            {/* Chronological list grouped by month — the eBay purchase
                history grammar the mobile MyOrdersScreen uses ("This
                month" / "September 2026" / year for older orders). On the
                Needs action tab each row carries its attention caption —
                the same classifier as the lane. */}
            {groups.map((group, gi) => (
              <section
                key={group.key}
                className={gi > 0 || (tab === 'all' && attentionItems.length > 0) ? 'mt-5' : undefined}
              >
                <h2 className="text-caption font-semibold text-text-secondary">{group.label}</h2>
                <ul className="mt-1 divide-y divide-border-subtle border-y border-border-subtle">
                  {group.data.map((order) => (
                    <OrderRow
                      key={order.id}
                      order={order}
                      isBuyer={order.buyerId === viewerId}
                      attention={tab === 'needs_action' ? attentionMap.get(order.id) : undefined}
                      meta={rowById.get(order.id)}
                    />
                  ))}
                </ul>
              </section>
            ))}
            {/* Order pagination — the server's nextCursor drives Load
                more; a failed page gets an honest retry, an exhausted
                history ends quietly. */}
            {hasNextPage || isFetchingNextPage || isFetchNextPageError ? (
              <div className="mt-6 flex justify-center">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isFetchingNextPage}
                  onClick={() => void fetchNextPage()}
                >
                  {isFetchingNextPage
                    ? 'Loading…'
                    : isFetchNextPageError
                      ? 'Couldn’t load more — try again'
                      : 'Load more'}
                </Button>
              </div>
            ) : null}
          </>
        )}
      </StateGate>

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
