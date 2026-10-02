'use client';

/**
 * BidPanel — the auction transaction surface orchestrator. Lifecycle badge
 * + ticking clock, price lockup, dual-format Buy now CTA, auth-gated
 * BidComposer, SellerNote, AuctionEndedState, and AuctionConfirmSheet.
 */

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import {
  ANTI_SNIPING_EXTENSION_MS,
  ANTI_SNIPING_WINDOW_MS,
  BID_INCREMENT_RATE,
  type AuctionViewModel,
} from '@/lib/contracts/auction';
import type { Listing } from '@/lib/contracts/domain';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { Icon } from '@/components/ui/Icon';
import { AuctionCountdownClock } from '@/components/auctions/AuctionCountdown';
import { AuctionWatchButton } from '@/components/auctions/AuctionWatchButton';
import { BidComposer } from '@/components/auctions/BidComposer';
import { AuctionConfirmSheet } from '@/components/auctions/AuctionConfirmSheet';
import { AuctionEndedState } from '@/components/auctions/AuctionEndedState';
import { SellerNote } from '@/components/auctions/SellerNote';
import { usePlaceBid, viewerProxyMax } from '@/lib/hooks/auction-queries';
import { useSession } from '@/lib/session/SessionProvider';
import { useSignupWall } from '@/components/auth/SignupWall';
import { DATA_MODE } from '@/lib/api/client';
import * as auctionsService from '@/lib/api/services/auctions';
import { auctionOutcome, minNextBid } from '@/lib/data/fixtures-auctions';
import { formatPrice } from '@/lib/utils/format';

const LIFECYCLE_BADGE = {
  live: { variant: 'danger', label: 'Live' },
  upcoming: { variant: 'warning', label: 'Upcoming' },
  ended: { variant: 'neutral', label: 'Ended' },
} as const;

const stepFrom = (amount: number) => Math.ceil(amount * (1 + BID_INCREMENT_RATE));

interface BidPanelProps {
  auction: AuctionViewModel;
  /** The listing under the hammer — won auctions check out against it. */
  listing: Listing | null;
  /** The underlying listing still exists — buy-now can route to checkout. */
  hasListing: boolean;
  /** Viewer's highest bid, when they have one (drives ended-state copy). */
  viewerMaxBid?: number;
  /** Username of the current top bid (surfaced when the auction ends). */
  topBidderName?: string | null;
}

export function BidPanel({
  auction,
  listing,
  hasListing,
  viewerMaxBid,
  topBidderName,
}: BidPanelProps) {
  const { show } = useToast();
  const { isGuest, user } = useSession();
  const { requireAuth, wall } = useSignupWall();
  const placeBid = usePlaceBid(auction.id);
  const router = useRouter();
  const qc = useQueryClient();
  const [input, setInput] = useState('');

  const [confirming, setConfirming] = useState<{
    amount: number;
    maxBid?: number;
    idempotencyKey: string;
  } | null>(null);

  const buyNowKeyRef = useRef<string | null>(null);
  const [buyingNow, setBuyingNow] = useState(false);

  const minimum = minNextBid(auction);
  const parsed = Number(input.replace(/[^0-9.]/g, ''));
  const inputEmpty = input.trim() === '';
  const parsedValid = !inputEmpty && Number.isFinite(parsed) && (parsed ?? 0) >= minimum;
  const ended = auction.lifecycle === 'ended';
  const pending = placeBid.isPending;

  const isSeller = user != null && auction.sellerId === user.id;
  const hasBuyNow = auction.buyNowPrice != null && !ended && !isSeller;
  const proxyMax = viewerProxyMax(auction.id, user?.id);

  const ladder = useMemo(() => {
    const steps: number[] = [];
    let next = minimum;
    for (let i = 0; i < 3; i += 1) {
      steps.push(next);
      next = stepFrom(next);
    }
    return steps;
  }, [minimum]);

  const buyNow = async () => {
    if (!requireAuth('purchase')) return;
    if (buyingNow || auction.buyNowPrice == null) return;
    buyNowKeyRef.current ??= auctionsService.newBuyNowAttemptKey();
    setBuyingNow(true);
    try {
      const result = await auctionsService.buyAuctionNow(auction.id, {
        idempotencyKey: buyNowKeyRef.current,
        expectedPriceGbp: auction.buyNowPrice,
      });
      if (!result.isBuyNow) throw new Error('The purchase was not confirmed — try again.');
      buyNowKeyRef.current = null;
      void qc.invalidateQueries({ queryKey: ['auction', auction.id] });
      void qc.invalidateQueries({ queryKey: ['auctions'] });
      void qc.invalidateQueries({ queryKey: ['orders'] });
      router.push(result.orderId ? `/orders/${result.orderId}` : '/orders');
    } catch (e) {
      show(
        e instanceof Error && e.message ? e.message : 'Could not complete the purchase — try again',
        'error',
      );
    } finally {
      setBuyingNow(false);
    }
  };

  const openConfirm = (amount: number, maxBid?: number) => {
    if (!requireAuth('place_bid')) return;
    setConfirming({ amount, maxBid, idempotencyKey: auctionsService.newBidAttemptKey() });
  };

  const place = async (confirmed: { amount: number; maxBid?: number; idempotencyKey: string }) => {
    const { amount, maxBid } = confirmed;
    const extended = Date.parse(auction.endsAt) - Date.now() < ANTI_SNIPING_WINDOW_MS;
    try {
      await placeBid.mutateAsync({
        amount,
        maxBid,
        idempotencyKey: confirmed.idempotencyKey,
      });
      show(
        extended
          ? `Bid placed — ${formatPrice(amount)} · end extended 2m`
          : maxBid != null
            ? `Bid placed — ${formatPrice(amount)} · automatic bidding to ${formatPrice(maxBid)}`
            : `Bid placed — ${formatPrice(amount)}`,
        'success',
      );
      setInput('');
      setConfirming(null);
    } catch (e) {
      const base = e instanceof Error && e.message ? e.message : 'Bid could not be placed';
      const min =
        e instanceof auctionsService.BidError && e.minimumNextBidGbp != null
          ? ` — the minimum is now ${formatPrice(e.minimumNextBidGbp)}`
          : '';
      show(`${base}${min}`, 'error');
    }
  };

  const submit = (event: React.FormEvent, maxBid?: number) => {
    event.preventDefault();
    if (!parsedValid || parsed == null) return;
    openConfirm(parsed, maxBid);
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Desktop Lot Identity Header */}
      <div className="hidden lg:flex lg:flex-col gap-1 pb-3 border-b border-border-subtle">
        <div className="flex items-center justify-between gap-2">
          <span className="text-meta font-semibold uppercase tracking-wider text-text-muted">
            {listing?.brand ? listing.brand : 'Curated Lot'} · Lot #{auction.id.slice(-4).toUpperCase()}
          </span>
          {listing?.condition ? (
            <span className="text-caption font-medium text-text-secondary bg-surface-alt px-2 py-0.5 rounded-full border border-border-subtle">
              {listing.condition}
            </span>
          ) : null}
        </div>
        <h2 className="text-body-emphasis font-bold text-text-primary clamp-2 leading-snug">
          {auction.title}
        </h2>
      </div>

      {/* Lifecycle + countdown */}
      <div className="flex items-center justify-between gap-3">
        <Badge variant={LIFECYCLE_BADGE[auction.lifecycle].variant}>
          {LIFECYCLE_BADGE[auction.lifecycle].label}
        </Badge>
        <AuctionCountdownClock
          ms={ended ? 0 : auction.lifecycle === 'live' ? auction.msToEnd : auction.msToStart}
          lifecycle={auction.lifecycle}
        />
      </div>

      {/* Anti-sniping window declaration */}
      {auction.lifecycle === 'live' ? (
        <p className="-mt-3 text-caption text-text-muted">
          Bids in the last {Math.round(ANTI_SNIPING_WINDOW_MS / 60_000)} minutes extend the close by{' '}
          {Math.round(ANTI_SNIPING_EXTENSION_MS / 60_000)}m.
        </p>
      ) : null}

      {/* Price lockup — the hero carries the live read on its own ("N
          bids · Starting £x" anchors it); the eyebrow returns only once
          ended, where it disambiguates the settled number. */}
      <div className="flex flex-col gap-1">
        {ended ? (
          <span className="text-meta font-semibold uppercase tracking-wide text-text-muted">
            {auctionOutcome(auction) === 'sold'
              ? 'Winning bid'
              : auction.bidCount > 0
                ? 'Highest bid'
                : 'Unsold · starting bid'}
          </span>
        ) : null}
        <span className="tnum text-price-hero font-bold text-text-primary">
          {formatPrice(ended && auction.bidCount === 0 ? auction.startingBid : auction.currentBid)}
        </span>
        <p className="tnum text-meta text-text-secondary">
          {auction.bidCount} {auction.bidCount === 1 ? 'bid' : 'bids'}
          {' · '}Starting {formatPrice(auction.startingBid)}
        </p>
        {auction.reservePrice != null && !ended ? (
          <p
            className={`text-meta font-semibold ${
              auction.currentBid >= auction.reservePrice
                ? 'text-success-text'
                : 'text-warning-text'
            }`}
          >
            {auction.currentBid >= auction.reservePrice ? 'Reserve met' : 'Reserve not met'}
          </p>
        ) : null}
      </div>

      {/* Buy now CTA if dual-format */}
      {hasBuyNow ? (
        DATA_MODE === 'live' ? (
          <Button
            size="lg"
            fullWidth
            disabled={buyingNow}
            aria-busy={buyingNow || undefined}
            onClick={() => void buyNow()}
          >
            {buyingNow ? 'Purchasing…' : `Buy now · ${formatPrice(auction.buyNowPrice)}`}
          </Button>
        ) : hasListing ? (
          <Link
            href={`/checkout?item=${auction.listingId}`}
            className="pressable flex h-12 items-center justify-center rounded-md bg-brand text-body-emphasis font-semibold text-text-inverse hover:bg-brand-pressed"
          >
            Buy now · {formatPrice(auction.buyNowPrice)}
          </Link>
        ) : (
          <div className="flex flex-col gap-1">
            <Button variant="secondary" size="md" fullWidth disabled>
              Buy now · {formatPrice(auction.buyNowPrice)}
            </Button>
            <p className="text-caption text-text-muted">
              Unavailable — the listing behind this auction is no longer active.
            </p>
          </div>
        )
      ) : null}

      {ended ? (
        <AuctionEndedState
          auction={auction}
          listing={listing}
          viewerMaxBid={viewerMaxBid}
          topBidderName={topBidderName}
        />
      ) : isSeller ? (
        <SellerNote />
      ) : (
        <BidComposer
          auction={auction}
          minimum={minimum}
          ladder={ladder}
          isGuest={isGuest}
          pending={pending}
          submitVariant={hasBuyNow ? 'secondary' : 'primary'}
          leading={
            auction.lifecycle === 'live' &&
            viewerMaxBid != null &&
            viewerMaxBid >= auction.currentBid
          }
          outbid={
            auction.lifecycle === 'live' &&
            viewerMaxBid != null &&
            viewerMaxBid < auction.currentBid
          }
          proxyMax={proxyMax}
          input={input}
          onInput={setInput}
          onQuickBid={(amount) => openConfirm(amount)}
          onSubmit={submit}
        />
      )}

      {/* Watchlist & trust guarantees */}
      {!ended && !isSeller ? (
        <div className="flex flex-col gap-2.5">
          <AuctionWatchButton auctionId={auction.id} variant="block" />
          <div className="flex items-center justify-center gap-1.5 text-caption text-text-muted">
            <Icon name="verified" size={13} className="text-commerce-trust shrink-0" />
            <span>Buyer Protection Guarantee · Funds released 48h post-delivery</span>
          </div>
        </div>
      ) : null}

      <AuctionConfirmSheet
        open={confirming != null}
        onClose={() => setConfirming(null)}
        auction={auction}
        confirming={confirming}
        minimum={minimum}
        pending={pending}
        onConfirm={(c) => void place(c)}
      />

      {wall}
    </div>
  );
}
