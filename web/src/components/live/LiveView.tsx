'use client';

/**
 * Live shopping home — orchestrator. Category-segmented rails (Whatnot
 * grammar: one filter over everything), LIVE NOW dominant media, today's
 * schedule as a timetable, Coming up rail, Replays grid. Skeleton mirrors
 * geometry; empty states are authored and category-honest. Mirrors
 * mobile's LiveShoppingHomeScreen surface grammar.
 */

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { LiveSession } from '@/lib/data/fixtures-media';
import { useLiveSessions } from './useLiveSessions';
import { LiveNowCard } from './LiveNowCard';
import { UpcomingRail } from './UpcomingRail';
import { ReplaysGrid } from './ReplaysGrid';
import { ScheduleTimeline, isSameDay } from './ScheduleTimeline';
import { LiveViewerOverlay } from './LiveViewerOverlay';
import { SegmentedControl } from '@/components/feed/SegmentedControl';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { Icon } from '@/components/ui/Icon';

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
  const { data, isLoading, isError, refetch } = useLiveSessions();
  const [watching, setWatching] = useState<LiveSession | null>(null);
  const [category, setCategory] = useState('all');

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

  return (
    <>
      <div className="space-y-10 pb-10">
        {/* Category rails — one filter across every section */}
        {categories.length > 0 ? (
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
              <LiveNowCard session={hero} onWatch={setWatching} variant="hero" />
              {restLive.length > 0 ? (
                <div className="no-scrollbar -mx-4 mt-4 flex gap-4 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6">
                  {restLive.map((s) => (
                    <LiveNowCard key={s.id} session={s} onWatch={setWatching} />
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

        {/* Replays */}
        {replays.length > 0 ? (
          <section aria-label="Replays">
            <SectionHeader title="Replays" meta={`${replays.length} shows`} />
            <ReplaysGrid sessions={replays} onPlay={setWatching} />
          </section>
        ) : null}
      </div>

      <LiveViewerOverlay session={watching} onClose={() => setWatching(null)} />
    </>
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
