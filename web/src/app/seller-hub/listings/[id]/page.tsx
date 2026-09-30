'use client';

/**
 * /seller-hub/listings/[id] — per-listing manage surface (mobile
 * ManageListingScreen parity). Media rail, identity, a buyer-activity
 * metric strip, then the action set: share, preview, offer-to-likers,
 * promote, pause/resume, mark sold/relist, delete. Stats open the shared
 * ListingStatsSheet — one stats contract, no duplicated metrics.
 */

import { use, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { SellerSectionNav } from '@/components/seller/SellerSectionNav';
import { listingStatusOf } from '@/components/seller/listingManagementModel';
import { useMyListings } from '@/lib/hooks/queries';
import {
  useAdjustListingPrice,
  useFulfilmentCounts,
  useLikerOfferHistory,
  useListingBatchCommand,
  useListingStats,
  useListingStatusPatch,
} from '@/lib/hooks/seller-queries';
import { ApiRequestError, isRecord } from '@/lib/api/http';
import { formatPrice } from '@/lib/utils/format';
import { ListingManageMediaRail } from '@/components/seller/detail/ListingManageMediaRail';
import { ListingManageIdentity } from '@/components/seller/detail/ListingManageIdentity';
import { ListingManageActivityMetrics } from '@/components/seller/detail/ListingManageActivityMetrics';
import {
  ListingManageActionMenu,
  type ListingPendingAction,
} from '@/components/seller/detail/ListingManageActionMenu';
import { ListingManageSheets } from '@/components/seller/detail/ListingManageSheets';

export default function ManageListingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { show } = useToast();
  const counts = useFulfilmentCounts();
  const batch = useListingBatchCommand();
  const statusPatch = useListingStatusPatch();
  const priceAdjust = useAdjustListingPrice();

  const { data, isLoading, isError, refetch } = useMyListings();
  const listing = useMemo(
    () => (data ?? []).find((l) => l.id === id) ?? null,
    [data, id],
  );
  const status = listing ? listingStatusOf(listing) : null;
  const stats = useListingStats(listing?.id ?? null, '30d');
  const lastOffer = useLikerOfferHistory(listing?.id ?? null);

  const [statsOpen, setStatsOpen] = useState(false);
  const [offerOpen, setOfferOpen] = useState(false);
  const [promoteOpen, setPromoteOpen] = useState(false);
  const [priceOpen, setPriceOpen] = useState(false);
  const [priceDraft, setPriceDraft] = useState('');
  const [pending, setPending] = useState<ListingPendingAction | null>(null);

  const share = async () => {
    if (!listing) return;
    const url = `${window.location.origin}/item/${listing.id}`;
    const payload = { title: listing.title, text: listing.title, url };
    try {
      if (navigator.share) {
        await navigator.share(payload);
        return;
      }
      await navigator.clipboard.writeText(url);
      show('Link copied', 'success');
    } catch {
      // AbortError = share sheet dismissed — not an error state
    }
  };

  const act = () => {
    if (!listing || !pending) return;
    const done = pending;
    if (done.kind === 'mark-sold' || done.kind === 'relist') {
      statusPatch.mutate(
        { listingId: listing.id, status: done.kind === 'mark-sold' ? 'sold' : 'active' },
        {
          onSuccess: () => {
            setPending(null);
            show(
              done.kind === 'mark-sold'
                ? `“${listing.title}” marked as sold`
                : `“${listing.title}” is live again`,
              'success',
            );
          },
          onError: () => show("Couldn't update that listing — try again", 'error'),
        },
      );
      return;
    }
    batch.mutate(
      {
        command: done.kind === 'pause' ? 'pause' : done.kind === 'resume' ? 'resume' : 'delete',
        listingIds: [listing.id],
      },
      {
        onSuccess: (result) => {
          const receipt = result.results[0];
          setPending(null);
          if (receipt?.state === 'applied') {
            if (done.kind === 'delete') {
              show(`“${listing.title}” deleted`, 'success');
              router.replace('/seller-hub/listings');
            } else {
              show(
                done.kind === 'pause' ? 'Listing paused' : 'Listing back on sale',
                'success',
              );
            }
          } else {
            show(receipt?.reason ?? 'That action was rejected', 'info');
          }
        },
        onError: () => show('Something went wrong — try again', 'error'),
      },
    );
  };

  const parsedPrice = Number(priceDraft);
  const priceValid =
    Number.isFinite(parsedPrice) &&
    parsedPrice > 0 &&
    parsedPrice <= 1_000_000;

  const submitPrice = () => {
    if (!listing || !priceValid) return;
    priceAdjust.mutate(
      { listingId: listing.id, newPriceGbp: Math.round(parsedPrice * 100) / 100 },
      {
        onSuccess: (result) => {
          setPriceOpen(false);
          setPriceDraft('');
          show(`Price updated — ${formatPrice(result.newPriceGbp)}`, 'success');
        },
        onError: (err) =>
          show(
            err instanceof ApiRequestError &&
              isRecord(err.details) &&
              typeof err.details.error === 'string'
              ? err.details.error
              : err instanceof Error && err.message
                ? err.message
                : 'Could not update the price — try again',
            'error',
          ),
      },
    );
  };

  const likerCount = listing?.likes ?? 0;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-16 pt-8 sm:px-6 md:pt-12 lg:max-w-[1440px]">
      <div className="flex items-center gap-3">
        <Link
          href="/seller-hub/listings"
          aria-label="Back to listings"
          className="pressable inline-flex h-11 w-11 items-center justify-center rounded-md text-text-primary hover:bg-surface-alt"
        >
          <Icon name="back" size={20} />
        </Link>
        <h1 className="text-screen-title text-text-primary">Manage listing</h1>
      </div>
      <SellerSectionNav toPost={counts.toPost} posted={counts.posted} />

      {isLoading ? (
        <div className="mt-6" aria-busy aria-label="Loading listing">
          <div className="flex gap-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-40 w-32 shrink-0 rounded-md" />
            ))}
          </div>
          <Skeleton className="mt-4 h-5 w-64" />
          <Skeleton className="mt-2 h-4 w-40" />
        </div>
      ) : isError ? (
        <EmptyState
          icon="alert"
          title="Couldn't load this listing"
          subtitle="Check your connection and try again."
          actionLabel="Retry"
          onAction={() => void refetch()}
        />
      ) : !listing ? (
        <EmptyState
          icon="inventory"
          title="Listing not found"
          subtitle="It may have sold, been deleted, or belongs to another account."
          actionLabel="Back to listings"
          onAction={() => router.replace('/seller-hub/listings')}
        />
      ) : (
        <div className="lg:mt-6 lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-12">
          <div>
            <ListingManageMediaRail listing={listing} status={status} />
            <ListingManageIdentity listing={listing} status={status} />
            <ListingManageActivityMetrics listing={listing} stats={stats.data} />
          </div>

          <ListingManageActionMenu
            listing={listing}
            status={status}
            likerCount={likerCount}
            lastOfferCreatedAt={lastOffer.data?.createdAt}
            onShare={() => void share()}
            onOpenStats={() => setStatsOpen(true)}
            onOpenOffer={() => setOfferOpen(true)}
            onOpenPromote={() => setPromoteOpen(true)}
            onOpenPrice={() => {
              setPriceDraft(listing.price > 0 ? listing.price.toFixed(2) : '');
              setPriceOpen(true);
            }}
            onSelectAction={setPending}
          />
        </div>
      )}

      <ListingManageSheets
        listing={listing}
        statsOpen={statsOpen}
        offerOpen={offerOpen}
        promoteOpen={promoteOpen}
        priceOpen={priceOpen}
        priceDraft={priceDraft}
        priceValid={priceValid}
        isPricePending={priceAdjust.isPending}
        pending={pending}
        isActionPending={batch.isPending || statusPatch.isPending}
        likerCount={likerCount}
        onCloseStats={() => setStatsOpen(false)}
        onCloseOffer={() => setOfferOpen(false)}
        onClosePromote={() => setPromoteOpen(false)}
        onClosePrice={() => setPriceOpen(false)}
        onPriceDraftChange={setPriceDraft}
        onSubmitPrice={submitPrice}
        onClosePending={() => setPending(null)}
        onConfirmAction={act}
      />
    </div>
  );
}
