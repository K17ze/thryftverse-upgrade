'use client';

/**
 * Live shopping home — orchestrator. A flat category chip row (one filter
 * over everything), LIVE NOW as dominant hero + a right-docked board of
 * compact rows (the rest of the on-air lineup, then the schedule in
 * chronological order), Your shows for the host, Replays grid. Skeleton
 * mirrors geometry; empty states are authored and category-honest.
 * Mirrors mobile's LiveShoppingHomeScreen surface grammar.
 */

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { LiveSession } from '@/lib/data/fixtures-media';
import { useLiveSessions } from './useLiveSessions';
import { LiveNowCard } from './LiveNowCard';
import { ReplaysGrid } from './ReplaysGrid';
import { LiveViewerOverlay } from './LiveViewerOverlay';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { useSession } from '@/lib/session/SessionProvider';
import { SectionHeader, LiveSkeleton } from './hub/LiveSkeleton';
import { CategoryFilter } from './hub/CategoryFilter';
import { YourShowRow } from './hub/YourShowRow';
import { LiveDock } from './hub/LiveDock';

export function LiveView() {
  const router = useRouter();
  const { user } = useSession();
  const { data, isLoading, isError, refetch } = useLiveSessions();
  const [watching, setWatching] = useState<LiveSession | null>(null);
  const [category, setCategory] = useState('all');

  // Deep link — /live?watch=<id> lands straight on the show surface, so
  // a shared live card opens the same overlay a tap does.
  useEffect(() => {
    if (!data || watching) return;
    const id = new URLSearchParams(window.location.search).get('watch');
    if (!id) return;
    const target = data.find((s) => s.id === id);
    if (target) {
      setWatching(target);
    } else {
      // Stale or session-scoped id — drop the param rather than 404 the show.
      window.history.replaceState(null, '', '/live');
    }
  }, [data, watching]);

  // The param write is synchronous history state, not a router nav — a
  // close must clear it before state resets or the effect above would
  // read the stale ?watch and reopen the overlay.
  const openSession = (s: LiveSession) => {
    setWatching(s);
    window.history.replaceState(
      null,
      '',
      `/live?watch=${encodeURIComponent(s.id)}`,
    );
  };
  const closeSession = () => {
    window.history.replaceState(null, '', '/live');
    setWatching(null);
  };

  // Segments come from the sessions themselves — no invented taxonomy.
  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of data ?? []) {
      if (s.category) counts.set(s.category, (counts.get(s.category) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([name]) => name);
  }, [data]);

  if (isLoading) return <LiveSkeleton />;

  if (isError || !data) {
    return (
      <EmptyState
        icon="videocam"
        title="Live shopping unavailable"
        subtitle="We couldn't load the schedule. Check your connection and try again."
        actionLabel="Retry"
        onAction={() => void refetch()}
      />
    );
  }

  if (data.length === 0) {
    return (
      <EmptyState
        icon="videocam"
        title="No shows scheduled"
        subtitle="Live drops from sellers you follow will appear here."
        actionLabel="Explore items"
        onAction={() => router.push('/explore')}
      />
    );
  }

  const inCategory = (s: LiveSession) => category === 'all' || s.category === category;

  const live = data.filter((s) => s.status === 'live' && inCategory(s));
  const upcoming = data.filter((s) => s.status === 'upcoming' && inCategory(s));
  const replays = data.filter((s) => s.status === 'ended' && inCategory(s));

  // The dock's "Up next" column — chronological; shows with no clock time
  // settle at the end rather than jumping the queue.
  const upNext = [...upcoming].sort((a, b) => {
    if (a.scheduledAt == null) return b.scheduledAt == null ? 0 : 1;
    if (b.scheduledAt == null) return -1;
    return a.scheduledAt.localeCompare(b.scheduledAt);
  });

  if (live.length === 0 && upcoming.length === 0 && replays.length === 0) {
    return (
      <div className="pb-10">
        <div className="no-scrollbar -mx-4 overflow-x-auto border-b border-border-subtle px-4 pb-4 sm:-mx-6 sm:px-6">
          <CategoryFilter
            categories={categories}
            category={category}
            onChange={setCategory}
            className="w-max"
          />
        </div>
        <div className="mt-8">
          <EmptyState
            icon="videocam"
            title={`No ${category} shows`}
            subtitle="Nothing scheduled in this category right now."
            actionLabel="Browse all shows"
            onAction={() => setCategory('all')}
          />
        </div>
      </div>
    );
  }

  const [hero, ...restLive] = live;

  // The viewer's own shows — the host surface index. Real membership only
  // (sellerId === session user); nothing renders for guests or sellers
  // with no shows. Rows route to the actual console for that show.
  const mine = user ? data.filter((s) => s.sellerId === user.id) : [];

  // Keep the watched session pinned to the latest hub data — a host
  // ending their show flips the cached session to 'ended', and the
  // overlay should stop claiming it's live.
  const watchingFresh =
    (watching && data.find((s) => s.id === watching.id)) ?? watching;

  return (
    <>
      <div className="space-y-10 pb-10">
        {/* Category chips — one filter across the surface; flat chip row
            on canvas with a hairline, the home/explore grammar (no bar). */}
        {categories.length > 1 ? (
          <div className="no-scrollbar -mx-4 overflow-x-auto border-b border-border-subtle px-4 pb-4 sm:-mx-6 sm:px-6">
            <CategoryFilter
              categories={categories}
              category={category}
              onChange={setCategory}
              className="w-max"
            />
          </div>
        ) : null}

        {/* Live now — the hero keeps the stage; the rest of the on-air
            board and the forward schedule dock as compact media rows in
            a right column, so a second live show is never a sliver under
            the fold. */}
        <section aria-label="Live now">
          <SectionHeader
            title="Live now"
            meta={live.length ? `${live.length} streaming` : undefined}
          />
          {hero ? (
            <div
              className={
                restLive.length > 0 || upNext.length > 0
                  ? 'grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,8fr)_minmax(0,5fr)] lg:gap-8'
                  : ''
              }
            >
              <LiveNowCard session={hero} onWatch={openSession} variant="hero" />
              {restLive.length > 0 || upNext.length > 0 ? (
                <LiveDock live={restLive} upcoming={upNext} onWatch={openSession} />
              ) : null}
            </div>
          ) : (
            <p className="flex items-center gap-2 py-2 text-body text-text-secondary">
              <Icon name="videocam" size={16} className="text-text-muted" />
              {category === 'all'
                ? 'Nothing live right now — the next shows are below.'
                : `Nothing live in ${category} right now — the next shows are below.`}
            </p>
          )}
          {!hero && upNext.length > 0 ? (
            <LiveDock live={[]} upcoming={upNext} onWatch={openSession} className="mt-6" />
          ) : null}
        </section>

        {/* Your shows — the seller's own lineup/past shows, linking back
            to the host console each row belongs to. */}
        {mine.length > 0 ? (
          <section aria-label="Your shows">
            <SectionHeader title="Your shows" meta={`${mine.length}`} />
            <ul className="divide-y divide-border-subtle border-y border-border-subtle">
              {mine.map((s) => (
                <YourShowRow key={s.id} session={s} />
              ))}
            </ul>
          </section>
        ) : null}

        {/* Replays */}
        {replays.length > 0 ? (
          <section aria-label="Replays">
            <SectionHeader title="Replays" meta={`${replays.length} shows`} />
            <ReplaysGrid sessions={replays} onPlay={openSession} />
          </section>
        ) : null}
      </div>

      <LiveViewerOverlay session={watchingFresh} onClose={closeSession} />
    </>
  );
}
