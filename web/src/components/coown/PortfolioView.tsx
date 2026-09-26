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
import { useToast } from '@/components/ui/Toast';
import {
  useCancelCoOwnOrder,
  useCoOwnAssets,
  useCoOwnOrders,
  useCoOwnPositions,
  useDistributionReceipts,
  useDistributions,
} from '@/lib/hooks/coown-queries';
import { PortfolioSummary } from './PortfolioSummary';
import { PositionsTable, type PositionRow } from './PositionsTable';
import { OpenOrders } from './OpenOrders';
import { DistributionsTable } from './DistributionsTable';
import { PortfolioSkeleton } from './PortfolioSkeleton';

export function PortfolioView() {
  const router = useRouter();
  const assetsQ = useCoOwnAssets();
  const positionsQ = useCoOwnPositions();
  const ordersQ = useCoOwnOrders();
  const distributionsQ = useDistributions();
  const receiptsQ = useDistributionReceipts();
  const { cancelOrder: cancel } = useCancelCoOwnOrder();
  const { show } = useToast();

  const loading =
    assetsQ.isLoading ||
    positionsQ.isLoading ||
    ordersQ.isLoading ||
    distributionsQ.isLoading ||
    receiptsQ.isLoading;

  const titleFor = useMemo(() => {
    const map = new Map((assetsQ.data ?? []).map((a) => [a.id, a.title] as const));
    return (assetId: string) => map.get(assetId) ?? 'Unknown asset';
  }, [assetsQ.data]);

  const rows = useMemo<PositionRow[]>(() => {
    const byId = new Map((assetsQ.data ?? []).map((a) => [a.id, a] as const));
    const out: PositionRow[] = [];
    for (const position of positionsQ.data ?? []) {
      const asset = byId.get(position.assetId);
      if (!asset) continue;
      const value = position.units * asset.unitPriceGbp;
      const cost = position.units * position.avgEntryPriceGbp;
      out.push({
        position,
        asset,
        value,
        plGbp: value - cost,
        plPct: cost > 0 ? ((value - cost) / cost) * 100 : 0,
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
      .filter((r) => r.status === 'paid' && new Date(r.exDate).getFullYear() === year)
      .reduce((s, r) => s + r.totalGbp, 0);
    return { year, ytd };
  }, [receiptsQ.data]);

  const summary = useMemo(() => {
    const marketValue = rows.reduce((s, r) => s + r.value, 0);
    const cost = rows.reduce((s, r) => s + r.position.units * r.position.avgEntryPriceGbp, 0);
    const todayMove = rows.reduce(
      (s, r) => s + r.value * ((r.asset.marketMovePct24h ?? 0) / 100),
      0,
    );
    const realized = (positionsQ.data ?? []).reduce((s, p) => s + p.realizedProfitGbp, 0);
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

  // Resting orders only — cancelled rows leave this list (the cache marks
  // status 'cancelled'; a separate order history isn't part of this surface).
  const openOrders = useMemo(
    () => (ordersQ.data ?? []).filter((o) => o.status === 'open' || o.status === 'partially_filled'),
    [ordersQ.data],
  );

  const cancelOrder = async (id: string) => {
    const ok = await cancel(id);
    show(
      ok ? 'Order cancelled — unfilled units released' : "Couldn't cancel this order",
      ok ? 'success' : 'error',
    );
  };

  if (loading) return <PortfolioSkeleton />;

  if (assetsQ.isError || !assetsQ.data) {
    return (
      <EmptyState
        icon="wallet"
        title="Portfolio unavailable"
        subtitle="We couldn't load your Co-Own portfolio. Check your connection and try again."
        actionLabel="Retry"
        onAction={() => void assetsQ.refetch()}
      />
    );
  }

  const hasPositions = rows.length > 0;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-20 pt-8 sm:px-6 md:pt-10">
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

      {hasPositions ? <PortfolioSummary {...summary} /> : (
        <div className="mt-8 border-b border-border-subtle pb-8">
          <EmptyState
            icon="layers"
            title="No positions yet"
            subtitle="Buy units in any Co-Own market and your portfolio builds itself here."
            actionLabel="Browse markets"
            onAction={() => router.push('/co-own')}
          />
        </div>
      )}

      {hasPositions ? (
        <section className="mt-10">
          <h2 className="text-section-title font-semibold text-text-primary">Positions</h2>
          <div className="mt-4">
            <PositionsTable rows={rows} />
          </div>
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

      {(distributionsQ.data ?? []).length > 0 ? (
        <section className="mt-10">
          <DistributionsTable distributions={distributionsQ.data ?? []} assetTitle={titleFor} />
        </section>
      ) : null}
    </div>
  );
}
