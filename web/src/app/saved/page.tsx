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
import { BoardCard, BoardGrid } from '@/components/profile/BoardGrid';
import {
  COLLECTIONS,
  listingsForIds,
  MOODBOARD_ITEM_IDS,
} from '@/components/profile/fixtures';
import { listingCoverThumbs } from '@/components/profile/boardMedia';
import { useStore, useHydrated } from '@/lib/store/useStore';
import {
  useSavedSearches,
  describeFilters,
  searchHref,
} from '@/lib/store/savedSearches';
import { Switch } from '@/components/settings/Switch';
import { MOODBOARDS } from '@/lib/data/fixtures';
import { useSession } from '@/lib/session/SessionProvider';

type Segment = 'favourites' | 'saved' | 'boards' | 'searches';

export default function SavedPage() {
  const router = useRouter();
  const { user } = useSession();
  const [seg, setSeg] = useState<Segment>('favourites');
  // Store hydration gate — wishlist/saved/searches persist to localStorage.
  const mounted = useHydrated();

  const wishlist = useStore((s) => s.wishlist);
  const saved = useStore((s) => s.saved);
  const searches = useSavedSearches((s) => s.searches);
  const toggleAlert = useSavedSearches((s) => s.toggleAlert);
  const removeSearch = useSavedSearches((s) => s.removeSearch);

  const favouriteListings = useMemo(() => listingsForIds(wishlist), [wishlist]);
  const savedListings = useMemo(() => listingsForIds(saved), [saved]);
  const boards = useMemo(
    () => MOODBOARDS.filter((b) => b.ownerId === (user?.id ?? 'me')),
    [user?.id],
  );
  const boardCount = boards.length + COLLECTIONS.length;

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
                return (
                  <li key={s.id} className="border-b border-border-subtle last:border-0">
                    <div className="flex items-center gap-3 py-3">
                      <button
                        type="button"
                        onClick={() => router.push(searchHref(s))}
                        className="pressable flex min-w-0 flex-1 items-center gap-3 text-left"
                        aria-label={`Run search${s.query ? ` “${s.query}”` : ''}`}
                      >
                        <Icon name="search" size={17} className="shrink-0 text-text-muted" />
                        <span className="min-w-0">
                          <span className="clamp-1 block text-body font-semibold text-text-primary">
                            {s.query || 'All items'}
                          </span>
                          {filterText ? (
                            <span className="clamp-1 block text-meta text-text-muted">
                              {filterText}
                            </span>
                          ) : null}
                        </span>
                        <Icon name="forward" size={14} className="shrink-0 text-text-muted" />
                      </button>
                      <Switch
                        checked={s.alertsOn}
                        onChange={() => toggleAlert(s.id)}
                        aria-label={`Alerts for${s.query ? ` “${s.query}”` : ' this search'}`}
                      />
                      <button
                        type="button"
                        onClick={() => removeSearch(s.id)}
                        aria-label={`Delete saved search${s.query ? ` “${s.query}”` : ''}`}
                        className="pressable flex h-9 w-9 shrink-0 items-center justify-center text-text-muted transition-colors hover:text-danger-text"
                      >
                        <Icon name="trash" size={17} />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )
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
            <div className="mb-3 flex justify-end px-4 sm:px-6">
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
                  href={`/moodboard/${b.id}`}
                  title={b.title}
                  thumbs={listingCoverThumbs(MOODBOARD_ITEM_IDS[b.id] ?? [], 4, b.coverUri)}
                  count={b.itemCount ?? (MOODBOARD_ITEM_IDS[b.id]?.length ?? 0)}
                />
              ))}
              {COLLECTIONS.map((c) => (
                <BoardCard
                  key={c.id}
                  href={`/collection/${c.id}`}
                  title={c.title}
                  thumbs={listingCoverThumbs(c.itemIds, 4)}
                  count={c.itemIds.length}
                />
              ))}
            </BoardGrid>
          </>
        )}
      </div>
    </div>
  );
}
