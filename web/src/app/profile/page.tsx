'use client';

/**
 * My Profile — port of MyProfileScreen: identity hero (88px avatar, bio,
 * location, rating, flat stats strip), edit/share/settings actions, and
 * tabs in mobile order: Listings | Looks | Boards | Saved | Reviews.
 * Boards merges moodboards and saved collections into one grid — private
 * boards carry a lock and are owner-only.
 */

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/lib/session/SessionProvider';
import { useMyListings, useReviews } from '@/lib/hooks/queries';
import { useStore } from '@/lib/store/useStore';
import { LOOKS } from '@/lib/data/fixtures';
import { boardsForOwner, listingsForIds } from '@/components/profile/fixtures';
import { boardHref } from '@/components/profile/profileViewModel';
import { ProfileHero } from '@/components/profile/ProfileHero';
import { ProfileTabs } from '@/components/profile/ProfileTabs';
import { ProfileSectionHeader } from '@/components/profile/SectionHeader';
import { ClosetGrid, ClosetGridSkeleton } from '@/components/profile/ClosetGrid';
import { ClosetListingsSection } from '@/components/closet';
import { LooksGrid } from '@/components/profile/LooksGrid';
import { ReviewList, ReviewListSkeleton } from '@/components/profile/ReviewList';
import { BoardCard, BoardGrid } from '@/components/profile/BoardGrid';
import { RatingStars } from '@/components/profile/RatingStars';
import { EmptyState } from '@/components/ui/EmptyState';
import { listingCoverThumbs } from '@/components/profile/boardMedia';

type TabKey = 'listings' | 'looks' | 'boards' | 'saved' | 'reviews';

export default function ProfilePage() {
  const router = useRouter();
  const { user, isGuest } = useSession();
  const [tab, setTab] = useState<TabKey>('listings');
  // Store hydration gate — saved ids live in localStorage.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (isGuest) router.replace('/auth');
  }, [isGuest, router]);

  const saved = useStore((s) => s.saved);
  const { data: myListings, isLoading: listingsLoading } = useMyListings();
  const { data: reviews, isLoading: reviewsLoading } = useReviews(user?.id ?? 'me');

  const listings = myListings ?? [];
  const looks = useMemo(() => LOOKS.filter((l) => l.creatorId === (user?.id ?? 'me')), [user?.id]);
  const boards = useMemo(() => boardsForOwner(user?.id ?? 'me', true), [user?.id]);
  const savedListings = useMemo(() => listingsForIds(saved), [saved]);

  if (isGuest || !user) return null;

  const tabs: { key: TabKey; label: string; count?: number }[] = [
    { key: 'listings', label: 'Listings', count: listingsLoading ? undefined : listings.length },
    { key: 'looks', label: 'Looks', count: looks.length },
    { key: 'boards', label: 'Boards', count: boards.length },
    { key: 'saved', label: 'Saved', count: mounted ? saved.length : undefined },
    { key: 'reviews', label: 'Reviews', count: user.reviewCount },
  ];

  const moodboards = boards.filter((b) => b.kind === 'moodboard');
  const collections = boards.filter((b) => b.kind === 'collection');
  // Section headers only earn their place when both kinds are present.
  const showBoardSections = moodboards.length > 0 && collections.length > 0;

  const boardCard = (b: (typeof boards)[number]) => (
    <BoardCard
      key={b.id}
      href={boardHref(b)}
      title={b.title}
      thumbs={listingCoverThumbs(b.itemIds, 4, b.coverUri)}
      count={b.itemIds.length}
      isPrivate={b.isPrivate}
    />
  );

  return (
    <div className="mx-auto max-w-[1200px]">
      <ProfileHero
        user={user}
        listingCount={listingsLoading ? user.listingCount : listings.length}
        variant="self"
      />

      <div className="mt-5">
        <ProfileTabs tabs={tabs} active={tab} onChange={setTab} />
      </div>

      <div className="py-4">
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
              compact
            />
          ) : showBoardSections ? (
            <>
              <ProfileSectionHeader title="Moodboards" count={moodboards.length} />
              <BoardGrid>{moodboards.map(boardCard)}</BoardGrid>
              <div className="mt-6">
                <ProfileSectionHeader title="Collections" count={collections.length} />
                <BoardGrid>{collections.map(boardCard)}</BoardGrid>
              </div>
            </>
          ) : (
            <BoardGrid>{boards.map(boardCard)}</BoardGrid>
          )
        ) : null}

        {tab === 'saved' ? (
          !mounted ? (
            <ClosetGridSkeleton />
          ) : (
            <ClosetGrid
              items={savedListings}
              unsave="saved"
              emptyIcon="bookmark"
              emptyTitle="No saved items"
              emptySubtitle="Bookmark items to compare them here later."
              actionLabel="Explore"
              onAction={() => router.push('/explore')}
            />
          )
        ) : null}

        {tab === 'reviews' ? (
          reviewsLoading ? (
            <ReviewListSkeleton />
          ) : (
            <div className="px-4 sm:px-6">
              <div className="flex items-center gap-2 pb-1">
                <RatingStars rating={user.rating} size={15} />
                <span className="tnum text-body-emphasis font-semibold text-text-primary">
                  {user.rating.toFixed(1)}
                </span>
                <span className="text-meta text-text-muted">
                  · {user.reviewCount} reviews
                </span>
              </div>
              {(reviews ?? []).length > 0 ? (
                <ReviewList reviews={reviews ?? []} />
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
    </div>
  );
}
