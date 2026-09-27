'use client';

/**
 * Public profile — port of UserProfileScreen: identity hero (Follow +
 * Message + share), flat shop stats strip, closet banner when the closet
 * is deep, and quiet underline tabs in shop grammar: Items | Sold |
 * Reviews — plus Looks and Boards only when the member actually has them.
 * Items is the active-listings grid; Sold carries the sold-marker closet.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from '@/lib/session/SessionProvider';
import { useReviews, useSellerListings, useUserByUsername } from '@/lib/hooks/queries';
import { LOOKS } from '@/lib/data/fixtures';
import { boardsForOwner } from '@/components/profile/fixtures';
import { boardHref } from '@/components/profile/profileViewModel';
import { ProfileHero, type ProfileStatKey } from '@/components/profile/ProfileHero';
import { HighlightsRail } from '@/components/profile/HighlightsRail';
import { useProfileHighlights } from '@/components/profile/useProfileHighlights';
import { ShopRail } from '@/components/profile/ShopRail';
import { ProfileTabs } from '@/components/profile/ProfileTabs';
import { ClosetGridSkeleton } from '@/components/profile/ClosetGrid';
import {
  ClosetListingsSection,
  closetMosaicCells,
  CLOSET_MOSAIC_MIN,
} from '@/components/closet';
import { LooksGrid } from '@/components/profile/LooksGrid';
import { ReviewList, ReviewListSkeleton, ReviewSummary } from '@/components/profile/ReviewList';
import { ProfileAbout } from '@/components/profile/ProfileAbout';
import { BoardCard, BoardGrid } from '@/components/profile/BoardGrid';
import { ProfileHeroSkeleton } from '@/components/profile/ProfileSkeleton';
import { AppImage } from '@/components/ui/AppImage';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { getListingCoverUri } from '@/lib/utils/media';
import { listingCoverThumbs } from '@/components/profile/boardMedia';

type TabKey = 'items' | 'sold' | 'looks' | 'boards' | 'about' | 'reviews';
const CLOSET_BANNER_MIN = 10;

export default function PublicProfilePage() {
  const params = useParams();
  const username = String(params.username ?? '');
  const router = useRouter();
  const { user: me } = useSession();
  const [tab, setTab] = useState<TabKey>('items');

  const { data: user, isLoading, isFetched, isError, refetch } = useUserByUsername(username);
  const { data: listings, isLoading: listingsLoading } = useSellerListings(user?.id ?? '');
  const { data: reviews, isLoading: reviewsLoading } = useReviews(user?.id ?? '');
  const tabContentRef = useRef<HTMLDivElement>(null);

  // Viewing your own public page routes to the owner surface.
  useEffect(() => {
    if (user?.id && me?.id === user.id) router.replace('/profile');
  }, [user?.id, me?.id, router]);

  const closetThumbs = useMemo(
    () => (listings ?? []).slice(0, 3).map((l) => getListingCoverUri(l.images)),
    [listings],
  );
  const looks = useMemo(() => LOOKS.filter((l) => l.creatorId === user?.id), [user?.id]);
  const boards = useMemo(
    () => (user?.id ? boardsForOwner(user.id, false) : []),
    [user?.id],
  );
  const { highlights } = useProfileHighlights(user?.id ?? '');

  if (isLoading) {
    return (
      <div className="mx-auto max-w-[1200px]">
        <ProfileHeroSkeleton />
        <div className="mt-5 border-b border-border-subtle" />
        <div className="py-4">
          <ClosetGridSkeleton />
        </div>
      </div>
    );
  }

  // Error is not absence — a failed fetch gets a retry, not a gravestone.
  if (isError) {
    return (
      <div className="mx-auto max-w-[1200px]">
        <EmptyState
          icon="warning"
          title="Couldn't load this profile"
          subtitle="Check your connection and try again."
          actionLabel="Try again"
          onAction={() => void refetch()}
        />
      </div>
    );
  }

  if (isFetched && !user) {
    return (
      <div className="mx-auto max-w-[1200px]">
        <EmptyState
          icon="profile"
          title="Member not found"
          subtitle="This profile doesn't exist or may have been removed."
          actionLabel="Explore"
          onAction={() => router.push('/explore')}
        />
      </div>
    );
  }

  if (!user || user.id === me?.id) return null;

  // Stat seams land on the matching tab and scroll content into view —
  // scroll-mt clears the sticky header + tab rail (~112px).
  const onStatPress = (stat: ProfileStatKey) => {
    setTab(stat === 'sold' ? 'sold' : stat === 'reviews' ? 'reviews' : 'items');
    requestAnimationFrame(() =>
      tabContentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    );
  };

  const closetListings = listings ?? [];
  const forSale = closetListings.filter((l) => !l.isSold);
  const soldListings = closetListings.filter((l) => l.isSold);
  const reviewRows = reviews ?? [];
  const shopTab: 'items' | 'sold' = tab === 'sold' ? 'sold' : 'items';

  // Media-mosaic hero — for-sale covers lead the collage so the band is
  // shoppable, sold items fill behind them. It subsumes the text banner's
  // "browse the full closet" affordance when it renders.
  const closetMediaPool = [...forSale, ...soldListings];
  const showMosaic =
    !user.coverPhoto && closetMosaicCells(closetMediaPool).length >= CLOSET_MOSAIC_MIN;

  // Mobile shop grammar — the Listings tab's For sale/Sold segments are
  // tabs here; About carries the bio/policies block mobile renders.
  const tabs: { key: TabKey; label: string; count?: number }[] = [
    { key: 'items', label: 'For sale', count: listingsLoading ? undefined : forSale.length },
    { key: 'sold', label: 'Sold', count: listingsLoading ? undefined : soldListings.length },
    ...(looks.length > 0
      ? [{ key: 'looks' as const, label: 'Looks', count: looks.length }]
      : []),
    ...(boards.length > 0
      ? [{ key: 'boards' as const, label: 'Boards', count: boards.length }]
      : []),
    { key: 'about', label: 'About' },
    {
      key: 'reviews',
      label: 'Reviews',
      count: reviewsLoading ? undefined : reviewRows.length,
    },
  ];

  return (
    <div className="mx-auto max-w-[1200px]">
      <ProfileHero
        user={user}
        listingCount={listingsLoading ? user.listingCount : closetListings.length}
        forSaleCount={listingsLoading ? undefined : forSale.length}
        soldCount={listingsLoading ? undefined : soldListings.length}
        variant="public"
        onStatPress={onStatPress}
        closetMedia={closetMediaPool}
      />

      <HighlightsRail highlights={highlights} />

      <ShopRail ownerId={user.id} />

      {/* Closet banner — only when the closet is deep enough to browse and
          the mosaic hero isn't already serving the same destination. */}
      {closetListings.length >= CLOSET_BANNER_MIN && !showMosaic ? (
        <Link
          href={`/collection/closet-${user.id}`}
          className="pressable mx-4 mt-4 flex items-center justify-between gap-3 border-y border-border-subtle py-3 sm:mx-6"
        >
          <span className="flex min-w-0 items-center gap-3">
            <span className="flex shrink-0 -space-x-2">
              {closetThumbs.map((src, i) => (
                <span
                  key={i}
                  className="relative h-7 w-7 overflow-hidden rounded-md ring-2 ring-background"
                >
                  <AppImage src={src} alt="" fill sizes="28px" className="h-full w-full" />
                </span>
              ))}
            </span>
            <span className="clamp-1 text-body text-text-secondary">
              Browse the full closet —{' '}
              <span className="tnum font-semibold text-text-primary">
                {closetListings.length} items
              </span>
            </span>
          </span>
          <Icon name="forward" size={16} className="shrink-0 text-text-muted" />
        </Link>
      ) : null}

      <div className="mt-5">
        <ProfileTabs tabs={tabs} active={tab} onChange={setTab} />
      </div>

      <div className="scroll-mt-28 py-4" ref={tabContentRef}>
        {tab === 'items' || tab === 'sold' ? (
          /* key resets closet filters when the shop tab changes */
          <ClosetListingsSection
            key={shopTab}
            items={shopTab === 'items' ? forSale : soldListings}
            isLoading={listingsLoading}
            emptyIcon={shopTab === 'sold' ? 'pricetag' : 'bag'}
            emptyTitle={shopTab === 'sold' ? 'Nothing sold yet' : 'Nothing for sale'}
            emptySubtitle={
              shopTab === 'sold'
                ? `@${user.username} hasn't sold anything recently.`
                : `@${user.username} has no active listings right now.`
            }
            stickyToolbar
          />
        ) : null}

        {tab === 'looks' ? (
          <LooksGrid
            looks={looks}
            emptyTitle="No looks yet"
            emptySubtitle={`@${user.username} hasn't published any looks.`}
          />
        ) : null}

        {tab === 'boards' ? (
          boards.length === 0 ? (
            <EmptyState
              icon="layers"
              title="No public boards"
              subtitle={`@${user.username} hasn't shared any collections.`}
              compact
            />
          ) : (
            <BoardGrid>
              {boards.map((b) => (
                <BoardCard
                  key={b.id}
                  href={boardHref(b)}
                  title={b.title}
                  thumbs={listingCoverThumbs(b.itemIds, 4, b.coverUri)}
                  count={b.itemIds.length}
                />
              ))}
            </BoardGrid>
          )
        ) : null}

        {tab === 'about' ? <ProfileAbout user={user} variant="public" /> : null}

        {tab === 'reviews' ? (
          reviewsLoading ? (
            <ReviewListSkeleton />
          ) : (
            <div className="px-4 sm:px-6">
              {reviewRows.length > 0 ? (
                <>
                  <ReviewSummary reviews={reviewRows} />
                  <ReviewList reviews={reviewRows} />
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
    </div>
  );
}
