'use client';

import { MetricDelta } from '@/components/seller/MetricDelta';
import type { SellerOverview } from '@/lib/hooks/seller-queries';
import type { SellerPeriod, SellerMetric } from '@/lib/data/fixtures-seller';
import { formatCount } from '@/lib/utils/format';

interface SellerMetricsGridProps {
  overview: SellerOverview;
  period: SellerPeriod;
}

/** Quiet unit context for metrics whose denominator isn't self-evident —
 *  same inline grammar as the `· est.` marker. Conversion is orders per
 *  listing view, which reads small against raw view counts. */
const METRIC_CONTEXT: Partial<Record<SellerMetric['key'], string>> = {
  conversion: 'of listing views',
};

export function SellerMetricsGrid({ overview, period }: SellerMetricsGridProps) {
  return (
    <section aria-label="Performance metrics" className="mt-10">
      <div className="grid grid-cols-2 gap-px bg-border-subtle sm:grid-cols-5">
        {overview.metrics.map((m: SellerMetric) => (
          <div key={m.key} className="bg-background p-4">
            <p className="text-label text-text-muted">
              {m.label}
              {m.estimated ? (
                <span className="ml-1 normal-case tracking-normal">· est.</span>
              ) : null}
              {METRIC_CONTEXT[m.key] ? (
                <span className="ml-1 normal-case tracking-normal">
                  · {METRIC_CONTEXT[m.key]}
                </span>
              ) : null}
            </p>
            <p className="tnum mt-1.5 text-price-list font-semibold text-text-primary">
              {m.value}
            </p>
            <div className="mt-1">
              <MetricDelta delta={m.delta} />
            </div>
          </div>
        ))}
      </div>

      {/* The funnel the metrics report — same numbers, in order.
          Offers are real offer records; a failed live fetch is an
          honest "—", never an interpolated count. */}
      <p className="tnum mt-3 text-meta text-text-muted">
        <span className="font-semibold text-text-secondary">
          {period === '7d' ? '7-day' : period === '90d' ? '90-day' : '30-day'} funnel
        </span>
        {' — '}
        {formatCount(overview.funnel.views)} views ·{' '}
        {formatCount(overview.funnel.watchers)} watching ·{' '}
        {overview.funnel.offers != null
          ? `${formatCount(overview.funnel.offers)} offers`
          : '— offers'}{' '}
        · {formatCount(overview.funnel.orders)} sold
      </p>
      {overview.metrics.some((m: SellerMetric) => m.estimated) ? (
        <p className="mt-1.5 text-meta text-text-muted">
          Watchers is estimated from saves — demo telemetry, not a measured count.
        </p>
      ) : null}
    </section>
  );
}
