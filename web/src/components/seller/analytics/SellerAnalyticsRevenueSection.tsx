import React from 'react';
import type { SellerAnalyticsView } from '@/lib/hooks/seller-queries';
import { MetricDelta } from '@/components/seller/MetricDelta';
import { LineChart } from '@/components/charts/LineChart';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatCount, formatPrice } from '@/lib/utils/format';
import { SectionTitle, shortDate } from './SellerAnalyticsPrimitives';

export function SellerAnalyticsRevenueSection({ data }: { data: SellerAnalyticsView }) {
  return (
    <section aria-labelledby="analytics-revenue">
      <div className="flex items-baseline justify-between gap-3">
        <SectionTitle>Revenue</SectionTitle>
        <span className="tnum flex items-baseline gap-2">
          <span className="text-price-list font-semibold text-text-primary">
            {formatPrice(data.revenueTotal)}
          </span>
          <MetricDelta delta={data.revenueDelta} />
        </span>
      </div>
      <div className="mt-4">
        {data.series.length ? (
          <LineChart
            points={data.series.map((p) => ({
              label: shortDate(p.date),
              value: p.revenue,
              hint: `${p.orders} order${p.orders === 1 ? '' : 's'}`,
            }))}
            formatValue={(v) => formatPrice(v)}
            ariaLabel={`Daily revenue, ${shortDate(data.range.from)} to ${shortDate(data.range.to)}`}
          />
        ) : (
          <EmptyState
            compact
            icon="analytics"
            title="No sales in this range"
            subtitle="Revenue appears here once orders land in the window."
          />
        )}
      </div>
      <dl className="mt-4 grid grid-cols-3 divide-x divide-border-subtle border-y border-border-subtle">
        {[
          { label: 'Orders', value: formatCount(data.ordersTotal) },
          { label: 'Avg sale', value: data.aov != null ? formatPrice(data.aov) : '—' },
          {
            label: 'View-to-sale',
            value: data.conversionPct != null ? `${data.conversionPct}%` : '—',
          },
        ].map((c) => (
          <div key={c.label} className="px-3 py-2.5 first:pl-0">
            <dt className="text-meta text-text-muted">{c.label}</dt>
            <dd className="tnum mt-0.5 text-body-emphasis font-semibold text-text-primary">
              {c.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
