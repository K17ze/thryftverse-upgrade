'use client';

/**
 * Co-Own hub — orchestrator. Market status strip, featured hero, then a
 * Markets/Watchlist switch over a Polymarket-style list, education band.
 * All market data via the shared coown query hooks; watch state is the
 * persisted session watchlist the asset detail stars into.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { Tabs } from '@/components/ui/Tabs';
import { DATA_MODE } from '@/lib/api/client';
import { useCoOwnAssets, useCoOwnPositions } from '@/lib/hooks/coown-queries';
import { coOwnMarkGbp, deriveLifecycleState } from '@/lib/contracts/coown';
import type { CoOwnAsset, CoOwnPosition } from '@/lib/contracts/coown';
import { useCoOwnWatchlist } from '@/lib/store/coownWatchlist';
import { useHydrated } from '@/lib/store/useStore';
import { HubSkeleton } from './HubSkeleton';
import { CoOwnOnboardingGate } from './CoOwnOnboardingGate';
import { EducationBand } from './EducationBand';
import { FeaturedHero } from './FeaturedHero';
import { MarketList } from './MarketList';
import { AssetThumb } from './AssetThumb';
import { useEvaluateCoOwnAlerts } from './alertStore';
import { gbp, gbpCompact, signedPct } from './format';

const ALL = 'All';

// Native hub grammar: Offerings are initial allocations, Trading is the
// secondary market (including paused/exiting rows, which still trade
// context), Watchlist is the viewer's own queue.
type View = 'offerings' | 'trading' | 'watchlist';

type SortKey = 'volume' | 'newest' | 'price_desc' | 'price_asc' | 'movers';

const SORTS: { value: SortKey; label: string }[] = [
  { value: 'volume', label: 'Volume' },
  { value: 'newest', label: 'Newest' },
  { value: 'movers', label: 'Movers' },
  { value: 'price_desc', label: 'Price ↓' },
  { value: 'price_asc', label: 'Price ↑' },
];

function sortMarkets(rows: CoOwnAsset[], sort: SortKey): CoOwnAsset[] {
  const list = [...rows];
  switch (sort) {
    case 'newest':
      return list.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    case 'movers':
      return list.sort(
        (a, b) => Math.abs(b.marketMovePct24h ?? 0) - Math.abs(a.marketMovePct24h ?? 0),
      );
    case 'price_desc':
      return list.sort((a, b) => coOwnMarkGbp(b) - coOwnMarkGbp(a));
    case 'price_asc':
      return list.sort((a, b) => coOwnMarkGbp(a) - coOwnMarkGbp(b));
    case 'volume':
    default:
      return list.sort((a, b) => (b.volume24hGbp ?? -1) - (a.volume24hGbp ?? -1));
  }
}

function matchesQuery(a: CoOwnAsset, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return (
    a.title.toLowerCase().includes(needle) ||
    (a.subtitle ?? '').toLowerCase().includes(needle) ||
    a.issuer.username.toLowerCase().includes(needle)
  );
}

/**
 * Compact "what you hold" rail — holders land on their book before the
 * day's highlight, matching the mobile hub ordering (positions →
 * highlights → markets). Value marks at the server's projection figures
 * when the row carries them, else the last settled trade over issue;
 * return is measured against the blended average entry.
 */
function PositionsRail({
  positions,
  assets,
}: {
  positions: CoOwnPosition[];
  assets: CoOwnAsset[];
}) {
  const rows = useMemo(
    () =>
      positions
        .filter((p) => p.units > 0)
        .flatMap((p) => {
          const asset = assets.find((a) => a.id === p.assetId);
          return asset ? [{ position: p, asset }] : [];
        })
        .sort(
          (a, b) =>
            (b.position.marketValueGbp ?? b.position.units * (b.position.markPriceGbp ?? coOwnMarkGbp(b.asset))) -
            (a.position.marketValueGbp ?? a.position.units * (a.position.markPriceGbp ?? coOwnMarkGbp(a.asset))),
        ),
    [positions, assets],
  );
  if (rows.length === 0) return null;

  const totalValue = rows.reduce(
    (sum, r) =>
      sum + (r.position.marketValueGbp ?? r.position.units * (r.position.markPriceGbp ?? coOwnMarkGbp(r.asset))),
    0,
  );

  return (
    <section aria-label="Your positions" className="mt-8">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-label text-text-muted">
          Your positions
        </h2>
        <Link
          href="/co-own/portfolio"
          className="text-meta font-medium text-text-secondary hover:text-text-primary"
        >
          Portfolio · <span className="tnum">{gbp(totalValue)}</span>
        </Link>
      </div>
      <ul className="mt-3 divide-y divide-border-subtle border-y border-border-subtle">
        {rows.slice(0, 4).map(({ position, asset }) => {
          const value = position.marketValueGbp ?? position.units * (position.markPriceGbp ?? coOwnMarkGbp(asset));
          const cost = position.costBasisGbp ?? position.units * position.avgEntryPriceGbp;
          const pl = position.unrealisedPnlGbp ?? value - cost;
          const plPct = cost > 0 ? (pl / cost) * 100 : 0;
          return (
            <li key={asset.id}>
              <Link
                href={`/co-own/${asset.id}`}
                className="group flex items-center gap-3 px-1 py-3 transition-colors hover:bg-row"
              >
                <AssetThumb src={asset.imageUrl} alt="" className="h-10 w-10 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="clamp-1 text-body font-semibold text-text-primary">
                    {asset.title}
                  </p>
                  <p className="mt-0.5 text-meta text-text-muted tnum">
                    {position.units} {position.units === 1 ? 'unit' : 'units'} · avg{' '}
                    {gbp(position.avgEntryPriceGbp)}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-body font-semibold text-text-primary tnum">
                    {gbp(value)}
                  </p>
                  <p
                    className={`mt-0.5 text-meta tnum ${
                      plPct >= 0 ? 'text-coown-up' : 'text-coown-down'
                    }`}
                  >
                    {signedPct(plPct)} since entry
                  </p>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function CoOwnHubView() {
  const { data: assets, isLoading, isError, refetch } = useCoOwnAssets();
  const positionsQ = useCoOwnPositions();
  // Alert evaluation ticks anywhere market data lands — a fill elsewhere
  // in the session must still fire the viewer's triggers.
  useEvaluateCoOwnAlerts();
  const [segment, setSegment] = useState<string>(ALL);
  const [view, setView] = useState<View>('offerings');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('volume');
  const hydrated = useHydrated();
  // Persisted watchlist — empty until hydration so SSR and first paint agree.
  const storedWatchedIds = useCoOwnWatchlist((s) => s.watchedIds);
  const toggleWatch = useCoOwnWatchlist((s) => s.toggleWatch);
  const watched = useMemo(
    () => new Set(hydrated ? storedWatchedIds : []),
    [hydrated, storedWatchedIds],
  );

  const ranked = useMemo(() => sortMarkets(assets ?? [], sort), [assets, sort]);

  const segments = useMemo(() => {
    const seen: string[] = [];
    for (const a of assets ?? []) if (!seen.includes(a.category)) seen.push(a.category);
    return [ALL, ...seen];
  }, [assets]);

  const inScope = useMemo(() => {
    const list =
      view === 'offerings'
        ? ranked.filter((a) => deriveLifecycleState(a) === 'initialOffering')
        : ranked.filter((a) => deriveLifecycleState(a) !== 'initialOffering');
    return list
      .filter((a) => segment === ALL || a.category === segment)
      .filter((a) => matchesQuery(a, query));
  }, [ranked, view, segment, query]);

  const offeringCount = useMemo(
    () =>
      (assets ?? []).filter((a) => deriveLifecycleState(a) === 'initialOffering')
        .length,
    [assets],
  );
  const tradingCount = (assets?.length ?? 0) - offeringCount;

  // Watched markets, newest star first — the watchlist is a personal queue,
  // not a re-ranking of the market.
  const watchedRows = useMemo(() => {
    if (!hydrated) return [];
    const byId = new Map(ranked.map((a) => [a.id, a] as const));
    return [...storedWatchedIds].reverse().flatMap((id) => {
      const asset = byId.get(id);
      return asset ? [asset] : [];
    });
  }, [hydrated, storedWatchedIds, ranked]);

  if (isLoading) return <HubSkeleton />;

  if (isError || !assets || assets.length === 0) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:max-w-[1440px]">
        <EmptyState
          icon="trending"
          title="Markets unavailable"
          subtitle="We couldn't load the Co-Own market. Check your connection and try again."
          actionLabel="Retry"
          onAction={() => void refetch()}
        />
      </div>
    );
  }

  // Honest market-state counts — paused and exiting markets are not
  // "closed", they carry their own grammar.
  const pausedCount = assets.filter(
    (a) => deriveLifecycleState(a) === 'tradingPaused',
  ).length;
  const exitingCount = assets.filter(
    (a) => deriveLifecycleState(a) === 'exitUnderway',
  ).length;
  const openCount = assets.length - pausedCount - exitingCount;
  const totalVolume = assets.reduce((sum, a) => sum + (a.volume24hGbp ?? 0), 0);
  const featured = ranked[0]!;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-20 pt-8 sm:px-6 md:pt-10 lg:max-w-[1440px]">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <h1 className="text-editorial-display text-text-primary">Co-Own</h1>
          <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-meta text-text-secondary">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-coown-up" aria-hidden="true" />
              <span className="tnum">{openCount} open</span>
            </span>
            {pausedCount > 0 ? (
              <>
                <span aria-hidden="true" className="text-text-muted">·</span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-warning" aria-hidden="true" />
                  <span className="tnum">{pausedCount} paused</span>
                </span>
              </>
            ) : null}
            {exitingCount > 0 ? (
              <>
                <span aria-hidden="true" className="text-text-muted">·</span>
                <span className="tnum">{exitingCount} exiting</span>
              </>
            ) : null}
            <span aria-hidden="true" className="text-text-muted">·</span>
            <span className="tnum">{gbpCompact(totalVolume)} traded today</span>
          </p>
        </div>
        <nav aria-label="Co-Own" className="flex items-center gap-5">
          {/* No pool endpoints exist — in live mode the link leads
              to an honest notice, so the entry point stays hidden. */}
          {DATA_MODE !== 'live' ? (
            <Link href="/co-own/pools" className="text-body font-medium text-text-secondary underline-offset-4 hover:text-text-primary hover:underline">
              Pools
            </Link>
          ) : null}
          <Link href="/co-own/leaderboard" className="text-body font-medium text-text-secondary underline-offset-4 hover:text-text-primary hover:underline">
            Leaderboard
          </Link>
          <Link href="/co-own/ledger" className="text-body font-medium text-text-secondary underline-offset-4 hover:text-text-primary hover:underline">
            Tape
          </Link>
          <Link href="/co-own/portfolio" className="text-body font-medium text-text-secondary underline-offset-4 hover:text-text-primary hover:underline">
            Portfolio
          </Link>
          <Link href="/co-own/distributions" className="text-body font-medium text-text-secondary underline-offset-4 hover:text-text-primary hover:underline">
            Income
          </Link>
          <Link href="/co-own/alerts" className="text-body font-medium text-text-secondary underline-offset-4 hover:text-text-primary hover:underline">
            Alerts
          </Link>
          <Link href="/co-own/guide" className="text-body font-medium text-text-secondary underline-offset-4 hover:text-text-primary hover:underline">
            Guide
          </Link>
        </nav>
      </header>

      {/* Positions before highlights — holders land on what they own. */}
      {positionsQ.data ? <PositionsRail positions={positionsQ.data} assets={assets} /> : null}

      <section className="mt-8 border-b border-border-subtle pb-10">
        <FeaturedHero asset={featured} />
      </section>

      {/* Offerings / Trading / Watchlist — native section grammar; the
          category chips and search stay subordinate filters. */}
      <Tabs<View>
        className="-mx-4 mt-6 sm:-mx-6"
        railClassName="px-1 sm:px-3"
        tabs={[
          { key: 'offerings', label: 'Offerings', count: offeringCount },
          { key: 'trading', label: 'Trading', count: tradingCount },
          { key: 'watchlist', label: 'Watchlist', count: watchedRows.length },
        ]}
        active={view}
        onChange={(v) => {
          setView(v);
          setQuery('');
          setSegment(ALL);
        }}
        ariaLabel="Co-own sections"
      />
      {view !== 'watchlist' ? (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <div className="relative min-w-44 flex-1">
            <Icon
              name="search"
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={view === 'offerings' ? 'Search offerings' : 'Search markets'}
              aria-label="Search markets"
              className="h-9 w-full rounded-full border border-border-subtle bg-transparent pl-8 pr-3 text-body text-text-primary placeholder:text-text-muted focus:border-text-muted focus:outline-none"
            />
          </div>
          <div className="no-scrollbar -mx-1 flex flex-1 gap-2 overflow-x-auto px-1" role="group" aria-label="Filter by category">
            {segments.map((s) => (
              <Chip key={s} selected={segment === s} onClick={() => setSegment(s)}>
                {s}
              </Chip>
            ))}
          </div>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            aria-label="Sort markets"
            className="h-9 rounded-full border border-border-subtle bg-transparent px-3 text-meta font-medium text-text-secondary focus:border-text-muted focus:outline-none"
          >
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <p className="text-meta text-text-muted tnum" aria-live="polite">
            {inScope.length} {inScope.length === 1 ? 'market' : 'markets'}
          </p>
        </div>
      ) : null}

      <div className="mt-2">
        {view !== 'watchlist' ? (
          inScope.length > 0 ? (
            <MarketList assets={inScope} watched={watched} onToggleWatch={toggleWatch} />
          ) : (
            <EmptyState
              icon={query ? 'search' : 'trending'}
              title={query ? 'No matches' : view === 'offerings' ? 'No open offerings' : 'Nothing trading yet'}
              subtitle={
                query
                  ? `No ${view === 'offerings' ? 'offerings' : 'markets'} match “${query.trim()}”.`
                  : view === 'offerings'
                    ? 'Every drop is fully allocated right now — the secondary board carries the action.'
                    : 'Open offerings allocate first; the secondary board wakes when they fill.'
              }
              actionLabel={query ? 'Clear search' : view === 'offerings' ? 'See trading markets' : undefined}
              onAction={query ? () => setQuery('') : view === 'offerings' ? () => setView('trading') : undefined}
            />
          )
        ) : watchedRows.length > 0 ? (
          <MarketList assets={watchedRows} watched={watched} onToggleWatch={toggleWatch} />
        ) : (
          <EmptyState
            icon="star"
            title="Nothing watched yet"
            subtitle="Star a market and it waits for you here — prices, 24h moves and the week's trend at a glance."
            actionLabel="Browse markets"
            onAction={() => setView('trading')}
          />
        )}
      </div>

      <EducationBand />

      {/* First-visit explainer — renders nothing once dismissed. */}
      <CoOwnOnboardingGate />
    </div>
  );
}
