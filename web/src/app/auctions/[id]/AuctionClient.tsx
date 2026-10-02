'use client';

/**
 * /auctions/[id] — the auction room. Media stage and evidence on the left,
 * the live transaction rail on the right: ticking countdown, auth-gated
 * composer with min-increment validation, buy-now routing, and the bid
 * ledger. Similar items close the surface when the listing exists.
 *
 * Existence is decided by the server shell for auctions it can see
 * (seeded fixtures, live misses); a resolved-null here — including the
 * session-runtime miss — throws to the not-found boundary.
 */

import { useMemo, useState } from 'react';
import { notFound, useParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
import { useToast } from '@/components/ui/Toast';
import { ConfirmSheet, type ConfirmSheetState } from '@/components/orders/ConfirmSheet';
import { useAuction, useAuctionBids } from '@/lib/hooks/auction-queries';
import type { AuctionMarketItem } from '@/lib/contracts/auction';
import { usePdpSimilarListings } from '@/lib/hooks/pdp-market-queries';
import { useSession } from '@/lib/session/SessionProvider';
import { DATA_MODE } from '@/lib/api/client';
import { cancelAuction } from '@/lib/api/services/auctions';
import { fetchListingById } from '@/lib/api/services/listings';
import { fetchSellerSummary } from '@/lib/api/services/users';
import { listingById, userById } from '@/lib/data/fixtures';
import { mapListingToDiscoverySummary } from '@/lib/contracts/domain';
import { formatPrice } from '@/lib/utils/format';

const LIVE = DATA_MODE === 'live';

export function AuctionClient({ initialAuction }: { initialAuction?: AuctionMarketItem }) {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id ?? '';
  const { user } = useSession();
  // Guests carry no bidder identity — never borrow the fixture 'me' id or
  // authored fixture bids would masquerade as theirs.
  const viewerId = user?.id;

  const { auction, isLoading, isError, refetch } = useAuction(id, {
    initialData: initialAuction,
  });
  const {
    data: bids,
    isLoading: bidsLoading,
    isError: bidsError,
    refetch: refetchBids,
  } = useAuctionBids(id);
  const qc = useQueryClient();
  const { show } = useToast();
  // Seller cancel — confirm-sheet grammar for the destructive verb.
  const [cancelSheet, setCancelSheet] = useState<ConfirmSheetState | null>(null);
  const [cancelling, setCancelling] = useState(false);

  // Live: the auction's listing + seller are real backend ids — fixture
  // lookups would always miss and strip the media stage, evidence table
  // and seller identity. Resolve them against the API.
  const listingQuery = useQuery({
    queryKey: ['auction-listing', auction?.listingId],
    queryFn: ({ signal }) => fetchListingById(auction!.listingId, signal),
    enabled: LIVE && Boolean(auction?.listingId),
    staleTime: 60_000,
  });
  const sellerQuery = useQuery({
    queryKey: ['auction-seller', auction?.sellerId],
    queryFn: ({ signal }) => fetchSellerSummary(auction!.sellerId, signal),
    enabled: LIVE && Boolean(auction?.sellerId),
    staleTime: 5 * 60_000,
  });

  const listing = auction
    ? LIVE
      ? (listingQuery.data ?? null)
      : (listingById(auction.listingId) ?? null)
    : null;
  const seller = auction
    ? LIVE
      ? (() => {
          const s = sellerQuery.data;
          const embedded = auction.seller;
          const username = s?.username ?? embedded?.username ?? embedded?.displayName;
          if (!username) return null;
          return {
            username,
            avatar: s?.avatar ?? embedded?.avatar ?? null,
            isVerified: s?.verified ?? false,
            rating: s?.rating ?? null,
            reviewCount: s?.reviewCount ?? null,
          };
        })()
      : (userById(auction.sellerId) ?? null)
    : null;
  // Live mode resolves the real related-listings endpoint — the fixture
  // scorer would deep-link fixture ids into live 404s.
  const { items: similar } = usePdpSimilarListings(listing, 8);

  const [activeImage, setActiveImage] = useState(0);
  const images = listing?.images?.length ? listing.images : auction ? [auction.image] : [];

  const viewerMaxBid = useMemo(() => {
    // The detail read carries the server's authoritative viewer max —
    // prefer it over re-deriving from a 50-row bid window (a deeper
    // bidder history would silently truncate the lead below currentBid).
    if (typeof auction?.viewerHighestBid === 'number') return auction.viewerHighestBid;
    const mine = (bids ?? []).filter((bid) => bid.bidderId === viewerId);
    return mine.length ? Math.max(...mine.map((bid) => bid.amount)) : undefined;
  }, [auction?.viewerHighestBid, bids, viewerId]);

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

  // A failed fetch is not a missing auction — retry, don't misreport.
  if (isError) {
    return (
      <EmptyState
        icon="alert"
        title="Couldn't load this auction"
        subtitle="Check your connection and try again."
        actionLabel="Try again"
        onAction={() => void refetch()}
      />
    );
  }

  // Resolved-empty is a definitive miss — not-found boundary.
  if (!auction) {
    notFound();
  }

  const isSeller = user != null && auction.sellerId === user.id;

  /** POST /auctions/:id/cancel — ends the run, notifies the bidders and
   *  unpauses the listing. The route itself refuses a settled or
   *  winner-bound auction; the button only shows while it can still run. */
  const confirmCancel = async () => {
    if (cancelling) return;
    setCancelling(true);
    try {
      await cancelAuction(id);
      setCancelSheet(null);
      show('Auction cancelled — bidders have been notified.', 'success');
      void qc.invalidateQueries({ queryKey: ['auction', id] });
      void qc.invalidateQueries({ queryKey: ['auctions'] });
      void qc.invalidateQueries({ queryKey: ['auction-bids-all'] });
    } catch (e) {
      show(
        e instanceof Error && e.message ? e.message : 'Could not cancel the auction',
        'error',
      );
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1280px] pb-16">
      <div className="grid grid-cols-1 gap-8 px-4 pt-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-10 lg:pt-6">
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
            <div className="mt-2 flex gap-2" role="group" aria-label="Auction media">
              {images.map((src, index) => (
                <button
                  key={src}
                  type="button"
                  aria-pressed={index === activeImage}
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
            <h1 className="text-screen-title text-text-primary">{auction.title}</h1>
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
                      <Icon name="verified" size={13} className="text-commerce-trust" />
                    ) : null}
                  </span>
                  <span className="tnum text-meta text-text-muted">
                    {seller.rating != null ? `${seller.rating} · ` : ''}
                    {seller.reviewCount != null ? `${seller.reviewCount} reviews` : 'Seller'}
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
            listing={listing}
            hasListing={!!listing}
            viewerMaxBid={viewerMaxBid}
            topBidderName={topBidderName}
          />
          {/* Seller's destructive verb — live-only (the fixture runtime
              has no cancel write). Hidden once the run is terminal. */}
          {LIVE && isSeller && auction.lifecycle !== 'ended' ? (
            <button
              type="button"
              onClick={() =>
                setCancelSheet({
                  title: 'Cancel this auction?',
                  message:
                    'The auction ends now, every bidder is notified, and the listing goes back on sale. This can’t be undone.',
                  confirmLabel: 'Cancel auction',
                  variant: 'destructive',
                  onConfirm: () => void confirmCancel(),
                })
              }
              className="pressable mt-4 self-start text-caption font-semibold text-danger-text underline-offset-4 hover:underline"
            >
              Cancel auction
            </button>
          ) : null}
          <section className="mt-6 border-t border-border-subtle pt-5">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-section-title font-semibold text-text-primary">Bid history</h2>
              <span className="tnum text-meta text-text-muted">
                {auction.bidCount} {auction.bidCount === 1 ? 'bid' : 'bids'}
              </span>
            </div>
            <div className="mt-3">
              <BidHistory
                bids={bids ?? []}
                viewerId={viewerId}
                isLoading={bidsLoading}
                isError={bidsError}
                onRetry={() => void refetchBids()}
              />
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

      <ConfirmSheet
        sheet={cancelSheet}
        busy={cancelling}
        onDismiss={() => setCancelSheet(null)}
      />
    </div>
  );
}

function Fact({ label, value, tnum }: { label: string; value: string | null; tnum?: boolean }) {
  if (!value) return null;
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <dt className="text-meta font-semibold uppercase tracking-wide text-text-muted">{label}</dt>
      <dd className={`text-right text-body text-text-primary ${tnum ? 'tnum' : ''}`}>{value}</dd>
    </div>
  );
}
