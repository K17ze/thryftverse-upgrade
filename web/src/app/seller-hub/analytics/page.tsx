'use client';

/**
 * /seller-hub/analytics — the seller analytics read (mobile
 * SellerAnalyticsScreen parity). Real aggregates only: revenue over the
 * selected range (LineChart), the demand funnel (views → likes → offers →
 * orders), category mix over real inventory (BarChart), and the
 * repeat-buyer cohort stat. Preset ranges resolve to exact ISO windows; a
 * custom range is a real slice of the same data — clamped windows disclose
 * rather than imply deeper history.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { SellerSectionNav } from '@/components/seller/SellerSectionNav';
import { MetricDelta } from '@/components/seller/MetricDelta';
import { BarChart } from '@/components/charts/BarChart';
import { LineChart } from '@/components/charts/LineChart';
import { AppImage } from '@/components/ui/AppImage';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { Sheet } from '@/components/ui/Sheet';
import { Skeleton } from '@/components/ui/Skeleton';
import {
  useFulfilmentCounts,
  useNeedsAttention,
  useSellerAnalytics,
  type SellerAnalyticsRange,
} from '@/lib/hooks/seller-queries';
import { DATA_MODE } from '@/lib/api/client';
import { formatCount, formatPrice } from '@/lib/utils/format';

type Preset = '7d' | '30d' | '90d' | 'custom';

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

function presetRange(preset: Exclude<Preset, 'custom'>): SellerAnalyticsRange {
  const days = preset === '7d' ? 7 : preset === '30d' ? 30 : 90;
  const to = new Date();
  const from = new Date(to.getTime() - (days - 1) * 86_400_000);
  return { from: isoDay(from), to: isoDay(to) };
}

const shortDate = (iso: string) =>
  new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-section-title font-semibold text-text-primary">{children}</h2>
  );
}

/** Funnel row — bar scaled to the first stage, step % from the stage
 *  above; the honest stage names stay visible. */
function FunnelRow({
  label,
  value,
  widthPct,
  stepPct,
}: {
  label: string;
  value: number | null;
  widthPct: number;
  stepPct: number | null;
}) {
  return (
    <li>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-body text-text-primary">{label}</span>
        <span className="tnum text-meta text-text-secondary">
          {value != null ? formatCount(value) : '—'}
          {stepPct != null ? (
            <span className="text-text-muted"> · {stepPct}% of stage above</span>
          ) : null}
        </span>
      </div>
      <div className="mt-1 h-1.5 w-full rounded-full bg-surface-alt" aria-hidden="true">
        <div
          className="h-full rounded-full bg-brand"
          style={{ width: `${Math.max(1.5, widthPct)}%` }}
        />
      </div>
    </li>
  );
}

export default function SellerAnalyticsPage() {
  const counts = useFulfilmentCounts();
  const [preset, setPreset] = useState<Preset>('30d');
  const [customSheet, setCustomSheet] = useState(false);
  const [customDraft, setCustomDraft] = useState<SellerAnalyticsRange>(() =>
    presetRange('30d'),
  );
  const [customRange, setCustomRange] = useState<SellerAnalyticsRange | null>(null);
  const [customError, setCustomError] = useState<string | null>(null);

  const range = useMemo<SellerAnalyticsRange>(
    () => (preset === 'custom' && customRange ? customRange : presetRange(preset === 'custom' ? '30d' : preset)),
    [preset, customRange],
  );
  const analytics = useSellerAnalytics(range);
  // Under-reach list — the server's analytics/attention verdict read
  // against this exact window (custom ranges ride as startDate/endDate).
  const attention = useNeedsAttention(range);

  const applyCustom = () => {
    const { from, to } = customDraft;
    if (!from || !to) {
      setCustomError('Pick both dates');
      return;
    }
    if (from > to) {
      setCustomError('Start must be before the end date');
      return;
    }
    setCustomError(null);
    setCustomRange({ from, to });
    setPreset('custom');
    setCustomSheet(false);
  };

  const a = analytics.data;
  const funnelBase = a && a.viewsTotal > 0 ? a.viewsTotal : null;
  const stepPct = (num: number | null, den: number | null) =>
    num != null && den != null && den > 0
      ? Math.round((num / den) * 1000) / 10
      : null;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-16 pt-8 sm:px-6 md:pt-12 lg:max-w-[1440px]">
      <h1 className="text-screen-title text-text-primary">Analytics</h1>
      <SellerSectionNav toPost={counts.toPost} posted={counts.posted} />

      {/* Range selector — presets are exact windows; custom opens a
          bounded picker so nothing implies history that doesn't exist. */}
      <div className="mt-6 flex flex-wrap items-center gap-1.5" role="group" aria-label="Date range">
        {(['7d', '30d', '90d'] as const).map((p) => (
          <Chip key={p} selected={preset === p} onClick={() => setPreset(p)}>
            {p === '7d' ? '7 days' : p === '30d' ? '30 days' : '90 days'}
          </Chip>
        ))}
        <Chip
          selected={preset === 'custom'}
          onClick={() => {
            setCustomDraft(range);
            setCustomError(null);
            setCustomSheet(true);
          }}
        >
          Custom
        </Chip>
        <span className="tnum ml-1 text-meta text-text-muted">
          {a ? `${shortDate(a.range.from)} – ${shortDate(a.range.to)}` : ''}
          {a?.clamped ? ' · clamped to available history' : ''}
        </span>
      </div>

      {analytics.isLoading ? (
        <div className="mt-8 space-y-8" aria-busy aria-label="Loading analytics">
          <Skeleton className="h-48 w-full rounded-md" />
          <Skeleton className="h-40 w-full rounded-md" />
          <Skeleton className="h-32 w-full rounded-md" />
        </div>
      ) : analytics.isError ? (
        <EmptyState
          icon="alert"
          title="Couldn't load analytics"
          subtitle="The aggregates didn't come through — try again."
          actionLabel="Retry"
          onAction={() => void analytics.refetch()}
        />
      ) : a ? (
        <>
          {/* Revenue + demand funnel — the two demand reads sit
              side-by-side at lg (chart dominant, funnel the ledger). */}
          <div className="mt-8 lg:grid lg:grid-cols-2 lg:items-start lg:gap-10 xl:gap-16">
          <section aria-labelledby="analytics-revenue">
            <div className="flex items-baseline justify-between gap-3">
              <SectionTitle>Revenue</SectionTitle>
              <span className="tnum flex items-baseline gap-2">
                <span className="text-price-list font-semibold text-text-primary">
                  {formatPrice(a.revenueTotal)}
                </span>
                <MetricDelta delta={a.revenueDelta} />
              </span>
            </div>
            <div className="mt-4">
              {a.series.length ? (
                <LineChart
                  points={a.series.map((p) => ({
                    label: shortDate(p.date),
                    value: p.revenue,
                    hint: `${p.orders} order${p.orders === 1 ? '' : 's'}`,
                  }))}
                  formatValue={(v) => formatPrice(v)}
                  ariaLabel={`Daily revenue, ${shortDate(a.range.from)} to ${shortDate(a.range.to)}`}
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
                { label: 'Orders', value: formatCount(a.ordersTotal) },
                { label: 'Avg sale', value: a.aov != null ? formatPrice(a.aov) : '—' },
                {
                  label: 'View → sale',
                  value: a.conversionPct != null ? `${a.conversionPct}%` : '—',
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

          {/* Demand funnel — each stage is a real count; the bar width is
              relative to views, step % is stage-over-stage. */}
          <section className="mt-10 lg:mt-0" aria-labelledby="analytics-funnel">
            <SectionTitle>Demand funnel</SectionTitle>
            {funnelBase ? (
              <ul className="mt-4 space-y-3">
                <FunnelRow label="Views" value={a.viewsTotal} widthPct={100} stepPct={null} />
                <FunnelRow
                  label="Likes"
                  value={a.likesTotal}
                  widthPct={(a.likesTotal / funnelBase) * 100}
                  stepPct={stepPct(a.likesTotal, a.viewsTotal)}
                />
                <FunnelRow
                  label="Offers received"
                  value={a.offersReceived}
                  widthPct={
                    a.offersReceived != null ? (a.offersReceived / funnelBase) * 100 : 0
                  }
                  stepPct={stepPct(a.offersReceived, a.likesTotal)}
                />
                <FunnelRow
                  label="Orders"
                  value={a.ordersTotal}
                  widthPct={(a.ordersTotal / funnelBase) * 100}
                  stepPct={stepPct(a.ordersTotal, a.offersReceived ?? a.likesTotal)}
                />
              </ul>
            ) : (
              <p className="mt-3 text-body text-text-muted">
                No views in this range — the funnel fills in once buyers see your items.
              </p>
            )}
          </section>
          </div>

          {/* Category mix + repeat buyers — the secondary reads pair up
              at lg rather than stacking full-width. */}
          <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-10 xl:gap-16">
          {/* Category mix — real inventory grouped by category. The live
              contract doesn't carry it, so live mode says so rather than
              faking a split. */}
          <section className="mt-10" aria-labelledby="analytics-mix">
            <SectionTitle>Category mix</SectionTitle>
            <div className="mt-4">
              {a.categoryMix == null ? (
                <p className="text-body text-text-muted">
                  Category breakdown isn&rsquo;t part of the live analytics feed yet.
                </p>
              ) : a.categoryMix.length ? (
                <BarChart
                  bars={a.categoryMix.map((c) => ({
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
              {a.repeatBuyers == null ? (
                <p className="text-body text-text-muted">
                  {DATA_MODE === 'live'
                    ? 'Repeat-buyer cohorts aren’t part of the live analytics feed yet.'
                    : 'No orders yet — the repeat-buyer read fills in after your first sales.'}
                </p>
              ) : (
                <dl className="grid grid-cols-3 divide-x divide-border-subtle border-y border-border-subtle">
                  {[
                    { label: 'Buyers', value: formatCount(a.repeatBuyers.buyers) },
                    {
                      label: 'Came back',
                      value:
                        a.repeatBuyers.repeatSharePct != null
                          ? `${a.repeatBuyers.repeatSharePct}%`
                          : '—',
                    },
                    {
                      label: 'Of orders',
                      value:
                        a.repeatBuyers.repeatOrderSharePct != null
                          ? `${a.repeatBuyers.repeatOrderSharePct}%`
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

          {/* Needs attention — listings under the view floor in the
              selected range (the server's attention verdict; priority is
              its call, not ours). Rows land on the listing's manage
              surface; a fetch failure renders nothing rather than an
              error block inside a supplementary read. */}
          {attention.isLoading ? (
            <div
              className="mt-10 space-y-3"
              aria-busy
              aria-label="Loading listings needing attention"
            >
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : attention.data && attention.data.length > 0 ? (
            <section aria-label="Needs attention" className="mt-10">
              <div className="flex items-baseline justify-between gap-3">
                <SectionTitle>Needs attention</SectionTitle>
                <span className="tnum text-meta text-text-muted">
                  {attention.data.length} listing{attention.data.length === 1 ? '' : 's'}
                </span>
              </div>
              <p className="mt-1 text-meta text-text-muted">
                Active listings under the view floor in this range.
              </p>
              <ul className="mt-3 divide-y divide-border-subtle border-y border-border-subtle">
                {attention.data.map((row) => (
                  <li key={row.listingId}>
                    <Link
                      href={`/seller-hub/listings/${row.listingId}`}
                      className="pressable flex items-center gap-3.5 py-3"
                    >
                      <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md bg-surface-alt">
                        <AppImage
                          src={row.imageUrl}
                          alt={row.title}
                          fill
                          sizes="48px"
                          fallbackIcon="tag"
                        />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="clamp-1 block text-body-emphasis font-medium text-text-primary">
                          {row.title}
                        </span>
                        <span
                          className={`tnum mt-0.5 block text-meta ${
                            row.priority === 'high' ? 'text-warning-text' : 'text-text-muted'
                          }`}
                        >
                          {formatCount(row.views)} views · {formatCount(row.likes)} likes
                          {row.offers > 0 ? ` · ${formatCount(row.offers)} offers` : ''}
                        </span>
                      </span>
                      <Icon name="forward" size={16} className="shrink-0 text-text-muted" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {a.demo ? (
            <p className="mt-8 text-meta text-text-muted">
              Demo data — aggregates are computed from this device&rsquo;s fixture closet and
              order book, not a live feed.
            </p>
          ) : null}
        </>
      ) : null}

      {/* Custom range — real ISO dates, validated; the engine clamps to
          whatever history exists and the range label says when it did. */}
      <Sheet
        open={customSheet}
        onClose={() => setCustomSheet(false)}
        title="Custom range"
        maxWidth={420}
      >
        <div className="px-5 pb-6 pt-1">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1.5 block text-caption font-medium text-text-secondary">
                From
              </span>
              <input
                type="date"
                value={customDraft.from}
                max={customDraft.to || undefined}
                onChange={(e) => {
                  setCustomDraft((d) => ({ ...d, from: e.target.value }));
                  setCustomError(null);
                }}
                className="tnum h-11 w-full rounded-md border border-border bg-surface px-3 text-body text-text-primary focus:border-text-muted focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-caption font-medium text-text-secondary">
                To
              </span>
              <input
                type="date"
                value={customDraft.to}
                min={customDraft.from || undefined}
                onChange={(e) => {
                  setCustomDraft((d) => ({ ...d, to: e.target.value }));
                  setCustomError(null);
                }}
                className="tnum h-11 w-full rounded-md border border-border bg-surface px-3 text-body text-text-primary focus:border-text-muted focus:outline-none"
              />
            </label>
          </div>
          {customError ? (
            <p className="mt-3 text-caption font-medium text-danger-text" role="alert">
              {customError}
            </p>
          ) : null}
          <p className="mt-3 text-meta text-text-muted">
            {DATA_MODE === 'live'
              ? 'Ranges are read from the 90-day analytics window — earlier dates clamp.'
              : 'Fixture history covers the last 90 days — earlier dates clamp.'}
          </p>
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="quiet" size="md" onClick={() => setCustomSheet(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="md" onClick={applyCustom}>
              Apply range
            </Button>
          </div>
        </div>
      </Sheet>
    </div>
  );
}
