'use client';

/**
 * Co-Own portfolio — orchestrator. Summary over positions, resting orders,
 * distribution history. Every number derives from the shared fixtures via
 * the coown query hooks; order cancellation goes through the shared
 * cancel mutation (fixture cache write / live POST).
 */

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { useSession } from '@/lib/session/SessionProvider';
import { coOwnMarkGbp } from '@/lib/contracts/coown';
import {
  useCoOwnAssets,
  useCoOwnOrders,
  useCoOwnPortfolioMeta,
  useCoOwnPositions,
  useDistributionReceipts,
  useMyIssuances,
} from '@/lib/hooks/coown-queries';
import {
  useCoOwnSettlements,
  useMyMarketHistory,
} from '@/lib/hooks/coown-history-queries';
import type {
  CoOwnSettlement,
  MarketHistoryChannelFilter,
  MarketHistoryItem,
} from '@/lib/api/services/coownHistory';
import { useCancelCoOwnOrder } from '@/components/trading/useCoOwnTrading';
import { formatDate, timeAgo } from '@/lib/utils/format';
import { PortfolioSummary } from './PortfolioSummary';
import { PositionsTable, type PositionRow } from './PositionsTable';
import { OpenOrders, OrderHistory } from './OpenOrders';
import { DistributionsTable } from './DistributionsTable';
import { PortfolioSkeleton } from './PortfolioSkeleton';
import { useEvaluateCoOwnAlerts } from './alertStore';
import { gbp, signedGbp } from './format';

export function PortfolioView() {
  const router = useRouter();
  const { isGuest, sessionLoading } = useSession();
  const assetsQ = useCoOwnAssets();
  const positionsQ = useCoOwnPositions();
  const ordersQ = useCoOwnOrders();
  const receiptsQ = useDistributionReceipts();
  const portfolioMetaQ = useCoOwnPortfolioMeta();
  const { cancelOrder: cancel } = useCancelCoOwnOrder();
  const { show } = useToast();
  // Session fills flow through the same assets snapshot — alerts evaluate
  // on this surface too, not only on the alerts page.
  useEvaluateCoOwnAlerts();

  const loading =
    assetsQ.isLoading ||
    positionsQ.isLoading ||
    ordersQ.isLoading ||
    receiptsQ.isLoading;

  const titleFor = useMemo(() => {
    const map = new Map((assetsQ.data ?? []).map((a) => [a.id, a.title] as const));
    return (assetId: string) => map.get(assetId) ?? 'Unknown asset';
  }, [assetsQ.data]);

  const rows = useMemo<PositionRow[]>(() => {
    const byId = new Map((assetsQ.data ?? []).map((a) => [a.id, a] as const));
    const out: PositionRow[] = [];
    for (const position of positionsQ.data ?? []) {
      // A full sell leaves a 0-unit row in the cache — realised P/L still
      // counts in the summary, but it is not a live holding.
      if (position.units <= 0) continue;
      const asset = byId.get(position.assetId);
      if (!asset) continue;
      // Prefer the server projection's own figures (live read) — mark,
      // market value, cost basis and unrealised P&L all come back
      // computed from the same mark basis. Fall back to the local mark
      // only when the row carries no projection fields (fixtures).
      const mark = position.markPriceGbp ?? coOwnMarkGbp(asset);
      const value = position.marketValueGbp ?? position.units * mark;
      const cost = position.costBasisGbp ?? position.units * position.avgEntryPriceGbp;
      const plGbp = position.unrealisedPnlGbp ?? value - cost;
      out.push({
        position,
        asset,
        value,
        plGbp,
        plPct: cost > 0 ? (plGbp / cost) * 100 : 0,
      });
    }
    return out.sort((a, b) => b.value - a.value);
  }, [assetsQ.data, positionsQ.data]);

  const income = useMemo(() => {
    const receipts = receiptsQ.data ?? [];
    // Fixture-anchored "now": the newest ex-date defines the income year.
    const year =
      receipts.length > 0 ? new Date(receipts[0]!.exDate).getFullYear() : new Date().getFullYear();
    const ytd = receipts
      .filter(
        (r) =>
          (r.status === 'settled' || r.status === 'paid') &&
          new Date(r.exDate).getFullYear() === year,
      )
      .reduce((s, r) => s + r.totalGbp, 0);
    return { year, ytd };
  }, [receiptsQ.data]);

  const summary = useMemo(() => {
    const marketValue = rows.reduce((s, r) => s + r.value, 0);
    // Derived from the row figures so the server's own cost basis /
    // unrealised split (live read) flows through unchanged.
    const cost = rows.reduce((s, r) => s + (r.value - r.plGbp), 0);
    const todayMove = rows.reduce(
      (s, r) => s + r.value * ((r.asset.marketMovePct24h ?? 0) / 100),
      0,
    );
    // The live projection reports no realised P&L — null stays null and
    // the summary renders '—' rather than a fabricated zero. Only when
    // every row reports a figure (fixture/session rows) does it sum.
    const positions = positionsQ.data ?? [];
    const realized =
      positions.length > 0 && positions.every((p) => p.realizedProfitGbp != null)
        ? positions.reduce((s, p) => s + p.realizedProfitGbp!, 0)
        : null;
    return {
      marketValue,
      cost,
      returnGbp: marketValue - cost,
      returnPct: cost > 0 ? ((marketValue - cost) / cost) * 100 : 0,
      todayMove,
      realized,
      incomeYtd: income.ytd,
      incomeYear: income.year,
      positions: rows.map((r) => ({
        id: r.asset.id,
        title: r.asset.title,
        value: r.value,
        pct: marketValue > 0 ? (r.value / marketValue) * 100 : 0,
      })),
    };
  }, [rows, positionsQ.data, income]);

  // Resting orders vs terminal ones — the cache marks 'filled' /
  // 'cancelled'; those surface below in the order history so a cancelled
  // order never just vanishes.
  const openOrders = useMemo(
    () => (ordersQ.data ?? []).filter((o) => o.status === 'open' || o.status === 'partially_filled'),
    [ordersQ.data],
  );
  const terminalOrders = useMemo(
    () => (ordersQ.data ?? []).filter((o) => o.status === 'filled' || o.status === 'cancelled'),
    [ordersQ.data],
  );

  const cancelOrder = async (id: string) => {
    try {
      const ok = await cancel(id);
      show(
        ok ? 'Order cancelled — unfilled units released' : "Couldn't cancel this order",
        ok ? 'success' : 'error',
      );
    } catch (err) {
      // Live mode throws — surface the backend's refusal verbatim.
      show(err instanceof Error ? err.message : "Couldn't cancel this order", 'error');
    }
  };

  if (sessionLoading || loading) return <PortfolioSkeleton />;

  // Positions and orders are account-bound — guests sign in rather than
  // read the demo identity's holdings.
  if (isGuest) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 pb-20 pt-8 sm:px-6 md:pt-10 lg:max-w-[1440px]">
        <EmptyState
          icon="layers"
          title="Sign in to see your portfolio"
          subtitle="Co-Own positions, orders and income live behind your account."
          actionLabel="Sign in"
          onAction={() => router.push('/auth')}
        />
      </div>
    );
  }

  if (assetsQ.isError || !assetsQ.data) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 pb-20 pt-8 sm:px-6 md:pt-10 lg:max-w-[1440px]">
        <EmptyState
          icon="wallet"
          title="Portfolio unavailable"
          subtitle="We couldn't load your Co-Own portfolio. Check your connection and try again."
          actionLabel="Retry"
          onAction={() => void assetsQ.refetch()}
        />
      </div>
    );
  }

  const hasPositions = rows.length > 0;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-20 pt-8 sm:px-6 md:pt-10 lg:max-w-[1440px]">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <h1 className="text-editorial-display text-text-primary">Portfolio</h1>
          <p className="mt-2 text-meta text-text-secondary">
            {hasPositions ? (
              <>
                <span className="tnum">{summary.positions.length}</span>{' '}
                {summary.positions.length === 1 ? 'position' : 'positions'} across the Co-Own market
              </>
            ) : (
              'Your fractional holdings, income and resting orders'
            )}
          </p>
        </div>
        <nav aria-label="Portfolio" className="flex items-center gap-5">
          <Link
            href="/co-own/distributions"
            className="text-body font-medium text-text-secondary underline-offset-4 hover:text-text-primary hover:underline"
          >
            Income history
          </Link>
          <Link
            href="/co-own/alerts"
            className="text-body font-medium text-text-secondary underline-offset-4 hover:text-text-primary hover:underline"
          >
            Alerts
          </Link>
          <Link
            href="/co-own"
            className="text-body font-medium text-text-secondary underline-offset-4 hover:text-text-primary hover:underline"
          >
            Markets
          </Link>
        </nav>
      </header>

      {/* Degraded read — the backend flagged the projection as partial,
          so the totals below may undercount. Say so, don't imply
          completeness. */}
      {portfolioMetaQ.data?.partial ? (
        <p
          role="status"
          className="mt-4 flex items-start gap-2 border-y border-warning-border bg-warning-subtle px-3 py-2.5 text-meta text-warning-text"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true">
            <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
          </svg>
          The portfolio read degraded — some holdings may be missing
          below. Retry in a moment.
        </p>
      ) : null}

      {/* A failed positions read must never collapse into the "No
          positions yet" empty state — a holder would be told they hold
          nothing. Each failed section renders its own inline error +
          retry; populated sections render alongside it when a stale
          read still carries rows. */}
      {hasPositions ? <PortfolioSummary {...summary} /> : null}

      <section className={hasPositions ? 'mt-10' : 'mt-8'} aria-label="Positions">
        <h2 className="text-section-title font-semibold text-text-primary">Positions</h2>
        {positionsQ.isError ? (
          <SectionState
            loading={positionsQ.isLoading}
            error
            onRetry={() => void positionsQ.refetch()}
            hasRows={hasPositions}
          />
        ) : null}
        {hasPositions ? (
          <div className="mt-4">
            <PositionsTable rows={rows} />
          </div>
        ) : positionsQ.isError ? null : (
          <div className="mt-4 border-b border-border-subtle pb-8">
            <EmptyState
              icon="layers"
              title="No positions yet"
              subtitle="Buy units in any Co-Own market and your portfolio builds itself here."
              actionLabel="Browse markets"
              onAction={() => router.push('/co-own')}
            />
          </div>
        )}
      </section>

      {ordersQ.isError ? (
        <section className="mt-10" aria-label="Orders">
          <SectionState
            loading={ordersQ.isLoading}
            error
            onRetry={() => void ordersQ.refetch()}
            hasRows={openOrders.length + terminalOrders.length > 0}
          />
        </section>
      ) : null}

      {openOrders.length > 0 ? (
        <section className="mt-10">
          <OpenOrders
            orders={openOrders}
            assetTitle={titleFor}
            onCancel={cancelOrder}
          />
        </section>
      ) : null}

      {terminalOrders.length > 0 ? (
        <section className="mt-10">
          <OrderHistory orders={terminalOrders} assetTitle={titleFor} />
        </section>
      ) : null}

      {/* The issuer's own markets — unsigned drafts live here too, so a
          market created but never signed is never orphaned. */}
      <IssuancesSection />

      {receiptsQ.isError ? (
        <section className="mt-10" aria-label="Distributions">
          <SectionState
            loading={receiptsQ.isLoading}
            error
            onRetry={() => void receiptsQ.refetch()}
            hasRows={(receiptsQ.data ?? []).length > 0}
          />
        </section>
      ) : null}

      {(receiptsQ.data ?? []).length > 0 ? (
        <section className="mt-10">
          <DistributionsTable receipts={receiptsQ.data ?? []} assetTitle={titleFor} />
        </section>
      ) : null}

      {/* Account-scoped ledgers — the viewer's own settlements and their
          cross-channel market activity. Both sections only mount for the
          signed-in viewer (the guest wall returns above); fixture mode
          has no dataset for either, so they render their honest empty
          state rather than seeded rows. */}
      <SettlementsSection assetTitle={titleFor} />
      <ActivitySection />
    </div>
  );
}

// ── Settlement ledger ────────────────────────────────────────────────
// GET /co-own/settlements — one row per matched trade the viewer was a
// party to. `role` is resolved server-side; the wire carries GBP majors
// only (no currency column). Net follows the trade accounting in
// coOwn.ts: a buyer pays notional + fee, a seller receives notional − fee.

const SETTLEMENT_STATUS: Record<
  string,
  { label: string; variant: 'success' | 'warning' | 'danger' | 'neutral' }
> = {
  settled: { label: 'Settled', variant: 'success' },
  pending: { label: 'Pending', variant: 'warning' },
  failed: { label: 'Failed', variant: 'danger' },
  reversed: { label: 'Reversed', variant: 'neutral' },
};

function settlementStatus(s: CoOwnSettlement) {
  return (
    SETTLEMENT_STATUS[s.settlementStatus] ?? {
      label: s.settlementStatus,
      variant: 'neutral' as const,
    }
  );
}

function settlementNetGbp(s: CoOwnSettlement): number {
  return s.role === 'buyer'
    ? -(s.notionalGbp + s.feeGbp)
    : Math.max(0, s.notionalGbp - s.feeGbp);
}

const SETTLEMENT_GRID =
  'hidden md:grid md:grid-cols-[minmax(0,1.6fr)_6rem_5rem_6.5rem_6rem_6rem]';

function SectionState({
  loading,
  error,
  onRetry,
  empty,
  hasRows,
}: {
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  /** Honest empty copy — omit where an empty section renders nothing. */
  empty?: string;
  hasRows: boolean;
}) {
  if (loading) {
    return (
      <div className="mt-4 space-y-1.5" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-12" />
        ))}
      </div>
    );
  }
  if (error) {
    return (
      <div className="mt-4 flex items-center justify-between gap-4 border-y border-border-subtle py-4">
        <p className="text-body text-text-secondary">Couldn’t load this section.</p>
        <Button size="sm" variant="outline" onClick={onRetry}>
          Retry
        </Button>
      </div>
    );
  }
  if (!hasRows) {
    return empty ? <p className="mt-4 text-body text-text-secondary">{empty}</p> : null;
  }
  return null;
}

// ── Issuances — markets the viewer issued, every tier ────────────────
// The public list hides 'preview' and 'delisted' rows; the backend lifts
// that gate for ?issuerId=self, so an unsigned draft (or a delisted
// market still under recourse) is always findable here.

const TIER_BADGE: Record<string, { label: string; variant: 'success' | 'warning' | 'neutral' }> = {
  preview: { label: 'Unsigned', variant: 'warning' },
  listed: { label: 'Live', variant: 'success' },
  badged: { label: 'Live', variant: 'success' },
  delisted: { label: 'Delisted', variant: 'neutral' },
};

function IssuancesSection() {
  const issuancesQ = useMyIssuances();
  const rows = issuancesQ.data ?? [];

  // Non-issuers have no surface here at all — an empty read is the
  // common case, not an empty state.
  if (!issuancesQ.isLoading && !issuancesQ.isError && rows.length === 0) {
    return null;
  }

  return (
    <section aria-labelledby="issuances-heading" className="mt-10">
      <div className="flex items-baseline justify-between">
        <h2 id="issuances-heading" className="text-section-title font-semibold text-text-primary">
          Markets you issued
        </h2>
        {rows.length > 0 ? (
          <p className="text-meta text-text-muted tnum">
            {rows.length} {rows.length === 1 ? 'market' : 'markets'}
          </p>
        ) : null}
      </div>

      <SectionState
        loading={issuancesQ.isLoading}
        error={issuancesQ.isError}
        onRetry={() => void issuancesQ.refetch()}
        hasRows={rows.length > 0}
      />

      {rows.length > 0 ? (
        <ul className="mt-4 divide-y divide-border-subtle border-y border-border-subtle">
          {rows.map((asset) => {
            const badge = TIER_BADGE[asset.listingTier ?? ''] ?? {
              label: 'Live',
              variant: 'success' as const,
            };
            return (
              <li key={asset.id}>
                <Link
                  href={`/co-own/${asset.id}`}
                  className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 px-1 py-3 pressable"
                >
                  <div className="min-w-0">
                    <p className="clamp-1 text-body font-semibold text-text-primary">
                      {asset.title}
                    </p>
                    <p className="mt-0.5 text-meta text-text-secondary tnum">
                      {asset.availableUnits} of {asset.totalUnits} units ·{' '}
                      {gbp(asset.unitPriceGbp)} each
                      {asset.listingTier === 'preview'
                        ? ' — needs your recourse signature'
                        : ''}
                    </p>
                  </div>
                  <Badge variant={badge.variant}>{badge.label}</Badge>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}

function SettlementsSection({ assetTitle }: { assetTitle: (assetId: string) => string }) {
  const settlementsQ = useCoOwnSettlements();
  const settlements = useMemo(
    () => settlementsQ.data?.pages.flatMap((p) => p.items) ?? [],
    [settlementsQ.data],
  );

  return (
    <section aria-labelledby="settlements-heading" className="mt-10">
      <div className="flex items-baseline justify-between">
        <h2 id="settlements-heading" className="text-section-title font-semibold text-text-primary">
          Settlements
        </h2>
        {settlements.length > 0 ? (
          <p className="text-meta text-text-muted tnum">
            {settlements.length} {settlements.length === 1 ? 'trade' : 'trades'}
          </p>
        ) : null}
      </div>

      <SectionState
        loading={settlementsQ.isLoading}
        error={settlementsQ.isError}
        onRetry={() => void settlementsQ.refetch()}
        hasRows={settlements.length > 0}
        empty="No settlements yet — once a co-own order of yours fills, the clearing record lands here."
      />

      {settlements.length > 0 ? (
        <>
          <div className={`${SETTLEMENT_GRID} mt-4 gap-4 border-b border-border-subtle px-1 pb-2`}>
            <span className="text-micro font-semibold uppercase tracking-[0.08em] text-text-muted">Asset</span>
            <span className="text-right text-micro font-semibold uppercase tracking-[0.08em] text-text-muted">Gross</span>
            <span className="text-right text-micro font-semibold uppercase tracking-[0.08em] text-text-muted">Fee</span>
            <span className="text-right text-micro font-semibold uppercase tracking-[0.08em] text-text-muted">Net</span>
            <span className="text-micro font-semibold uppercase tracking-[0.08em] text-text-muted">Status</span>
            <span className="text-right text-micro font-semibold uppercase tracking-[0.08em] text-text-muted">Settled</span>
          </div>
          <ul className="divide-y divide-border-subtle">
            {settlements.map((s) => {
              const status = settlementStatus(s);
              const net = settlementNetGbp(s);
              return (
                <li key={s.id}>
                  {/* Mobile */}
                  <div className="flex items-start justify-between gap-3 py-4 md:hidden">
                    <div className="min-w-0">
                      <Link
                        href={`/co-own/${s.assetId}`}
                        className="pressable clamp-1 block text-body-emphasis font-semibold text-text-primary"
                      >
                        {assetTitle(s.assetId)}
                      </Link>
                      <p className="mt-0.5 text-meta text-text-secondary tnum">
                        {s.role === 'buyer' ? 'Bought' : 'Sold'} {s.units}{' '}
                        {s.units === 1 ? 'unit' : 'units'} @ {gbp(s.unitPriceGbp)} · fee{' '}
                        {gbp(s.feeGbp)}
                      </p>
                      <p className="mt-0.5 text-meta text-text-muted tnum">
                        {s.settledAt ? `Settled ${formatDate(s.settledAt)}` : `Placed ${timeAgo(s.createdAt)}`}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-body-emphasis text-text-primary tnum">{signedGbp(net)}</p>
                      <Badge variant={status.variant} className="mt-1">
                        {status.label}
                      </Badge>
                    </div>
                  </div>
                  {/* Desktop */}
                  <div className={`${SETTLEMENT_GRID} hidden items-center gap-4 px-1 py-3.5 md:grid`}>
                    <div className="min-w-0">
                      <Link
                        href={`/co-own/${s.assetId}`}
                        className="pressable clamp-1 block text-body-emphasis font-semibold text-text-primary"
                      >
                        {assetTitle(s.assetId)}
                      </Link>
                      <p className="mt-0.5 text-meta text-text-muted tnum">
                        {s.role === 'buyer' ? 'Bought' : 'Sold'} {s.units}{' '}
                        {s.units === 1 ? 'unit' : 'units'} @ {gbp(s.unitPriceGbp)}
                      </p>
                    </div>
                    <p className="text-right text-body text-text-secondary tnum">{gbp(s.notionalGbp)}</p>
                    <p className="text-right text-body text-text-secondary tnum">{gbp(s.feeGbp)}</p>
                    <p className="text-right text-body-emphasis text-text-primary tnum">{signedGbp(net)}</p>
                    <p>
                      <Badge variant={status.variant}>{status.label}</Badge>
                    </p>
                    <p className="text-right text-body text-text-secondary tnum">
                      {s.settledAt ? formatDate(s.settledAt) : '—'}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
          {settlementsQ.hasNextPage ||
          settlementsQ.isFetchingNextPage ||
          settlementsQ.isFetchNextPageError ? (
            <div className="mt-4 flex justify-center pb-2">
              <Button
                variant="outline"
                size="sm"
                disabled={settlementsQ.isFetchingNextPage}
                onClick={() => void settlementsQ.fetchNextPage()}
              >
                {settlementsQ.isFetchingNextPage
                  ? 'Loading…'
                  : settlementsQ.isFetchNextPageError
                    ? 'Couldn’t load more — try again'
                    : 'Load more'}
              </Button>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

// ── Your activity ─────────────────────────────────────────────────────
// GET /users/:id/market-history — the viewer's own orders and auction
// bids in one feed. `note` carries the joined asset/listing title;
// auction bid rows carry no order status, so they render without one.

const ACTION_LABEL: Record<MarketHistoryItem['action'], string> = {
  'buy-units': 'Bought units',
  'sell-units': 'Sold units',
  bid: 'Auction bid',
};

const HISTORY_STATUS: Record<
  string,
  { label: string; variant: 'success' | 'warning' | 'danger' | 'neutral' }
> = {
  open: { label: 'Open', variant: 'neutral' },
  partially_filled: { label: 'Part filled', variant: 'warning' },
  filled: { label: 'Filled', variant: 'success' },
  cancelled: { label: 'Cancelled', variant: 'neutral' },
  rejected: { label: 'Rejected', variant: 'danger' },
};

function ActivitySection() {
  const [channel, setChannel] = useState<MarketHistoryChannelFilter>('all');
  const historyQ = useMyMarketHistory(channel);
  const items = useMemo(
    () => historyQ.data?.pages.flatMap((p) => p.items) ?? [],
    [historyQ.data],
  );

  // The Auctions chip only disappears once the complete 'all' read
  // proves the viewer has no auction rows — an unloaded tail can't
  // prove absence, so the chip stays until then. And a filter over a
  // provably empty history is meaningless chrome — the chips hide until
  // there's something to filter (a non-'all' selection keeps them so the
  // viewer can always get back to All).
  const historyComplete = historyQ.data != null && !historyQ.hasNextPage;
  const hasAuctionRows = items.some((i) => i.channel === 'auction');
  const showChips = channel !== 'all' || !historyComplete || items.length > 0;
  const showAuctionChip = channel !== 'all' || !historyComplete || hasAuctionRows;

  return (
    <section aria-labelledby="activity-heading" className="mt-10">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-3">
        <h2 id="activity-heading" className="text-section-title font-semibold text-text-primary">
          Your activity
        </h2>
        {showChips ? (
          <div className="flex gap-2" role="group" aria-label="Filter by channel">
            <Chip selected={channel === 'all'} onClick={() => setChannel('all')}>
              All
            </Chip>
            <Chip selected={channel === 'co-own'} onClick={() => setChannel('co-own')}>
              Co-Own
            </Chip>
            {showAuctionChip ? (
              <Chip selected={channel === 'auction'} onClick={() => setChannel('auction')}>
                Auctions
              </Chip>
            ) : null}
          </div>
        ) : null}
      </div>

      <SectionState
        loading={historyQ.isLoading}
        error={historyQ.isError}
        onRetry={() => void historyQ.refetch()}
        hasRows={items.length > 0}
        empty={
          channel === 'auction'
            ? 'No auction bids yet — bids you place land here.'
            : channel === 'co-own'
              ? 'No co-own orders yet — orders you place land here.'
              : 'No market activity yet — co-own orders and auction bids land here.'
        }
      />

      {items.length > 0 ? (
        <>
          <ul className="mt-3 divide-y divide-border-subtle border-y border-border-subtle">
            {items.map((item) => {
              const href =
                item.channel === 'auction'
                  ? `/auctions/${item.referenceId}`
                  : `/co-own/${item.referenceId}`;
              const status = item.status ? HISTORY_STATUS[item.status] : null;
              return (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 px-1 py-3"
                >
                  <div className="min-w-0">
                    <p className="clamp-1 text-body font-semibold text-text-primary">
                      <Link href={href} className="pressable">
                        {item.note ?? (item.channel === 'auction' ? 'Auction' : 'Market')}
                      </Link>
                    </p>
                    <p className="mt-0.5 text-meta text-text-secondary tnum">
                      {ACTION_LABEL[item.action]}
                      {item.units != null
                        ? ` · ${item.units} ${item.units === 1 ? 'unit' : 'units'}${
                            item.unitPriceGbp != null ? ` @ ${gbp(item.unitPriceGbp)}` : ''
                          }`
                        : ''}
                      {item.status === 'partially_filled' && item.filledUnits != null
                        ? ` — ${item.filledUnits} filled`
                        : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="text-body text-text-primary tnum">{gbp(item.amountGbp)}</span>
                    {status ? <Badge variant={status.variant}>{status.label}</Badge> : null}
                    <span className="text-meta text-text-muted tnum">{timeAgo(item.timestamp)}</span>
                  </div>
                </li>
              );
            })}
          </ul>
          {historyQ.hasNextPage || historyQ.isFetchingNextPage || historyQ.isFetchNextPageError ? (
            <div className="mt-4 flex justify-center pb-2">
              <Button
                variant="outline"
                size="sm"
                disabled={historyQ.isFetchingNextPage}
                onClick={() => void historyQ.fetchNextPage()}
              >
                {historyQ.isFetchingNextPage
                  ? 'Loading…'
                  : historyQ.isFetchNextPageError
                    ? 'Couldn’t load more — try again'
                    : 'Load more'}
              </Button>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
