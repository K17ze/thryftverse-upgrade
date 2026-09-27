'use client';

/**
 * /co-own/ledger — the market-wide tape. Port of mobile
 * MarketLedgerScreen's co-own channel: every per-asset execution folded
 * into one stream, newest first, with a market filter and a side filter.
 * Prints are contract TradeLedgerEntry rows — side, units, unit price,
 * executedAt — counterparties stay masked like the asset-local tape.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { SegmentedControl } from '@/components/feed/SegmentedControl';
import { Skeleton } from '@/components/ui/Skeleton';
import { useCoOwnAssets, useMarketTape } from '@/lib/hooks/coown-queries';
import { gbp } from './format';

const ALL = 'all';
type SideFilter = 'all' | 'buy' | 'sell';

function tapeTime(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  if (sameDay) return time;
  return `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} · ${time}`;
}

function TapeSkeleton() {
  return (
    <div
      className="mx-auto w-full max-w-3xl px-4 pb-20 pt-8 sm:px-6 md:pt-10"
      aria-busy="true"
      aria-label="Loading market tape"
    >
      <Skeleton className="h-9 w-40" />
      <Skeleton className="mt-3 h-4 w-64" />
      <div className="mt-8 flex gap-2 border-b border-border-subtle pb-4" aria-hidden="true">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-20 rounded-full" />
        ))}
      </div>
      <ul className="divide-y divide-border-subtle" aria-hidden="true">
        {Array.from({ length: 10 }).map((_, i) => (
          <li key={i} className="flex items-center gap-3 py-3">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-40" />
            <div className="flex-1" />
            <Skeleton className="h-4 w-20" />
          </li>
        ))}
      </ul>
    </div>
  );
}

export function MarketTapeView() {
  const { data: entries, isLoading, isError, refetch } = useMarketTape();
  const { data: assets } = useCoOwnAssets();
  const [market, setMarket] = useState<string>(ALL);
  const [side, setSide] = useState<SideFilter>('all');

  const assetById = useMemo(
    () => new Map((assets ?? []).map((a) => [a.id, a] as const)),
    [assets],
  );

  const filtered = useMemo(() => {
    let rows = entries ?? [];
    if (market !== ALL) rows = rows.filter((e) => e.assetId === market);
    if (side !== 'all') rows = rows.filter((e) => e.side === side);
    return rows;
  }, [entries, market, side]);

  if (isLoading) return <TapeSkeleton />;

  if (isError || !entries) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
        <EmptyState
          icon="trending"
          title="Tape unavailable"
          subtitle="We couldn't load the market ledger. Check your connection and try again."
          actionLabel="Retry"
          onAction={() => void refetch()}
        />
      </div>
    );
  }

  // Only markets that have printed get a filter chip — an empty chip
  // would promise rows that don't exist.
  const marketsWithPrints = (assets ?? []).filter((a) =>
    entries.some((e) => e.assetId === a.id),
  );

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-20 pt-8 sm:px-6 md:pt-10">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <h1 className="text-editorial-display text-text-primary">Market tape</h1>
          <p className="mt-2 text-meta text-text-secondary">
            Public executions across every Co-Own market · counterparties masked
          </p>
        </div>
        <nav aria-label="Co-Own" className="flex items-center gap-5">
          <Link
            href="/co-own"
            className="text-body font-medium text-text-secondary underline-offset-4 hover:text-text-primary hover:underline"
          >
            Markets
          </Link>
          <Link
            href="/co-own/leaderboard"
            className="text-body font-medium text-text-secondary underline-offset-4 hover:text-text-primary hover:underline"
          >
            Leaderboard
          </Link>
        </nav>
      </header>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle pb-4">
        <div
          className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4"
          role="group"
          aria-label="Filter by market"
        >
          <Chip selected={market === ALL} onClick={() => setMarket(ALL)}>
            All markets
          </Chip>
          {marketsWithPrints.map((a) => (
            <Chip key={a.id} selected={market === a.id} onClick={() => setMarket(a.id)}>
              {a.title}
            </Chip>
          ))}
        </div>
        <SegmentedControl<SideFilter>
          options={[
            { value: 'all', label: 'All' },
            { value: 'buy', label: 'Buys' },
            { value: 'sell', label: 'Sells' },
          ]}
          value={side}
          onChange={setSide}
        />
      </div>

      <p className="mt-3 text-meta text-text-muted tnum" aria-live="polite">
        {filtered.length} {filtered.length === 1 ? 'print' : 'prints'}
      </p>

      {filtered.length === 0 ? (
        <div className="mt-10">
          <EmptyState
            icon="trending"
            title="Nothing on the tape"
            subtitle={
              market === ALL && side === 'all'
                ? 'No executions yet — prints land here as trades clear across Co-Own markets.'
                : 'No prints match this filter. Try another market or side.'
            }
            actionLabel={
              market === ALL && side === 'all' ? undefined : 'Clear filters'
            }
            onAction={
              market === ALL && side === 'all'
                ? undefined
                : () => {
                    setMarket(ALL);
                    setSide('all');
                  }
            }
          />
        </div>
      ) : (
        <ul className="divide-y divide-border-subtle border-b border-border-subtle">
          {filtered.map((t) => {
            const asset = assetById.get(t.assetId);
            return (
              <li key={t.id} className="flex items-baseline gap-4 py-2.5">
                <time
                  dateTime={t.executedAt}
                  className="w-24 shrink-0 text-meta text-text-muted tnum"
                >
                  {tapeTime(t.executedAt)}
                </time>
                {asset ? (
                  <Link
                    href={`/co-own/${asset.id}`}
                    className="clamp-1 min-w-0 flex-1 text-body text-text-primary underline-offset-4 hover:underline"
                  >
                    {asset.title}
                  </Link>
                ) : (
                  <span className="min-w-0 flex-1 text-body text-text-muted tnum">
                    {t.assetId}
                  </span>
                )}
                <span
                  className={`shrink-0 text-body font-medium tnum ${
                    t.side === 'buy' ? 'text-coown-up' : 'text-coown-down'
                  }`}
                >
                  {t.side === 'buy' ? 'Buy' : 'Sell'} {gbp(t.unitPriceGbp)}
                </span>
                <span className="w-16 shrink-0 text-right text-meta text-text-secondary tnum">
                  {t.units} {t.units === 1 ? 'unit' : 'units'}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
