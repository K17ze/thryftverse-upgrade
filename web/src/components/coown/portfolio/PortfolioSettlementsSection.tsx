'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useCoOwnSettlements } from '@/lib/hooks/coown-history-queries';
import type { CoOwnSettlement } from '@/lib/api/services/coownHistory';
import { formatDate, timeAgo } from '@/lib/utils/format';
import { gbp, signedGbp } from '../format';
import { PortfolioSectionState } from './PortfolioSectionState';

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

interface PortfolioSettlementsSectionProps {
  assetTitle: (assetId: string) => string;
}

export function PortfolioSettlementsSection({ assetTitle }: PortfolioSettlementsSectionProps) {
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

      <PortfolioSectionState
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
