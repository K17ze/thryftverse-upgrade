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
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import {
  OwnedBoardCard,
  PublicBoardCard,
} from '@/components/moodboard/MoodboardBoardCard';
import { CreateMoodboardSheet } from '@/components/moodboard/CreateMoodboardSheet';
import { useMasonryColumns } from '@/components/feed/MasonryGrid';
import {
  boardsForOwner,
  type ProfileBoard,
} from '@/components/profile/fixtures';
import { useBoardPrefs } from '@/components/profile/boardPrefs';
import { PUBLIC_MOODBOARDS } from '@/lib/data/fixtures-content';
import { USERS } from '@/lib/data/fixtures';
import { useMoodboardEdits } from '@/lib/store/moodboards';
import { useHydrated } from '@/lib/store/useStore';
import { useSession } from '@/lib/session/SessionProvider';

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
  const { user } = useSession();
  const hydrated = useHydrated();
  const columns = useMasonryColumns();
  const createdBoards = useBoardPrefs((s) => s.createdMoodboards);
  const privacyPrefs = useBoardPrefs((s) => s.boards);
  const renames = useMoodboardEdits((s) => s.boards);
  const [query, setQuery] = useState('');
  const [createOpen, setCreateOpen] = useState(false);

  const q = query.trim().toLowerCase();

  const ownedBoards = useMemo<ProfileBoard[]>(() => {
    const base = boardsForOwner(user?.id ?? 'me', true).filter(
      (b) => b.kind === 'moodboard',
    );
    const merged = [
      ...base,
      ...(hydrated ? createdBoards : []),
    ].filter((b, i, arr) => arr.findIndex((x) => x.id === b.id) === i);
    return merged
      .map((b) => ({
        ...b,
        title: renames[b.id]?.title ?? b.title,
        isPrivate: privacyPrefs[b.id]?.isPrivate ?? b.isPrivate,
      }))
      .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
      .filter(
        (b) => !q || b.title.toLowerCase().includes(q),
      );
  }, [user?.id, hydrated, createdBoards, renames, privacyPrefs, q]);

  const publicBoards = useMemo(
    () =>
      PUBLIC_MOODBOARDS.filter(
        (b) =>
          !q ||
          b.title.toLowerCase().includes(q) ||
          (b.description ?? '').toLowerCase().includes(q) ||
          (USERS.find((u) => u.id === b.ownerId)?.username ?? '')
            .toLowerCase()
            .includes(q),
      ).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [q],
  );

  const discoveryColumns = Math.min(columns, 4);
  const discoveryCols = useMemo(
    () => distributeBoards(publicBoards, discoveryColumns),
    [publicBoards, discoveryColumns],
  );

  return (
    <div className="mx-auto max-w-[1200px] pb-16">
      {/* Header — title + quiet search, mirroring the mobile home header */}
      <header className="flex items-center gap-3 px-4 pb-2 pt-3 sm:px-6">
        <h1 className="text-screen-title font-bold text-text-primary">
          Moodboards
        </h1>
        <div className="relative ml-auto w-44 sm:w-64">
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
        <div className="flex items-baseline justify-between px-4 sm:px-6">
          <h2 className="text-body-emphasis font-semibold text-text-primary">
            Your moodboards
          </h2>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="pressable text-meta font-medium text-text-secondary hover:text-text-primary"
          >
            New board
          </button>
        </div>
        <div className="mt-3 flex gap-3 overflow-x-auto px-4 pb-1 sm:px-6">
          {/* Create tile — dashed frame, first in the rail */}
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            aria-label="Create a new moodboard"
            className="pressable block w-40 shrink-0 sm:w-44"
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

          {ownedBoards.map((b) => (
            <OwnedBoardCard key={b.id} board={b} />
          ))}
        </div>
      </section>

      {/* Discover — public boards, balanced masonry with curator rows */}
      <section aria-label="Discover moodboards" className="mt-8 px-4 sm:px-6">
        <h2 className="text-body-emphasis font-semibold text-text-primary">
          Discover
        </h2>
        {publicBoards.length === 0 ? (
          <EmptyState
            icon="search"
            title={`No boards match “${query.trim()}”`}
            subtitle="Try a different search, or start your own board."
            actionLabel="New moodboard"
            onAction={() => setCreateOpen(true)}
            compact
          />
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
