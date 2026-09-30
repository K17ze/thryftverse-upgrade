import React from 'react';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ClosetListingsSection } from '@/components/closet';
import { LooksGrid } from '@/components/profile/LooksGrid';
import { BoardCard, BoardGrid } from '@/components/profile/BoardGrid';
import { ProfileAbout, type StorefrontPolicies } from '@/components/profile/ProfileAbout';
import { ReviewList, ReviewListSkeleton, ReviewSummary } from '@/components/profile/ReviewList';
import { boardHref } from '@/components/profile/profileViewModel';
import { useBoardCoverThumbs } from '@/components/profile/boardMedia';
import type { OwnerBoard } from '@/components/profile/useOwnerBoards';
import type { ProfileTabKey } from './usePublicProfileWorkflow';
import type { Listing, Look, Review, User } from '@/lib/contracts/domain';

/** Board card — the collage resolves through the live-aware hook so a
 *  live board never renders catalogue ghosts (fixture keeps the same
 *  derivation). */
export function PublicBoardCard({ board }: { board: OwnerBoard }) {
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

export function ProfileTabPanels({
  activeTab,
  user,
  forSale,
  soldListings,
  listingsLoading,
  hasNextPage,
  isFetchingNextPage,
  isFetchNextPageError,
  onFetchNextPage,
  looks,
  boards,
  reviewRows,
  reviewSummary,
  reviewsLoading,
  storefrontPolicies,
}: {
  activeTab: ProfileTabKey;
  user: User;
  forSale: Listing[];
  soldListings: Listing[];
  listingsLoading: boolean;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  isFetchNextPageError?: boolean;
  onFetchNextPage: () => void;
  looks: Look[];
  boards: OwnerBoard[];
  reviewRows: Review[];
  reviewSummary?: Parameters<typeof ReviewSummary>[0]['summary'];
  reviewsLoading: boolean;
  storefrontPolicies?: StorefrontPolicies | null;
}) {
  const shopTab: 'items' | 'sold' = activeTab === 'sold' ? 'sold' : 'items';

  return (
    <>
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
                onClick={onFetchNextPage}
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
          policies={storefrontPolicies ?? null}
        />
      ) : null}

      {activeTab === 'reviews' ? (
        reviewsLoading ? (
          <ReviewListSkeleton />
        ) : (
          <div className="px-4 sm:px-6 lg:max-w-3xl">
            {reviewRows.length > 0 ? (
              <>
                <ReviewSummary reviews={reviewRows} summary={reviewSummary} />
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
    </>
  );
}
