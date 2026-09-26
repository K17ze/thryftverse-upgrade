'use client';

/**
 * /co-own/[id] orchestrator — market header, price panel + order book on the
 * left, sticky trade composer on the right, tabs below, related rail, risk
 * band. Mobile collapses the composer into a sticky dock + Sheet.
 *
 * All market data comes from the shared coown hooks; order placement and
 * cancellation are session-local mutations with toast feedback.
 */

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { Sheet } from '@/components/ui/Sheet';
import { useToast } from '@/components/ui/Toast';
import type { CoOwnOrder, PriceWindow } from '@/lib/contracts/coown';
import {
  useCoOwnActivity,
  useCoOwnAsset,
  useCoOwnAssets,
  useCoOwnOrders,
  useCoOwnPositions,
  useCorporateActions,
  useDistributions,
  useDueDiligence,
  useMarketLedger,
  useOrderBook,
  usePriceHistory,
} from '@/lib/hooks/coown-queries';
import { gbp } from '../format';
import { useCoOwnWatchlist } from '@/lib/store/coownWatchlist';
import { useHydrated } from '@/lib/store/useStore';
import { useCoOwnAlerts } from '../alertStore';
import { CreateAlertSheet } from '../CreateAlertSheet';
import { MovePill } from '../MovePill';
import { ActivityTab } from './ActivityTab';
import { AssetActionsMenu } from './AssetActionsMenu';
import { AssetDetailSkeleton } from './AssetDetailSkeleton';
import { MarketHeader } from './MarketHeader';
import { OrderBookPanel } from './OrderBookPanel';
import { OverviewTab } from './OverviewTab';
import { OwnershipTab } from './OwnershipTab';
import { PricePanel } from './PricePanel';
import { RelatedAssets } from './RelatedAssets';
import { RiskDisclosure } from './RiskDisclosure';
import { PausedNotice, TradePanel, type TradePrefill } from './TradePanel';

type Tab = 'overview' | 'ownership' | 'activity';

const TABS: { value: Tab; label: string }[] = [
  { value: 'overview', label: 'Overview' },
  { value: 'ownership', label: 'Ownership' },
  { value: 'activity', label: 'Activity' },
];

export function AssetDetailView({ id }: { id: string }) {
  const router = useRouter();
  const { data: asset, isLoading, isError } = useCoOwnAsset(id);
  const { data: book } = useOrderBook(id);
  const [range, setRange] = useState<PriceWindow>('1D');
  const { data: history } = usePriceHistory(id, range);
  // The day-range stat reads its own 1D slice so it stays honest when the
  // chart is zoomed out to a wider window.
  const { data: dayHistory } = usePriceHistory(id, '1D');
  const { data: positions } = useCoOwnPositions();
  const { data: fetchedOrders } = useCoOwnOrders();
  const { data: activity } = useCoOwnActivity(id);
  const { data: ledger } = useMarketLedger(id);
  const { data: diligence } = useDueDiligence(id);
  const { data: distributions } = useDistributions(id);
  const { data: actions } = useCorporateActions(id);
  const { data: allAssets } = useCoOwnAssets();
  const hydrated = useHydrated();
  // Persisted read — gate behind hydration so SSR and first paint agree.
  const storedHasAlert = useCoOwnAlerts((s) =>
    s.alerts.some((a) => a.assetId === id && a.active),
  );
  const hasAlert = hydrated && storedHasAlert;
  const storedWatching = useCoOwnWatchlist((s) => s.watchedIds.includes(id));
  const toggleWatch = useCoOwnWatchlist((s) => s.toggleWatch);
  const watching = hydrated && storedWatching;

  const [tab, setTab] = useState<Tab>('overview');
  const [orders, setOrders] = useState<CoOwnOrder[] | null>(null);
  const [prefill, setPrefill] = useState<TradePrefill | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [alertSheetOpen, setAlertSheetOpen] = useState(false);
  const seq = useRef(0);
  const { show } = useToast();

  useEffect(() => {
    if (fetchedOrders) setOrders(fetchedOrders.filter((o) => o.assetId === id));
  }, [fetchedOrders, id]);

  const position = positions?.find((p) => p.assetId === id) ?? null;

  const placeOrder = (order: CoOwnOrder) => {
    setOrders((prev) => [order, ...(prev ?? [])]);
    show(
      `Order resting — ${order.side === 'buy' ? 'Buy' : 'Sell'} ${order.units} @ £${order.unitPriceGbp.toFixed(2)}`,
      'success',
    );
  };

  const cancelOrder = (orderId: string) => {
    setOrders((prev) => (prev ? prev.filter((o) => o.id !== orderId) : prev));
    show('Order cancelled', 'info');
  };

  const pickLevel = (price: number, side: 'buy' | 'sell') => {
    setPrefill({ price, side, seq: ++seq.current });
    setComposerOpen(true);
  };

  if (isLoading) return <AssetDetailSkeleton />;

  if (isError || !asset) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
        <EmptyState
          icon="alert"
          title="Asset not found"
          subtitle="This market doesn't exist or is no longer listed."
          actionLabel="Back to markets"
          onAction={() => router.push('/co-own')}
        />
      </div>
    );
  }

  const halted = asset.marketStatus === 'paused' || asset.marketStatus === 'closed';

  const tradePanel = halted ? (
    <PausedNotice exitUnderway={asset.marketStatus === 'closed'} />
  ) : (
    <TradePanel
      asset={asset}
      bids={book?.bids ?? []}
      asks={book?.asks ?? []}
      position={position}
      onPlaced={placeOrder}
      prefill={prefill}
    />
  );

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-44 pt-6 sm:px-6 md:pb-16 md:pt-8">
      <MarketHeader
        asset={asset}
        alertActive={hasAlert}
        onOpenAlert={() => setAlertSheetOpen(true)}
        watched={watching}
        onToggleWatch={() => toggleWatch(id)}
        actions={<AssetActionsMenu asset={asset} />}
      />

      <div className="mt-8 grid gap-10 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <PricePanel
            asset={asset}
            book={book ?? null}
            history={history}
            dayHistory={dayHistory}
            window={range}
            onWindowChange={setRange}
          />

          <div className="mt-10">
            <OrderBookPanel
              book={book}
              lastPrice={ledger?.[0]?.unitPriceGbp ?? null}
              trades={ledger}
              onPickLevel={pickLevel}
            />
          </div>

          {orders != null && orders.length > 0 ? (
            <section className="mt-10" aria-labelledby="resting-heading">
              <div className="flex items-baseline justify-between">
                <h2
                  id="resting-heading"
                  className="text-micro font-semibold uppercase tracking-[0.08em] text-text-muted"
                >
                  Your resting orders
                </h2>
                <p className="text-meta text-text-muted tnum">{orders.length}</p>
              </div>
              <ul className="mt-3 divide-y divide-border-subtle border-y border-border-subtle">
                {orders.map((o) => (
                  <li
                    key={o.id}
                    className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3"
                  >
                    <p className="text-body text-text-primary tnum">
                      <span
                        className={`font-semibold ${o.side === 'buy' ? 'text-coown-up' : 'text-coown-down'}`}
                      >
                        {o.side === 'buy' ? 'Buy' : 'Sell'}
                      </span>
                      <span className="text-text-secondary">
                        {' '}
                        · {o.orderType === 'limit' ? 'Limit' : o.orderType === 'market' ? 'Market' : 'Protected'} ·{' '}
                        {gbp(o.unitPriceGbp)} · {o.units} {o.units === 1 ? 'unit' : 'units'}
                      </span>
                    </p>
                    <div className="flex items-center gap-3">
                      <span className="text-meta text-text-muted">
                        {o.status === 'open' ? 'Open' : o.status}
                      </span>
                      <Button size="sm" variant="outline" onClick={() => cancelOrder(o.id)}>
                        Cancel
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>

        <aside className="lg:col-span-5">
          <div className="lg:sticky lg:top-24">{tradePanel}</div>
        </aside>
      </div>

      <section className="mt-14" aria-label="Asset details">
        <div
          role="tablist"
          aria-label="Asset details"
          className="no-scrollbar -mx-4 flex gap-6 overflow-x-auto border-b border-border-subtle px-4 sm:mx-0 sm:px-0"
        >
          {TABS.map((t) => (
            <button
              key={t.value}
              role="tab"
              aria-selected={tab === t.value}
              onClick={() => setTab(t.value)}
              className={`pressable relative shrink-0 pb-3 text-body-emphasis ${
                tab === t.value
                  ? 'font-semibold text-text-primary'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {t.label}
              {tab === t.value ? (
                <span aria-hidden="true" className="absolute inset-x-0 -bottom-px h-0.5 bg-text-primary" />
              ) : null}
            </button>
          ))}
        </div>

        <div role="tabpanel" className="mt-7">
          {tab === 'overview' ? <OverviewTab asset={asset} diligence={diligence} /> : null}
          {tab === 'ownership' ? <OwnershipTab asset={asset} position={position} /> : null}
          {tab === 'activity' ? (
            <ActivityTab
              events={activity}
              ledger={ledger}
              distributions={distributions}
              actions={actions}
            />
          ) : null}
        </div>
      </section>

      <div className="mt-14">
        <RelatedAssets assets={allAssets ?? []} currentId={id} />
      </div>

      <RiskDisclosure />

      {/* Mobile trade dock — price + entry point; the composer lives in the Sheet */}
      <div
        className="fixed inset-x-0 z-sticky border-t border-border-subtle bg-header/95 backdrop-blur-xl md:hidden"
        style={{ bottom: 'calc(68px + env(safe-area-inset-bottom))' }}
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="text-body-emphasis font-semibold text-text-primary tnum">
              {gbp(asset.unitPriceGbp)}
            </p>
            <MovePill pct={asset.marketMovePct24h} className="mt-0.5" />
          </div>
          {halted ? (
            <span className="inline-flex items-center gap-1.5 text-meta font-semibold text-warning-text">
              <Icon name="pause" size={16} />
              {asset.marketStatus === 'closed' ? 'Exit underway' : 'Paused'}
            </span>
          ) : (
            <Button onClick={() => setComposerOpen(true)}>Trade</Button>
          )}
        </div>
      </div>

      <Sheet
        open={composerOpen}
        onClose={() => setComposerOpen(false)}
        title={halted ? 'Market halted' : `Trade ${asset.title}`}
        maxWidth={520}
      >
        <div className="p-5">{tradePanel}</div>
      </Sheet>

      <Sheet
        open={alertSheetOpen}
        onClose={() => setAlertSheetOpen(false)}
        title="Price alert"
        maxWidth={440}
      >
        <CreateAlertSheet asset={asset} onClose={() => setAlertSheetOpen(false)} />
      </Sheet>
    </div>
  );
}
