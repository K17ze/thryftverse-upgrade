'use client';

/**
 * /co-own/[id] orchestrator — market header, price panel + order book on the
 * left, sticky trade composer on the right, tabs below, related rail, risk
 * band. Mobile collapses the composer into a sticky dock + Sheet.
 * Factored into domain subcomponents:
 * - useAssetDetailWorkflow: realtime stream, queries, watchlist, alert evaluator
 * - AssetRestingOrders: resting orders with 2-tap cancel confirm
 * - AssetMobileTradeDock: mobile dock with price, 24h pill, and action trigger
 */

import Link from 'next/link';
import { EmptyState } from '@/components/ui/EmptyState';
import { Tabs, tabId, tabPanelId } from '@/components/ui/Tabs';
import { Icon } from '@/components/ui/Icon';
import { Sheet } from '@/components/ui/Sheet';
import { CreateAlertSheet } from '../CreateAlertSheet';
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
import { DelistedPanel, PausedNotice, PreviewPanel, TradePanel } from './TradePanel';
import { TABS, useAssetDetailWorkflow } from './useAssetDetailWorkflow';
import { AssetRestingOrders } from './AssetRestingOrders';
import { AssetMobileTradeDock } from './AssetMobileTradeDock';

export function AssetDetailView({ id }: { id: string }) {
  const workflow = useAssetDetailWorkflow(id);
  const {
    router,
    asset,
    isLoading,
    isError,
    book,
    range,
    setRange,
    history,
    dayHistory,
    position,
    orders,
    activity,
    ledger,
    diligence,
    distributions,
    actions,
    allAssets,
    isOffline,
    hasAlert,
    watching,
    toggleWatch,
    tab,
    setTab,
    tabsId,
    prefill,
    composerOpen,
    setComposerOpen,
    alertSheetOpen,
    setAlertSheetOpen,
    confirmingId,
    setConfirmingId,
    cancellingId,
    cancel,
    pickLevel,
    halted,
    preview,
    delisted,
    isIssuer,
  } = workflow;

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

  const tradePanel = halted ? (
    <PausedNotice exitUnderway={asset.marketStatus === 'closed'} />
  ) : preview ? (
    <PreviewPanel asset={asset} isIssuer={isIssuer} />
  ) : delisted ? (
    <DelistedPanel />
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

      {/* Per-surface state strips — offline and book reconciliation */}
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

      {/* Contract trading surface: chart/book column + sticky trade rail */}
      <div className="mt-8 grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_400px]">
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

          <AssetRestingOrders
            orders={orders}
            confirmingId={confirmingId}
            cancellingId={cancellingId}
            onConfirmId={setConfirmingId}
            onCancel={cancel}
          />
        </div>

        <aside className="hidden min-w-0 md:block">
          <div className="lg:sticky lg:top-24">{tradePanel}</div>
        </aside>
      </div>

      <section className="mt-14" aria-label="Asset details">
        <Tabs
          tabs={TABS.map((t) => ({ key: t.value, label: t.label }))}
          active={tab}
          onChange={setTab}
          ariaLabel="Asset details"
          idBase={tabsId}
          className="-mx-4 sm:-mx-6"
          railClassName="px-1 sm:px-3"
        />

        <div
          role="tabpanel"
          id={tabPanelId(tabsId, tab)}
          aria-labelledby={tabId(tabsId, tab)}
          className="mt-7"
        >
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

      {/* Concierge line */}
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

      {/* Mobile trade dock */}
      <AssetMobileTradeDock
        asset={asset}
        halted={halted}
        preview={preview}
        delisted={delisted}
        isIssuer={isIssuer}
        onOpenComposer={() => setComposerOpen(true)}
      />

      <Sheet
        open={composerOpen}
        onClose={() => setComposerOpen(false)}
        title={
          halted
            ? 'Market halted'
            : preview
              ? isIssuer
                ? 'Take your market live'
                : 'Not live yet'
              : delisted
                ? 'Delisted'
                : `Trade ${asset.title}`
        }
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
