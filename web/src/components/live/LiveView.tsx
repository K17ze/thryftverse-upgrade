'use client';

/**
 * Live shopping home — orchestrator. Category-segmented rails (Whatnot
 * grammar: one filter over everything), LIVE NOW dominant media, today's
 * schedule as a timetable, Coming up rail, Replays grid. Skeleton mirrors
 * geometry; empty states are authored and category-honest. Mirrors
 * mobile's LiveShoppingHomeScreen surface grammar.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { LiveSession } from '@/lib/data/fixtures-media';
import { useLiveSessions, liveSellerOf } from './useLiveSessions';
import { LiveNowCard } from './LiveNowCard';
import { UpcomingRail, formatScheduled } from './UpcomingRail';
import { ReplaysGrid } from './ReplaysGrid';
import { ScheduleTimeline, isSameDay } from './ScheduleTimeline';
import { LiveViewerOverlay } from './LiveViewerOverlay';
import { LiveBadge } from './LiveBadge';
import { SegmentedControl } from '@/components/feed/SegmentedControl';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { Icon } from '@/components/ui/Icon';
import { AppImage } from '@/components/ui/AppImage';
import { useSession } from '@/lib/session/SessionProvider';

function SectionHeader({ title, meta }: { title: string; meta?: string }) {
  return (
    <div className="mb-3 flex items-baseline justify-between">
      <h2 className="text-section-title font-semibold text-text-primary">{title}</h2>
      {meta ? <span className="tnum text-meta text-text-muted">{meta}</span> : null}
    </div>
  );
}

function LiveSkeleton() {
  return (
    <div className="space-y-10" aria-busy aria-label="Loading live shopping">
      <div>
        <Skeleton className="mb-3 h-6 w-28" />
        <Skeleton className="aspect-[4/3] w-full rounded-xl sm:aspect-[21/9]" />
      </div>
      <div>
        <Skeleton className="mb-3 h-6 w-32" />
        <div className="flex gap-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="w-[220px] shrink-0">
              <Skeleton className="aspect-[4/5] w-full rounded-lg" />
              <Skeleton className="mt-2.5 h-4 w-4/5" />
              <Skeleton className="mt-2 h-3 w-2/5" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

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

  // Today's timetable vs the later rail — honest split, no padded rows.
  const now = new Date();
  const todays = upcoming.filter((s) => s.scheduledAt != null && isSameDay(s.scheduledAt, now));
  const later = upcoming.filter(
    (s) => s.scheduledAt == null || !isSameDay(s.scheduledAt, now),
  );

  if (live.length === 0 && upcoming.length === 0 && replays.length === 0) {
    return (
      <div className="pb-10">
        <CategoryFilter
          categories={categories}
          category={category}
          onChange={setCategory}
        />
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
        {/* Category rails — one filter across every section; only when
            the contract actually carries more than one category. */}
        {categories.length > 1 ? (
          <div className="no-scrollbar -mx-4 overflow-x-auto px-4 sm:-mx-6 sm:px-6">
            <CategoryFilter
              categories={categories}
              category={category}
              onChange={setCategory}
              className="w-max"
            />
          </div>
        ) : null}

        {/* Live now */}
        <section aria-label="Live now">
          <SectionHeader
            title="Live now"
            meta={live.length ? `${live.length} streaming` : undefined}
          />
          {hero ? (
            <>
              <LiveNowCard session={hero} onWatch={openSession} variant="hero" />
              {restLive.length > 0 ? (
                <div className="no-scrollbar -mx-4 mt-4 flex gap-4 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6">
                  {restLive.map((s) => (
                    <LiveNowCard key={s.id} session={s} onWatch={openSession} />
                  ))}
                </div>
              ) : null}
            </>
          ) : (
            <p className="flex items-center gap-2 py-2 text-body text-text-secondary">
              <Icon name="videocam" size={16} className="text-text-muted" />
              {category === 'all'
                ? 'Nothing live right now — the next shows are below.'
                : `Nothing live in ${category} right now — the next shows are below.`}
            </p>
          )}
        </section>

        {/* Today's schedule — timetable rows while the day has bookings */}
        {todays.length > 0 ? (
          <section aria-label="Today's schedule">
            <SectionHeader title="Today's schedule" meta={`${todays.length} today`} />
            <ScheduleTimeline sessions={todays} />
          </section>
        ) : null}

        {/* Coming up — scheduled beyond today */}
        {later.length > 0 ? (
          <section aria-label="Coming up">
            <SectionHeader title="Coming up" meta={`${later.length} scheduled`} />
            <UpcomingRail sessions={later} />
          </section>
        ) : null}

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

/** One row of "Your shows" — hairline timetable grammar shared with the
 *  schedule timeline: status where the clock sits, title, scheduled time,
 *  chevron into that show's host console. */
function YourShowRow({ session }: { session: LiveSession }) {
  const seller = liveSellerOf(session);
  return (
    <li>
      <Link
        href={`/live/host/${session.id}`}
        aria-label={`Manage “${session.title}” — host console`}
        className="pressable -mx-2 flex items-center gap-3 rounded-md px-2 py-2.5 hover:bg-surface-alt"
      >
        <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-md bg-surface-alt">
          <AppImage
            src={session.coverUri}
            alt=""
            fill
            sizes="44px"
            className="h-full w-full"
          />
        </span>
        <span className="min-w-0 flex-1">
          <span className="clamp-1 block text-body-emphasis text-text-primary">
            {session.title}
          </span>
          <span className="tnum mt-0.5 block text-meta text-text-muted">
            {session.status === 'upcoming' && session.scheduledAt
              ? formatScheduled(session.scheduledAt)
              : session.status === 'ended'
                ? `Ended${session.durationMinutes != null ? ` · ${session.durationMinutes} min` : ''}`
                : (seller?.username ? `@${seller.username}` : 'On air')}
          </span>
        </span>
        {session.status === 'live' ? (
          <LiveBadge className="shrink-0" />
        ) : (
          <span className="shrink-0 rounded-md bg-surface-alt px-2 py-1 text-meta font-semibold uppercase tracking-wide text-text-secondary">
            {session.status === 'upcoming' ? 'Scheduled' : 'Replay'}
          </span>
        )}
        <Icon name="forward" size={16} className="shrink-0 text-text-muted" />
      </Link>
    </li>
  );
}

function CategoryFilter({
  categories,
  category,
  onChange,
  className,
}: {
  categories: string[];
  category: string;
  onChange: (next: string) => void;
  className?: string;
}) {
  return (
    <SegmentedControl
      options={[
        { value: 'all', label: 'All' },
        ...categories.map((name) => ({ value: name, label: name })),
      ]}
      value={category}
      onChange={onChange}
      className={className}
    />
  );
}
