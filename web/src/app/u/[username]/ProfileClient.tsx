'use client';

/**
 * Public profile — port of UserProfileScreen: identity hero (Follow +
 * Message + share), flat shop stats strip, closet banner when the closet
 * is deep, and quiet underline tabs in shop grammar: Items | Sold |
 * Reviews — plus Looks and Boards only when the member actually has them.
 * Items is the active-listings grid; Sold carries the sold-marker closet.
 *
 * Existence is decided upstream by the server shell (member resolution →
 * notFound()); a resolved-null here is still a definitive miss and throws
 * to the not-found boundary.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { notFound, useParams, useRouter } from 'next/navigation';
import { useSession } from '@/lib/session/SessionProvider';
import { useReviews } from '@/lib/hooks/queries';
import {
  PROFILE_AGGREGATE_ROOT,
  usePublicProfileByUsername,
  useSellerListingsPaged,
} from '@/lib/hooks/profile-queries';
import { LOOKS } from '@/lib/data/fixtures';
import { DATA_MODE } from '@/lib/api/client';
import * as socialService from '@/lib/api/services/social';
import { unblockUser } from '@/lib/api/services/users';
import { useInboxSafety } from '@/components/inbox/inboxSafety';
import { useSettingsPrefs } from '@/lib/store/settingsPrefs';
import { useToast } from '@/components/ui/Toast';
import { boardHref } from '@/components/profile/profileViewModel';
import { useOwnerBoards, type OwnerBoard } from '@/components/profile/useOwnerBoards';
import { ProfileHero, type ProfileStatKey } from '@/components/profile/ProfileHero';
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
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { formatDate } from '@/lib/utils/format';
import { getListingCoverUri } from '@/lib/utils/media';
import { useBoardCoverThumbs } from '@/components/profile/boardMedia';

type TabKey = 'items' | 'sold' | 'looks' | 'boards' | 'about' | 'reviews';
const CLOSET_BANNER_MIN = 10;

/** Board card — the collage resolves through the live-aware hook so a
 *  live board never renders catalogue ghosts (fixture keeps the same
 *  derivation). */
function PublicBoardCard({ board }: { board: OwnerBoard }) {
  const resolved = useBoardCoverThumbs(board.itemIds, 4, board.coverUri);
  // Live moodboards carry wire thumbs + itemCount — membership isn't on
  // the list wire, so the empty itemIds derivation stays a fallback.
  const thumbs = board.thumbs && board.thumbs.length > 0 ? board.thumbs : resolved;
  return (
    <BoardCard
      href={boardHref(board)}
      title={board.title}
      thumbs={thumbs}
      count={board.itemCount ?? board.itemIds.length}
    />
  );
}

export function ProfileClient() {
  const params = useParams();
  const username = String(params.username ?? '');
  const router = useRouter();
  const { user: me } = useSession();
  const [tab, setTab] = useState<TabKey>('items');

  // One composed read — by-username → /users/:id/profile aggregate.
  // The aggregate carries the User plus the viewer-scoped fields (away
  // state, storefront extras, DSA trader disclosure, block/mute/restrict
  // relations); surfaces below self-omit until their field lands.
  const {
    data: aggregate,
    isLoading,
    isFetched,
    isError,
    refetch,
  } = usePublicProfileByUsername(username);
  const user = aggregate?.user ?? null;
  // Paged closet — walks GET /users/:id/listings' keyset cursor, so deep
  // closets append past the first page instead of truncating at it.
  const {
    data: listings,
    isLoading: listingsLoading,
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
    fetchNextPage,
  } = useSellerListingsPaged(user?.id ?? '');
  const { data: reviews, isLoading: reviewsLoading } = useReviews(user?.id ?? '');
  const tabContentRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();
  const { show } = useToast();
  const [unblockPending, setUnblockPending] = useState(false);

  // Viewing your own public page routes to the owner surface.
  useEffect(() => {
    if (user?.id && me?.id === user.id) router.replace('/profile');
  }, [user?.id, me?.id, router]);

  const closetThumbs = useMemo(
    () => (listings ?? []).slice(0, 3).map((l) => getListingCoverUri(l.images)),
    [listings],
  );
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
  // Boards — one derivation shared with the owner surfaces: fixture truth
  // plus the query caches, so live collections and live moodboards resolve
  // here too (boardsForOwner alone only knows the seeded fixtures).
  const boards = useOwnerBoards(user?.id ?? '', false);


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

  // Resolved-empty is a definitive miss — not-found boundary, not a
  // soft-404 EmptyState.
  if (isFetched && !user) {
    notFound();
  }

  // Self-profile redirect in flight — skeleton, not a blank frame.
  if (!user || user.id === me?.id) {
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

  /** Unblock — live posts POST /users/:id/unblock; both modes converge the
   *  local safety stores the options menu writes, then re-read the
   *  aggregate so the full profile returns on server truth. */
  const handleUnblock = () => {
    const write = DATA_MODE === 'live' ? unblockUser(user.id) : Promise.resolve();
    setUnblockPending(true);
    void write
      .then(() => {
        if (useInboxSafety.getState().blockedUserIds.includes(user.id)) {
          useInboxSafety.getState().toggleBlocked(user.id);
        }
        useSettingsPrefs.getState().unblockUser(user.id);
        void qc.invalidateQueries({ queryKey: PROFILE_AGGREGATE_ROOT });
        show(`@${user.username} unblocked`, 'info');
      })
      .catch(() => show('Could not unblock this member', 'error'))
      .finally(() => setUnblockPending(false));
  };

  // Viewer-blocked — the aggregate's isBlocked (viewer → target) collapses
  // the surface to identity + the honest unblock affordance rather than
  // rendering a profile the viewer chose to shut out.
  if (aggregate?.isBlocked === true) {
    return (
      <div className="mx-auto max-w-[1200px]">
        <div className="flex flex-col items-center px-6 py-16 text-center sm:py-24">
          <Avatar src={user.avatar} name={user.username} size={80} />
          <h1 className="mt-4 text-item-title font-bold text-text-primary">
            {user.displayName?.trim() || `@${user.username}`}
          </h1>
          {user.displayName?.trim() ? (
            <p className="mt-1 text-body text-text-secondary">@{user.username}</p>
          ) : null}
          <p className="mt-3 max-w-sm text-body text-text-secondary">
            You blocked this member — they can&apos;t message you and you
            won&apos;t see their items.
          </p>
          <Button
            variant="secondary"
            className="mt-5"
            disabled={unblockPending}
            onClick={handleUnblock}
          >
            {unblockPending ? 'Unblocking…' : 'Unblock'}
          </Button>
        </div>
      </div>
    );
  }

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

  // Aggregate fields — all optional; surfaces self-omit until they land.
  const away = aggregate?.away ?? null;
  const trader = aggregate?.trader ?? null;
  const storefront = aggregate?.storefront ?? null;
  // Privacy gates (mobile canViewSocialContent/canViewShop): a private
  // profile keeps hero + About — closet, looks, boards and reviews hide.
  const canViewSocial = aggregate?.canViewSocialContent !== false;
  const closetVisible = canViewSocial && aggregate?.canViewShop !== false;

  // Media-mosaic hero — for-sale covers lead the collage so the band is
  // shoppable, sold items fill behind them. It subsumes the text banner's
  // "browse the full closet" affordance when it renders.
  const closetMediaPool = closetVisible ? [...forSale, ...soldListings] : [];
  const showMosaic =
    !user.coverPhoto &&
    !user.coverVideo &&
    closetMosaicCells(closetMediaPool).length >= CLOSET_MOSAIC_MIN;

  // Mobile shop grammar — the Listings tab's For sale/Sold segments are
  // tabs here; About carries the bio/policies block mobile renders.
  const tabs: { key: TabKey; label: string; count?: number }[] = [
    ...(closetVisible
      ? [
          { key: 'items' as const, label: 'For sale', count: listingsLoading ? undefined : forSale.length },
          { key: 'sold' as const, label: 'Sold', count: listingsLoading ? undefined : soldListings.length },
        ]
      : []),
    ...(canViewSocial && looks.length > 0
      ? [{ key: 'looks' as const, label: 'Looks', count: looks.length }]
      : []),
    ...(canViewSocial && boards.length > 0
      ? [{ key: 'boards' as const, label: 'Boards', count: boards.length }]
      : []),
    { key: 'about' as const, label: 'About' },
    ...(canViewSocial
      ? [
          {
            key: 'reviews' as const,
            label: 'Reviews',
            count: reviewsLoading ? undefined : reviewRows.length,
          },
        ]
      : []),
  ];
  // A privacy gate landing mid-visit can retire the active tab — fall back
  // to About, which always exists.
  const activeTab: TabKey = tabs.some((t) => t.key === tab) ? tab : 'about';

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
        viewer={aggregate ?? undefined}
      />

      {/* Away banner — the aggregate is the authoritative, privacy-aware
          away source (mobile UserProfileHeader grammar). Informational;
          buy/offer CTAs are gated at the listing level. */}
      {away?.holidayMode === true ? (
        <div className="mx-4 mt-4 flex items-start gap-2.5 rounded-xl border border-border-subtle bg-surface-alt px-4 py-3 sm:mx-6">
          <Icon name="pause" size={18} className="mt-0.5 shrink-0 text-text-muted" />
          <div className="min-w-0">
            <p className="text-body-emphasis font-semibold text-text-primary">
              This shop is on holiday
            </p>
            <p className="mt-0.5 text-meta text-text-muted">
              {away.awayMessage?.trim() ||
                'The seller is away right now. Listings are paused and will return when they are back.'}
            </p>
            {away.holidayModeUntil ? (
              <p className="mt-0.5 text-meta text-text-muted">
                Back {formatDate(away.holidayModeUntil)}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Storefront announcement — the seller's shop greeting. Plain text
          with spacing, no decorative container (native grammar). */}
      {storefront?.announcement?.trim() ? (
        <p className="mx-4 mt-4 text-body text-text-primary sm:mx-6">
          {storefront.announcement.trim()}
        </p>
      ) : null}

      {/* DSA Art. 30 trader disclosure — legally required in EU/UK.
          Factual meta rows under a hairline; legal details only render
          for classified traders (mobile UserProfileHeader). */}
      {trader ? (
        <div className="mx-4 mt-3 border-t border-border-subtle pt-2.5 sm:mx-6">
          <p className="text-meta font-semibold text-text-primary">
            {trader.classification === 'trader' ? 'Business seller' : 'Private seller'}
          </p>
          {trader.classification === 'trader' ? (
            <>
              {trader.legalName ? (
                <p className="mt-0.5 text-meta text-text-muted">{trader.legalName}</p>
              ) : null}
              {trader.address ? (
                <p className="mt-0.5 text-meta text-text-muted">{trader.address}</p>
              ) : null}
              {trader.registrationNumber ? (
                <p className="mt-0.5 text-meta text-text-muted">
                  Reg: {trader.registrationNumber}
                </p>
              ) : null}
              {trader.vatNumber ? (
                <p className="mt-0.5 text-meta text-text-muted">VAT: {trader.vatNumber}</p>
              ) : null}
              {trader.contactEmail ? (
                <p className="mt-0.5 text-meta text-text-muted">{trader.contactEmail}</p>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}

      {closetVisible ? <ShopRail ownerId={user.id} /> : null}

      {/* Closet banner — only when the closet is deep enough to browse and
          the mosaic hero isn't already serving the same destination. */}
      {closetVisible && closetListings.length >= CLOSET_BANNER_MIN && !showMosaic ? (
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
        <ProfileTabs tabs={tabs} active={activeTab} onChange={setTab} />
      </div>

      <div className="scroll-mt-28 py-4" ref={tabContentRef}>
        {activeTab === 'items' || activeTab === 'sold' ? (
          <>
            {/* key resets closet filters when the shop tab changes */}
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

            {/* Closet pagination — the service's nextCursor drives Load
                more; a failed page gets an honest retry, an exhausted
                closet ends quietly. */}
            {hasNextPage || isFetchingNextPage || isFetchNextPageError ? (
              <div className="mt-6 flex justify-center">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isFetchingNextPage}
                  onClick={() => void fetchNextPage()}
                >
                  {isFetchingNextPage
                    ? 'Loading…'
                    : isFetchNextPageError
                      ? 'Couldn’t load more — try again'
                      : 'Load more'}
                </Button>
              </div>
            ) : null}
          </>
        ) : null}

        {activeTab === 'looks' ? (
          <LooksGrid
            looks={looks}
            emptyTitle="No looks yet"
            emptySubtitle={`@${user.username} hasn't published any looks.`}
          />
        ) : null}

        {activeTab === 'boards' ? (
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
                <PublicBoardCard key={b.id} board={b} />
              ))}
            </BoardGrid>
          )
        ) : null}

        {activeTab === 'about' ? (
          <ProfileAbout
            user={user}
            variant="public"
            policies={storefront?.policies ?? null}
          />
        ) : null}

        {activeTab === 'reviews' ? (
          reviewsLoading ? (
            <ReviewListSkeleton />
          ) : (
            <div className="px-4 sm:px-6 lg:max-w-3xl">
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
