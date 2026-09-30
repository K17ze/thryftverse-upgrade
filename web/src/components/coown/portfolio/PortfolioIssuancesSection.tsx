'use client';

import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { useMyIssuances } from '@/lib/hooks/coown-queries';
import { gbp } from '../format';
import { PortfolioSectionState } from './PortfolioSectionState';

const TIER_BADGE: Record<string, { label: string; variant: 'success' | 'warning' | 'neutral' }> = {
  preview: { label: 'Unsigned', variant: 'warning' },
  listed: { label: 'Live', variant: 'success' },
  badged: { label: 'Live', variant: 'success' },
  delisted: { label: 'Delisted', variant: 'neutral' },
};

export function PortfolioIssuancesSection() {
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

      <PortfolioSectionState
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
