'use client';

/**
 * CoOwnOrdersView — the viewer's complete Co-Own order ledger.
 * Factored into domain subcomponents:
 * - CoOwnOrdersPrimitives: side tones, type/status labels, desktop grid tracks, HistoryRow
 * - useCoOwnOrdersWorkflow: queries, side filter, open/terminal/history derivations, highlight scrolling
 */

import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { OpenOrders } from './OpenOrders';
import {
  FILTER_OPTIONS,
  HEAD_CELL,
  HISTORY_GRID,
  HistoryRow,
} from './orders/CoOwnOrdersPrimitives';
import { useCoOwnOrdersWorkflow } from './orders/useCoOwnOrdersWorkflow';

export function CoOwnOrdersView() {
  const workflow = useCoOwnOrdersWorkflow();
  const {
    router,
    user,
    isGuest,
    sessionLoading,
    live,
    side,
    setSide,
    ordersQ,
    historyQ,
    titleFor,
    openOrders,
    terminalOrders,
    historyItems,
    highlight,
    onCancel,
  } = workflow;

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
    <div className="mx-auto w-full max-w-5xl px-4 pb-20 pt-8 sm:px-6 md:pt-10 lg:max-w-[1200px]">
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
        {FILTER_OPTIONS.map((opt) => (
          <Chip
            key={opt.key}
            selected={side === opt.key}
            onClick={() => setSide(opt.key)}
          >
            {opt.label}
          </Chip>
        ))}
      </div>

      <div className="mt-8 flex flex-col gap-10">
        {ordersQ.isLoading || ordersQ.isError || openOrders.length === 0 ? (
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
            ) : (
              <p className="mt-3 border-y border-border-subtle py-4 text-body text-text-secondary">
                {side === 'all'
                  ? 'Nothing resting — a limit or protected order that hasn\u2019t filled sits here.'
                  : `No open ${side} orders.`}
              </p>
            )}
          </section>
        ) : (
          <OpenOrders
            orders={openOrders}
            assetTitle={(id) =>
              openOrders.find((o) => o.assetId === id)?.assetTitle ?? titleFor(id)
            }
            onCancel={onCancel}
          />
        )}

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
              <div
                aria-hidden="true"
                className={`mt-3 hidden lg:grid ${HISTORY_GRID} lg:gap-x-5 border-y border-border-subtle px-1 py-2`}
              >
                <span className={HEAD_CELL}>Asset</span>
                <span className={HEAD_CELL}>Side</span>
                <span className={HEAD_CELL}>Type</span>
                <span className={`${HEAD_CELL} text-right`}>Units</span>
                <span className={`${HEAD_CELL} text-right`}>Price</span>
                <span className={`${HEAD_CELL} text-right`}>Status</span>
                <span className={`${HEAD_CELL} text-right`}>Placed</span>
              </div>

              {terminalOrders.length > 0 ? (
                <ul className="mt-3 divide-y divide-border-subtle border-y border-border-subtle lg:mt-0 lg:border-t-0">
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
                    terminalOrders.length === 0 ? 'mt-3 border-t lg:mt-0 lg:border-t-0' : ''
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
