'use client';

/**
 * Saved — favourites, saved items, boards and searches in one surface.
 * Underline tabs (profile grammar) with honest per-type counts; item
 * grids unsave in place, and every segment has a designed empty state
 * with a recovery CTA.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ProfileTabs } from '@/components/profile/ProfileTabs';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { ClosetGrid, ClosetGridSkeleton } from '@/components/profile/ClosetGrid';
import { SaveToBoardSheet } from '@/components/saved/SaveToBoardSheet';
import { BoardCard, BoardGrid } from '@/components/profile/BoardGrid';
import { listingsForIds } from '@/components/profile/fixtures';
import { boardHref } from '@/components/profile/profileViewModel';
import { useOwnerBoards } from '@/components/profile/useOwnerBoards';
import { BoardSortControl } from '@/components/profile/BoardSortControl';
import { sortBoards, useBoardPrefs } from '@/components/profile/boardPrefs';
import { listingCoverThumbs } from '@/components/profile/boardMedia';
import { useStore, useHydrated } from '@/lib/store/useStore';
import {
  useSavedSearches,
  describeFilters,
  searchHref,
} from '@/lib/store/savedSearches';
import { Switch } from '@/components/settings/Switch';
import { useSession } from '@/lib/session/SessionProvider';

type Segment = 'favourites' | 'saved' | 'boards' | 'searches';

export default function SavedPage() {
  const router = useRouter();
  const { user, isGuest } = useSession();
  const [seg, setSeg] = useState<Segment>('favourites');
  // Store hydration gate — wishlist/saved/searches persist to localStorage.
  const mounted = useHydrated();
  // Hold-to-file web equivalent — the tile being offered to a board.
  const [filing, setFiling] = useState<{ id: string; title: string } | null>(null);

  const wishlist = useStore((s) => s.wishlist);
  const saved = useStore((s) => s.saved);
  const searches = useSavedSearches((s) => s.searches);
  const toggleAlert = useSavedSearches((s) => s.toggleAlert);
  const removeSearch = useSavedSearches((s) => s.removeSearch);

  const favouriteListings = useMemo(() => listingsForIds(wishlist), [wishlist]);
  const savedListings = useMemo(() => listingsForIds(saved), [saved]);
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
        <h1 className="text-screen-title font-bold text-text-primary">Saved</h1>
      </div>

      <div className="mt-4">
        <ProfileTabs tabs={tabs} active={seg} onChange={setSeg} />
      </div>

      <div className="py-4">
        {!mounted ? (
          <ClosetGridSkeleton />
        ) : seg === 'favourites' ? (
          <ClosetGrid
            items={favouriteListings}
            unsave="favourites"
            emptyIcon="heart"
            emptyTitle="No favourites yet"
            emptySubtitle="Tap the heart on any item and it'll wait for you here."
            actionLabel="Explore"
            onAction={() => router.push('/explore')}
          />
        ) : seg === 'saved' ? (
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
            <ul className="px-4 sm:px-6">
              {searches.map((s) => {
                const filterText = describeFilters(s.filters);
                const isVisual = s.kind === 'visual';
                return (
                  <li key={s.id} className="border-b border-border-subtle last:border-0">
                    <div className="flex items-center gap-3 py-[var(--density-row-py)]">
                      <button
                        type="button"
                        onClick={() => router.push(searchHref(s))}
                        className="pressable flex min-w-0 flex-1 items-center gap-3 text-left"
                        aria-label={`Run search${s.query ? ` “${s.query}”` : ''}`}
                      >
                        <Icon
                          name={isVisual ? 'camera' : 'search'}
                          size={17}
                          className="shrink-0 text-text-muted"
                        />
                        <span className="min-w-0">
                          <span className="clamp-1 block text-body font-semibold text-text-primary">
                            {s.query || 'All items'}
                          </span>
                          <span className="clamp-1 block text-meta text-text-muted">
                            {[
                              filterText,
                              isVisual
                                ? 'Matches on the detected details — the photo isn’t kept.'
                                : null,
                              s.resultCount !== undefined
                                ? `${s.resultCount} result${s.resultCount === 1 ? '' : 's'} when saved`
                                : null,
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </span>
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
                <BoardCard
                  key={b.id}
                  href={boardHref(b)}
                  title={b.title}
                  thumbs={listingCoverThumbs(b.itemIds, 4, b.coverUri, b.coverItemId)}
                  count={b.itemIds.length}
                  isPrivate={b.isPrivate}
                />
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
