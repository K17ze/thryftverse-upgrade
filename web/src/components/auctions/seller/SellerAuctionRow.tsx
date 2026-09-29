'use client';

/**
 * SellerAuctionRow — port of mobile SellerAuctionRow: an inventory row in
 * the operations-studio grammar. 96px media (live dot when a window is
 * open), identity + state label, a hairline, then the operational block:
 * prefixed price on the left, the one truthful action on the right, and a
 * leading line (time or outcome) with the bid count. Whole row deep-links
 * to /auctions/[id]; lifecycle writes the row qualifies for (cancel a
 * running auction, accept a below-reserve hammer) sit in a confirm strip
 * below the link — the destructive verbs arm inline, never window.confirm.
 */

import { useState } from 'react';
import Link from 'next/link';
import { AppImage } from '@/components/ui/AppImage';
import { Icon } from '@/components/ui/Icon';
import type { AuctionViewModel } from '@/lib/contracts/auction';
import { useListingIds } from '@/lib/hooks/listing-resolution';
import {
  useAcceptHighestBid,
  useCancelAuction,
} from '@/lib/hooks/auction-queries';
import { MY_LISTING_STATS, listingById } from '@/lib/data/fixtures';
import { DATA_MODE } from '@/lib/api/client';
import { formatPrice } from '@/lib/utils/format';
import {
  resolveSellerRowPresentation,
  sellerLifecycleActions,
  sellerPrice,
  type SellerLifecycleAction,
  type SellerRowTone,
} from './sellerAuctionModel';

const TONE_CLASS: Record<SellerRowTone, string> = {
  danger: 'text-danger-text',
  success: 'text-success-text',
  primary: 'text-text-primary',
  secondary: 'text-text-secondary',
  muted: 'text-text-muted',
};

/** The quiet text-action grammar shared by the idle and confirming
 *  states — same voice as the bag row's inline confirms. */
function TextAction({
  onClick,
  tone = 'default',
  disabled = false,
  children,
}: {
  onClick: () => void;
  tone?: 'default' | 'danger';
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`pressable -my-1.5 rounded-sm py-2 text-caption font-medium disabled:opacity-50 ${
        tone === 'danger'
          ? 'text-danger-text hover:text-danger-text'
          : 'text-text-muted hover:text-text-primary'
      }`}
    >
      {children}
    </button>
  );
}

/**
 * The row's lifecycle strip — idle shows the verbs the server would
 * honour right now; armed swaps to a one-line confirm; the mutation's
 * verbatim server error stays in place until the next attempt. Accept is
 * live-mode only: a fixture accept would mint a sale with no order
 * behind it, so the demo never offers the button.
 */
function SellerRowActions({ auction }: { auction: AuctionViewModel }) {
  const actions = sellerLifecycleActions(auction).filter(
    (action) => action !== 'accept_highest_bid' || DATA_MODE === 'live',
  );
  const [confirming, setConfirming] = useState<SellerLifecycleAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cancel = useCancelAuction(auction.id);
  const acceptHighest = useAcceptHighestBid(auction.id);
  const pending = cancel.isPending || acceptHighest.isPending;

  const commit = (action: SellerLifecycleAction) => {
    setError(null);
    const options = {
      onSuccess: () => setConfirming(null),
      onError: (e: unknown) =>
        setError(
          e instanceof Error && e.message
            ? e.message
            : 'The auction could not be updated — try again.',
        ),
    };
    if (action === 'cancel') cancel.mutate({}, options);
    else acceptHighest.mutate(undefined, options);
  };

  if (actions.length === 0) return null;

  return (
    <div className="pb-3 pl-28">
      {confirming == null ? (
        <div className="flex items-center justify-end gap-4">
          {actions.includes('accept_highest_bid') ? (
            <TextAction onClick={() => setConfirming('accept_highest_bid')}>
              Accept {formatPrice(auction.currentBid)}
            </TextAction>
          ) : null}
          {actions.includes('cancel') ? (
            <TextAction tone="danger" onClick={() => setConfirming('cancel')}>
              Cancel auction
            </TextAction>
          ) : null}
        </div>
      ) : confirming === 'cancel' ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-caption text-text-secondary">
            Cancel this auction
            {auction.bidCount > 0 ? ' — every bidder is notified' : ''}? This
            can&rsquo;t be undone.
          </span>
          <span className="flex shrink-0 items-center gap-4">
            <TextAction
              tone="danger"
              disabled={pending}
              onClick={() => commit('cancel')}
            >
              {pending ? 'Cancelling…' : 'Cancel auction'}
            </TextAction>
            <TextAction disabled={pending} onClick={() => setConfirming(null)}>
              Keep
            </TextAction>
          </span>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="tnum text-caption text-text-secondary">
            Sell to the top bidder for {formatPrice(auction.currentBid)}? They
            get 72h to pay.
          </span>
          <span className="flex shrink-0 items-center gap-4">
            <TextAction disabled={pending} onClick={() => commit('accept_highest_bid')}>
              {pending ? 'Accepting…' : 'Accept bid'}
            </TextAction>
            <TextAction disabled={pending} onClick={() => setConfirming(null)}>
              Keep
            </TextAction>
          </span>
        </div>
      )}
      {error != null ? (
        <p className="mt-1.5 text-caption text-danger-text" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function SellerAuctionRow({ auction }: { auction: AuctionViewModel }) {
  const presentation = resolveSellerRowPresentation(auction);
  const price = sellerPrice(auction);
  // Brand: fixture ids read the catalogue; live ids resolve through the
  // shared listing resolver (a fixture miss would blank the cell, and a
  // live-id collision would print the wrong brand).
  const { byId: resolvedListings } = useListingIds([auction.listingId]);
  const brand =
    DATA_MODE === 'live'
      ? resolvedListings.get(auction.listingId)?.brand
      : listingById(auction.listingId)?.brand;
  // Watchers — the seller's listing-level engagement stat, keyed by
  // listing id (fixture truth; the live wire carries no per-auction
  // watcher count, so it stays off rather than fabricated). Sold rows
  // keep the ledger clean — a closed sale's watchers changed nothing.
  const watchers =
    DATA_MODE === 'live'
      ? 0
      : (MY_LISTING_STATS[auction.listingId]?.watchers ?? 0);
  const meta: string[] = [];
  if (auction.bidCount > 0 && presentation.stateLabel !== 'Sold') {
    meta.push(`${auction.bidCount} ${auction.bidCount === 1 ? 'bid' : 'bids'}`);
  }
  if (watchers > 0 && presentation.stateLabel !== 'Sold') {
    meta.push(`${watchers} watching`);
  }

  return (
    <li>
      <Link
        href={`/auctions/${auction.id}`}
        className="pressable flex items-start gap-4 py-3"
        aria-label={`${auction.title}, ${presentation.stateLabel}`}
      >
        {/* Media — 96px, controlled radius, live dot while the window is open */}
        <span className="relative h-24 w-24 shrink-0 overflow-hidden rounded-md bg-surface-alt">
          {auction.image ? (
            <AppImage
              src={auction.image}
              alt={auction.title}
              fill
              sizes="96px"
              className="h-full w-full"
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-text-muted">
              <Icon name="image" size={22} />
            </span>
          )}
          {presentation.showLiveDot ? (
            <span
              className="absolute left-1.5 top-1.5 h-2 w-2 rounded-full border-2 border-background bg-danger"
              aria-hidden="true"
            />
          ) : null}
        </span>

        {/* Body — identity pinned top, operational block pinned to media bottom */}
        <span className="flex min-h-24 min-w-0 flex-1 flex-col">
          <span className="flex items-start justify-between gap-3">
            <span className="clamp-2 text-body-emphasis font-medium text-text-primary">
              {auction.title}
            </span>
            <span className={`pt-0.5 text-label ${TONE_CLASS[presentation.stateTone]}`}>
              {presentation.stateLabel}
            </span>
          </span>
          {brand ? (
            <span className="clamp-1 mt-0.5 block text-meta text-text-muted">{brand}</span>
          ) : null}

          <span className="mt-auto block">
            <span className="my-2.5 block h-px bg-border-subtle" aria-hidden="true" />
            <span className="flex items-end justify-between gap-3">
              <span className="tnum text-price-list font-semibold text-text-primary">
                {price.prefix ? (
                  <span className="text-meta font-medium text-text-secondary">{price.prefix}</span>
                ) : null}
                {formatPrice(price.amount)}
              </span>
              <span className="inline-flex items-center gap-1 pb-0.5 text-meta text-text-secondary">
                {presentation.actionLabel}
                <Icon name="forward" size={13} className="text-text-muted" />
              </span>
            </span>
            <span className="mt-1.5 flex items-center justify-between gap-3">
              <span className={`tnum clamp-1 text-meta ${TONE_CLASS[presentation.leadingTone]}`}>
                {presentation.leadingLabel}
              </span>
              {meta.length > 0 ? (
                <span className="tnum shrink-0 text-meta text-text-muted">
                  {meta.join(' · ')}
                </span>
              ) : null}
            </span>
          </span>
        </span>
      </Link>
      <SellerRowActions auction={auction} />
    </li>
  );
}
