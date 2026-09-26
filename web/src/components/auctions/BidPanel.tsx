'use client';

/**
 * BidPanel — the auction transaction surface. Lifecycle badge + ticking
 * clock, price lockup, and the auth-gated composer: "Next bid £X or more"
 * carries the real 5% increment, the ladder shows the next three valid
 * bids as quick chips, and every placement confirms through a sheet that
 * states the exact amount before it commits (the contract defines no
 * buyer premium, so none is invented). Outbid viewers get a banner with a
 * one-tap re-bid at the next increment. Ended auctions resolve to one
 * honest result state.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ANTI_SNIPING_EXTENSION_MS,
  ANTI_SNIPING_WINDOW_MS,
  BID_INCREMENT_RATE,
  type AuctionViewModel,
} from '@/lib/contracts/auction';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { useToast } from '@/components/ui/Toast';
import { AppImage } from '@/components/ui/AppImage';
import { Icon } from '@/components/ui/Icon';
import { AuctionCountdownClock } from '@/components/auctions/AuctionCountdown';
import { maskBidder } from '@/components/auctions/BidHistory';
import { usePlaceBid } from '@/lib/hooks/auction-queries';
import { useSession } from '@/lib/session/SessionProvider';
import { useSignupWall } from '@/components/auth/SignupWall';
import { minNextBid } from '@/lib/data/fixtures-auctions';
import { formatPrice } from '@/lib/utils/format';

const LIFECYCLE_BADGE = {
  live: { variant: 'danger', label: 'Live' },
  upcoming: { variant: 'warning', label: 'Upcoming' },
  ended: { variant: 'neutral', label: 'Ended' },
} as const;

const INCREMENT_PCT = Math.round(BID_INCREMENT_RATE * 100);

/** Next valid bid after an amount — the ladder's step function. */
const stepFrom = (amount: number) => Math.ceil(amount * (1 + BID_INCREMENT_RATE));

interface BidPanelProps {
  auction: AuctionViewModel;
  /** The underlying listing still exists — buy-now can route to checkout. */
  hasListing: boolean;
  /** Viewer's highest bid, when they have one (drives ended-state copy). */
  viewerMaxBid?: number;
  /** Username of the current top bid (surfaced when the auction ends). */
  topBidderName?: string | null;
}

export function BidPanel({ auction, hasListing, viewerMaxBid, topBidderName }: BidPanelProps) {
  const { show } = useToast();
  const { isGuest } = useSession();
  const { requireAuth, wall } = useSignupWall();
  const placeBid = usePlaceBid(auction.id);
  const [input, setInput] = useState('');
  const [confirming, setConfirming] = useState<number | null>(null);

  const minimum = minNextBid(auction);
  const parsed = Number(input.replace(/[^0-9.]/g, ''));
  const inputEmpty = input.trim() === '';
  const parsedValid = !inputEmpty && Number.isFinite(parsed) && (parsed ?? 0) >= minimum;
  const ended = auction.lifecycle === 'ended';
  const pending = placeBid.isPending;

  // The quiet ladder — the next three honest increments from the contract
  // rate, not arbitrary steps.
  const ladder = useMemo(() => {
    const steps: number[] = [];
    let next = minimum;
    for (let i = 0; i < 3; i += 1) {
      steps.push(next);
      next = stepFrom(next);
    }
    return steps;
  }, [minimum]);

  /** One gate before money moves: auth first, then the confirmation sheet. */
  const openConfirm = (amount: number) => {
    if (!requireAuth('place_bid')) return;
    setConfirming(amount);
  };

  const place = async (amount: number) => {
    // Anti-sniping mirror — the mutation applies the same predicate when it
    // commits; this decides which toast the viewer sees.
    const extended = Date.parse(auction.endsAt) - Date.now() < ANTI_SNIPING_WINDOW_MS;
    try {
      await placeBid.mutateAsync(amount);
      show(
        extended
          ? `Bid placed — ${formatPrice(amount)} · end extended 2m`
          : `Bid placed — ${formatPrice(amount)}`,
        'success',
      );
      setInput('');
      setConfirming(null);
    } catch {
      show('Bid could not be placed', 'error');
    }
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!parsedValid || parsed == null) return;
    openConfirm(parsed);
  };

  return (
    <div className="flex flex-col gap-5">
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

      {/* Anti-sniping — the rule is declared before the clock reaches it */}
      {auction.lifecycle === 'live' ? (
        <p className="-mt-3 text-caption text-text-muted">
          Bids in the last {Math.round(ANTI_SNIPING_WINDOW_MS / 60_000)} minutes extend
          the close by {Math.round(ANTI_SNIPING_EXTENSION_MS / 60_000)}m.
        </p>
      ) : null}

      {/* Price lockup — the single source of the number */}
      <div className="flex flex-col gap-1">
        <span className="text-meta font-medium uppercase tracking-wide text-text-muted">
          {ended
            ? auction.bidCount > 0
              ? 'Winning bid'
              : 'Unsold · starting bid'
            : 'Current bid'}
        </span>
        <span className="tnum text-price-hero font-bold text-text-primary">
          {formatPrice(ended && auction.bidCount === 0 ? auction.startingBid : auction.currentBid)}
        </span>
        <p className="tnum text-meta text-text-secondary">
          {auction.bidCount} {auction.bidCount === 1 ? 'bid' : 'bids'}
          {' · '}Starting {formatPrice(auction.startingBid)}
        </p>
      </div>

      {ended ? (
        <EndedState
          auction={auction}
          viewerMaxBid={viewerMaxBid}
          topBidderName={topBidderName}
        />
      ) : (
        <BidComposer
          auction={auction}
          minimum={minimum}
          ladder={ladder}
          isGuest={isGuest}
          pending={pending}
          outbid={
            auction.lifecycle === 'live' &&
            viewerMaxBid != null &&
            viewerMaxBid < auction.currentBid
          }
          input={input}
          onInput={setInput}
          onQuickBid={openConfirm}
          onSubmit={submit}
        />
      )}

      {/* Buy now — single-item checkout while the listing exists */}
      {auction.buyNowPrice != null && !ended ? (
        hasListing ? (
          <Link
            href={`/checkout?item=${auction.listingId}`}
            className="pressable flex h-11 items-center justify-center rounded-md border border-border text-body-emphasis font-semibold text-text-primary hover:border-text-muted"
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

      {/* Confirm before the hammer — the exact amount, the exact item. */}
      <Sheet
        open={confirming != null}
        onClose={() => setConfirming(null)}
        title="Confirm your bid"
        maxWidth={440}
      >
        <div className="flex flex-col gap-5 p-5">
          <div className="flex items-center gap-3">
            <span className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-surface-alt">
              <AppImage
                src={auction.image}
                alt={auction.title}
                fill
                sizes="56px"
                className="h-full w-full"
              />
            </span>
            <div className="min-w-0">
              <p className="clamp-1 text-body-emphasis font-medium text-text-primary">
                {auction.title}
              </p>
              <p className="tnum mt-0.5 text-caption text-text-secondary">
                Current bid {formatPrice(auction.currentBid)} · {auction.bidCount}{' '}
                {auction.bidCount === 1 ? 'bid' : 'bids'}
              </p>
            </div>
          </div>

          <div className="border-y border-border-subtle py-4">
            <p className="text-meta font-medium uppercase tracking-wide text-text-muted">
              Your bid
            </p>
            <p className="tnum mt-1 text-price-hero font-bold text-text-primary">
              {formatPrice(confirming ?? minimum)}
            </p>
          </div>

          <p className="text-caption text-text-secondary">
            {auction.lifecycle === 'live'
              ? Date.parse(auction.endsAt) - Date.now() < ANTI_SNIPING_WINDOW_MS
                ? `Inside the final ${Math.round(ANTI_SNIPING_WINDOW_MS / 60_000)} minutes — your bid extends the close by ${Math.round(ANTI_SNIPING_EXTENSION_MS / 60_000)}m.`
                : `You become the top bidder unless someone passes ${formatPrice(confirming ?? minimum)}.`
              : 'Bidding opens when the auction goes live.'}
          </p>

          <div className="flex flex-col gap-2">
            <Button
              size="lg"
              fullWidth
              disabled={pending}
              onClick={() => confirming != null && void place(confirming)}
            >
              {pending ? 'Placing bid…' : `Place bid · ${formatPrice(confirming ?? minimum)}`}
            </Button>
            <Button variant="quiet" size="md" fullWidth onClick={() => setConfirming(null)}>
              Keep editing
            </Button>
          </div>
        </div>
      </Sheet>

      {wall}
    </div>
  );
}

/** Composer — increment ladder, minimum validation, honest gating. */
function BidComposer({
  auction,
  minimum,
  ladder,
  isGuest,
  pending,
  outbid,
  input,
  onInput,
  onQuickBid,
  onSubmit,
}: {
  auction: AuctionViewModel;
  minimum: number;
  /** The next three valid bids at the real increment. */
  ladder: number[];
  isGuest: boolean;
  pending: boolean;
  /** Viewer's bid is on the ledger but no longer on top. */
  outbid: boolean;
  input: string;
  onInput: (value: string) => void;
  onQuickBid: (amount: number) => void;
  onSubmit: (event: React.FormEvent) => void;
}) {
  const upcoming = auction.lifecycle === 'upcoming';
  const parsed = Number(input.replace(/[^0-9.]/g, ''));
  const invalid = input.trim() !== '' && (!Number.isFinite(parsed) || parsed < minimum);
  const intent = !invalid && input.trim() !== '' && Number.isFinite(parsed) ? parsed : minimum;

  return (
    <div className="flex flex-col gap-2.5">
      {outbid ? (
        <div
          role="status"
          className="flex items-center gap-3 rounded-lg border border-danger-border bg-danger-subtle p-3"
        >
          <Icon name="alert" size={18} className="shrink-0 text-danger-text" />
          <div className="min-w-0 flex-1">
            <p className="text-caption font-semibold text-danger-text">You&apos;ve been outbid</p>
            <p className="tnum text-caption text-text-secondary">
              Top bid {formatPrice(auction.currentBid)}
            </p>
          </div>
          <button
            type="button"
            disabled={upcoming}
            onClick={() => onQuickBid(minimum)}
            className="pressable h-9 shrink-0 rounded-md bg-danger px-3 text-caption font-semibold text-scrim-text-primary disabled:opacity-50"
          >
            Re-bid {formatPrice(minimum)}
          </button>
        </div>
      ) : null}

      <p className="text-meta text-text-muted">
        Next bid{' '}
        <span className="tnum font-semibold text-text-primary">{formatPrice(minimum)}</span>{' '}
        or more · {INCREMENT_PCT}% increments
      </p>

      <form id="bid" onSubmit={onSubmit} className="flex scroll-mt-24 flex-col gap-2.5">
        <div className="relative">
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-body-large text-text-muted">
            £
          </span>
          <input
            value={input}
            onChange={(event) => onInput(event.target.value)}
            inputMode="decimal"
            placeholder={String(minimum)}
            aria-label="Your bid in pounds"
            aria-invalid={invalid}
            disabled={upcoming}
            className="h-12 w-full rounded-lg border border-border bg-input pl-9 pr-4 text-body-large tnum text-input-text outline-none placeholder:text-text-muted focus:border-text-muted disabled:opacity-50"
          />
        </div>

        {invalid ? (
          <p className="text-caption text-danger-text">
            Bid at least {formatPrice(minimum)} — the current bid plus {INCREMENT_PCT}%.
          </p>
        ) : null}

        <Button type="submit" size="lg" fullWidth disabled={upcoming || pending}>
          {isGuest
            ? 'Sign in to bid'
            : pending
              ? 'Placing bid…'
              : `Place bid · ${formatPrice(intent)}`}
        </Button>

        {upcoming ? (
          <p className="text-caption text-text-secondary">
            Bidding opens when the auction goes live.
          </p>
        ) : null}
      </form>

      {/* The ladder — the next three valid bids, one tap each to confirm. */}
      {!upcoming ? (
        <div>
          <p className="mb-2 text-label text-text-muted">Quick bid</p>
          <div className="flex gap-2">
            {ladder.map((amount, index) => (
              <button
                key={amount}
                type="button"
                disabled={upcoming || pending}
                onClick={() => onQuickBid(amount)}
                aria-label={`Bid ${formatPrice(amount)}`}
                className={`pressable h-9 flex-1 rounded-md text-caption font-semibold tnum ${
                  index === 0
                    ? 'bg-brand-subtle text-text-primary hover:bg-brand hover:text-text-inverse'
                    : 'bg-surface-alt text-text-primary hover:bg-surface-raised'
                } disabled:opacity-50`}
              >
                {formatPrice(amount)}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Ended — one result state, one next fact. The price lockup above already
 * carries the amount; this card carries the outcome narrative only. */
function EndedState({
  auction,
  viewerMaxBid,
  topBidderName,
}: {
  auction: AuctionViewModel;
  viewerMaxBid?: number;
  topBidderName?: string | null;
}) {
  const sold = auction.bidCount > 0;
  const viewerWon = viewerMaxBid != null && viewerMaxBid >= auction.currentBid;

  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-border-subtle bg-surface-alt p-4">
      <p className="text-body-emphasis text-text-primary">Auction ended</p>
      {sold && topBidderName ? (
        <p className="text-caption text-text-secondary">
          Winning bidder {maskBidder(topBidderName)}
        </p>
      ) : null}
      {!sold ? (
        <p className="text-caption text-text-secondary">
          Closed without qualifying bids — nothing sold.
        </p>
      ) : null}
      {sold && viewerMaxBid != null ? (
        <p
          className={`text-caption font-semibold ${
            viewerWon ? 'text-success-text' : 'text-text-secondary'
          }`}
        >
          {viewerWon
            ? 'You won this auction'
            : `Your highest bid ${formatPrice(viewerMaxBid)} — outbid`}
        </p>
      ) : null}
    </div>
  );
}
