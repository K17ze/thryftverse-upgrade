'use client';

/**
 * /item/[id] — flagship PDP. Breadcrumb → one grid: media stage and
 * evidence column left, buy panel pinned right for the whole scroll (the
 * eBay buy-box behaviour — the panel is capped to the viewport and only
 * scrolls internally if a state variant outgrows it). Evidence order
 * mirrors the mobile ItemDetailScreen scroll zones: item specifics +
 * description → seller reviews → environmental impact → price history &
 * market → questions. Discovery rails close the page. Loading skeleton,
 * not-found boundary and the populated state are all authored.
 *
 * Existence is decided by the server page (listing resolvers in
 * lib/api/server.ts → notFound()); the client keeps its own resolution
 * so session-published listings (fixture runtime records) and
 * mid-session deletes stay honest — a resolved-null is a real miss and
 * throws to the not-found boundary.
 */

import { useMemo } from 'react';
import { notFound, useParams, useRouter } from 'next/navigation';
import { useListing, useSellerListings } from '@/lib/hooks/queries';
import { usePdpSimilarListings } from '@/lib/hooks/pdp-market-queries';
import { PdpGallery } from '@/components/pdp/PdpGallery';
import { BuyPanel } from '@/components/pdp/BuyPanel';
import { PdpBreadcrumb } from '@/components/pdp/PdpBreadcrumb';
import { PdpAbout } from '@/components/pdp/PdpAbout';
import { PdpReviews } from '@/components/pdp/PdpReviews';
import { SustainabilityBadge } from '@/components/pdp/SustainabilityBadge';
import { PdpMarket } from '@/components/pdp/PdpMarket';
import { PdpCoOwn } from '@/components/pdp/PdpCoOwn';
import { ListingQA } from '@/components/pdp/ListingQA';
import { PdpRails } from '@/components/pdp/PdpRails';
import { PdpRecentlyViewed } from '@/components/pdp/PdpRecentlyViewed';
import { SeenInLooksRail } from '@/components/pdp/SeenInLooksRail';
import { CuratedCollectionsRail } from '@/components/pdp/CuratedCollectionsRail';
import { PdpSkeleton } from '@/components/pdp/PdpSkeleton';
import { PdpBuyDock } from '@/components/pdp/PdpBuyDock';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconButton } from '@/components/ui/IconButton';
import { useRecordListingView } from '@/lib/store/recentlyViewed';
import { useIsBlockedUser } from '@/components/inbox/inboxSafety';

export function ItemClient() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id ?? '';

  const { data: listing, isLoading, isError, refetch } = useListing(id);
  const {
    data: sellerListings,
    isLoading: sellerLoading,
    isError: sellerError,
    refetch: refetchSellerListings,
  } = useSellerListings(listing?.sellerId ?? '');
  // Recently-viewed memory — records once the listing resolves, not the raw param.
  useRecordListingView(listing?.id);
  // Viewer-relationship truth — a blocked seller gates the public Q&A
  // composer below (buy/offer/message suppression lives in the buy
  // panel + dock, which read the same store union).
  const sellerBlocked = useIsBlockedUser(listing?.sellerId ?? null);

  const sellerItems = useMemo(
    () => (sellerListings ?? []).filter((l) => l.id !== listing?.id && !l.isSold),
    [sellerListings, listing?.id],
  );
  // Similar band — live mode reads /listings/:id/related so the rail only
  // ever deep-links real listings; fixture mode keeps the local scorer.
  const { items: similar, isLoading: similarLoading } = usePdpSimilarListings(listing);

  if (isLoading) {
    return <PdpSkeleton />;
  }

  // A failed fetch is not a removed listing — retry, don't misreport.
  if (isError) {
    return (
      <EmptyState
        icon="alert"
        title="Couldn’t load this item"
        subtitle="Check your connection and try again."
        actionLabel="Try again"
        onAction={() => void refetch()}
      />
    );
  }

  // Resolved-empty is a definitive miss — the not-found boundary owns it
  // (the server page 404s misses it can see; client-side misses land here).
  if (!listing) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-[1280px] xl:max-w-[1440px]">
      <PdpBreadcrumb listing={listing} />

      {/* One grid: media + evidence left, buy panel right. The aside spans
          both rows so lg:sticky pins it from the gallery through the last
          evidence section — without the span the panel would unstick as
          soon as the media row scrolled past. */}
      <div className="grid gap-6 px-4 py-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-x-10 lg:gap-y-8">
        <div className="min-w-0 lg:col-start-1 lg:row-start-1">
          <div className="mb-3 lg:hidden">
            <IconButton name="back" aria-label="Back" onClick={() => router.back()} className="-ml-2" />
          </div>
          {/* The evidence column's "View all photos" jump lands here. */}
          <div id="pdp-gallery" className="scroll-mt-20">
            <PdpGallery listing={listing} />
          </div>
        </div>

        {/* Sticky buy column — capped to the viewport and scrollable in
            itself so the CTAs stay pinned under the header for the whole
            page. Without the cap the panel is taller than the viewport and
            sticky never engages. */}
        <aside className="lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:self-start lg:overflow-y-auto">
          <BuyPanel listing={listing} />
        </aside>

        {/* Evidence column — aligned under the media stage. */}
        <div className="min-w-0 lg:col-start-1 lg:row-start-2">
          <PdpAbout listing={listing} />
          <PdpReviews listing={listing} />
          <SustainabilityBadge grade={listing.sustainabilityGrade} />
          <PdpMarket listing={listing} />
          <PdpCoOwn listingId={listing.id} />
          <ListingQA listing={listing} isSellerBlocked={sellerBlocked} />
        </div>
      </div>

      {/* Discovery rails — seller closet preview + basis-stated similar band */}
      <PdpRails
        listing={listing}
        sellerItems={sellerItems}
        similarItems={similar}
        isLoading={sellerLoading}
        similarLoading={similarLoading}
        hasError={sellerError}
        onRetry={() => void refetchSellerListings()}
      />

      {/* Community styling — looks + collections featuring this item.
          Sits below every item-critical and discovery section, matching
          the mobile ItemDetailScreen order. Each rail self-omits when the
          item is featured nowhere. */}
      <SeenInLooksRail listing={listing} />
      <CuratedCollectionsRail listing={listing} />

      {/* Session trail — the buyer's own recently-viewed set minus this
          item. Hydration-gated; self-omits when empty. */}
      <PdpRecentlyViewed listing={listing} />

      {/* Mobile purchase dock — price + buy pinned over the tab bar on
          <lg, where the aside scrolls away. The spacer keeps the last
          rails clear of the dock + tab-bar overlay. */}
      <div className="h-[84px] lg:hidden" aria-hidden />
      <PdpBuyDock listing={listing} />
    </div>
  );
}
