import React from 'react';
import type { SellerAnalyticsView } from '@/lib/hooks/seller-queries';
import { BarChart } from '@/components/charts/BarChart';
import { DATA_MODE } from '@/lib/api/client';
import { formatCount, formatPrice } from '@/lib/utils/format';
import { SectionTitle } from './SellerAnalyticsPrimitives';

export function SellerAnalyticsBreakdownSection({ data }: { data: SellerAnalyticsView }) {
  return (
    <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-10 xl:gap-16">
      {/* Category mix — real inventory grouped by category. The live
          contract doesn't carry it, so live mode says so rather than
          faking a split. */}
      <section className="mt-10" aria-labelledby="analytics-mix">
        <SectionTitle>Category mix</SectionTitle>
        <div className="mt-4">
          {data.categoryMix == null ? (
            <p className="text-body text-text-muted">
              Category breakdown isn&rsquo;t part of the live analytics feed yet.
            </p>
          ) : data.categoryMix.length ? (
            <BarChart
              bars={data.categoryMix.map((c) => ({
                label: c.label,
                value: c.items,
                hint: `${c.sharePct}% · ${formatPrice(c.valueGbp)}`,
              }))}
              formatValue={(v) => `${v} item${v === 1 ? '' : 's'}`}
              ariaLabel="Items per category"
            />
          ) : (
            <p className="text-body text-text-muted">No inventory to split yet.</p>
          )}
        </div>
      </section>

      {/* Repeat buyers — cohort-style: distinct buyers, how many came
          back for a second order. */}
      <section className="mt-10" aria-labelledby="analytics-repeat">
        <SectionTitle>Repeat buyers</SectionTitle>
        <div className="mt-4">
          {data.repeatBuyers == null ? (
            <p className="text-body text-text-muted">
              {DATA_MODE === 'live'
                ? 'Repeat-buyer cohorts aren’t part of the live analytics feed yet.'
                : 'No orders yet — the repeat-buyer read fills in after your first sales.'}
            </p>
          ) : (
            <dl className="grid grid-cols-3 divide-x divide-border-subtle border-y border-border-subtle">
              {[
                { label: 'Buyers', value: formatCount(data.repeatBuyers.buyers) },
                {
                  label: 'Came back',
                  value:
                    data.repeatBuyers.repeatSharePct != null
                      ? `${data.repeatBuyers.repeatSharePct}%`
                      : '—',
                },
                {
                  label: 'Of orders',
                  value:
                    data.repeatBuyers.repeatOrderSharePct != null
                      ? `${data.repeatBuyers.repeatOrderSharePct}%`
                      : '—',
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
          )}
        </div>
      </section>
    </div>
  );
}
