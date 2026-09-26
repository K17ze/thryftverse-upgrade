'use client';

/**
 * Poster archive — the member's own story history, ported from
 * PosterArchiveScreen: a 9:16 media grid of active + archived stories with
 * status / view / frame pills, segmented filters with honest counts, a
 * caption search, per-story delete (confirmed), and the Highlights lane —
 * seeded + member-created sets that open the highlight viewer. Stories
 * are the member's own, so every card opens the same viewer chrome used
 * for feed posters.
 */

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { BackBar } from '@/components/profile/BackBar';
import { SegmentedControl } from '@/components/feed/SegmentedControl';
import {
  ArchiveHighlightCard,
  ArchiveStoryCard,
} from '@/components/poster/ArchiveCards';
import { CreateHighlightSheet } from '@/components/poster/CreateHighlightSheet';
import { ConfirmSheet, type ConfirmSheetState } from '@/components/orders/ConfirmSheet';
import { useSession } from '@/lib/session/SessionProvider';
import { useHydrated } from '@/lib/store/useStore';
import { usePosterArchive } from '@/lib/store/posterArchive';
import {
  POSTER_ARCHIVE,
  POSTER_HIGHLIGHTS,
  type PosterArchiveStory,
  type PosterHighlight,
} from '@/lib/data/fixtures-posters';

type Filter = 'all' | 'active' | 'archived' | 'highlights';

const tick = (ms = 280) => new Promise((r) => setTimeout(r, ms));

export default function PosterArchivePage() {
  const router = useRouter();
  const { show } = useToast();
  const { user, isGuest } = useSession();
  const hydrated = useHydrated();

  const removedStoryIds = usePosterArchive((s) => s.removedStoryIds);
  const archivedStoryIds = usePosterArchive((s) => s.archivedStoryIds);
  const createdHighlights = usePosterArchive((s) => s.highlights);
  const removeStory = usePosterArchive((s) => s.removeStory);

  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmSheetState | null>(null);

  const { isLoading, isError, refetch } = useQuery({
    queryKey: ['poster-archive'],
    queryFn: async () => {
      await tick();
      return true;
    },
  });

  // Effective stories — fixture truth with persisted mutations applied
  // post-hydration (same gate as the board overlays).
  const stories = useMemo<PosterArchiveStory[]>(() => {
    const removed = hydrated ? new Set(removedStoryIds) : new Set<string>();
    const archived = hydrated ? new Set(archivedStoryIds) : new Set<string>();
    return POSTER_ARCHIVE.filter((s) => !removed.has(s.id)).map((s) =>
      archived.has(s.id) ? { ...s, status: 'archived' as const } : s,
    );
  }, [hydrated, removedStoryIds, archivedStoryIds]);

  const highlights = useMemo<PosterHighlight[]>(
    () =>
      hydrated
        ? [...createdHighlights, ...POSTER_HIGHLIGHTS]
        : POSTER_HIGHLIGHTS,
    [hydrated, createdHighlights],
  );

  const activeCount = stories.filter((s) => s.status === 'active').length;
  const archivedCount = stories.length - activeCount;

  const filtered = useMemo(() => {
    let list = stories;
    if (filter === 'active') list = list.filter((s) => s.status === 'active');
    if (filter === 'archived') list = list.filter((s) => s.status !== 'active');
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((s) =>
      s.frames.some((f) => f.caption?.toLowerCase().includes(q)),
    );
  }, [stories, filter, query]);

  const askDelete = (story: PosterArchiveStory) =>
    setConfirm({
      title: 'Delete story?',
      message: 'This will permanently remove this poster story from your archive.',
      confirmLabel: 'Delete',
      variant: 'destructive',
      onConfirm: () => {
        removeStory(story.id);
        setConfirm(null);
        show('Story deleted', 'info');
      },
    });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-[1200px] pb-16" aria-busy aria-label="Loading archive">
        <BackBar />
        <div className="flex items-center justify-between px-4 pt-2 sm:px-6">
          <Skeleton className="h-8 w-44" />
          <Skeleton className="h-9 w-32" />
        </div>
        <div className="mt-5 px-4 sm:px-6">
          <Skeleton className="h-9 w-72 rounded-full" />
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 px-4 sm:grid-cols-3 sm:px-6 lg:grid-cols-4">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i}>
              <Skeleton className="aspect-[9/16] w-full rounded-lg" />
              <Skeleton className="mt-2 h-3.5 w-16" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="mx-auto max-w-[1200px]">
        <BackBar />
        <EmptyState
          icon="warning"
          title="Could not load archive"
          subtitle="Check your connection and try again."
          actionLabel="Try again"
          onAction={() => void refetch()}
        />
      </div>
    );
  }

  if (isGuest) {
    return (
      <div className="mx-auto max-w-[1200px]">
        <BackBar />
        <EmptyState
          icon="images"
          title="Your poster archive lives here"
          subtitle="Sign in to see the stories you've published and saved highlights."
          actionLabel="Sign in"
          onAction={() => router.push('/auth')}
        />
      </div>
    );
  }

  const emptyTitle =
    query.trim().length > 0
      ? `No stories match '${query.trim()}'`
      : filter === 'active'
        ? 'No active stories'
        : filter === 'archived'
          ? 'No archived stories'
          : filter === 'highlights'
            ? 'No highlights yet'
            : 'No stories yet';
  const emptySubtitle =
    query.trim().length > 0
      ? 'Try a different search.'
      : filter === 'highlights'
        ? 'Save frames from your stories into a highlight that stays on your profile.'
        : 'Poster stories you publish appear here for 24h, then move to the archive.';

  return (
    <div className="mx-auto max-w-[1200px] pb-16">
      <BackBar
        actions={
          <Button
            variant="outline"
            size="sm"
            icon="plus"
            onClick={() => setCreateOpen(true)}
          >
            New highlight
          </Button>
        }
      />

      <div className="flex flex-wrap items-end justify-between gap-3 px-4 pt-2 sm:px-6">
        <h1 className="text-screen-title font-bold text-text-primary">
          Poster archive
        </h1>
        <p className="text-meta text-text-muted">
          Signed in as @{user?.username ?? 'you'} · your stories only
        </p>
      </div>

      <div className="mt-4 px-4 sm:px-6">
        <SegmentedControl<Filter>
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'All', count: stories.length },
            { value: 'active', label: 'Active', count: activeCount },
            { value: 'archived', label: 'Archived', count: archivedCount },
            { value: 'highlights', label: 'Highlights', count: highlights.length },
          ]}
          className="max-w-full overflow-x-auto no-scrollbar"
        />
      </div>

      {filter !== 'highlights' ? (
        <div className="mt-3 px-4 sm:px-6">
          <div className="flex h-11 items-center gap-2 rounded-lg border border-border bg-input px-3">
            <Icon name="search" size={18} className="shrink-0 text-text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search stories"
              aria-label="Search stories"
              className="min-w-0 flex-1 bg-transparent text-body text-input-text outline-none placeholder:text-text-muted"
            />
            {query.length > 0 ? (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Clear search"
                className="pressable flex h-8 w-8 items-center justify-center text-text-muted"
              >
                <Icon name="closeCircle" filled size={18} />
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {filter === 'highlights' ? (
        highlights.length === 0 ? (
          <EmptyState
            icon="bookmark"
            title={emptyTitle}
            subtitle={emptySubtitle}
            actionLabel="New highlight"
            onAction={() => setCreateOpen(true)}
            compact
          />
        ) : (
          <div className="mt-5 grid grid-cols-2 gap-3 px-4 sm:grid-cols-3 sm:px-6 lg:grid-cols-4">
            {highlights.map((h) => (
              <ArchiveHighlightCard key={h.id} highlight={h} />
            ))}
          </div>
        )
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={query.trim().length > 0 ? 'search' : 'images'}
          title={emptyTitle}
          subtitle={emptySubtitle}
          compact
        />
      ) : (
        <div className="mt-5 grid grid-cols-2 gap-3 px-4 sm:grid-cols-3 sm:px-6 lg:grid-cols-4">
          {filtered.map((story) => (
            <ArchiveStoryCard key={story.id} story={story} onDelete={askDelete} />
          ))}
        </div>
      )}

      <CreateHighlightSheet
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        stories={stories}
        onCreated={() => {
          setCreateOpen(false);
          setFilter('highlights');
        }}
      />

      <ConfirmSheet sheet={confirm} onDismiss={() => setConfirm(null)} />
    </div>
  );
}
