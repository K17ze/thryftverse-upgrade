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

import { ProfileHero } from '@/components/profile/ProfileHero';
import { ProfileTabs } from '@/components/profile/ProfileTabs';
import { usePublicProfileWorkflow } from '@/components/profile/usePublicProfileWorkflow';
import { ProfileGates } from '@/components/profile/ProfileGates';
import { ProfileInfoBanners } from '@/components/profile/ProfileInfoBanners';
import { ProfileTabPanels } from '@/components/profile/ProfileTabPanels';

export function ProfileClient() {
  const {
    user,
    me,
    aggregate,
    isLoading,
    isFetched,
    isError,
    refetch,
    listingsLoading,
    closetListings,
    forSale,
    soldListings,
    closetThumbs,
    closetMediaPool,
    showMosaic,
    looks,
    boards,
    reviewRows,
    reviewSummary,
    reviewsLoading,
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
    fetchNextPage,
    activeTab,
    setTab,
    tabs,
    tabContentRef,
    onStatPress,
    storefront,
    closetVisible,
    unblockPending,
    handleUnblock,
  } = usePublicProfileWorkflow();

  const gate = (
    <ProfileGates
      isLoading={isLoading}
      isError={isError}
      refetch={() => void refetch()}
      isFetched={isFetched}
      user={user}
      me={me}
      aggregate={aggregate}
      unblockPending={unblockPending}
      onUnblock={handleUnblock}
    />
  );

  if (gate) return gate;
  if (!user) return null;

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

      <ProfileInfoBanners
        user={user}
        aggregate={aggregate}
        closetVisible={closetVisible}
        closetListingsLength={closetListings.length}
        closetThumbs={closetThumbs}
        showMosaic={showMosaic}
      />

      <div className="mt-5">
        <ProfileTabs tabs={tabs} active={activeTab} onChange={setTab} />
      </div>

      <div className="scroll-mt-28 py-4" ref={tabContentRef}>
        <ProfileTabPanels
          activeTab={activeTab}
          user={user}
          forSale={forSale}
          soldListings={soldListings}
          listingsLoading={listingsLoading}
          hasNextPage={hasNextPage}
          isFetchingNextPage={isFetchingNextPage}
          isFetchNextPageError={isFetchNextPageError}
          onFetchNextPage={() => void fetchNextPage()}
          looks={looks}
          boards={boards}
          reviewRows={reviewRows}
          reviewSummary={reviewSummary}
          reviewsLoading={reviewsLoading}
          storefrontPolicies={storefront?.policies}
        />
      </div>
    </div>
  );
}
