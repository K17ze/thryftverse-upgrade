'use client';

/**
 * Moodboards hub — port of the mobile MoodboardHomeScreen:
 * a search field, the "Your moodboards" rail (create tile + owned
 * boards), and the public discovery masonry with curator rows.
 *
 * Owned boards merge fixture MOODBOARDS with member-created overlays;
 * discovery resolves PUBLIC_MOODBOARDS from the content fixtures.
 */

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import {
  OwnedBoardCard,
  PublicBoardCard,
  type OwnedBoardCardData,
  type PublicBoardCardData,
} from '@/components/moodboard/MoodboardBoardCard';
import { CreateMoodboardSheet } from '@/components/moodboard/CreateMoodboardSheet';
import { useMasonryColumns } from '@/components/feed/MasonryGrid';
import { boardsForOwner } from '@/components/profile/fixtures';
import { useBoardPrefs } from '@/components/profile/boardPrefs';
import { PUBLIC_MOODBOARDS } from '@/lib/data/fixtures-content';
import { listingById, USERS } from '@/lib/data/fixtures';
import { useMoodboardEdits } from '@/lib/store/moodboards';
import { useHydrated } from '@/lib/store/useStore';
import { useSession } from '@/lib/session/SessionProvider';
import { DATA_MODE } from '@/lib/api/client';
import { fetchMoodboards, fetchMyMoodboards } from '@/lib/api/services/social';
import { useOnlineStatus } from '@/lib/offline/useOnlineStatus';

const LIVE = DATA_MODE === 'live';

/** Rail skeleton — three board-shaped tiles matching the owned rail's
 *  square collage cover (title + count overlay inside the frame). */
function RailSkeleton() {
  return (
    <>
      {[0, 1, 2].map((i) => (
        <div key={i} className="w-40 shrink-0 sm:w-44 lg:w-48" aria-hidden>
          <Skeleton className="aspect-square w-full rounded-lg" />
        </div>
      ))}
    </>
  );
}

/** Discovery skeleton — balanced-height tiles + curator rows in the same
 *  masonry grammar the loaded board cards use. */
function DiscoverSkeleton({ columns }: { columns: number }) {
  const ratios = ['4/3', '1/1', '3/4', '4/5', '5/4', '1/1'];
  const cols: string[][] = Array.from({ length: columns }, () => []);
  ratios.forEach((r, i) => cols[i % columns].push(r));
  return (
    <div
      className="mt-3 grid items-start gap-3"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0,1fr))` }}
      aria-busy
      aria-label="Loading boards"
    >
      {cols.map((rows, ci) => (
        <div key={ci} className="flex flex-col gap-3">
          {rows.map((r, ri) => (
            <div key={ri}>
              <Skeleton className="w-full rounded-xl" style={{ aspectRatio: r }} />
              <Skeleton className="mt-2 h-3.5 w-4/5" />
              <Skeleton className="mt-1.5 h-3 w-2/5" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/** Balanced shortest-column distribution keyed on tile aspect ratio —
 *  same grammar as MasonryGrid, local to the board-card masonry. */
function distributeBoards<T extends { aspectRatio: number }>(
  boards: T[],
  columns: number,
): T[][] {
  const heights = new Array(columns).fill(0);
  const cols: T[][] = Array.from({ length: columns }, () => []);
  for (const b of boards) {
    let target = 0;
    for (let c = 1; c < columns; c += 1) {
      if (heights[c] < heights[target]) target = c;
    }
    cols[target].push(b);
    heights[target] += 1 / b.aspectRatio + 0.3;
  }
  return cols;
}

export default function MoodboardsPage() {
  const router = useRouter();
  const { user, isGuest, sessionLoading } = useSession();
  const hydrated = useHydrated();
  const { isOffline } = useOnlineStatus();
  const columns = useMasonryColumns();
  const createdBoards = useBoardPrefs((s) => s.createdMoodboards);
  const privacyPrefs = useBoardPrefs((s) => s.boards);
  const renames = useMoodboardEdits((s) => s.boards);
  const [query, setQuery] = useState('');
  const [createOpen, setCreateOpen] = useState(false);

  const q = query.trim().toLowerCase();

  // Live mode: owned boards from GET /me/moodboards (auth-gated — guests
  // have none), discovery from GET /moodboards (public boards). No local
  // overlay merges — the server is the source of truth.
  const myBoardsQuery = useQuery({
    queryKey: ['moodboards', 'mine'],
    queryFn: ({ signal }) => fetchMyMoodboards(signal),
    enabled: LIVE && !isGuest,
    staleTime: 60_000,
  });
  const publicBoardsQuery = useQuery({
    queryKey: ['moodboards', 'public'],
    queryFn: ({ signal }) => fetchMoodboards(signal),
    enabled: LIVE,
    staleTime: 60_000,
  });

  const ownedBoards = useMemo<OwnedBoardCardData[]>(() => {
    if (LIVE) {
      return (myBoardsQuery.data ?? [])
        .filter((b) => !q || b.title.toLowerCase().includes(q))
        .map((b) => ({
          id: b.id,
          title: b.title,
          isPrivate: b.isPublic !== true,
          itemCount: b.itemCount ?? b.thumbs?.length ?? 0,
          createdAt: b.createdAt,
          images: b.thumbs && b.thumbs.length > 0
            ? b.thumbs
            : b.coverUri
              ? [b.coverUri]
              : [],
        }));
    }
    const base = boardsForOwner(user?.id ?? 'me', true).filter(
      (b) => b.kind === 'moodboard',
    );
    const merged = [
      ...base,
      ...(hydrated ? createdBoards : []),
    ].filter((b, i, arr) => arr.findIndex((x) => x.id === b.id) === i);
    return merged
      .map((b) => ({
        id: b.id,
        title: renames[b.id]?.title ?? b.title,
        isPrivate: privacyPrefs[b.id]?.isPrivate ?? b.isPrivate ?? false,
        itemCount: b.itemIds.length,
        createdAt: b.createdAt,
        images: b.itemIds
          .map((id) => listingById(id)?.images[0])
          .filter((s): s is string => Boolean(s)),
      }))
      .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
      .filter((b) => !q || b.title.toLowerCase().includes(q));
  }, [user?.id, hydrated, createdBoards, renames, privacyPrefs, q, myBoardsQuery.data]);

  const publicBoards = useMemo<PublicBoardCardData[]>(() => {
    if (LIVE) {
      return (publicBoardsQuery.data ?? [])
        .filter(
          (b) =>
            !q ||
            b.title.toLowerCase().includes(q) ||
            (b.description ?? '').toLowerCase().includes(q) ||
            (b.curator ?? '').toLowerCase().includes(q),
        )
        .map((b) => ({
          id: b.id,
          title: b.title,
          coverUri: b.coverUri,
          aspectRatio: b.aspectRatio ?? 4 / 3,
          curator: b.curator ?? null,
          curatorAvatar: b.curatorAvatar ?? null,
          itemCount: b.itemCount ?? b.thumbs?.length ?? 0,
        }));
    }
    return PUBLIC_MOODBOARDS.filter(
      (b) =>
        !q ||
        b.title.toLowerCase().includes(q) ||
        (b.description ?? '').toLowerCase().includes(q) ||
        (USERS.find((u) => u.id === b.ownerId)?.username ?? '')
          .toLowerCase()
          .includes(q),
    )
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((b) => {
        const owner = USERS.find((u) => u.id === b.ownerId);
        return {
          id: b.id,
          title: b.title,
          coverUri: b.coverUri,
          aspectRatio: b.aspectRatio,
          curator: owner?.username ?? null,
          curatorAvatar: owner?.avatar ?? null,
          itemCount: b.itemIds.length,
        };
      });
  }, [q, publicBoardsQuery.data]);

  // Balanced masonry tracks the shared feed column rhythm, capped at 5 —
  // the 1200px canvas keeps tiles ~230px at the top end.
  const discoveryColumns = Math.min(columns, 5);
  const discoveryCols = useMemo(
    () => distributeBoards(publicBoards, discoveryColumns),
    [publicBoards, discoveryColumns],
  );

  return (
    <div className="mx-auto max-w-[1200px] pb-16">
      {/* Header — title + quiet search, mirroring the mobile home header */}
      <header className="flex items-center gap-3 px-4 pb-2 pt-3 sm:px-6">
        <h1 className="text-screen-title text-text-primary">
          Moodboards
        </h1>
        <div className="relative ml-auto w-44 sm:w-64 lg:w-72">
          <Icon
            name="search"
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            type="search"
            placeholder="Search boards"
            aria-label="Search moodboards"
            className="h-10 w-full rounded-full bg-surface-alt pl-9 pr-3 text-body text-text-primary outline-none placeholder:text-text-muted focus:ring-1 focus:ring-brand"
          />
        </div>
      </header>

      {/* Your boards — horizontal rail led by the create tile */}
      <section aria-label="Your moodboards" className="mt-3">
        <div className="flex items-baseline justify-end px-4 sm:px-6">
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="pressable text-meta font-medium text-text-secondary hover:text-text-primary"
          >
            New board
          </button>
        </div>
        <div className="no-scrollbar mt-3 flex gap-3 overflow-x-auto px-4 pb-1 sm:px-6">
          {/* Create tile — dashed frame, first in the rail */}
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            aria-label="Create a new moodboard"
            className="pressable block w-40 shrink-0 sm:w-44 lg:w-48"
          >
            <span className="flex aspect-square items-center justify-center rounded-lg border border-dashed border-border bg-surface text-text-muted transition-colors hover:text-text-primary">
              <Icon name="plus" size={26} />
            </span>
            <span className="block pt-2 text-left text-body font-semibold text-text-secondary">
              New moodboard
            </span>
            <span className="block text-left text-meta text-text-muted">
              Pick a theme
            </span>
          </button>

          {LIVE && (sessionLoading || myBoardsQuery.isLoading) ? (
            <RailSkeleton />
          ) : LIVE && myBoardsQuery.isError ? (
            <div className="flex w-40 shrink-0 flex-col items-start justify-center gap-2 rounded-lg border border-dashed border-border px-4 py-6 sm:w-44">
              <p className="text-meta text-text-muted">
                {isOffline
                  ? 'You’re offline — your boards will load when you reconnect.'
                  : 'Couldn’t load your boards.'}
              </p>
              <button
                type="button"
                onClick={() => void myBoardsQuery.refetch()}
                className="pressable text-meta font-semibold text-text-primary"
              >
                Try again
              </button>
            </div>
          ) : LIVE && isGuest ? (
            <button
              type="button"
              onClick={() => router.push('/auth')}
              className="pressable flex w-40 shrink-0 flex-col items-start justify-center gap-1 rounded-lg border border-border-subtle px-4 py-6 text-left sm:w-44"
            >
              <span className="text-meta font-semibold text-text-primary">Sign in</span>
              <span className="text-meta text-text-muted">
                Your boards live on your account.
              </span>
            </button>
          ) : (
            ownedBoards.map((b) => <OwnedBoardCard key={b.id} board={b} />)
          )}
        </div>
      </section>

      {/* Discover — public boards, balanced masonry with curator rows */}
      <section aria-label="Discover moodboards" className="mt-8 px-4 sm:px-6">
        <h2 className="text-body-emphasis font-semibold text-text-primary">
          Discover
        </h2>
        {LIVE && publicBoardsQuery.isLoading ? (
          <DiscoverSkeleton columns={discoveryColumns} />
        ) : LIVE && publicBoardsQuery.isError ? (
          <EmptyState
            icon="warning"
            title="Couldn't load boards"
            subtitle={
              isOffline
                ? 'You’re offline — boards will load when you reconnect.'
                : 'Check your connection and try again.'
            }
            actionLabel="Try again"
            onAction={() => void publicBoardsQuery.refetch()}
            compact
          />
        ) : publicBoards.length === 0 ? (
          q ? (
            <EmptyState
              icon="search"
              title={`No boards match “${query.trim()}”`}
              subtitle="Try a different search, or start your own board."
              actionLabel="New moodboard"
              onAction={() => setCreateOpen(true)}
              compact
            />
          ) : (
            <EmptyState
              icon="layers"
              title="No public boards yet"
              subtitle="Start your own board — share it when it's ready."
              actionLabel="New moodboard"
              onAction={() => setCreateOpen(true)}
              compact
            />
          )
        ) : (
          <div
            className="mt-3 grid items-start gap-3"
            style={{ gridTemplateColumns: `repeat(${discoveryColumns}, minmax(0,1fr))` }}
          >
            {discoveryCols.map((col, ci) => (
              <div key={ci} className="flex flex-col gap-3">
                {col.map((b) => (
                  <PublicBoardCard key={b.id} board={b} />
                ))}
              </div>
            ))}
          </div>
        )}
      </section>

      <CreateMoodboardSheet
        open={createOpen}
        onClose={() => setCreateOpen(false)}
      />
    </div>
  );
}
