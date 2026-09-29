'use client';

/**
 * /co-own/[id] orchestrator — market header, price panel + order book on the
 * left, sticky trade composer on the right, tabs below, related rail, risk
 * band. Mobile collapses the composer into a sticky dock + Sheet.
 *
 * All market data — orders included — comes from the shared coown hooks,
 * and every write (place, cancel) routes through the trading mutation in
 * components/trading, so this surface and Portfolio always agree.
 */

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Tabs } from '@/components/ui/Tabs';
import { Icon } from '@/components/ui/Icon';
import { Sheet } from '@/components/ui/Sheet';
import { useToast } from '@/components/ui/Toast';
import { useCancelCoOwnOrder } from '@/components/trading/useCoOwnTrading';
import type { PriceWindow } from '@/lib/contracts/coown';
import { coOwnMarkGbp } from '@/lib/contracts/coown';
import {
  useCoOwnActivity,
  useCoOwnAsset,
  useCoOwnAssets,
  useCoOwnOrders,
  useCoOwnPositions,
  useDistributions,
  useDueDiligence,
  useGovernanceActions,
  useMarketLedger,
  useOrderBook,
  usePriceHistory,
} from '@/lib/hooks/coown-queries';
import { gbp } from '../format';
import { useCoOwnWatchlist } from '@/lib/store/coownWatchlist';
import { useHydrated } from '@/lib/store/useStore';
import { useOnlineStatus } from '@/lib/offline';
import { useCoOwnOrderBookStream } from '@/lib/realtime/useCoOwnOrderBookStream';
import { useCoOwnAlertsApi, useEvaluateCoOwnAlerts } from '../alertStore';
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
  const { data: allOrders } = useCoOwnOrders();
  const { data: activity } = useCoOwnActivity(id);
  const { data: ledger } = useMarketLedger(id);
  const { data: diligence } = useDueDiligence(id);
  const { data: distributions } = useDistributions(id);
  // Governance overlay — persisted ballots fold into each row so the
  // activity list shows the recorded vote, not the raw fixture.
  const { data: actions } = useGovernanceActions(id);
  const { data: allAssets } = useCoOwnAssets();
  const hydrated = useHydrated();
  // Live order book — SSE deltas write through the same query cache the
  // REST snapshot owns, so every consumer (ladder, composer, spread band)
  // stays in step without prop plumbing.
  useCoOwnOrderBookStream(id);
  const { isOffline } = useOnlineStatus();
  // Mode-aware: server-persisted alerts in live mode, the device store
  // under fixtures — `ready` plays the hydration role for both.
  const { alerts, ready: alertsReady } = useCoOwnAlertsApi();
  const hasAlert = alertsReady && alerts.some((a) => a.assetId === id && a.active);
  const storedWatching = useCoOwnWatchlist((s) => s.watchedIds.includes(id));
  const toggleWatch = useCoOwnWatchlist((s) => s.toggleWatch);
  const watching = hydrated && storedWatching;
  // Fixture-mode evaluator — no-op when the server owns evaluation.
  useEvaluateCoOwnAlerts();

  const [tab, setTab] = useState<Tab>('overview');
  const [prefill, setPrefill] = useState<TradePrefill | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [alertSheetOpen, setAlertSheetOpen] = useState(false);
  const seq = useRef(0);
  const { show } = useToast();
  const { cancelOrder } = useCancelCoOwnOrder();

  // Resting orders for this market — read straight from the shared cache
  // so the list stays in step with Portfolio and open-orders surfaces.
  const orders = (allOrders ?? []).filter(
    (o) => o.assetId === id && (o.status === 'open' || o.status === 'partially_filled'),
  );

  const position = positions?.find((p) => p.assetId === id) ?? null;

  const cancel = async (orderId: string) => {
    try {
      const ok = await cancelOrder(orderId);
      show(ok ? 'Order cancelled — remainder released' : 'Could not cancel that order', ok ? 'info' : 'error');
    } catch (err) {
      // Live mode throws — the backend's refusal (locked, not yours,
      // already filled) is the message worth showing.
      show(err instanceof Error ? err.message : 'Could not cancel that order', 'error');
    }
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
      prefill={prefill}
    />
  );

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-44 pt-6 sm:px-6 md:pb-16 md:pt-8 lg:max-w-[1440px]">
      <MarketHeader
        asset={asset}
        alertActive={hasAlert}
        onOpenAlert={() => setAlertSheetOpen(true)}
        watched={watching}
        onToggleWatch={() => toggleWatch(id)}
        actions={<AssetActionsMenu asset={asset} />}
      />

      {/* Per-surface state strips — offline and book reconciliation.
          The book is the most price-sensitive surface on the page, so a
          stale or offline book says so rather than reading as fresh. */}
      {isOffline ? (
        <p
          role="status"
          className="mt-4 flex items-start gap-2 border-y border-warning-border bg-warning-subtle px-3 py-2.5 text-meta text-warning-text"
        >
          <Icon name="warning" size={14} className="mt-0.5 shrink-0" />
          You&rsquo;re offline — prices and the order book are the last
          snapshot, and orders can&rsquo;t be placed until you reconnect.
        </p>
      ) : book?.reconciliationState === 'reconciling' ? (
        <p
          role="status"
          className="mt-4 flex items-start gap-2 border-y border-warning-border bg-warning-subtle px-3 py-2.5 text-meta text-warning-text"
        >
          <Icon name="warning" size={14} className="mt-0.5 shrink-0" />
          The book is reconciling — the ladder below may be a few seconds
          behind live fills.
        </p>
      ) : book?.reconciliationState === 'break' ? (
        <p
          role="status"
          className="mt-4 flex items-start gap-2 border-y border-danger-border bg-danger-subtle px-3 py-2.5 text-meta text-danger-text"
        >
          <Icon name="warning" size={14} className="mt-0.5 shrink-0" />
          Live updates dropped — the book is resyncing from the server.
          Treat the ladder below as indicative until it reconnects.
        </p>
      ) : null}

      {/* Contract trading surface: fluid chart/book column + fixed 400px
          sticky trade rail at lg. Mobile keeps the stacked order with the
          fixed bottom dock. */}
      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="min-w-0">
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

          {orders.length > 0 ? (
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
                        {o.status === 'open'
                          ? 'Open'
                          : `Partial — ${o.filledUnits} of ${o.units} filled`}
                      </span>
                      <Button size="sm" variant="outline" onClick={() => void cancel(o.id)}>
                        Cancel
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>

        <aside className="min-w-0">
          <div className="lg:sticky lg:top-24">{tradePanel}</div>
        </aside>
      </div>

      <section className="mt-14" aria-label="Asset details">
        <Tabs<Tab>
          tabs={TABS.map((t) => ({ key: t.value, label: t.label }))}
          active={tab}
          onChange={setTab}
          ariaLabel="Asset details"
          className="-mx-4 sm:-mx-6"
          railClassName="px-1 sm:px-3"
        />

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

      {/* Concierge line — same posture as the mobile asset footer: a
          human-readable route into support, anchored to this market. */}
      <p className="mt-8 flex items-start gap-2 text-meta text-text-muted">
        <Icon name="chat" size={15} className="mt-0.5 shrink-0" />
        <span>
          Questions about this market?{' '}
          <Link
            href="/support"
            className="font-medium text-text-secondary underline-offset-4 hover:text-text-primary hover:underline"
          >
            Talk to support
          </Link>
          {' '}or{' '}
          <Link
            href={`/co-own/${asset.id}/issue`}
            className="font-medium text-text-secondary underline-offset-4 hover:text-text-primary hover:underline"
          >
            report an issue
          </Link>
          .
        </span>
      </p>

      {/* Mobile trade dock — price + entry point; the composer lives in the Sheet */}
      <div
        className="fixed inset-x-0 z-sticky border-t border-border-subtle bg-header/95 backdrop-blur-xl md:hidden"
        style={{ bottom: 'calc(68px + env(safe-area-inset-bottom))' }}
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="text-body-emphasis font-semibold text-text-primary tnum">
              {gbp(coOwnMarkGbp(asset))}
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
