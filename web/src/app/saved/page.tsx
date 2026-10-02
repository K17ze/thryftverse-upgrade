'use client';

/**
 * Saved — favourites, saved items, boards and searches in one surface.
 * Underline tabs (profile grammar) with honest per-type counts; item
 * grids unsave in place, and every segment has a designed empty state
 * with a recovery CTA.
 */

import { useId, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ProfileTabs } from '@/components/profile/ProfileTabs';
import { tabId, tabPanelId } from '@/components/ui/Tabs';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { ClosetGrid, ClosetGridSkeleton } from '@/components/profile/ClosetGrid';
import { SaveToBoardSheet } from '@/components/saved/SaveToBoardSheet';
import { BoardCard, BoardGrid } from '@/components/profile/BoardGrid';
import { boardHref } from '@/components/profile/profileViewModel';
import { useOwnerBoards, type OwnerBoard } from '@/components/profile/useOwnerBoards';
import { BoardSortControl } from '@/components/profile/BoardSortControl';
import { sortBoards, useBoardPrefs } from '@/components/profile/boardPrefs';
import { useBoardCoverThumbs } from '@/components/profile/boardMedia';
import { useListingIds } from '@/lib/hooks/listing-resolution';
import { useStore, useHydrated } from '@/lib/store/useStore';
import {
  useSavedSearches,
  describeFilters,
  searchHref,
  type SavedSearch,
} from '@/lib/store/savedSearches';
import { Switch } from '@/components/settings/Switch';
import { useSession } from '@/lib/session/SessionProvider';
import { DATA_MODE } from '@/lib/api/client';
import {
  fetchNotificationEvents,
  markNotificationRead,
} from '@/lib/api/services/notifications';
import { timeAgo } from '@/lib/utils/format';

type Segment = 'favourites' | 'saved' | 'boards' | 'searches';

/** Quiet unavailability line — live ids the server couldn't resolve
 *  (deleted listings, failed reads) are dropped from the grid; the count
 *  is disclosed instead of silently shrinking the list. */
function UnavailableNote({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <p className="px-4 pb-2 text-meta text-text-muted sm:px-6">
      {count} {count === 1 ? 'item' : 'items'} unavailable
    </p>
  );
}

/** Board card — the collage resolves through the live-aware hook so a
 *  live board never renders catalogue ghosts (fixture keeps the same
 *  derivation). Live moodboards carry wire thumbs + itemCount (membership
 *  isn't on the list wire) — those win over the empty itemIds collage. */
function SavedBoardCard({ board }: { board: OwnerBoard }) {
  const resolved = useBoardCoverThumbs(board.itemIds, 4, board.coverUri, board.coverItemId);
  const thumbs = board.thumbs && board.thumbs.length > 0 ? board.thumbs : resolved;
  return (
    <BoardCard
      href={boardHref(board)}
      title={board.title}
      thumbs={thumbs}
      count={board.itemCount ?? board.itemIds.length}
      isPrivate={board.isPrivate}
    />
  );
}

export default function SavedPage() {
  const router = useRouter();
  const { user, isGuest } = useSession();
  const [seg, setSeg] = useState<Segment>('favourites');
  const tabsId = useId();
  // Store hydration gate — wishlist/saved/searches persist to localStorage.
  const mounted = useHydrated();
  // Hold-to-file web equivalent — the tile being offered to a board.
  const [filing, setFiling] = useState<{ id: string; title: string } | null>(null);

  const wishlist = useStore((s) => s.wishlist);
  const saved = useStore((s) => s.saved);
  // Sync-honesty channels — a failed live write or hydrate is disclosed,
  // never silently absorbed (item 10).
  const savedSyncError = useStore((s) => s.savedSyncError);
  const savedListsStale = useStore((s) => s.savedListsStale);
  const searches = useSavedSearches((s) => s.searches);
  const searchesSyncError = useSavedSearches((s) => s.syncError);
  const searchesStale = useSavedSearches((s) => s.stale);
  const toggleAlert = useSavedSearches((s) => s.toggleAlert);
  const removeSearch = useSavedSearches((s) => s.removeSearch);

  // "N new" per saved search — the durable server signal. The backend
  // matcher queues a saved_search_match notification per new listing and
  // stamps `last_notified_at` on the row; counting UNREAD match events by
  // their payload.savedSearchId gives a real per-search new count (native
  // useSavedSearchAlerts parity — the client never invents a diff).
  const liveSearches = DATA_MODE === 'live' && !isGuest;
  const matchCountsQ = useQuery({
    queryKey: ['saved-search-match-counts'],
    enabled: liveSearches && seg === 'searches',
    staleTime: 60_000,
    queryFn: async () => {
      const page = await fetchNotificationEvents({
        eventTypes: ['saved_search_match'],
        unread: true,
        limit: 100,
      });
      const bySearch = new Map<string, string[]>();
      for (const e of page.entries) {
        if (!e.savedSearchId) continue;
        const ids = bySearch.get(e.savedSearchId) ?? [];
        ids.push(e.id);
        bySearch.set(e.savedSearchId, ids);
      }
      return bySearch;
    },
  });

  const runSearch = (s: SavedSearch) => {
    // Running the search is seeing the matches — mark the unread match
    // events read so the "N new" badge clears (fire-and-forget; a failed
    // mark-read just leaves the badge until the notifications surface
    // clears it).
    const unreadIds = matchCountsQ.data?.get(s.id);
    if (unreadIds?.length) {
      void Promise.allSettled(
        unreadIds.map((id) => markNotificationRead(id)),
      ).then(() => matchCountsQ.refetch());
    }
    router.push(searchHref(s));
  };

  // Id lists resolve through the shared live/fixture hook — one batched
  // read for both lists (live: GET /listings/:id per id, misses dropped
  // and counted; fixture: the catalogue). Each tab filters the merged
  // resolution by list membership, so tab content is exactly its list.
  const resolved = useListingIds(
    useMemo(() => [...new Set([...wishlist, ...saved])], [wishlist, saved]),
  );
  const favouriteListings = useMemo(
    () => resolved.items.filter((l) => wishlist.includes(l.id)),
    [resolved.items, wishlist],
  );
  const savedListings = useMemo(
    () => resolved.items.filter((l) => saved.includes(l.id)),
    [resolved.items, saved],
  );
  // Same derivation as the profile Boards tab — one source of truth:
  // fixture boards plus persisted owner edits, private boards included.
  // Guests are never the fixture 'me' — no id, no boards.
  const boardsRaw = useOwnerBoards(user?.id ?? '', true);
  const boardSort = useBoardPrefs((s) => s.sort);
  const boards = useMemo(() => sortBoards(boardsRaw, boardSort), [boardsRaw, boardSort]);
  const boardCount = boards.length;

  const tabs: { key: Segment; label: string; count?: number }[] = [
    { key: 'favourites', label: 'Favourites', count: mounted ? wishlist.length : undefined },
    { key: 'saved', label: 'Saved items', count: mounted ? saved.length : undefined },
    { key: 'boards', label: 'Boards', count: boardCount },
    { key: 'searches', label: 'Searches', count: mounted ? searches.length : undefined },
  ];

  return (
    <div className="mx-auto max-w-[1200px]">
      <div className="px-4 pt-5 sm:px-6">
        <h1 className="text-screen-title text-text-primary">Saved</h1>
      </div>

      <div className="mt-4">
        <ProfileTabs
          tabs={tabs}
          active={seg}
          onChange={setSeg}
          idBase={tabsId}
        />
      </div>

      <div
        className="py-4"
        role="tabpanel"
        id={tabPanelId(tabsId, seg)}
        aria-labelledby={tabId(tabsId, seg)}
      >
        {(savedSyncError || savedListsStale) && (seg === 'favourites' || seg === 'saved') ? (
          <p className="px-4 pb-2 text-meta text-warning-text sm:px-6">
            {savedSyncError
              ? "Some changes couldn't sync — check your connection and try again."
              : "Couldn't refresh your saved items — this list may be outdated."}
          </p>
        ) : null}
        {!mounted ? (
          <ClosetGridSkeleton />
        ) : seg === 'favourites' ? (
          resolved.isLoading ? (
            <ClosetGridSkeleton />
          ) : (
            <>
              <UnavailableNote count={resolved.unresolvedCount} />
              <ClosetGrid
                items={favouriteListings}
                unsave="favourites"
                emptyIcon="heart"
                emptyTitle="No favourites yet"
                emptySubtitle="Tap the heart on any item and it'll wait for you here."
                actionLabel="Explore"
                onAction={() => router.push('/explore')}
              />
            </>
          )
        ) : seg === 'saved' ? (
          resolved.isLoading ? (
            <ClosetGridSkeleton />
          ) : (
            <>
              <UnavailableNote count={resolved.unresolvedCount} />
              <ClosetGrid
                items={savedListings}
                unsave="saved"
                onFileItem={
                  isGuest ? undefined : (item) => setFiling({ id: item.id, title: item.title })
                }
                emptyIcon="bookmark"
                emptyTitle="No saved items"
                emptySubtitle="Bookmark items to compare them here later."
                actionLabel="Explore"
                onAction={() => router.push('/explore')}
              />
            </>
          )
        ) : seg === 'searches' ? (
          searches.length === 0 ? (
            <EmptyState
              icon="search"
              title="No saved searches"
              subtitle="Save a search from the results page and we'll alert you when new matches land."
              actionLabel="Search"
              onAction={() => router.push('/search')}
              compact
            />
          ) : (
            <>
              {searchesSyncError || searchesStale ? (
                <p className="px-4 pb-2 text-meta text-warning-text sm:px-6">
                  {searchesSyncError
                    ? "Some changes couldn't sync — check your connection and try again."
                    : "Couldn't refresh your saved searches — this list may be outdated."}
                </p>
              ) : null}
              <ul className="px-4 sm:px-6">
                {searches.map((s) => {
                const filterText = describeFilters(s.filters);
                const isVisual = s.kind === 'visual';
                const newMatches = s.alertsOn
                  ? matchCountsQ.data?.get(s.id)?.length ?? 0
                  : 0;
                // Two clauses max — the filters it saved and when it last
                // matched. The visual-search caveat lives on the alert
                // switch's label; the save-time count was context, not
                // state worth a third clause.
                const meta = [
                  filterText,
                  s.lastNotifiedAt
                    ? `Last match ${timeAgo(s.lastNotifiedAt)}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(' · ');
                return (
                  <li key={s.id} className="border-b border-border-subtle last:border-0">
                    <div className="flex items-center gap-3 py-[var(--density-row-py)]">
                      <button
                        type="button"
                        onClick={() => runSearch(s)}
                        className="pressable flex min-w-0 flex-1 items-center gap-3 text-left"
                        aria-label={`Run search${s.query ? ` “${s.query}”` : ''}`}
                      >
                        <Icon
                          name={isVisual ? 'camera' : 'search'}
                          size={17}
                          className="shrink-0 text-text-muted"
                        />
                        <span className="min-w-0">
                          <span className="flex items-center gap-2">
                            <span className="clamp-1 text-body font-semibold text-text-primary">
                              {s.query || 'All items'}
                            </span>
                            {newMatches > 0 ? (
                              <span
                                className="shrink-0 rounded-full bg-brand px-1.5 py-px text-meta font-semibold text-text-inverse"
                                aria-label={`${newMatches} new match${newMatches === 1 ? '' : 'es'}`}
                              >
                                {newMatches} new
                              </span>
                            ) : null}
                          </span>
                          {meta ? (
                            <span className="clamp-1 block text-meta text-text-muted">
                              {meta}
                            </span>
                          ) : null}
                        </span>
                        <Icon name="forward" size={14} className="shrink-0 text-text-muted" />
                      </button>
                      <Switch
                        checked={s.alertsOn}
                        onChange={() => toggleAlert(s.id)}
                        aria-label={`Alerts for${s.query ? ` “${s.query}”` : ' this search'}${isVisual ? ' — matches new listings against the detected details' : ''}`}
                      />
                      <button
                        type="button"
                        onClick={() => removeSearch(s.id)}
                        aria-label={`Delete saved search${s.query ? ` “${s.query}”` : ''}`}
                        className="pressable -my-1 flex h-11 w-11 shrink-0 items-center justify-center text-text-muted transition-colors hover:text-danger-text"
                      >
                        <Icon name="trash" size={17} />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
            </>
          )
        ) : isGuest ? (
          <EmptyState
            icon="lock"
            title="Sign in to see your boards"
            subtitle="Collections and moodboards are tied to your account."
            actionLabel="Sign in"
            onAction={() => router.push('/auth')}
            compact
          />
        ) : boardCount === 0 ? (
          <EmptyState
            icon="layers"
            title="No boards yet"
            subtitle="Save items into boards to plan outfits and capsules."
            actionLabel="Explore"
            onAction={() => router.push('/explore')}
            compact
          />
        ) : (
          <>
            <div className="mb-3 flex items-center justify-between px-4 sm:px-6">
              <BoardSortControl />
              <Link
                href="/collections"
                className="pressable inline-flex items-center gap-1 text-meta font-semibold text-text-primary"
              >
                All collections
                <Icon name="forward" size={14} />
              </Link>
            </div>
            <BoardGrid>
              {boards.map((b) => (
                <SavedBoardCard key={b.id} board={b} />
              ))}
            </BoardGrid>
          </>
        )}
      </div>

      <SaveToBoardSheet
        open={filing !== null}
        onClose={() => setFiling(null)}
        itemId={filing?.id ?? null}
        itemLabel={filing?.title}
      />
    </div>
  );
}
