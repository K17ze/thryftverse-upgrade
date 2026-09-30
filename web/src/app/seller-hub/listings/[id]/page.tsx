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
import { AppImage } from '@/components/ui/AppImage';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { Sheet } from '@/components/ui/Sheet';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { SellerSectionNav } from '@/components/seller/SellerSectionNav';
import { ListingStatsSheet } from '@/components/seller/ListingStatsSheet';
import { OfferToLikersSheet } from '@/components/seller/OfferToLikersSheet';
import { PromoteListingSheet } from '@/components/seller/PromoteListingSheet';
import {
  listingStatusOf,
  type ManagedListingRow,
} from '@/components/seller/listingManagementModel';
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
import { formatCount, formatPrice, timeAgo } from '@/lib/utils/format';
import type { Listing } from '@/lib/contracts/domain';

type Pending =
  | { kind: 'pause' }
  | { kind: 'resume' }
  | { kind: 'mark-sold' }
  | { kind: 'relist' }
  | { kind: 'delete' };

/** A stats-sheet-compatible row shim — the sheet reads listing + status. */
function toRow(listing: Listing): ManagedListingRow {
  return {
    listing,
    status: listingStatusOf(listing),
    imported: false,
    views: listing.views ?? 0,
    likes: listing.likes,
    watchers: 0,
    effectiveCreatedAt: listing.createdAt ?? new Date().toISOString(),
  };
}

function MetricCell({
  label,
  value,
  href,
}: {
  label: string;
  value: string;
  /** Optional destination — rendered as a stretched link so the whole
   *  cell navigates without breaking the dl > div > dt/dd grammar a
   *  wrapping anchor would. */
  href?: string;
}) {
  return (
    <div
      className={`relative px-3 py-2.5 first:pl-0 ${
        href ? 'transition-colors hover:bg-surface-alt' : ''
      }`}
    >
      <dt className="text-meta text-text-muted">{label}</dt>
      <dd className="tnum mt-0.5 text-body-emphasis font-semibold text-text-primary">{value}</dd>
      {href ? (
        <Link
          href={href}
          aria-label={`View ${label.toLowerCase()} for this listing`}
          className="absolute inset-0"
        />
      ) : null}
    </div>
  );
}

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
  const [pending, setPending] = useState<Pending | null>(null);

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
      // AbortError = the share sheet was dismissed — not an error state.
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

  const confirmCopy: Record<Pending['kind'], { title: string; body: string; action: string }> = {
    pause: {
      title: 'Pause this listing?',
      body: 'It stays yours but buyers can’t see or buy it until you resume.',
      action: 'Pause listing',
    },
    resume: {
      title: 'Resume this listing?',
      body: 'It goes back on sale and shows in feeds again.',
      action: 'Resume',
    },
    'mark-sold': {
      title: 'Mark as sold?',
      body: 'It comes off the public shelf and shows as sold. You can relist it anytime.',
      action: 'Mark sold',
    },
    relist: {
      title: 'Relist this item?',
      body: 'It goes back on sale as an active listing.',
      action: 'Relist',
    },
    delete: {
      title: 'Delete this listing?',
      body: 'It will be removed permanently — likes, watchers and its listing history are lost. This can’t be undone.',
      action: 'Delete',
    },
  };

  const likerCount = listing?.likes ?? 0;

  /**
   * Dedicated repricing write — POST /sellers/:id/listings/:listingId/
   * price-adjust, NOT the generic listing patch: the route records a
   * durable price event, runs alert evaluation and search sync. Client
   * validation mirrors the schema bounds; every other rejection (same
   * price, unpriceable state) surfaces the server's message verbatim and
   * the listing only re-renders after confirmation.
   */
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
        <>
        {/* At lg the identity pane takes the lead column and the command
            verbs pin to a right rail — DOM order unchanged. */}
        <div className="lg:mt-6 lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-12">
        <div>
          {/* Media rail — real thumbs, first is the cover. */}
          {listing.images.length ? (
            <ul className="no-scrollbar mt-6 flex gap-2 overflow-x-auto pb-1 lg:mt-0" aria-label="Listing photos">
              {listing.images.map((uri, i) => (
                <li key={uri} className="relative h-36 w-28 shrink-0">
                  <AppImage
                    src={uri}
                    alt={`${listing.title} photo ${i + 1}`}
                    fill
                    sizes="112px"
                    className="rounded-md"
                  />
                  {status === 'sold' || status === 'paused' ? (
                    <span className="absolute inset-0 bg-overlay/30" />
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}

          {/* Identity — title, price, status. */}
          <div className="mt-4 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="clamp-2 text-section-title font-semibold text-text-primary">
                {listing.title}
              </h2>
              <p className="tnum mt-1 text-body text-text-secondary">
                {formatPrice(listing.price)}
                {listing.brand ? ` · ${listing.brand}` : ''}
                {listing.size ? ` · Size ${listing.size}` : ''}
              </p>
              {listing.createdAt ? (
                <p className="mt-1 text-meta text-text-muted">
                  Listed {timeAgo(listing.createdAt)}
                </p>
              ) : null}
            </div>
            <Badge
              variant={
                status === 'active' ? 'success' : status === 'draft' ? 'warning' : 'neutral'
              }
            >
              {status === 'active'
                ? 'Active'
                : status === 'paused'
                  ? 'Paused'
                  : status === 'draft'
                    ? 'Draft'
                    : 'Sold'}
            </Badge>
          </div>

          {/* Buyer activity — one flat strip, honest source per cell. */}
          <dl
            aria-label="Buyer activity"
            className="mt-5 grid grid-cols-4 divide-x divide-border-subtle border-y border-border-subtle"
          >
            <MetricCell
              label="Views"
              value={stats.data ? formatCount(stats.data.views) : '—'}
            />
            <MetricCell label="Likes" value={formatCount(listing.likes)} />
            <MetricCell
              label="Watching"
              value={stats.data ? formatCount(stats.data.watchers) : '—'}
            />
            <MetricCell
              label="Offers"
              value={stats.data ? formatCount(stats.data.offers) : '—'}
              // Deep link into the scoped offers view — mobile
              // ManageListing "View offers" parity.
              href={`/offers?listing=${listing.id}`}
            />
          </dl>
        </div>

        <div>
          {/* Primary cluster — share / preview / edit as quiet icon row. */}
          <div className="mt-4 flex items-center gap-1 lg:mt-0 lg:border-b lg:border-border-subtle lg:pb-4">
            <Button variant="secondary" size="sm" icon="share" onClick={() => void share()}>
              Share
            </Button>
            <Link
              href={`/item/${listing.id}`}
              className="pressable inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-caption font-medium text-text-primary hover:bg-brand-subtle"
            >
              <Icon name="eye" size={16} />
              Preview
            </Link>
            <Link
              href={`/sell?edit=${listing.id}`}
              className="pressable inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-caption font-medium text-text-primary hover:bg-brand-subtle"
            >
              <Icon name="edit" size={16} />
              Edit
            </Link>
          </div>

          {/* Action rows — hairline list, verbs are the affordance. */}
          <ul className="mt-5 divide-y divide-border-subtle border-y border-border-subtle">
            <li>
              <button
                type="button"
                onClick={() => setStatsOpen(true)}
                className="pressable flex w-full items-center justify-between gap-3 py-3.5 text-left"
              >
                <span className="flex items-center gap-3">
                  <Icon name="analytics" size={18} className="text-text-secondary" />
                  <span className="text-body text-text-primary">Listing analytics</span>
                </span>
                <Icon name="forward" size={16} className="text-text-muted" />
              </button>
            </li>
            {status === 'active' ? (
              <li>
                <button
                  type="button"
                  onClick={() => setOfferOpen(true)}
                  disabled={likerCount === 0}
                  className="pressable flex w-full items-center justify-between gap-3 py-3.5 text-left disabled:opacity-50"
                >
                  <span className="flex items-center gap-3">
                    <Icon name="offer" size={18} className="text-text-secondary" />
                    <span className="text-body text-text-primary">
                      Send an offer to likers
                      <span className="tnum block text-meta text-text-muted">
                        {likerCount > 0
                          ? `${likerCount} ${likerCount === 1 ? 'person has' : 'people have'} liked this`
                          : 'No likers yet'}
                        {lastOffer.data
                          ? ` · last sent ${timeAgo(lastOffer.data.createdAt)}`
                          : ''}
                      </span>
                    </span>
                  </span>
                  <Icon name="forward" size={16} className="text-text-muted" />
                </button>
              </li>
            ) : null}
            {status === 'active' ? (
              <li>
                <button
                  type="button"
                  onClick={() => setPromoteOpen(true)}
                  className="pressable flex w-full items-center justify-between gap-3 py-3.5 text-left"
                >
                  <span className="flex items-center gap-3">
                    <Icon name="zap" size={18} className="text-text-secondary" />
                    <span className="text-body text-text-primary">Promote this listing</span>
                  </span>
                  <Icon name="forward" size={16} className="text-text-muted" />
                </button>
              </li>
            ) : null}
            {/* Dedicated repricing — the price-adjust route records the
                price event, outbox and search sync a generic patch skips.
                Active/paused only; a sold listing's price is history. */}
            {status === 'active' || status === 'paused' ? (
              <li>
                <button
                  type="button"
                  onClick={() => {
                    setPriceDraft(listing.price > 0 ? listing.price.toFixed(2) : '');
                    setPriceOpen(true);
                  }}
                  className="pressable flex w-full items-center justify-between gap-3 py-3.5 text-left"
                >
                  <span className="flex items-center gap-3">
                    <Icon name="payout" size={18} className="text-text-secondary" />
                    <span className="text-body text-text-primary">Change price</span>
                  </span>
                  <Icon name="forward" size={16} className="text-text-muted" />
                </button>
              </li>
            ) : null}
          </ul>

          {/* Lifecycle — destructive verbs separated, each confirmed. */}
          <ul className="mt-5 divide-y divide-border-subtle border-y border-border-subtle">
            {status === 'active' ? (
              <>
                <li>
                  <button
                    type="button"
                    onClick={() => setPending({ kind: 'pause' })}
                    className="pressable flex w-full items-center gap-3 py-3.5 text-left text-body text-text-primary"
                  >
                    <Icon name="pause" size={18} className="text-text-secondary" />
                    Pause listing
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => setPending({ kind: 'mark-sold' })}
                    className="pressable flex w-full items-center gap-3 py-3.5 text-left text-body text-text-primary"
                  >
                    <Icon name="check" size={18} className="text-text-secondary" />
                    Mark as sold
                  </button>
                </li>
              </>
            ) : null}
            {status === 'paused' ? (
              <li>
                <button
                  type="button"
                  onClick={() => setPending({ kind: 'resume' })}
                  className="pressable flex w-full items-center gap-3 py-3.5 text-left text-body text-text-primary"
                >
                  <Icon name="play" size={18} className="text-text-secondary" />
                  Resume — back on sale
                </button>
              </li>
            ) : null}
            {status === 'sold' ? (
              <li>
                <button
                  type="button"
                  onClick={() => setPending({ kind: 'relist' })}
                  className="pressable flex w-full items-center gap-3 py-3.5 text-left text-body text-text-primary"
                >
                  <Icon name="refresh" size={18} className="text-text-secondary" />
                  Relist
                </button>
              </li>
            ) : null}
            {status !== 'sold' && status !== 'draft' ? (
              <li>
                <button
                  type="button"
                  onClick={() => setPending({ kind: 'delete' })}
                  className="pressable flex w-full items-center gap-3 py-3.5 text-left text-body text-danger-text"
                >
                  <Icon name="trash" size={18} />
                  Delete listing
                </button>
              </li>
            ) : null}
          </ul>
        </div>
        </div>
        </>
      )}

      <ListingStatsSheet
        row={listing && statsOpen ? toRow(listing) : null}
        onClose={() => setStatsOpen(false)}
      />
      <OfferToLikersSheet
        open={offerOpen}
        listing={listing}
        likerCount={likerCount}
        onClose={() => setOfferOpen(false)}
      />
      <PromoteListingSheet
        open={promoteOpen}
        listing={listing}
        onClose={() => setPromoteOpen(false)}
      />

      {/* Repricing — the dedicated price-adjust write. The new price only
          lands on the listing after the server confirms; rejections (same
          price, unpriceable state) surface the server's own message. */}
      <Sheet
        open={priceOpen}
        onClose={() => setPriceOpen(false)}
        title="Change price"
        ariaLabel="Change listing price"
        maxWidth={420}
      >
        <div className="px-5 pb-6">
          <p className="text-body text-text-secondary">
            Buyers with alerts on this listing are notified, and the new price
            applies to every open surface.
          </p>
          {listing ? (
            <p className="tnum mt-2 text-caption text-text-muted">
              Current price: {formatPrice(listing.price)}
            </p>
          ) : null}
          <label className="mt-4 block">
            <span className="text-label text-text-muted">New price</span>
            <span className="mt-1.5 flex items-center rounded-md border border-border bg-input px-3 py-2 focus-within:border-text-muted">
              <span className="text-body text-text-muted">£</span>
              <input
                value={priceDraft}
                onChange={(e) => setPriceDraft(e.target.value)}
                inputMode="decimal"
                autoComplete="off"
                aria-label="New price in pounds"
                placeholder="0.00"
                className="tnum ml-1.5 w-full bg-transparent text-body text-input-text placeholder:text-text-muted focus:outline-none"
              />
            </span>
          </label>
          <div className="mt-5 flex justify-end gap-2">
            <Button
              variant="quiet"
              size="md"
              onClick={() => setPriceOpen(false)}
              disabled={priceAdjust.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="md"
              onClick={submitPrice}
              disabled={!priceValid || priceAdjust.isPending}
              aria-busy={priceAdjust.isPending}
            >
              {priceAdjust.isPending ? 'Saving…' : 'Save price'}
            </Button>
          </div>
        </div>
      </Sheet>

      <Sheet
        open={pending != null}
        onClose={() => setPending(null)}
        title={pending ? confirmCopy[pending.kind].title : undefined}
        ariaLabel="Confirm listing action"
        maxWidth={420}
      >
        <div className="px-5 py-5">
          {pending ? (
            <>
              <p className="text-body text-text-secondary">{confirmCopy[pending.kind].body}</p>
              <div className="mt-6 flex justify-end gap-2">
                <Button variant="quiet" size="md" onClick={() => setPending(null)}>
                  Cancel
                </Button>
                <Button
                  variant={pending.kind === 'delete' ? 'danger' : 'primary'}
                  size="md"
                  onClick={act}
                  disabled={batch.isPending || statusPatch.isPending}
                  aria-busy={batch.isPending || statusPatch.isPending}
                >
                  {confirmCopy[pending.kind].action}
                </Button>
              </div>
            </>
          ) : null}
        </div>
      </Sheet>
    </div>
  );
}
