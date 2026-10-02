'use client';

/**
 * Co-Own portfolio — orchestrator. Summary over positions, resting orders,
 * distribution history. Every number derives from the shared fixtures via
 * the coown query hooks; order cancellation goes through the shared
 * cancel mutation (fixture cache write / live POST).
 */

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
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
import { useCancelCoOwnOrder } from '@/components/trading/useCoOwnTrading';
import { PortfolioSummary } from './PortfolioSummary';
import type { PositionRow } from './PositionsTable';
import { DistributionsTable } from './DistributionsTable';
import { PortfolioSkeleton } from './PortfolioSkeleton';
import { useEvaluateCoOwnAlerts } from './alertStore';
import { PortfolioPositionsSection } from './portfolio/PortfolioPositionsSection';
import { PortfolioOrdersSection } from './portfolio/PortfolioOrdersSection';
import { PortfolioIssuancesSection } from './portfolio/PortfolioIssuancesSection';
import { PortfolioSettlementsSection } from './portfolio/PortfolioSettlementsSection';
import { PortfolioActivitySection } from './portfolio/PortfolioActivitySection';
import { PortfolioSectionState } from './portfolio/PortfolioSectionState';

export function PortfolioView() {
  const router = useRouter();
  const { isGuest, sessionLoading } = useSession();
  const assetsQ = useCoOwnAssets();
  const positionsQ = useCoOwnPositions();
  const ordersQ = useCoOwnOrders();
  const receiptsQ = useDistributionReceipts();
  const portfolioMetaQ = useCoOwnPortfolioMeta();
  // Subscribed here only so the rail's section index knows whether the
  // issuances block mounts — the section itself reads the same cached
  // query, so this is a shared subscription, not a second fetch.
  const issuancesQ = useMyIssuances();
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

  // The rail's section index — every link points at a block that is
  // actually mounted below, so the conditional sections mirror their
  // own render conditions (issuances hide entirely for non-issuers,
  // income only exists once receipts land or the read fails).
  const showOrders = openOrders.length + terminalOrders.length > 0 || ordersQ.isError;
  const showIssuances =
    issuancesQ.isLoading || issuancesQ.isError || (issuancesQ.data ?? []).length > 0;
  const showIncome = receiptsQ.isError || (receiptsQ.data ?? []).length > 0;
  const sectionLinks: { id: string; label: string }[] = [
    { id: 'portfolio-positions', label: 'Positions' },
    ...(showOrders ? [{ id: 'portfolio-orders', label: 'Orders' }] : []),
    ...(showIssuances ? [{ id: 'portfolio-issuances', label: 'Issued markets' }] : []),
    ...(showIncome ? [{ id: 'portfolio-income', label: 'Income' }] : []),
    { id: 'portfolio-settlements', label: 'Settlements' },
    { id: 'portfolio-activity', label: 'Activity' },
  ];

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

      {/* Degraded read — the backend flagged the projection as partial */}
      {portfolioMetaQ.data?.partial ? (
        <p
          role="status"
          className="mt-4 flex items-start gap-2 border-y border-warning-border bg-warning-subtle px-3 py-2.5 text-meta text-warning-text"
        >
          <Icon name="warning" size={14} className="mt-0.5 shrink-0" />
          The portfolio read degraded — some holdings may be missing
          below. Retry in a moment.
        </p>
      ) : null}

      {/* lg composition — the summary plus a section index pin to a
          sticky 360px rail; the sections form the main column. The rail
          is DOM-first so mobile keeps its summary → sections flow. */}
      <div className="lg:grid lg:grid-cols-[360px_minmax(0,1fr)] lg:gap-x-12">
        <aside className="lg:sticky lg:top-24 lg:mt-10 lg:self-start">
          {hasPositions ? <PortfolioSummary {...summary} /> : null}
          <nav
            aria-label="Portfolio sections"
            className={`hidden lg:block ${
              hasPositions ? 'mt-8 border-t border-border-subtle pt-5' : ''
            }`}
          >
            <ul className="space-y-2.5">
              {sectionLinks.map((l) => (
                <li key={l.id}>
                  <a
                    href={`#${l.id}`}
                    className="pressable text-meta text-text-secondary underline-offset-4 transition-colors hover:text-text-primary hover:underline"
                  >
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </aside>

        <div className="min-w-0">
          <div id="portfolio-positions" className="scroll-mt-24">
            <PortfolioPositionsSection
              rows={rows}
              hasPositions={hasPositions}
              isError={positionsQ.isError}
              isLoading={positionsQ.isLoading}
              onRetry={() => void positionsQ.refetch()}
            />
          </div>

          <div id="portfolio-orders" className="scroll-mt-24">
            <PortfolioOrdersSection
              openOrders={openOrders}
              terminalOrders={terminalOrders}
              titleFor={titleFor}
              onCancelOrder={cancelOrder}
              isError={ordersQ.isError}
              isLoading={ordersQ.isLoading}
              onRetry={() => void ordersQ.refetch()}
            />
          </div>

          {/* The issuer's own markets */}
          <div id="portfolio-issuances" className="scroll-mt-24">
            <PortfolioIssuancesSection />
          </div>

          <div id="portfolio-income" className="scroll-mt-24">
            {receiptsQ.isError ? (
              <section className="mt-10" aria-label="Distributions">
                <PortfolioSectionState
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
          </div>

          {/* Account-scoped ledgers */}
          <div id="portfolio-settlements" className="scroll-mt-24">
            <PortfolioSettlementsSection assetTitle={titleFor} />
          </div>
          <div id="portfolio-activity" className="scroll-mt-24">
            <PortfolioActivitySection />
          </div>
        </div>
      </div>
    </div>
  );
}
