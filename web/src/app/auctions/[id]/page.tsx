'use client';

/**
 * /auctions/[id] — the auction room. Media stage and evidence on the left,
 * the live transaction rail on the right: ticking countdown, auth-gated
 * composer with min-increment validation, buy-now routing, and the bid
 * ledger. Similar items close the surface when the listing exists.
 */

import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  AuctionDetailSkeleton,
  BidHistory,
  BidPanel,
} from '@/components/auctions';
import { ProductTile } from '@/components/cards/ProductTile';
import { AppImage } from '@/components/ui/AppImage';
import { Avatar } from '@/components/ui/Avatar';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconButton } from '@/components/ui/IconButton';
import { Icon } from '@/components/ui/Icon';
import { useAuction, useAuctionBids } from '@/lib/hooks/auction-queries';
import { useSession } from '@/lib/session/SessionProvider';
import { listingById, userById } from '@/lib/data/fixtures';
import { similarListings } from '@/lib/data/fixtures-commerce';
import { mapListingToDiscoverySummary } from '@/lib/contracts/domain';
import { formatPrice } from '@/lib/utils/format';

export default function AuctionDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id ?? '';
  const { user } = useSession();
  const viewerId = user?.id ?? 'me';

  const { auction, isLoading } = useAuction(id);
  const { data: bids, isLoading: bidsLoading } = useAuctionBids(id);

  const listing = auction ? (listingById(auction.listingId) ?? null) : null;
  const seller = auction ? (userById(auction.sellerId) ?? null) : null;
  const similar = useMemo(() => (listing ? similarListings(listing, 8) : []), [listing]);

  const [activeImage, setActiveImage] = useState(0);
  const images = listing?.images?.length ? listing.images : auction ? [auction.image] : [];

  const viewerMaxBid = useMemo(() => {
    const mine = (bids ?? []).filter((bid) => bid.bidderId === viewerId);
    return mine.length ? Math.max(...mine.map((bid) => bid.amount)) : undefined;
  }, [bids, viewerId]);

  const topBidderName = useMemo(() => {
    if (!bids?.length) return null;
    const top = [...bids].sort(
      (a, b) => b.amount - a.amount || Date.parse(b.createdAt) - Date.parse(a.createdAt),
    )[0];
    return top?.bidderName ?? null;
  }, [bids]);

  if (isLoading) {
    return <AuctionDetailSkeleton />;
  }

  if (!auction) {
    return (
      <EmptyState
        icon="auction"
        title="Auction not found"
        subtitle="It may have closed, been removed, or never existed."
        actionLabel="Back to auctions"
        onAction={() => router.push('/auctions')}
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1280px] pb-16">
      <div className="grid gap-8 px-4 pt-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-10 lg:pt-6">
        {/* Media + evidence */}
        <div className="min-w-0">
          <div className="mb-3 lg:hidden">
            <IconButton
              name="back"
              aria-label="Back to auctions"
              onClick={() => router.push('/auctions')}
              className="-ml-2"
            />
          </div>

          <div className="overflow-hidden rounded-xl bg-surface-alt">
            <AppImage
              src={images[activeImage] ?? auction.image}
              alt={auction.title}
              aspectRatio={listing?.mediaAspectRatio ?? 0.8}
              priority
              sizes="(max-width: 1024px) 100vw, 60vw"
            />
          </div>

          {images.length > 1 ? (
            <div className="mt-2 flex gap-2" role="tablist" aria-label="Auction media">
              {images.map((src, index) => (
                <button
                  key={src}
                  type="button"
                  role="tab"
                  aria-selected={index === activeImage}
                  aria-label={`View image ${index + 1}`}
                  onClick={() => setActiveImage(index)}
                  className={`pressable h-16 w-16 overflow-hidden rounded-md border ${
                    index === activeImage ? 'border-text-primary' : 'border-transparent'
                  }`}
                >
                  <AppImage src={src} alt="" fill sizes="64px" className="h-full w-full" />
                </button>
              ))}
            </div>
          ) : null}

          {/* Title + seller */}
          <div className="mt-5">
            <h1 className="text-screen-title font-bold text-text-primary">{auction.title}</h1>
            {seller ? (
              <Link
                href={`/u/${seller.username}`}
                className="pressable mt-3 flex items-center gap-2.5 self-start"
              >
                <Avatar src={seller.avatar} name={seller.username} size={40} />
                <span className="flex flex-col">
                  <span className="flex items-center gap-1 text-body-emphasis font-semibold text-text-primary">
                    <span className="clamp-1">@{seller.username}</span>
                    {seller.isVerified ? (
                      <Icon name="verified" size={13} className="text-success-text" />
                    ) : null}
                  </span>
                  <span className="tnum text-meta text-text-muted">
                    {seller.rating} · {seller.reviewCount} reviews
                  </span>
                </span>
              </Link>
            ) : null}
          </div>

          {/* Item evidence — flat, hairline-separated */}
          {listing ? (
            <section className="mt-8 border-t border-border-subtle pt-6">
              <h2 className="text-section-title font-semibold text-text-primary">
                About this item
              </h2>
              <p className="mt-2 max-w-prose text-body text-text-secondary">
                {listing.description}
              </p>
              <dl className="mt-5 divide-y divide-border-subtle border-y border-border-subtle text-body">
                <Fact label="Brand" value={listing.brand} />
                <Fact label="Condition" value={listing.condition} />
                <Fact label="Size" value={listing.size} />
                <Fact label="Listing price" value={formatPrice(listing.price)} tnum />
              </dl>
            </section>
          ) : null}

        </div>

        {/* Transaction rail — composer first, then the bid ladder it competes in */}
        <aside className="mt-2 lg:sticky lg:top-20 lg:mt-0 lg:self-start">
          <BidPanel
            auction={auction}
            hasListing={!!listing}
            viewerMaxBid={viewerMaxBid}
            topBidderName={topBidderName}
          />
          <section className="mt-6 border-t border-border-subtle pt-5">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-section-title font-semibold text-text-primary">Bid history</h2>
              <span className="tnum text-meta text-text-muted">
                {auction.bidCount} {auction.bidCount === 1 ? 'bid' : 'bids'}
              </span>
            </div>
            <div className="mt-3">
              <BidHistory bids={bids ?? []} viewerId={viewerId} isLoading={bidsLoading} />
            </div>
          </section>
        </aside>
      </div>

      {/* Similar items — only when the listing exists to compare against */}
      {similar.length > 0 ? (
        <section className="mt-10 border-t border-border-subtle py-6">
          <h2 className="mb-4 px-4 text-section-title font-semibold text-text-primary sm:px-6">
            Similar items
          </h2>
          <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 sm:px-6" role="list">
            {similar.map((item) => (
              <div key={item.id} role="listitem" className="w-[150px] shrink-0 sm:w-[180px]">
                <ProductTile item={mapListingToDiscoverySummary(item)} />
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function Fact({ label, value, tnum }: { label: string; value: string | null; tnum?: boolean }) {
  if (!value) return null;
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <dt className="text-meta font-medium uppercase tracking-wide text-text-muted">{label}</dt>
      <dd className={`text-right text-body text-text-primary ${tnum ? 'tnum' : ''}`}>{value}</dd>
    </div>
  );
}
