'use client';

/**
 * /co-own/leaderboard — the asset screener. Port of mobile
 * AssetLeaderboardScreen ("Market overview") raised to a
 * TradingView-grade table: every market ranked on real contract fields —
 * price, period move, 24h volume, holders, allocated share — with a
 * per-row sparkline over the matching candle window and a period toggle.
 *
 * The % column and the sparkline always read the same candle window, so a
 * row's number and its line can never disagree. For 24h the move falls
 * back to the contract's marketMovePct24h when no candles exist; other
 * periods render an em dash rather than inventing a figure.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { SegmentedControl } from '@/components/feed/SegmentedControl';
import {
  useCoOwnAssets,
  usePriceHistoryMap,
} from '@/lib/hooks/coown-queries';
import type { CandlePoint, CoOwnAsset, PriceWindow } from '@/lib/contracts/coown';
import { formatCount } from '@/lib/utils/format';
import { AssetThumb } from './AssetThumb';
import { LifecycleTag } from './LifecycleTag';
import { Sparkline } from './Sparkline';
import { gbp, gbpCompact, pctAllocated, signedPct } from './format';

type Period = '24h' | '7d' | '30d';
const PERIOD_WINDOW: Record<Period, PriceWindow> = { '24h': '1D', '7d': '1W', '30d': '1M' };
const PERIOD_LABEL: Record<Period, string> = { '24h': '24h', '7d': '7D', '30d': '30D' };

type SortKey = 'name' | 'price' | 'move' | 'volume' | 'holders' | 'allocated';
interface SortState {
  key: SortKey;
  dir: 'asc' | 'desc';
}

interface Row {
  asset: CoOwnAsset;
  candles: CandlePoint[];
  /** First→last close move over the selected window; contract 24h figure
   *  stands in only for the 24h period when candles are absent. */
  movePct: number | null;
  allocatedPct: number;
}

/** Close-to-close return over the window — the same series the row's
 *  sparkline draws, so the number always matches the line. */
function windowReturn(candles: CandlePoint[]): number | null {
  if (candles.length < 2) return null;
  const first = candles[0]!.c;
  const last = candles[candles.length - 1]!.c;
  if (!(first > 0)) return null;
  return (last / first - 1) * 100;
}

const COLUMN_LABEL: Record<SortKey, string> = {
  name: 'Market',
  price: 'Price',
  move: 'Move',
  volume: '24h volume',
  holders: 'Holders',
  allocated: 'Allocated',
};

/** Column template shared by header and rows — md drops the quieter
 *  columns, lg restores holders + allocation. */
const GRID =
  'md:grid-cols-[2rem_minmax(0,1fr)_6.5rem_5rem_6rem_5rem] lg:grid-cols-[2rem_minmax(0,1fr)_6.5rem_5rem_5.5rem_4.5rem_7.5rem_6rem]';

function MoveValue({ pct }: { pct: number | null }) {
  if (pct == null) {
    return <span className="text-body text-text-muted tnum">—</span>;
  }
  return (
    <span
      className={`text-body-emphasis font-semibold tnum ${
        pct >= 0 ? 'text-coown-up' : 'text-coown-down'
      }`}
    >
      {signedPct(pct)}
    </span>
  );
}

function AllocMeter({ pct }: { pct: number }) {
  return (
    <div className="flex items-center justify-end gap-2">
      <span className="h-1 w-full max-w-16 overflow-hidden rounded-full bg-surface-alt">
        <span className="block h-full rounded-full bg-text-primary" style={{ width: `${pct}%` }} />
      </span>
      <span className="w-9 text-right text-meta text-text-secondary tnum">{pct}%</span>
    </div>
  );
}

function LeaderboardSkeleton() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-20 pt-8 sm:px-6 md:pt-10" aria-busy="true" aria-label="Loading leaderboard">
      <Skeleton className="h-9 w-48" />
      <Skeleton className="mt-3 h-4 w-72" />
      <div className="mt-8 flex items-center justify-between border-b border-border-subtle pb-4">
        <Skeleton className="h-9 w-52 rounded-full" />
        <Skeleton className="h-4 w-24" />
      </div>
      <ul className="divide-y divide-border-subtle" aria-hidden="true">
        {Array.from({ length: 8 }).map((_, i) => (
          <li key={i} className="flex items-center gap-3 py-3.5">
            <Skeleton className="h-4 w-5" />
            <Skeleton className="h-12 w-12 rounded-lg" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-28" />
            </div>
            <Skeleton className="h-4 w-16" />
            <Skeleton className="hidden h-6 w-20 md:block" />
          </li>
        ))}
      </ul>
    </div>
  );
}

export function LeaderboardView() {
  const { data: assets, isLoading, isError, refetch } = useCoOwnAssets();
  const [period, setPeriod] = useState<Period>('24h');
  const [sort, setSort] = useState<SortState>({ key: 'volume', dir: 'desc' });

  const assetIds = useMemo(() => (assets ?? []).map((a) => a.id), [assets]);
  const history = usePriceHistoryMap(assetIds, PERIOD_WINDOW[period]);
  const candlesById = useMemo(() => {
    const map = new Map<string, CandlePoint[]>();
    for (const h of history) map.set(h.assetId, h.candles);
    return map;
  }, [history]);

  const rows = useMemo<Row[]>(
    () =>
      (assets ?? []).map((asset) => {
        const candles = candlesById.get(asset.id) ?? [];
        const movePct =
          windowReturn(candles) ?? (period === '24h' ? asset.marketMovePct24h : null);
        return { asset, candles, movePct, allocatedPct: pctAllocated(asset) };
      }),
    [assets, candlesById, period],
  );

  const sorted = useMemo(() => {
    const value = (r: Row): number | string | null => {
      switch (sort.key) {
        case 'name':
          return r.asset.title.toLowerCase();
        case 'price':
          return r.asset.unitPriceGbp;
        case 'move':
          return r.movePct;
        case 'volume':
          return r.asset.volume24hGbp;
        case 'holders':
          return r.asset.holders;
        case 'allocated':
          return r.allocatedPct;
      }
    };
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = value(a);
      const vb = value(b);
      // Empty cells always sink — a missing figure never outranks a real one.
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === 'string' && typeof vb === 'string')
        return va.localeCompare(vb) * dir;
      return ((va as number) - (vb as number)) * dir;
    });
  }, [rows, sort]);

  const sortBy = (key: SortKey) =>
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: key === 'name' ? 'asc' : 'desc' },
    );

  if (isLoading) return <LeaderboardSkeleton />;

  if (isError || !assets || assets.length === 0) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
        <EmptyState
          icon="trending"
          title="Leaderboard unavailable"
          subtitle="We couldn't load market rankings. Check your connection and try again."
          actionLabel="Retry"
          onAction={() => void refetch()}
        />
      </div>
    );
  }

  const totalVolume = assets.reduce((sum, a) => sum + (a.volume24hGbp ?? 0), 0);

  /** Sortable column header — text button, chevron on the active column. */
  const head = (key: SortKey, align: 'left' | 'right' = 'right', className = '') => (
    <button
      type="button"
      onClick={() => sortBy(key)}
      aria-label={`Sort by ${COLUMN_LABEL[key]}${
        sort.key === key ? `, currently ${sort.dir === 'asc' ? 'ascending' : 'descending'}` : ''
      }`}
      className={`pressable -my-1 inline-flex items-center gap-1 rounded-sm py-1 text-micro font-semibold uppercase tracking-[0.08em] ${
        align === 'right' ? 'justify-end' : 'justify-start'
      } ${sort.key === key ? 'text-text-primary' : 'text-text-muted hover:text-text-secondary'} ${className}`}
    >
      {key === 'move' ? PERIOD_LABEL[period] : COLUMN_LABEL[key]}
      {sort.key === key ? (
        <Icon name={sort.dir === 'asc' ? 'chevronUp' : 'chevronDown'} size={12} />
      ) : null}
    </button>
  );

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-20 pt-8 sm:px-6 md:pt-10">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <h1 className="text-editorial-display text-text-primary">Leaderboard</h1>
          <p className="mt-2 flex flex-wrap items-center gap-x-2 text-meta text-text-secondary">
            <span className="tnum">{assets.length} markets</span>
            <span aria-hidden="true" className="text-text-muted">·</span>
            <span className="tnum">{gbpCompact(totalVolume)} traded today</span>
          </p>
        </div>
        <nav aria-label="Co-Own" className="flex items-center gap-5">
          <Link href="/co-own" className="text-body font-medium text-text-secondary underline-offset-4 hover:text-text-primary hover:underline">
            Markets
          </Link>
          <Link href="/co-own/ledger" className="text-body font-medium text-text-secondary underline-offset-4 hover:text-text-primary hover:underline">
            Tape
          </Link>
        </nav>
      </header>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle pb-4">
        <SegmentedControl<Period>
          options={[
            { value: '24h', label: '24h' },
            { value: '7d', label: '7D' },
            { value: '30d', label: '30D' },
          ]}
          value={period}
          onChange={setPeriod}
        />
        <p className="text-meta text-text-muted tnum" aria-live="polite">
          Sorted by {COLUMN_LABEL[sort.key].toLowerCase()} ·{' '}
          {sort.dir === 'asc' ? 'ascending' : 'descending'}
        </p>
      </div>

      {/* Desktop — screener grid. The header rail and every row share one
          column template so the columns stay aligned. */}
      <div className="hidden md:block">
        <div
          className={`grid ${GRID} items-center gap-4 border-b border-border-subtle px-1 pb-2 pt-3`}
        >
          <span className="text-center text-micro font-semibold uppercase tracking-[0.08em] text-text-muted">
            #
          </span>
          {head('name', 'left')}
          {head('price')}
          {head('move')}
          <span className="text-micro font-semibold uppercase tracking-[0.08em] text-text-muted">
            Trend
          </span>
          <span className="hidden lg:block">{head('holders')}</span>
          {head('volume')}
          <span className="hidden lg:block">{head('allocated')}</span>
        </div>

        <ul className="divide-y divide-border-subtle">
          {sorted.map((row, i) => {
            const { asset } = row;
            return (
              <li key={asset.id} className="group relative transition-colors hover:bg-row">
                <Link
                  href={`/co-own/${asset.id}`}
                  className="absolute inset-0 z-0"
                  aria-label={`Rank ${i + 1} — ${asset.title}`}
                />
                <div
                  className={`pointer-events-none relative z-[1] grid ${GRID} items-center gap-4 px-1 py-3.5`}
                >
                  <span className="text-center text-meta text-text-muted tnum">{i + 1}</span>
                  <div className="flex min-w-0 items-center gap-3">
                    <AssetThumb src={asset.imageUrl} alt="" className="h-11 w-11 shrink-0" />
                    <div className="min-w-0">
                      <p className="clamp-1 text-body-emphasis font-semibold text-text-primary">
                        {asset.title}
                      </p>
                      <p className="mt-0.5 flex items-center gap-1.5 text-meta text-text-secondary">
                        <span className="truncate">@{asset.issuer.username}</span>
                        <LifecycleTag asset={asset} />
                      </p>
                    </div>
                  </div>
                  <p className="text-right text-body-emphasis text-text-primary tnum">
                    {gbp(asset.unitPriceGbp)}
                  </p>
                  <div className="text-right">
                    <MoveValue pct={row.movePct} />
                  </div>
                  <Sparkline
                    candles={row.candles}
                    width={88}
                    height={26}
                    label={`${asset.title} ${PERIOD_LABEL[period]} trend`}
                  />
                  <p className="hidden text-right text-body text-text-secondary tnum lg:block">
                    {formatCount(asset.holders)}
                  </p>
                  <p className="text-right text-body text-text-secondary tnum">
                    {gbpCompact(asset.volume24hGbp)}
                  </p>
                  <div className="hidden lg:block">
                    <AllocMeter pct={row.allocatedPct} />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Mobile — stacked dense rows, same figures */}
      <ul className="mt-1 divide-y divide-border-subtle md:hidden">
        {sorted.map((row, i) => {
          const { asset } = row;
          return (
            <li key={asset.id} className="relative transition-colors hover:bg-row">
              <Link
                href={`/co-own/${asset.id}`}
                className="absolute inset-0 z-0"
                aria-label={`Rank ${i + 1} — ${asset.title}`}
              />
              <div className="pointer-events-none relative z-[1] py-4">
                <div className="flex items-start gap-3">
                  <span className="w-5 pt-1 text-center text-meta text-text-muted tnum">
                    {i + 1}
                  </span>
                  <AssetThumb src={asset.imageUrl} alt="" className="h-12 w-12 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="clamp-1 text-body-emphasis font-semibold text-text-primary">
                      {asset.title}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-meta text-text-secondary">
                      <span className="truncate">@{asset.issuer.username}</span>
                      <LifecycleTag asset={asset} />
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-body-emphasis text-text-primary tnum">
                      {gbp(asset.unitPriceGbp)}
                    </p>
                    <p className="mt-1">
                      <MoveValue pct={row.movePct} />
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex items-end justify-between gap-3 pl-8">
                  <Sparkline
                    candles={row.candles}
                    width={104}
                    height={28}
                    label={`${asset.title} ${PERIOD_LABEL[period]} trend`}
                  />
                  <p className="text-right text-meta text-text-secondary tnum">
                    {formatCount(asset.holders)} holders · {gbpCompact(asset.volume24hGbp)} ·{' '}
                    {row.allocatedPct}% allocated
                  </p>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <p className="mt-6 text-meta text-text-muted">
        Rankings use issued supply, holders and traded volume. The {PERIOD_LABEL[period]} column and
        each trend line read the same candle window.
      </p>
    </div>
  );
}
