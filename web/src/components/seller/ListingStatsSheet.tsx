'use client';

/**
 * ListingStatsSheet — per-listing analytics, opened from the management
 * table's stats column. Web port of the mobile AnalyticsListingDetail
 * sheet: the views → watchers → offers → sales funnel plus conversion
 * and time on market.
 *
 * Live mode reads /sellers/:id/analytics/listing/:id verbatim — intent
 * signal and price history render only when the server returns them.
 * Fixture mode computes the same fields from the fixture records and
 * discloses itself as demo rather than presenting sample counts as live
 * traffic.
 */

import { Sheet } from '@/components/ui/Sheet';
import { Skeleton } from '@/components/ui/Skeleton';
import { useListingStats } from '@/lib/hooks/seller-queries';
import { formatCount, formatDate, formatPrice } from '@/lib/utils/format';
import type { SellerListingAnalyticsApi } from '@/lib/api/services/sellerHub';
import type { ManagedListingRow } from './listingManagementModel';

/** Machine-readable intent → the seller-facing read (mobile copy parity). */
const INTENT_COPY: Record<
  NonNullable<SellerListingAnalyticsApi['intentSignal']>,
  string
> = {
  high_intent_price_friction:
    'Strong interest with price friction — a small drop or an offer to watchers usually converts it.',
  low_affinity_photo_needed:
    'Low affinity so far — a stronger cover photo is the usual fix.',
  healthy_velocity: 'Healthy velocity — selling pace looks normal for this price.',
  stale_reach: 'Reach has gone stale — a bump or a photo refresh resurfaces it.',
};

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-3">
      <dt className="text-body text-text-secondary">{label}</dt>
      <dd className="tnum text-body-emphasis font-semibold text-text-primary">{value}</dd>
    </div>
  );
}

export function ListingStatsSheet({
  row,
  onClose,
}: {
  /** Null keeps the sheet closed — the query stays disabled. */
  row: ManagedListingRow | null;
  onClose: () => void;
}) {
  const stats = useListingStats(row?.listing.id ?? null, '30d');

  return (
    <Sheet
      open={row != null}
      onClose={onClose}
      title={row ? `Stats — ${row.listing.title || 'Untitled'}` : undefined}
      ariaLabel={row ? undefined : 'Listing stats'}
      maxWidth={440}
    >
      <div className="px-5 py-5">
        {stats.isLoading ? (
          <div aria-busy aria-label="Loading listing stats" className="space-y-3">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        ) : stats.isError || !stats.data ? (
          <p className="text-body text-text-secondary">
            Stats aren&apos;t available for this listing yet — they build once it&apos;s had
            some traffic.
          </p>
        ) : (
          <>
            <p className="text-meta text-text-muted">Last 30 days</p>
            <dl className="mt-2 divide-y divide-border-subtle border-y border-border-subtle">
              <StatRow label="Views" value={formatCount(stats.data.views)} />
              <StatRow label="Watching" value={formatCount(stats.data.watchers)} />
              <StatRow label="Likes" value={formatCount(stats.data.likes)} />
              <StatRow label="Offers received" value={formatCount(stats.data.offers)} />
              <StatRow
                label="Sales"
                value={stats.data.purchases > 0 ? String(stats.data.purchases) : 'None yet'}
              />
              <StatRow
                label="View → sale conversion"
                value={
                  stats.data.conversionRate != null
                    ? `${stats.data.conversionRate.toFixed(1)}%`
                    : '—'
                }
              />
              <StatRow
                label="Time on market"
                value={`${stats.data.timeOnMarketDays} day${stats.data.timeOnMarketDays === 1 ? '' : 's'}`}
              />
            </dl>

            {stats.data.intentSignal ? (
              <p className="mt-4 text-caption text-text-secondary">
                {INTENT_COPY[stats.data.intentSignal]}
              </p>
            ) : null}

            {stats.data.priceHistory.length ? (
              <div className="mt-4">
                <p className="text-label font-semibold uppercase tracking-wider text-text-muted">
                  Price history
                </p>
                <ul className="mt-2 space-y-1.5">
                  {stats.data.priceHistory.map((p) => (
                    <li key={p.changedAt} className="tnum text-meta text-text-secondary">
                      {formatPrice(p.previousPrice)} → {formatPrice(p.newPrice)}
                      <span className="text-text-muted"> · {formatDate(p.changedAt)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {stats.data.demo ? (
              <p className="mt-4 text-meta text-text-muted">
                Demo mode — counts come from this device&apos;s sample data, not live traffic.
              </p>
            ) : null}
          </>
        )}
      </div>
    </Sheet>
  );
}
