'use client';

/**
 * Co-Own hub — orchestrator. Market status strip, featured hero, then a
 * Markets/Watchlist switch over a Polymarket-style list, education band.
 * All market data via the shared coown query hooks; watch state is the
 * persisted session watchlist the asset detail stars into.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { Tabs } from '@/components/ui/Tabs';
import { DATA_MODE } from '@/lib/api/client';
import { useCoOwnAssets, useCoOwnPositions } from '@/lib/hooks/coown-queries';
import {
  useCoOwnMarkets,
  useCoOwnWatchlistAssets,
  useCoOwnWatchlistSync,
  type CoOwnMarketsSort,
} from '@/lib/hooks/coown-hub-queries';
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue';
import { coOwnMarkGbp, deriveLifecycleState } from '@/lib/contracts/coown';
import type {
  AssetLifecycleState,
  CoOwnAsset,
  CoOwnPosition,
} from '@/lib/contracts/coown';
import { useSession } from '@/lib/session/SessionProvider';
import { useCoOwnWatchlist } from '@/lib/store/coownWatchlist';
import { useHydrated } from '@/lib/store/useStore';
import { HubSkeleton } from './HubSkeleton';
import { CoOwnOnboardingGate } from './CoOwnOnboardingGate';
import { EducationBand } from './EducationBand';
import { FeaturedHero } from './FeaturedHero';
import { MarketList } from './MarketList';
import { AssetThumb } from './AssetThumb';
import { useEvaluateCoOwnAlerts } from './alertStore';
import { gbp, signedPct } from './format';

const ALL = 'All';

// Native hub grammar: Offerings are initial allocations, Trading is the
// secondary market (including paused/exiting rows, which still trade
// context), Watchlist is the viewer's own queue.
type View = 'offerings' | 'trading' | 'watchlist';

// The hub-query layer owns the vocabulary — it maps each key onto the
// endpoint's `sort` wire values in live mode.
type SortKey = CoOwnMarketsSort;

const SORTS: { value: SortKey; label: string }[] = [
  { value: 'volume', label: 'Volume' },
  { value: 'newest', label: 'Newest' },
  // Movers ranks by |24h move| — the endpoint has no wire sort for it,
  // so live mode omits the option rather than re-ordering one loaded
  // page while paging claims server order.
  ...(DATA_MODE === 'live' ? [] : [{ value: 'movers' as SortKey, label: 'Movers' }]),
  { value: 'price_desc', label: 'Price ↓' },
  { value: 'price_asc', label: 'Price ↑' },
];

/** Lifecycle states worth a row tag per tab — the tab already asserts
 *  its rows' state, so a plain trading row on the Trading board stays
 *  quiet; the Watchlist mixes states, so offering rows keep their tag. */
const INFORMATIVE_TAG_STATES: Record<View, readonly AssetLifecycleState[]> = {
  offerings: ['tradingPaused', 'exitUnderway'],
  trading: ['tradingPaused', 'exitUnderway'],
  watchlist: ['initialOffering', 'tradingPaused', 'exitUnderway'],
};

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

/** Watchlist-tab loading rows — same grammar as HubSkeleton's market rows. */
function WatchlistRowsSkeleton() {
  return (
    <ul className="divide-y divide-border-subtle" aria-busy="true" aria-label="Loading watchlist">
      {Array.from({ length: 4 }).map((_, i) => (
        <li key={i} className="flex items-center gap-4 px-1 py-4">
          <Skeleton className="h-12 w-12 shrink-0 rounded-lg" />
          <div className="min-w-0 flex-1">
            <Skeleton className="h-4" style={{ maxWidth: `${52 - (i % 3) * 9}%` }} />
            <Skeleton className="mt-2 h-3 w-24" />
          </div>
          <Skeleton className="h-4 w-16" />
          <Skeleton className="hidden h-6 w-20 sm:block" />
          <Skeleton className="hidden h-4 w-12 md:block" />
          <Skeleton className="h-4 w-14" />
        </li>
      ))}
    </ul>
  );
}

export function CoOwnHubView() {
  // The unfiltered universe read — the featured hero's editorial pick
  // and the positions rail resolve here; header counts, category chips
  // and tab counts span every loaded payload (universe + paged market
  // rows + watchlist) since no endpoint reports global totals. The
  // browsable list paginates through useCoOwnMarkets.
  const { data: assets, isLoading, isError, refetch } = useCoOwnAssets();
  const positionsQ = useCoOwnPositions();
  const { user } = useSession();
  // Live + signed-in: hydrate the star store off GET /co-own/watchlist
  // (once per account) and toast a failed write after its rollback.
  // Guests and fixture mode never reach the API.
  useCoOwnWatchlistSync();
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

  // Server-side search in live mode — the debounced term rides the query
  // key, so typing batches into one request per pause. Fixture mode
  // keeps the local match over the authored page.
  const debouncedQuery = useDebouncedValue(query, 300);
  const marketsQ = useCoOwnMarkets({
    search: debouncedQuery,
    tab: view,
    sort,
    enabled: view !== 'watchlist',
  });
  const marketRows = useMemo(() => marketsQ.data ?? [], [marketsQ.data]);

  // The server watchlist — payloads for the Watchlist tab in live mode.
  // The same cache entry feeds the store's hydration; opening the tab
  // re-reads so stars written since (here or on another device)
  // reconcile on activation.
  const watchlistQ = useCoOwnWatchlistAssets();
  const refetchWatchlistRef = useRef(watchlistQ.refetch);
  useEffect(() => {
    refetchWatchlistRef.current = watchlistQ.refetch;
  }, [watchlistQ.refetch]);
  useEffect(() => {
    if (view === 'watchlist' && DATA_MODE === 'live' && user) {
      void refetchWatchlistRef.current();
    }
  }, [view, user]);

  // Every asset payload currently in hand — universe page, paged market
  // rows, server watchlist — keyed by id for the watchlist tab and the
  // positions rail (a held or watched asset isn't always on page one).
  const knownById = useMemo(() => {
    const map = new Map<string, CoOwnAsset>();
    for (const a of assets ?? []) map.set(a.id, a);
    for (const a of marketRows) map.set(a.id, a);
    for (const a of watchlistQ.data ?? []) map.set(a.id, a);
    return map;
  }, [assets, marketRows, watchlistQ.data]);
  const knownAssets = useMemo(() => [...knownById.values()], [knownById]);

  // Category chips span every loaded payload, not just the universe
  // page — a segment whose rows only arrived on page two still earns
  // its chip. Skip empty strings so the rail never renders a blank chip.
  const segments = useMemo(() => {
    const seen: string[] = [];
    for (const a of knownAssets) {
      if (a.category && !seen.includes(a.category)) seen.push(a.category);
    }
    return [ALL, ...seen];
  }, [knownAssets]);

  const inScope = useMemo(() => {
    const scoped = marketRows
      .filter((a) =>
        view === 'offerings'
          ? deriveLifecycleState(a) === 'initialOffering'
          : deriveLifecycleState(a) !== 'initialOffering',
      )
      .filter((a) => segment === ALL || a.category === segment);
    // Live rows arrive server-filtered by the debounced search and
    // server-ordered by the sort key — a local pass over just the loaded
    // pages would wrongly drop jurisdiction matches and silently
    // re-sort a paged order. Fixture rows keep both local passes over
    // the authored page.
    const searched =
      DATA_MODE === 'live' ? scoped : scoped.filter((a) => matchesQuery(a, query));
    return DATA_MODE === 'live' ? searched : sortMarkets(searched, sort);
  }, [marketRows, view, segment, query, sort]);

  // Tab counts cover every loaded payload — the endpoints expose no
  // global totals, so the numbers describe the loaded set, nothing more.
  const offeringCount = useMemo(
    () =>
      knownAssets.filter((a) => deriveLifecycleState(a) === 'initialOffering')
        .length,
    [knownAssets],
  );
  const tradingCount = knownAssets.length - offeringCount;

  // Watched markets — the watchlist is a personal queue, not a re-ranking
  // of the market. Live + signed-in renders the server list filtered by
  // the local store (the optimistic membership truth — a just-unstarred
  // row drops instantly); stars added since the last read render from
  // already-loaded payloads, ahead of the server order (newest first).
  // Guests and fixtures resolve local ids against the loaded markets.
  const watchedRows = useMemo(() => {
    if (!hydrated) return [];
    if (DATA_MODE === 'live' && user) {
      const serverRows = (watchlistQ.data ?? []).filter((a) => watched.has(a.id));
      const covered = new Set(serverRows.map((a) => a.id));
      const pending = [...storedWatchedIds].reverse().flatMap((id) => {
        if (covered.has(id)) return [];
        const asset = knownById.get(id);
        return asset ? [asset] : [];
      });
      return [...pending, ...serverRows];
    }
    return [...storedWatchedIds].reverse().flatMap((id) => {
      const asset = knownById.get(id);
      return asset ? [asset] : [];
    });
  }, [hydrated, storedWatchedIds, watchlistQ.data, knownById, user, watched]);

  // Editorial hero — resolved before the sort control touches anything.
  // The universe read arrives in the endpoint's default order (volume),
  // so its deepest market by 24h volume leads regardless of how the
  // list below is sorted. On the Watchlist tab the viewer's own first
  // row leads; an empty watchlist hides the hero rather than borrowing
  // an unrelated market.
  const heroAsset = useMemo(() => {
    if (view === 'watchlist') return watchedRows[0] ?? null;
    // Native parity: holders get the positions rail, not a promo hero —
    // the hero's job is pulling a non-holder into their first market.
    if ((positionsQ.data?.length ?? 0) > 0) return null;
    let best: CoOwnAsset | null = null;
    for (const a of assets ?? []) {
      if (!best || (a.volume24hGbp ?? -1) > (best.volume24hGbp ?? -1)) best = a;
    }
    return best;
  }, [view, assets, watchedRows, positionsQ.data]);

  if (isLoading || (view !== 'watchlist' && marketsQ.isPending)) {
    return <HubSkeleton />;
  }

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

  // Market-state counts over every loaded payload — paused and exiting
  // markets are not "closed", they carry their own grammar. The endpoint
  // exposes no global totals, so the header scopes itself ("N of M"):
  // the numbers describe the board as loaded, never a market-wide claim.
  // No "traded today" line — a partial-page volume sum can't carry it.
  const pausedCount = knownAssets.filter(
    (a) => deriveLifecycleState(a) === 'tradingPaused',
  ).length;
  const exitingCount = knownAssets.filter(
    (a) => deriveLifecycleState(a) === 'exitUnderway',
  ).length;
  const openCount = knownAssets.length - pausedCount - exitingCount;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-20 pt-8 sm:px-6 md:pt-10 lg:max-w-[1440px]">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <h1 className="text-editorial-display text-text-primary">Co-Own</h1>
          <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-meta text-text-secondary">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-coown-up" aria-hidden="true" />
              <span className="tnum">
                {openCount} of {knownAssets.length} open
              </span>
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
          <Link href="/co-own/orders" className="text-body font-medium text-text-secondary underline-offset-4 hover:text-text-primary hover:underline">
            Orders
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
          {/* Issuance — the route itself runs the issuer/KYC preflight
              and shows an honest notice in fixture mode. */}
          <Link href="/co-own/create" className="text-body font-medium text-text-primary underline-offset-4 hover:underline">
            Issue
          </Link>
        </nav>
      </header>

      {/* Positions before highlights — holders land on what they own. */}
      {positionsQ.data ? (
        <PositionsRail positions={positionsQ.data} assets={knownAssets} />
      ) : null}

      {heroAsset ? (
        <section className="mt-8 border-b border-border-subtle pb-10">
          <FeaturedHero asset={heroAsset} />
        </section>
      ) : null}

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
          marketsQ.isError && marketRows.length === 0 ? (
            <EmptyState
              icon="warning"
              title="Couldn't load markets"
              subtitle="Check your connection and try again."
              actionLabel="Retry"
              onAction={() => void marketsQ.refetch()}
            />
          ) : inScope.length > 0 ? (
            <MarketList
              assets={inScope}
              watched={watched}
              onToggleWatch={toggleWatch}
              lifecycleTagStates={INFORMATIVE_TAG_STATES[view]}
              hasMore={DATA_MODE === 'live' && marketsQ.hasNextPage === true}
              isLoadingMore={marketsQ.isFetchingNextPage}
              loadMoreError={marketsQ.isFetchNextPageError}
              onLoadMore={() => {
                if (!marketsQ.isFetchingNextPage) void marketsQ.fetchNextPage();
              }}
            />
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
        ) : DATA_MODE === 'live' && user ? (
          watchlistQ.isPending ? (
            <WatchlistRowsSkeleton />
          ) : watchlistQ.isError ? (
            <EmptyState
              icon="warning"
              title="Couldn't load your watchlist"
              subtitle="Check your connection and try again."
              actionLabel="Retry"
              onAction={() => void watchlistQ.refetch()}
            />
          ) : watchedRows.length > 0 ? (
            <MarketList
              assets={watchedRows}
              watched={watched}
              onToggleWatch={toggleWatch}
              lifecycleTagStates={INFORMATIVE_TAG_STATES.watchlist}
            />
          ) : (
            <EmptyState
              icon="star"
              title="Nothing watched yet"
              subtitle="Star a market and it waits for you here — prices, 24h moves and the week's trend at a glance."
              actionLabel="Browse markets"
              onAction={() => setView('trading')}
            />
          )
        ) : watchedRows.length > 0 ? (
          <MarketList
            assets={watchedRows}
            watched={watched}
            onToggleWatch={toggleWatch}
            lifecycleTagStates={INFORMATIVE_TAG_STATES.watchlist}
          />
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
