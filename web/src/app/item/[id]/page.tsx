'use client';

/**
 * /item/[id] — flagship PDP. Breadcrumb → one grid: media stage and
 * evidence column left, buy panel pinned right for the whole scroll (the
 * eBay buy-box behaviour — the panel is capped to the viewport and only
 * scrolls internally if a state variant outgrows it). Evidence order
 * mirrors the mobile ItemDetailScreen scroll zones: item specifics +
 * description → seller reviews → environmental impact → price history &
 * market → questions. Discovery rails close the page. Loading skeleton,
 * not-found EmptyState and the populated state are all authored.
 */

import { useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useListing, useSellerListings } from '@/lib/hooks/queries';
import { similarListings } from '@/lib/data/fixtures-commerce';
import { PdpGallery } from '@/components/pdp/PdpGallery';
import { BuyPanel } from '@/components/pdp/BuyPanel';
import { PdpBreadcrumb } from '@/components/pdp/PdpBreadcrumb';
import { PdpAbout } from '@/components/pdp/PdpAbout';
import { PdpReviews } from '@/components/pdp/PdpReviews';
import { SustainabilityBadge } from '@/components/pdp/SustainabilityBadge';
import { PdpMarket } from '@/components/pdp/PdpMarket';
import { ListingQA } from '@/components/pdp/ListingQA';
import { PdpRails } from '@/components/pdp/PdpRails';
import { SeenInLooksRail } from '@/components/pdp/SeenInLooksRail';
import { CuratedCollectionsRail } from '@/components/pdp/CuratedCollectionsRail';
import { PdpSkeleton } from '@/components/pdp/PdpSkeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconButton } from '@/components/ui/IconButton';
import { useRecordListingView } from '@/lib/store/recentlyViewed';

export default function ItemPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id ?? '';

  const { data: listing, isLoading, isError } = useListing(id);
  const { data: sellerListings, isLoading: sellerLoading } = useSellerListings(
    listing?.sellerId ?? '',
  );
  // Recently-viewed memory — records once the listing resolves, not the raw param.
  useRecordListingView(listing?.id);

  const sellerItems = useMemo(
    () => (sellerListings ?? []).filter((l) => l.id !== listing?.id && !l.isSold),
    [sellerListings, listing?.id],
  );
  const similar = useMemo(() => (listing ? similarListings(listing) : []), [listing]);

  if (isLoading) {
    return <PdpSkeleton />;
  }

  if (!listing) {
    return (
      <EmptyState
        icon="pricetag"
        title={isError ? 'Couldn’t load this item' : 'This listing is no longer available'}
        subtitle="It may have been sold or removed by the seller."
        actionLabel="Browse similar items"
        onAction={() => router.push('/explore')}
      />
    );
  }

  return (
    <div className="mx-auto max-w-[1280px]">
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
          <PdpGallery listing={listing} />
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
          <ListingQA listing={listing} />
        </div>
      </div>

      {/* Discovery rails — seller closet preview + basis-stated similar band */}
      <PdpRails
        listing={listing}
        sellerItems={sellerItems}
        similarItems={similar}
        isLoading={sellerLoading}
      />

      {/* Community styling — looks + collections featuring this item.
          Sits below every item-critical and discovery section, matching
          the mobile ItemDetailScreen order. Each rail self-omits when the
          item is featured nowhere. */}
      <SeenInLooksRail listing={listing} />
      <CuratedCollectionsRail listing={listing} />
    </div>
  );
}
