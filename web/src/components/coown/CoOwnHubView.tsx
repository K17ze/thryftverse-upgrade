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
import { SegmentedControl } from '@/components/feed/SegmentedControl';
import { useCoOwnAssets } from '@/lib/hooks/coown-queries';
import { deriveLifecycleState } from '@/lib/contracts/coown';
import { useCoOwnWatchlist } from '@/lib/store/coownWatchlist';
import { useHydrated } from '@/lib/store/useStore';
import { HubSkeleton } from './HubSkeleton';
import { CoOwnOnboardingGate } from './CoOwnOnboardingGate';
import { EducationBand } from './EducationBand';
import { FeaturedHero } from './FeaturedHero';
import { MarketList } from './MarketList';
import { gbpCompact } from './format';

const ALL = 'All';

type View = 'markets' | 'watchlist';

export function CoOwnHubView() {
  const { data: assets, isLoading, isError, refetch } = useCoOwnAssets();
  const [segment, setSegment] = useState<string>(ALL);
  const [view, setView] = useState<View>('markets');
  const hydrated = useHydrated();
  // Persisted watchlist — empty until hydration so SSR and first paint agree.
  const storedWatchedIds = useCoOwnWatchlist((s) => s.watchedIds);
  const toggleWatch = useCoOwnWatchlist((s) => s.toggleWatch);
  const watched = useMemo(
    () => new Set(hydrated ? storedWatchedIds : []),
    [hydrated, storedWatchedIds],
  );

  const ranked = useMemo(
    () => [...(assets ?? [])].sort((a, b) => (b.volume24hGbp ?? -1) - (a.volume24hGbp ?? -1)),
    [assets],
  );

  const segments = useMemo(() => {
    const seen: string[] = [];
    for (const a of assets ?? []) if (!seen.includes(a.category)) seen.push(a.category);
    return [ALL, ...seen];
  }, [assets]);

  const visible = useMemo(
    () => (segment === ALL ? ranked : ranked.filter((a) => a.category === segment)),
    [ranked, segment],
  );

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
      <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
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

  const openCount = assets.filter((a) => {
    const s = deriveLifecycleState(a);
    return s === 'initialOffering' || s === 'secondaryTrading';
  }).length;
  const closedCount = assets.length - openCount;
  const totalVolume = assets.reduce((sum, a) => sum + (a.volume24hGbp ?? 0), 0);
  const featured = ranked[0]!;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-20 pt-8 sm:px-6 md:pt-10">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <h1 className="text-editorial-display text-text-primary">Co-Own</h1>
          <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-meta text-text-secondary">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-coown-up" aria-hidden="true" />
              <span className="tnum">{openCount} open</span>
            </span>
            <span aria-hidden="true" className="text-text-muted">·</span>
            <span className="tnum">{closedCount} closed</span>
            <span aria-hidden="true" className="text-text-muted">·</span>
            <span className="tnum">{gbpCompact(totalVolume)} traded today</span>
          </p>
        </div>
        <nav aria-label="Co-Own" className="flex items-center gap-5">
          <Link href="/co-own/syndicate" className="text-body font-medium text-text-secondary underline-offset-4 hover:text-text-primary hover:underline">
            Syndicates
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
          <Link href="/help" className="text-body font-medium text-text-secondary underline-offset-4 hover:text-text-primary hover:underline">
            How it works
          </Link>
        </nav>
      </header>

      <section className="mt-8 border-b border-border-subtle pb-10">
        <FeaturedHero asset={featured} />
      </section>

      {/* Markets / Watchlist — the watchlist rides the same dense rows */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle pb-4">
        <SegmentedControl<View>
          options={[
            { value: 'markets', label: 'Markets' },
            { value: 'watchlist', label: 'Watchlist', count: watchedRows.length },
          ]}
          value={view}
          onChange={setView}
        />
        {view === 'markets' ? (
          <>
            <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4" role="group" aria-label="Filter by category">
              {segments.map((s) => (
                <Chip key={s} selected={segment === s} onClick={() => setSegment(s)}>
                  {s}
                </Chip>
              ))}
            </div>
            <p className="text-meta text-text-muted tnum" aria-live="polite">
              {visible.length} {visible.length === 1 ? 'market' : 'markets'}
            </p>
          </>
        ) : null}
      </div>

      <div className="mt-2">
        {view === 'markets' ? (
          <MarketList assets={visible} watched={watched} onToggleWatch={toggleWatch} />
        ) : watchedRows.length > 0 ? (
          <MarketList assets={watchedRows} watched={watched} onToggleWatch={toggleWatch} />
        ) : (
          <EmptyState
            icon="star"
            title="Nothing watched yet"
            subtitle="Star a market and it waits for you here — prices, 24h moves and the week's trend at a glance."
            actionLabel="Browse markets"
            onAction={() => setView('markets')}
          />
        )}
      </div>

      <EducationBand />

      {/* First-visit explainer — renders nothing once dismissed. */}
      <CoOwnOnboardingGate />
    </div>
  );
}
