'use client';

/**
 * CoOwnOrdersView — the viewer's complete Co-Own order ledger, the web
 * counterpart of native's CoOwnOrderHistory screen (deep-link target
 * `co-own/orders`). Two honest data planes:
 *
 *  - Open/resting orders — the my-orders fan-out, cancellable with the
 *    shared armed-confirm grammar (OpenOrders).
 *  - Order history — the canonical market-history feed, channel
 *    'co-own', keyset-paged; titles come from the wire `note` join so
 *    rows for assets that never loaded still read correctly.
 *
 * `?order=<id>` highlights a just-submitted order (native lands the user
 * on the order they just placed — TradePanel receipts link here the same
 * way). Side chips filter both planes client-side; the history channel
 * is already server-scoped to co-own.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { DATA_MODE } from '@/lib/api/client';
import { useSession } from '@/lib/session/SessionProvider';
import { useCoOwnOrders, useCoOwnAssets } from '@/lib/hooks/coown-queries';
import { useMyMarketHistory } from '@/lib/hooks/coown-history-queries';
import { useCancelCoOwnOrder } from '@/components/trading/useCoOwnTrading';
import { useToast } from '@/components/ui/Toast';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import type { MarketHistoryItem } from '@/lib/api/services/coownHistory';
import { timeAgo } from '@/lib/utils/format';
import { OpenOrders } from './OpenOrders';
import { gbp } from './format';

type SideFilter = 'all' | 'buy' | 'sell';

const SIDE_TONE = { buy: 'text-coown-up', sell: 'text-coown-down' } as const;
const TYPE_LABEL = {
  limit: 'Limit',
  market: 'Market',
  protected_market: 'Protected',
} as const;
const STATUS_LABEL: Record<string, string> = {
  open: 'Open',
  partially_filled: 'Part filled',
  filled: 'Filled',
  cancelled: 'Cancelled',
  rejected: 'Refused',
};

const FILTER_OPTIONS: { key: SideFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'buy', label: 'Buys' },
  { key: 'sell', label: 'Sells' },
];

function historySide(item: MarketHistoryItem): 'buy' | 'sell' | null {
  return item.action === 'buy-units' ? 'buy' : item.action === 'sell-units' ? 'sell' : null;
}

function HistoryRow({
  item,
  highlighted,
}: {
  item: MarketHistoryItem;
  highlighted: boolean;
}) {
  const side = historySide(item);
  const title = item.note ?? 'Co-Own asset';
  return (
    <li
      id={`order-${item.orderId ?? item.id}`}
      className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 px-1 py-3 ${
        highlighted ? 'bg-row -mx-1 px-2' : ''
      }`}
    >
      <div className="min-w-0">
        <Link
          href={`/co-own/${item.referenceId}`}
          className="clamp-1 block text-body font-semibold text-text-primary underline-offset-4 hover:underline"
        >
          {title}
        </Link>
        <p className="mt-0.5 text-meta text-text-secondary tnum">
          {side ? (
            <span className={`font-semibold ${SIDE_TONE[side]}`}>
              {side === 'buy' ? 'Buy' : 'Sell'}
            </span>
          ) : null}
          {item.orderType ? ` · ${TYPE_LABEL[item.orderType]}` : ''}
          {item.units != null
            ? ` · ${item.units} ${item.units === 1 ? 'unit' : 'units'}`
            : ''}
          {item.unitPriceGbp != null ? ` @ ${gbp(item.unitPriceGbp)}` : ''}
          {item.filledUnits != null && item.units != null && item.filledUnits !== item.units
            ? ` — ${item.filledUnits} filled`
            : ''}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {item.status ? (
          <Badge variant={item.status === 'filled' ? 'success' : 'neutral'}>
            {STATUS_LABEL[item.status] ?? item.status}
          </Badge>
        ) : null}
        <span className="text-meta text-text-muted tnum">{timeAgo(item.timestamp)}</span>
      </div>
    </li>
  );
}

export function CoOwnOrdersView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isGuest, sessionLoading } = useSession();
  const { show } = useToast();
  const { cancelOrder } = useCancelCoOwnOrder();
  const highlight = searchParams.get('order');
  const [side, setSide] = useState<SideFilter>('all');

  const ordersQ = useCoOwnOrders();
  const assetsQ = useCoOwnAssets();
  const historyQ = useMyMarketHistory('co-own');

  const live = DATA_MODE === 'live';

  // Titles for open-order rows — the fan-out knows its assets; history
  // rows carry their own `note` join so this map only needs to cover
  // whatever the orders fan-out can reach.
  const titleFor = useMemo(() => {
    const map = new Map((assetsQ.data ?? []).map((a) => [a.id, a.title] as const));
    return (assetId: string) => map.get(assetId) ?? 'Co-Own asset';
  }, [assetsQ.data]);

  const openOrders = useMemo(
    () =>
      (ordersQ.data ?? []).filter(
        (o) =>
          (o.status === 'open' || o.status === 'partially_filled') &&
          (side === 'all' || o.side === side),
      ),
    [ordersQ.data, side],
  );
  const terminalOrders = useMemo(
    () =>
      (ordersQ.data ?? []).filter(
        (o) =>
          o.status !== 'open' &&
          o.status !== 'partially_filled' &&
          (side === 'all' || o.side === side),
      ),
    [ordersQ.data, side],
  );
  const historyItems = useMemo(() => {
    const flat = (historyQ.data?.pages ?? []).flatMap((p) => p.items);
    return side === 'all' ? flat : flat.filter((i) => historySide(i) === side);
  }, [historyQ.data, side]);

  // Scroll the just-placed order into view once its list resolves.
  const scrolledRef = useRef(false);
  useEffect(() => {
    if (!highlight || scrolledRef.current) return;
    if (ordersQ.data === undefined && historyQ.data === undefined) return;
    scrolledRef.current = true;
    const el = document.getElementById(`order-${highlight}`);
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [highlight, ordersQ.data, historyQ.data]);

  const onCancel = async (id: string) => {
    const ok = await cancelOrder(id);
    if (!ok) show('Could not cancel the order — try again.', 'error');
    else show('Order cancelled', 'success');
  };

  if (sessionLoading) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
        <Skeleton className="h-7 w-44" />
        <Skeleton className="mt-4 h-4 w-72" />
        <Skeleton className="mt-8 h-40 w-full" />
      </div>
    );
  }

  if (live && (isGuest || !user)) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
        <EmptyState
          icon="lock"
          title="Sign in to see your orders"
          subtitle="Your Co-Own orders live on your account — sign in to view them."
          actionLabel="Sign in"
          onAction={() => router.push('/auth')}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-20 pt-8 sm:px-6 md:pt-10">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <h1 className="text-editorial-display text-text-primary">Your orders</h1>
          <p className="mt-2 text-meta text-text-secondary">
            Every Co-Own order on your account — resting buys and sells you can
            still act on, then the settled record.
          </p>
        </div>
        <nav aria-label="Co-Own" className="flex items-center gap-5">
          <Link
            href="/co-own"
            className="text-body font-medium text-text-secondary underline-offset-4 hover:text-text-primary hover:underline"
          >
            Markets
          </Link>
          <Link
            href="/co-own/portfolio"
            className="text-body font-medium text-text-secondary underline-offset-4 hover:text-text-primary hover:underline"
          >
            Portfolio
          </Link>
        </nav>
      </header>

      {/* Side chips — filter resting orders and the history feed together. */}
      <div className="mt-6 flex items-center gap-2" role="group" aria-label="Filter by side">
        {FILTER_OPTIONS.map((opt) => {
          const active = side === opt.key;
          return (
            <button
              key={opt.key}
              type="button"
              aria-pressed={active}
              onClick={() => setSide(opt.key)}
              className={`pressable rounded-full border px-3.5 py-1.5 text-caption font-medium transition-colors ${
                active
                  ? 'border-brand bg-brand text-text-inverse'
                  : 'border-border text-text-secondary hover:border-border-strong hover:text-text-primary'
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      <div className="mt-8 flex flex-col gap-10">
        <section aria-labelledby="open-orders-heading">
          <div className="flex items-baseline justify-between">
            <h2 id="open-orders-heading" className="text-section-title font-semibold text-text-primary">
              Open orders
            </h2>
            <p className="text-meta text-text-muted tnum">{openOrders.length} resting</p>
          </div>
          {ordersQ.isLoading ? (
            <div className="mt-3 flex flex-col gap-2" aria-busy>
              {[0, 1].map((i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : ordersQ.isError ? (
            <div className="mt-3 flex items-center justify-between border-y border-border-subtle py-4">
              <p className="text-body text-text-secondary">Couldn&apos;t load your orders.</p>
              <Button size="sm" variant="secondary" onClick={() => ordersQ.refetch()}>
                Retry
              </Button>
            </div>
          ) : openOrders.length === 0 ? (
            <p className="mt-3 border-y border-border-subtle py-4 text-body text-text-secondary">
              {side === 'all'
                ? 'Nothing resting — a limit or protected order that hasn\u2019t filled sits here.'
                : `No open ${side} orders.`}
            </p>
          ) : (
            <OpenOrders
              orders={openOrders}
              assetTitle={(id) =>
                openOrders.find((o) => o.assetId === id)?.assetTitle ?? titleFor(id)
              }
              onCancel={onCancel}
            />
          )}
        </section>

        {/* Terminal rows from the my-orders fan-out (fixture seeds and any
            session orders the fan-out captured) ride beside the canonical
            history feed — deduped by order id below. */}
        <section aria-labelledby="order-history-heading">
          <div className="flex items-baseline justify-between">
            <h2 id="order-history-heading" className="text-section-title font-semibold text-text-primary">
              Order history
            </h2>
          </div>
          {historyQ.isPending && ordersQ.isLoading ? (
            <div className="mt-3 flex flex-col gap-2" aria-busy>
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : historyItems.length === 0 && terminalOrders.length === 0 ? (
            historyQ.isError ? (
              <div className="mt-3 flex items-center justify-between border-y border-border-subtle py-4">
                <p className="text-body text-text-secondary">Couldn&apos;t load your order history.</p>
                <Button size="sm" variant="secondary" onClick={() => historyQ.refetch()}>
                  Retry
                </Button>
              </div>
            ) : (
              <EmptyState
                icon="receipt"
                title="No order history yet"
                subtitle="Filled, part-filled and cancelled orders land here once the market matches them."
                actionLabel="Browse markets"
                onAction={() => router.push('/co-own')}
                compact
              />
            )
          ) : (
            <>
              {/* Fan-out terminal rows the history feed can't cover yet
                  (fixture seeds, orders on assets outside the feed). */}
              {terminalOrders.length > 0 ? (
                <ul className="mt-3 divide-y divide-border-subtle border-y border-border-subtle">
                  {terminalOrders
                    .slice()
                    .sort((a, b) => b.placedAt.localeCompare(a.placedAt))
                    .map((order) => (
                      <HistoryRow
                        key={`o-${order.id}`}
                        item={{
                          id: `coOwn_order_${order.id}`,
                          orderId: Number(order.id) || null,
                          channel: 'co-own',
                          action: order.side === 'buy' ? 'buy-units' : 'sell-units',
                          referenceId: order.assetId,
                          amountGbp: order.totalGbp,
                          units: order.units,
                          filledUnits: order.filledUnits,
                          remainingUnits: order.units - order.filledUnits,
                          unitPriceGbp: order.unitPriceGbp,
                          feeGbp: order.feeGbp,
                          status: order.status,
                          orderType: order.orderType,
                          note: order.assetTitle ?? titleFor(order.assetId),
                          timestamp: order.placedAt,
                        }}
                        highlighted={String(order.id) === highlight}
                      />
                    ))}
                </ul>
              ) : null}
              {historyItems.length > 0 ? (
                <ul
                  className={`divide-y divide-border-subtle border-b border-border-subtle ${
                    terminalOrders.length === 0 ? 'mt-3 border-t' : ''
                  }`}
                >
                  {historyItems.map((item) => (
                    <HistoryRow
                      key={item.id}
                      item={item}
                      highlighted={
                        String(item.orderId ?? '') === highlight || item.id === highlight
                      }
                    />
                  ))}
                </ul>
              ) : null}
              {historyQ.hasNextPage || historyQ.isFetchingNextPage || historyQ.isError ? (
                <div className="mt-4">
                  {historyQ.isError && historyItems.length > 0 ? (
                    <div className="flex items-center justify-between border-b border-border-subtle pb-4">
                      <p className="text-body text-text-secondary">Couldn&apos;t load more history.</p>
                      <Button size="sm" variant="secondary" onClick={() => historyQ.fetchNextPage()}>
                        Retry
                      </Button>
                    </div>
                  ) : historyQ.hasNextPage ? (
                    <Button
                      variant="secondary"
                      onClick={() => historyQ.fetchNextPage()}
                      disabled={historyQ.isFetchingNextPage}
                    >
                      {historyQ.isFetchingNextPage ? 'Loading…' : 'Load older orders'}
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
