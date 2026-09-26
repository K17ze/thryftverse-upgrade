'use client';

/**
 * /seller-hub — the analytics command centre. One dominant earnings header,
 * the unified to-do radar, the revenue trajectory, a metric grid with period
 * deltas and the sortable listings table. Flat canvas, hairlines, tnum —
 * no card stack.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { SellerSectionNav } from '@/components/seller/SellerSectionNav';
import { RevenueChart } from '@/components/seller/RevenueChart';
import { MetricDelta } from '@/components/seller/MetricDelta';
import { AppImage } from '@/components/ui/AppImage';
import { Icon, type AppIconName } from '@/components/ui/Icon';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { SegmentedControl } from '@/components/feed/SegmentedControl';
import {
  useSellerOverview,
  useSellerListingPerformance,
  useSellerTodos,
  useFulfilmentCounts,
} from '@/lib/hooks/seller-queries';
import type { SellerPeriod } from '@/lib/data/fixtures-seller';
import { formatPrice, formatCount } from '@/lib/utils/format';
import { getListingCoverUri } from '@/lib/utils/media';

const PERIODS: { value: SellerPeriod; label: string }[] = [
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
  { value: '90d', label: '90d' },
];

const QUICK_ACTIONS: { href: string; icon: AppIconName; label: string }[] = [
  { href: '/sell', icon: 'plus', label: 'List an item' },
  { href: '/seller-hub/import', icon: 'download', label: 'Import catalog' },
  { href: '/seller-hub/listings', icon: 'inventory', label: 'My listings' },
  { href: '/seller-hub/quick-replies', icon: 'zap', label: 'Quick replies' },
  { href: '/wallet', icon: 'wallet', label: 'Wallet' },
  { href: '/orders', icon: 'box', label: 'Orders' },
  { href: '/live', icon: 'videocam', label: 'Go live' },
];

type SortKey = 'views' | 'price' | 'age';

function HubSkeleton() {
  return (
    <div aria-busy aria-label="Loading seller analytics">
      <Skeleton className="mt-8 h-3 w-28" />
      <Skeleton className="mt-3 h-12 w-48" />
      <div className="mt-6 flex gap-2">
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-8 w-32" />
      </div>
      <Skeleton className="mt-8 h-52 w-full" />
      <div className="mt-8 grid grid-cols-2 gap-px sm:grid-cols-5">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
      <div className="mt-10 space-y-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-3.5">
            <Skeleton className="h-14 w-14 rounded-md" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 w-14" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function SellerHubPage() {
  const router = useRouter();
  const [period, setPeriod] = useState<SellerPeriod>('30d');
  const [sort, setSort] = useState<{ key: SortKey; dir: 'desc' | 'asc' }>({ key: 'views', dir: 'desc' });

  const overview = useSellerOverview(period);
  const performance = useSellerListingPerformance(period);
  const todos = useSellerTodos();
  const counts = useFulfilmentCounts();

  const isLoading = overview.isLoading || performance.isLoading;
  const isError = overview.isError || performance.isError;

  const rows = useMemo(() => {
    const list = [...(performance.data ?? [])];
    const dir = sort.dir === 'desc' ? -1 : 1;
    return list.sort((a, b) => {
      if (sort.key === 'views') return (a.views - b.views) * dir;
      if (sort.key === 'price') return (a.listing.price - b.listing.price) * dir;
      return (b.ageDays - a.ageDays) * dir;
    });
  }, [performance.data, sort]);

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'desc' ? 'asc' : 'desc' } : { key, dir: 'desc' }));

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-16 pt-8 sm:px-6 md:pt-12">
      <h1 className="text-screen-title font-semibold text-text-primary">Seller hub</h1>
      <SellerSectionNav toPost={counts.toPost} posted={counts.posted} />

      {isLoading ? (
        <HubSkeleton />
      ) : isError ? (
        <EmptyState
          icon="analytics"
          title="Couldn't load analytics"
          subtitle="We couldn't reach your seller data. Try again in a moment."
          actionLabel="Retry"
          onAction={() => {
            void overview.refetch();
            void performance.refetch();
          }}
        />
      ) : (
        <>
          {/* ── Earnings header — the number is the object ── */}
          <section aria-label="Earnings" className="mt-8">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-label font-semibold uppercase tracking-wider text-text-muted">
                  Available to withdraw
                </p>
                <p className="tnum mt-2 text-display font-bold tracking-tight text-text-primary">
                  {formatPrice(overview.data!.available, overview.data!.currency)}
                </p>
                <p className="mt-2 text-body text-text-secondary">
                  <span className="tnum font-medium text-text-primary">
                    {formatPrice(overview.data!.pending, overview.data!.currency)}
                  </span>{' '}
                  pending ·{' '}
                  <span className="tnum font-medium text-text-primary">
                    {formatPrice(overview.data!.lifetimeSales, overview.data!.currency)}
                  </span>{' '}
                  lifetime sales
                </p>
              </div>
              <SegmentedControl options={PERIODS} value={period} onChange={setPeriod} />
            </div>
          </section>

          {/* ── To-do radar — one list, not three boxes ── */}
          {todos.data && todos.data.length > 0 ? (
            <nav aria-label="To do" className="mt-8">
              <ul className="divide-y divide-border-subtle border-y border-border-subtle">
                {todos.data.map((t) => (
                  <li key={t.id}>
                    <Link
                      href={t.href}
                      className="pressable flex items-center gap-3 py-3"
                    >
                      <Icon
                        name={t.kind === 'dispatch' ? 'box' : t.kind === 'offers' ? 'offer' : 'trending'}
                        size={18}
                        className={
                          t.tone === 'danger'
                            ? 'text-danger-text'
                            : t.tone === 'warning'
                              ? 'text-warning-text'
                              : 'text-text-muted'
                        }
                      />
                      <span className="min-w-0 flex-1">
                        <span
                          className={`clamp-1 text-body-emphasis font-medium ${
                            t.tone === 'danger' ? 'text-danger-text' : 'text-text-primary'
                          }`}
                        >
                          {t.title}
                        </span>
                        <span className="mt-0.5 block text-meta text-text-muted">{t.meta}</span>
                      </span>
                      <Icon name="forward" size={16} className="shrink-0 text-text-muted" />
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ) : null}

          {/* ── Revenue trajectory ── */}
          <section aria-label="Revenue" className="mt-10">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-section-title font-semibold text-text-primary">Revenue</h2>
              <p className="tnum text-meta text-text-muted">
                {formatPrice(overview.data!.revenueTotal, overview.data!.currency)} · prev{' '}
                {formatPrice(overview.data!.revenuePrev, overview.data!.currency)}
              </p>
            </div>
            <div className="mt-4">
              <RevenueChart
                points={overview.data!.series}
                ariaLabel={`Revenue, last ${period}`}
              />
            </div>
          </section>

          {/* ── Metric grid — flat cells, hairline dividers ── */}
          <section aria-label="Performance metrics" className="mt-10">
            <div className="grid grid-cols-2 gap-px bg-border-subtle sm:grid-cols-5">
              {overview.data!.metrics.map((m) => (
                <div key={m.key} className="bg-background p-4">
                  <p className="text-label font-semibold uppercase tracking-wider text-text-muted">
                    {m.label}
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
          </section>

          {/* ── Listings performance — sortable hairline table ── */}
          <section aria-label="Listing performance" className="mt-10 scroll-mt-20" id="performance">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-section-title font-semibold text-text-primary">Your listings</h2>
              <div className="flex items-center gap-1" role="group" aria-label="Sort listings">
                <span className="text-meta text-text-muted">Sort</span>
                {(['views', 'price', 'age'] as const).map((k) => (
                  <button
                    key={k}
                    onClick={() => toggleSort(k)}
                    aria-pressed={sort.key === k}
                    className={`pressable rounded px-2 py-1 text-meta font-semibold capitalize ${
                      sort.key === k ? 'bg-surface-alt text-text-primary' : 'text-text-muted hover:text-text-primary'
                    }`}
                  >
                    {k}
                  </button>
                ))}
              </div>
            </div>

            {performance.data && performance.data.length > 0 ? (
              <ul className="mt-3 divide-y divide-border-subtle border-y border-border-subtle">
                {rows.map((row) => {
                  const sold = row.listing.status === 'sold' || row.listing.isSold;
                  return (
                    <li key={row.listing.id}>
                      <Link
                        href={`/item/${row.listing.id}`}
                        className="pressable flex items-center gap-3.5 py-3"
                      >
                        <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md bg-surface-alt">
                          <AppImage
                            src={getListingCoverUri(row.listing.images)}
                            alt={row.listing.title}
                            fill
                            sizes="56px"
                          />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="clamp-1 block text-body-emphasis font-medium text-text-primary">
                            {row.listing.title}
                          </span>
                          <span className="tnum mt-0.5 block text-meta text-text-muted">
                            {formatCount(row.views)} views · {formatCount(row.likes)} likes ·{' '}
                            {row.ageDays}d listed
                          </span>
                        </span>
                        <Badge variant={sold ? 'neutral' : 'success'}>{sold ? 'Sold' : 'Active'}</Badge>
                        <span className="tnum w-16 shrink-0 text-right text-body-emphasis font-semibold text-text-primary">
                          {formatPrice(row.listing.price, overview.data!.currency)}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <EmptyState
                compact
                icon="inventory"
                title="Nothing listed yet"
                subtitle="Photograph a piece, set a price — your first listing takes minutes."
                actionLabel="List an item"
                onAction={() => router.push('/sell')}
              />
            )}
          </section>

          {/* ── Quick actions — quiet rail ── */}
          <nav aria-label="Seller actions" className="no-scrollbar -mx-4 mt-10 flex gap-2 overflow-x-auto px-4 sm:-mx-6 sm:px-6">
            {QUICK_ACTIONS.map((a) => (
              <Link
                key={a.label}
                href={a.href}
                className="pressable inline-flex h-10 shrink-0 items-center gap-2 rounded-full bg-surface-alt px-4 text-body font-semibold text-text-primary hover:bg-surface-raised"
              >
                <Icon name={a.icon} size={16} />
                {a.label}
              </Link>
            ))}
          </nav>
        </>
      )}
    </div>
  );
}
