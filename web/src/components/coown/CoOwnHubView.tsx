'use client';

/**
 * Co-Own hub — orchestrator. Market status strip, featured hero, then a
 * Markets/Watchlist switch over a Polymarket-style list, education band.
 * All market data via the shared coown query hooks; watch state is the
 * persisted session watchlist the asset detail stars into.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { EmptyState } from '@/components/ui/EmptyState';
import { Tabs } from '@/components/ui/Tabs';
import { DATA_MODE } from '@/lib/api/client';
import { useCoOwnAssets, useCoOwnPositions } from '@/lib/hooks/coown-queries';
import {
  useCoOwnMarkets,
  useCoOwnWatchlistAssets,
  useCoOwnWatchlistSync,
} from '@/lib/hooks/coown-hub-queries';
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue';
import { deriveLifecycleState } from '@/lib/contracts/coown';
import type { CoOwnAsset } from '@/lib/contracts/coown';
import { useSession } from '@/lib/session/SessionProvider';
import { useCoOwnWatchlist } from '@/lib/store/coownWatchlist';
import { useHydrated } from '@/lib/store/useStore';
import { HubSkeleton } from './HubSkeleton';
import { CoOwnOnboardingGate } from './CoOwnOnboardingGate';
import { EducationBand } from './EducationBand';
import { FeaturedHero } from './FeaturedHero';
import { useEvaluateCoOwnAlerts } from './alertStore';
import {
  ALL_SEGMENTS,
  matchesQuery,
  sortMarkets,
  type HubSortKey,
  type HubView,
} from './hub/hubTypes';
import { HubHeader } from './hub/HubHeader';
import { HubPositionsRail } from './hub/HubPositionsRail';
import { HubMarketControls } from './hub/HubMarketControls';
import { HubMarketBoard } from './hub/HubMarketBoard';

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

  const [segment, setSegment] = useState<string>(ALL_SEGMENTS);
  const [view, setView] = useState<HubView>('offerings');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<HubSortKey>('volume');
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

  // Category chips span every loaded payload, not just the universe page
  const segments = useMemo(() => {
    const seen: string[] = [];
    for (const a of knownAssets) {
      if (a.category && !seen.includes(a.category)) seen.push(a.category);
    }
    return [ALL_SEGMENTS, ...seen];
  }, [knownAssets]);

  const inScope = useMemo(() => {
    const scoped = marketRows
      .filter((a) =>
        view === 'offerings'
          ? deriveLifecycleState(a) === 'initialOffering'
          : deriveLifecycleState(a) !== 'initialOffering',
      )
      .filter((a) => segment === ALL_SEGMENTS || a.category === segment);
    const searched =
      DATA_MODE === 'live' ? scoped : scoped.filter((a) => matchesQuery(a, query));
    return DATA_MODE === 'live' ? searched : sortMarkets(searched, sort);
  }, [marketRows, view, segment, query, sort]);

  // Tab counts cover every loaded payload
  const offeringCount = useMemo(
    () =>
      knownAssets.filter((a) => deriveLifecycleState(a) === 'initialOffering')
        .length,
    [knownAssets],
  );
  const tradingCount = knownAssets.length - offeringCount;

  // Watched markets — the watchlist is a personal queue
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
  const heroAsset = useMemo(() => {
    if (view === 'watchlist') return watchedRows[0] ?? null;
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

  const pausedCount = knownAssets.filter(
    (a) => deriveLifecycleState(a) === 'tradingPaused',
  ).length;
  const exitingCount = knownAssets.filter(
    (a) => deriveLifecycleState(a) === 'exitUnderway',
  ).length;
  const openCount = knownAssets.length - pausedCount - exitingCount;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-20 pt-8 sm:px-6 md:pt-10 lg:max-w-[1440px]">
      <HubHeader
        openCount={openCount}
        pausedCount={pausedCount}
        exitingCount={exitingCount}
        totalCount={knownAssets.length}
      />

      {positionsQ.data ? (
        <HubPositionsRail positions={positionsQ.data} assets={knownAssets} />
      ) : null}

      {heroAsset ? (
        <section className="mt-8 border-b border-border-subtle pb-10">
          <FeaturedHero asset={heroAsset} />
        </section>
      ) : null}

      <Tabs<HubView>
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
          setSegment(ALL_SEGMENTS);
        }}
        ariaLabel="Co-own sections"
      />

      {view !== 'watchlist' ? (
        <HubMarketControls
          view={view}
          query={query}
          onQueryChange={setQuery}
          segments={segments}
          segment={segment}
          onSegmentChange={setSegment}
          sort={sort}
          onSortChange={setSort}
          count={inScope.length}
        />
      ) : null}

      <div className="mt-2">
        <HubMarketBoard
          view={view}
          user={user}
          query={query}
          onClearQuery={() => setQuery('')}
          onSwitchView={setView}
          inScope={inScope}
          marketRows={marketRows}
          watchedRows={watchedRows}
          watched={watched}
          onToggleWatch={toggleWatch}
          isMarketsError={marketsQ.isError}
          onRetryMarkets={() => void marketsQ.refetch()}
          hasNextPage={marketsQ.hasNextPage}
          isFetchingNextPage={marketsQ.isFetchingNextPage}
          isFetchNextPageError={marketsQ.isFetchNextPageError}
          onFetchNextPage={() => {
            if (!marketsQ.isFetchingNextPage) void marketsQ.fetchNextPage();
          }}
          isWatchlistPending={watchlistQ.isPending}
          isWatchlistError={watchlistQ.isError}
          onRetryWatchlist={() => void watchlistQ.refetch()}
        />
      </div>

      <EducationBand />
      <CoOwnOnboardingGate />
    </div>
  );
}
