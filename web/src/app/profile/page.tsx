'use client';

/**
 * My Profile — port of MyProfileScreen: identity hero (88px avatar, bio,
 * location, rating, flat stats strip), edit/share/settings actions, and
 * tabs in mobile order: Listings | Looks | Boards | Saved | Reviews.
 * Boards merges moodboards and saved collections into one grid — private
 * boards carry a lock and are owner-only.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useSession } from '@/lib/session/SessionProvider';
import { useMyListings, useReviews } from '@/lib/hooks/queries';
import { useStore } from '@/lib/store/useStore';
import { LOOKS } from '@/lib/data/fixtures';
import { DATA_MODE } from '@/lib/api/client';
import * as socialService from '@/lib/api/services/social';
import { boardHref } from '@/components/profile/profileViewModel';
import { useOwnerBoards, type OwnerBoard } from '@/components/profile/useOwnerBoards';
import { ShopRail } from '@/components/profile/ShopRail';
import { HighlightsRail } from '@/components/profile/HighlightsRail';
import { BoardSortControl } from '@/components/profile/BoardSortControl';
import { sortBoards, useBoardPrefs } from '@/components/profile/boardPrefs';
import { CreateBoardSheet } from '@/components/profile/CreateBoardSheet';
import { ProfileHero, type ProfileStatKey } from '@/components/profile/ProfileHero';
import { ProfileTabs } from '@/components/profile/ProfileTabs';
import { ProfileSectionHeader } from '@/components/profile/SectionHeader';
import { ClosetGrid, ClosetGridSkeleton } from '@/components/profile/ClosetGrid';
import { SaveToBoardSheet } from '@/components/saved/SaveToBoardSheet';
import { ClosetListingsSection } from '@/components/closet';
import { LooksGrid } from '@/components/profile/LooksGrid';
import { ReviewList, ReviewListSkeleton, ReviewSummary } from '@/components/profile/ReviewList';
import { ProfileAbout } from '@/components/profile/ProfileAbout';
import { BoardCard, BoardGrid } from '@/components/profile/BoardGrid';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { useBoardCoverThumbs } from '@/components/profile/boardMedia';
import { useListingIds } from '@/lib/hooks/listing-resolution';

type TabKey = 'listings' | 'looks' | 'boards' | 'saved' | 'about' | 'reviews';

/** Board card — the collage resolves through the live-aware hook so a
 *  live board never renders catalogue ghosts (fixture keeps the same
 *  derivation). */
function ProfileBoardCard({ board }: { board: OwnerBoard }) {
  const resolved = useBoardCoverThumbs(board.itemIds, 4, board.coverUri, board.coverItemId);
  // Live moodboards carry wire thumbs + itemCount — membership isn't on
  // the list wire, so the empty itemIds derivation stays a fallback.
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

export default function ProfilePage() {
  const router = useRouter();
  const { user, isGuest } = useSession();
  const [tab, setTab] = useState<TabKey>('listings');
  // File-to-board picker state — the saved tile being offered to a board.
  const [filing, setFiling] = useState<{ id: string; title: string } | null>(null);
  const [createBoardOpen, setCreateBoardOpen] = useState(false);
  // Store hydration gate — saved ids live in localStorage.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (isGuest) router.replace('/auth');
  }, [isGuest, router]);

  const saved = useStore((s) => s.saved);
  const savedSyncError = useStore((s) => s.savedSyncError);
  const savedListsStale = useStore((s) => s.savedListsStale);
  const { data: myListings, isLoading: listingsLoading } = useMyListings();
  const { data: reviews, isLoading: reviewsLoading } = useReviews(user?.id ?? '');

  const listings = myListings ?? [];
  // Live mode reads the server's creator-scoped look list; fixture mode
  // filters the bundled set.
  const looksQuery = useQuery({
    queryKey: ['looks', 'creator', user?.id, DATA_MODE],
    queryFn: () => socialService.fetchLooks({ creatorId: user?.id }),
    enabled: DATA_MODE === 'live' && !!user?.id,
  });
  const looks = useMemo(
    () =>
      DATA_MODE === 'live'
        ? (looksQuery.data ?? [])
        : LOOKS.filter((l) => l.creatorId === user?.id),
    [looksQuery.data, user?.id],
  );
  // One board derivation shared with /saved — fixture truth plus the
  // owner's persisted title/item edits. No 'me' fallback: a null user is
  // a guest (walled above), never the demo account.
  const boardsRaw = useOwnerBoards(user?.id ?? '', true);

  const boardSort = useBoardPrefs((s) => s.sort);
  const boards = useMemo(() => sortBoards(boardsRaw, boardSort), [boardsRaw, boardSort]);
  // Id lists resolve through the shared live/fixture hook — live ids are
  // fetched per id (misses dropped and counted); fixture keeps the
  // catalogue. Never swapped for fixture rows in live mode.
  const { items: savedListings, isLoading: savedLoading, unresolvedCount: savedUnavailable } =
    useListingIds(useMemo(() => [...new Set(saved)], [saved]));

  // Stat seams scroll the tabbed content into view — the stat that only
  // vibrates is a dead affordance (mobile FRESH-06). scroll-mt clears the
  // sticky header + tab rail (~112px).
  const tabContentRef = useRef<HTMLDivElement>(null);
  const onStatPress = (stat: ProfileStatKey) => {
    setTab(stat === 'reviews' ? 'reviews' : 'listings');
    requestAnimationFrame(() =>
      tabContentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    );
  };

  if (isGuest || !user) return null;

  // Mobile tab grammar — Shop | Looks | About | Reviews, plus the web's
  // Boards/Saved owner surfaces in the same rail.
  const tabs: { key: TabKey; label: string; count?: number }[] = [
    { key: 'listings', label: 'Shop', count: listingsLoading ? undefined : listings.length },
    { key: 'looks', label: 'Looks', count: looks.length },
    { key: 'boards', label: 'Boards', count: boards.length },
    { key: 'saved', label: 'Saved', count: mounted ? saved.length : undefined },
    { key: 'about', label: 'About' },
    { key: 'reviews', label: 'Reviews', count: user.reviewCount },
  ];

  const moodboards = boards.filter((b) => b.kind === 'moodboard');
  const collections = boards.filter((b) => b.kind === 'collection');
  // Section headers only earn their place when both kinds are present.
  const showBoardSections = moodboards.length > 0 && collections.length > 0;

  return (
    <div className="mx-auto max-w-[1200px]">
      <ProfileHero
        user={user}
        listingCount={listingsLoading ? user.listingCount : listings.length}
        variant="self"
        onStatPress={onStatPress}
      />

      <HighlightsRail ownerId={user.id} isOwner />

      <ShopRail ownerId={user.id} isOwner listings={listings} />

      <div className="mt-5">
        <ProfileTabs tabs={tabs} active={tab} onChange={setTab} />
      </div>

      <div className="scroll-mt-28 py-4" ref={tabContentRef}>
        {tab === 'listings' ? (
          <ClosetListingsSection
            items={listings}
            isLoading={listingsLoading}
            emptyIcon="bag"
            emptyTitle="Nothing for sale yet"
            emptySubtitle="List your first item — it takes less than a minute."
            actionLabel="Start selling"
            onAction={() => router.push('/sell')}
            editable
            stickyToolbar
          />
        ) : null}

        {tab === 'looks' ? (
          <LooksGrid
            looks={looks}
            emptyTitle="No looks yet"
            emptySubtitle="Looks you create will appear here."
          />
        ) : null}

        {tab === 'boards' ? (
          boards.length === 0 ? (
            <EmptyState
              icon="layers"
              title="No boards yet"
              subtitle="Collect items into boards to plan outfits and capsules."
              actionLabel="New board"
              onAction={() => setCreateBoardOpen(true)}
              compact
            />
          ) : showBoardSections ? (
            <>
              <div className="mb-3 flex items-center justify-end gap-2 px-4 sm:px-6">
                <button
                  type="button"
                  onClick={() => setCreateBoardOpen(true)}
                  className="pressable inline-flex h-9 items-center gap-1.5 rounded-md px-3.5 text-caption font-semibold text-text-primary hover:bg-surface-alt"
                >
                  <Icon name="plus" size={16} />
                  New board
                </button>
                <BoardSortControl />
              </div>
              <ProfileSectionHeader title="Moodboards" count={moodboards.length} />
              <BoardGrid>{moodboards.map((b) => <ProfileBoardCard key={b.id} board={b} />)}</BoardGrid>
              <div className="mt-6">
                <ProfileSectionHeader title="Collections" count={collections.length} />
                <BoardGrid>{collections.map((b) => <ProfileBoardCard key={b.id} board={b} />)}</BoardGrid>
              </div>
            </>
          ) : (
            <>
              <div className="mb-3 flex items-center justify-end gap-2 px-4 sm:px-6">
                <button
                  type="button"
                  onClick={() => setCreateBoardOpen(true)}
                  className="pressable inline-flex h-9 items-center gap-1.5 rounded-md px-3.5 text-caption font-semibold text-text-primary hover:bg-surface-alt"
                >
                  <Icon name="plus" size={16} />
                  New board
                </button>
                <BoardSortControl />
              </div>
              <BoardGrid>{boards.map((b) => <ProfileBoardCard key={b.id} board={b} />)}</BoardGrid>
            </>
          )
        ) : null}

        {tab === 'saved' ? (
          !mounted || savedLoading ? (
            <ClosetGridSkeleton />
          ) : (
            <>
              {savedSyncError || savedListsStale ? (
                <p className="px-4 pb-2 text-meta text-warning-text sm:px-6">
                  {savedSyncError
                    ? "Some changes couldn't sync — check your connection and try again."
                    : "Couldn't refresh your saved items — this list may be outdated."}
                </p>
              ) : null}
              {savedUnavailable > 0 ? (
                <p className="px-4 pb-2 text-meta text-text-muted sm:px-6">
                  {savedUnavailable} {savedUnavailable === 1 ? 'item' : 'items'} unavailable
                </p>
              ) : null}
              <ClosetGrid
                items={savedListings}
                unsave="saved"
                onFileItem={(item) => setFiling({ id: item.id, title: item.title })}
                emptyIcon="bookmark"
                emptyTitle="No saved items"
                emptySubtitle="Bookmark items to compare them here later."
                actionLabel="Explore"
                onAction={() => router.push('/explore')}
              />
            </>
          )
        ) : null}

        {tab === 'about' ? <ProfileAbout user={user} variant="self" /> : null}

        {tab === 'reviews' ? (
          reviewsLoading ? (
            <ReviewListSkeleton />
          ) : (
            <div className="px-4 sm:px-6 lg:max-w-3xl">
              {(reviews ?? []).length > 0 ? (
                <>
                  {/* Same aggregate block as the public profile — one
                      reviews grammar across both surfaces. */}
                  <ReviewSummary reviews={reviews ?? []} />
                  <ReviewList reviews={reviews ?? []} />
                </>
              ) : (
                <EmptyState
                  icon="chat"
                  title="No reviews yet"
                  subtitle="Reviews from completed orders will appear here."
                  compact
                />
              )}
            </div>
          )
        ) : null}
      </div>

      <SaveToBoardSheet
        open={filing !== null}
        onClose={() => setFiling(null)}
        itemId={filing?.id ?? null}
        itemLabel={filing?.title}
      />
      <CreateBoardSheet
        open={createBoardOpen}
        onClose={() => setCreateBoardOpen(false)}
      />
    </div>
  );
}
