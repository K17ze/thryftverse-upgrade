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
import type { CommerceOrder, Listing } from '@/lib/contracts/domain';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { useToast } from '@/components/ui/Toast';
import { AppImage } from '@/components/ui/AppImage';
import { Icon } from '@/components/ui/Icon';
import { AuctionCountdownClock } from '@/components/auctions/AuctionCountdown';
import { maskBidder } from '@/components/auctions/BidHistory';
import { useAuctionWatchlist } from '@/components/auctions/auctionWatchlist';
import { usePlaceBid, viewerProxyMax } from '@/lib/hooks/auction-queries';
import { useSession } from '@/lib/session/SessionProvider';
import { useSignupWall } from '@/components/auth/SignupWall';
import { useHydrated } from '@/lib/store/useStore';
import { DATA_MODE } from '@/lib/api/client';
import * as auctionsService from '@/lib/api/services/auctions';
import {
  auctionOutcome,
  formatClock,
  minNextBid,
} from '@/lib/data/fixtures-auctions';
import { recordOrder } from '@/lib/data/fixtures-commerce';
import { checkoutTotals } from '@/lib/commerce/postage';
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
  /** The listing under the hammer — won auctions check out against it. */
  listing: Listing | null;
  /** The underlying listing still exists — buy-now can route to checkout. */
  hasListing: boolean;
  /** Viewer's highest bid, when they have one (drives ended-state copy). */
  viewerMaxBid?: number;
  /** Username of the current top bid (surfaced when the auction ends). */
  topBidderName?: string | null;
}

export function BidPanel({ auction, listing, hasListing, viewerMaxBid, topBidderName }: BidPanelProps) {
  const { show } = useToast();
  const { isGuest, user } = useSession();
  const { requireAuth, wall } = useSignupWall();
  const placeBid = usePlaceBid(auction.id);
  const router = useRouter();
  const qc = useQueryClient();
  const [input, setInput] = useState('');
  /** One idempotency key per confirmation — retries from this sheet reuse
   *  it so a lost response can never double-place the bid. */
  const [confirming, setConfirming] = useState<{
    amount: number;
    maxBid?: number;
    idempotencyKey: string;
  } | null>(null);
  /** Buy-now attempt — the key is minted per click-through and held
   *  across retries so the server dedupes (scoped `buy_now:` claim
   *  replays the original response). */
  const buyNowKeyRef = useRef<string | null>(null);
  const [buyingNow, setBuyingNow] = useState(false);

  const minimum = minNextBid(auction);
  const parsed = Number(input.replace(/[^0-9.]/g, ''));
  const inputEmpty = input.trim() === '';
  const parsedValid = !inputEmpty && Number.isFinite(parsed) && (parsed ?? 0) >= minimum;
  const ended = auction.lifecycle === 'ended';
  const pending = placeBid.isPending;
  // Seller-of-record never bids on their own lot — the composer is
  // replaced by an honest owner note rather than a disabled fake.
  const isSeller = user != null && auction.sellerId === user.id;
  // The viewer's proxy ceiling this session — set when they placed a bid
  // with "Set maximum bid" on. Session-scoped; labelled as their ceiling,
  // never implied to be a server-persisted agent in fixture mode.
  const proxyMax = viewerProxyMax(auction.id, user?.id);

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

  /** Live buy-now — the auction-paused listing can't go through
   *  /checkout?item= (POST /orders 409s non-active listings), so the
   *  dedicated route commits it: the server ends the auction, binds the
   *  win, and provisions the bound order, which we navigate to. Fixture
   *  mode keeps the plain checkout link (fixture listings stay active). */
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

  /** One gate before money moves: auth first, then the confirmation sheet. */
  const openConfirm = (amount: number, maxBid?: number) => {
    if (!requireAuth('place_bid')) return;
    setConfirming({ amount, maxBid, idempotencyKey: auctionsService.newBidAttemptKey() });
  };

  const place = async (confirmed: { amount: number; maxBid?: number; idempotencyKey: string }) => {
    const { amount, maxBid } = confirmed;
    // Anti-sniping mirror — the mutation applies the same predicate when it
    // commits; this decides which toast the viewer sees.
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
      // Surface the honest reason — server rejections (seller-of-record,
      // below minimum, closed auction) and fixture rejections carry a
      // message worth showing verbatim. An outcome-unknown error says so
      // explicitly and names My Bids — never a bare "failed".
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
            ? auctionOutcome(auction) === 'sold'
              ? 'Winning bid'
              : auction.bidCount > 0
                ? 'Highest bid'
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
        {/* Reserve state — the floor is never disclosed, only whether the
            hammer has reached it (eBay grammar). */}
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

      {ended ? (
        <EndedState
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

      {/* Watch — the watchlist is account-bound; guests hit the wall. */}
      {!ended && !isSeller ? <WatchToggle auctionId={auction.id} /> : null}

      {/* Buy now — single-item checkout while the listing exists; the
          seller can't buy their own lot either. */}
      {auction.buyNowPrice != null && !ended && !isSeller ? (
        DATA_MODE === 'live' ? (
          /* Live: the listing is auction-paused by design — /checkout
             would 409. The dedicated route ends the auction, binds the
             win, and provisions the order we navigate to. */
          <Button
            variant="secondary"
            size="md"
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
              {formatPrice(confirming?.amount ?? minimum)}
            </p>
            {confirming?.maxBid != null ? (
              <p className="tnum mt-2 text-caption text-text-secondary">
                Maximum bid{' '}
                <span className="font-semibold text-text-primary">
                  {formatPrice(confirming.maxBid)}
                </span>
              </p>
            ) : null}
          </div>

          <p className="text-caption text-text-secondary">
            {auction.lifecycle === 'live'
              ? Date.parse(auction.endsAt) - Date.now() < ANTI_SNIPING_WINDOW_MS
                ? `Inside the final ${Math.round(ANTI_SNIPING_WINDOW_MS / 60_000)} minutes — your bid extends the close by ${Math.round(ANTI_SNIPING_EXTENSION_MS / 60_000)}m.`
                : confirming?.maxBid != null
                  ? `We place ${formatPrice(confirming.amount)} now and bid the lowest amount needed to keep you in the lead — up to ${formatPrice(confirming.maxBid)}.`
                  : `You become the top bidder unless someone passes ${formatPrice(confirming?.amount ?? minimum)}.`
              : 'Bidding opens when the auction goes live.'}
          </p>

          {/* Binding-bid disclosure — the same block the native review
              stage shows (BidSheet commitment block): above the confirm
              button, never buried. A bid is an irreversible commitment. */}
          <ul className="flex flex-col gap-1.5">
            <li className="flex items-start gap-2 text-caption text-text-secondary">
              <Icon name="info" size={13} className="mt-0.5 shrink-0" />
              Bids are binding once accepted.
            </li>
            <li className="flex items-start gap-2 text-caption text-text-secondary">
              <Icon name="clock" size={13} className="mt-0.5 shrink-0" />
              If you win, payment is due promptly after the auction ends.
            </li>
            <li className="flex items-start gap-2 text-caption text-text-secondary">
              <Icon name="lock" size={13} className="mt-0.5 shrink-0" />
              You cannot cancel a bid after it is submitted.
            </li>
          </ul>

          <div className="flex flex-col gap-2">
            <Button
              size="lg"
              fullWidth
              disabled={pending}
              onClick={() => confirming != null && void place(confirming)}
            >
              {pending
                ? 'Placing bid…'
                : confirming?.maxBid != null
                  ? `Place proxy bid · ${formatPrice(confirming.amount)}`
                  : `Place bid · ${formatPrice(confirming?.amount ?? minimum)}`}
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

/** Composer — increment ladder, minimum validation, the optional proxy
 *  ceiling ("Set maximum bid" — mobile BidSheet grammar), honest gating. */
function BidComposer({
  auction,
  minimum,
  ladder,
  isGuest,
  pending,
  leading,
  outbid,
  proxyMax,
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
  /** Viewer's bid is the current top bid — the lead state. */
  leading: boolean;
  /** Viewer's bid is on the ledger but no longer on top. */
  outbid: boolean;
  /** The proxy ceiling the viewer set this session, if any. */
  proxyMax: number | null;
  input: string;
  onInput: (value: string) => void;
  onQuickBid: (amount: number) => void;
  onSubmit: (event: React.FormEvent, maxBid?: number) => void;
}) {
  const upcoming = auction.lifecycle === 'upcoming';
  const [maxBidOn, setMaxBidOn] = useState(false);
  const [maxBidInput, setMaxBidInput] = useState('');
  const parsed = Number(input.replace(/[^0-9.]/g, ''));
  const invalid = input.trim() !== '' && (!Number.isFinite(parsed) || parsed < minimum);
  const intent = !invalid && input.trim() !== '' && Number.isFinite(parsed) ? parsed : minimum;

  // Proxy ceiling — optional: an empty field is simply "no ceiling", not
  // an error. When set it must sit above the bid being placed (a ceiling
  // at or under the bid is just the bid).
  const maxParsed = Number(maxBidInput.replace(/[^0-9.]/g, ''));
  const maxEmpty = maxBidInput.trim() === '';
  const maxInvalid =
    maxBidOn &&
    !maxEmpty &&
    (!Number.isFinite(maxParsed) || maxParsed <= (intent || minimum));
  const maxBid = maxBidOn && !maxEmpty && !maxInvalid ? maxParsed : undefined;

  return (
    <div className="flex flex-col gap-2.5">
      {leading ? (
        <div
          role="status"
          className="flex items-center gap-3 rounded-lg border border-border-subtle bg-success-subtle p-3"
        >
          <Icon name="check" size={18} className="shrink-0 text-success-text" />
          <div className="min-w-0 flex-1">
            <p className="text-caption font-semibold text-success-text">You&apos;re leading</p>
            <p className="tnum text-caption text-text-secondary">
              Top bid {formatPrice(auction.currentBid)}
              {proxyMax != null ? ` · Automatic bidding to ${formatPrice(proxyMax)}` : ''}
            </p>
          </div>
        </div>
      ) : null}

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

      <form
        id="bid"
        onSubmit={(event) => onSubmit(event, maxBid)}
        className="flex scroll-mt-24 flex-col gap-2.5"
      >
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

        {/* Proxy ceiling — mobile BidSheet grammar: an off-by-default
            switch that reveals the maximum-bid field. The visible bid is
            still the amount placed now; the max is the confidential cap
            the proxy bids up to.
            Live mode: the bids schema accepts only {amountGbp,
            idempotencyKey} — there is no server-side proxy, so the toggle
            renders disabled with honest copy rather than collecting a
            number that would be rejected (or worse, silently ignored). */}
        {DATA_MODE === 'live' ? (
          <div className="flex flex-col gap-1 self-start">
            <button
              type="button"
              role="switch"
              aria-checked={false}
              disabled
              className="flex h-10 items-center gap-2.5 text-caption font-medium text-text-muted opacity-60"
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-sm border border-border" />
              Set maximum bid
            </button>
            <p className="text-meta text-text-muted">
              Automatic maximum bidding isn&apos;t supported on web yet — your bid
              commits at the amount you enter.
            </p>
          </div>
        ) : (
          <>
            <button
              type="button"
              role="switch"
              aria-checked={maxBidOn}
              onClick={() => {
                setMaxBidOn((on) => !on);
                if (maxBidOn) setMaxBidInput('');
              }}
              disabled={upcoming}
              className="pressable flex h-10 items-center gap-2.5 self-start text-caption font-medium text-text-primary disabled:opacity-50"
            >
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-sm border ${
                  maxBidOn ? 'border-brand bg-brand text-text-inverse' : 'border-border'
                }`}
              >
                {maxBidOn ? <Icon name="check" size={13} /> : null}
              </span>
              Set maximum bid
              <span className="text-meta font-normal text-text-muted">optional</span>
            </button>
            {maxBidOn ? (
            <>
              <div className="relative">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-body-large text-text-muted">
                  £
                </span>
                <input
                  value={maxBidInput}
                  onChange={(event) => setMaxBidInput(event.target.value)}
                  inputMode="decimal"
                  placeholder={String(stepFrom(intent || minimum))}
                  aria-label="Maximum bid in pounds (optional)"
                  aria-invalid={maxInvalid}
                  disabled={upcoming}
                  className="h-12 w-full rounded-lg border border-border bg-input pl-9 pr-4 text-body-large tnum text-input-text outline-none placeholder:text-text-muted focus:border-text-muted disabled:opacity-50"
                />
              </div>
              {maxInvalid ? (
                <p className="text-caption text-danger-text" role="alert">
                  Your maximum must be above the bid you&apos;re placing.
                </p>
              ) : (
                <p className="text-meta text-text-muted">
                  We&apos;ll bid the lowest amount needed to keep you in the lead — up
                  to this maximum. Other bidders can&apos;t see it.
                </p>
              )}
            </>
            ) : null}
          </>
        )}

        <Button type="submit" size="lg" fullWidth disabled={upcoming || pending || maxInvalid}>
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

/** Seller-of-record on a running auction — the honest owner state that
 *  replaces the composer (sellers never bid on their own lot). */
function SellerNote() {
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-border-subtle bg-surface-alt p-4">
      <p className="text-body-emphasis text-text-primary">Your auction</p>
      <p className="text-caption text-text-secondary">
        You&apos;re the seller of record — you can&apos;t bid on your own lot. Track it
        from the seller board.
      </p>
      <Link
        href="/seller-hub/auctions"
        className="pressable mt-1 self-start text-caption font-semibold text-brand hover:underline"
      >
        Open seller board
      </Link>
    </div>
  );
}

/** Watch/unwatch — the persisted watchlist toggle. Quiet secondary row;
 *  set state reads as set (brand-subtle + filled bookmark). */
function WatchToggle({ auctionId }: { auctionId: string }) {
  const { show } = useToast();
  const { requireAuth, wall } = useSignupWall();
  const hydrated = useHydrated();
  const { watched, toggle } = useAuctionWatchlist();
  const isWatched = hydrated && watched.has(auctionId);

  return (
    <>
      <button
        type="button"
        aria-pressed={isWatched}
        onClick={() => {
          if (!requireAuth('save_item')) return;
          const on = toggle(auctionId);
          show(on ? 'Watching — you can find it in your watchlist' : 'Removed from watchlist', 'info');
        }}
        className={`pressable flex h-11 items-center justify-center gap-2 rounded-md border text-body-emphasis font-semibold ${
          isWatched
            ? 'border-border bg-brand-subtle text-text-primary'
            : 'border-border text-text-primary hover:border-text-muted'
        }`}
      >
        <Icon name="bookmark" size={18} filled={isWatched} />
        {isWatched ? 'Watching' : 'Watch this auction'}
      </button>
      {wall}
    </>
  );
}

/** Ended — one result state, one next fact. The price lockup above already
 * carries the amount; this card carries the outcome narrative — sold /
 * reserve not met / cancelled / payment expired / no bids — plus, for the
 * winner, the payment path into the commerce order flow with the real
 * deadline the server reports. */
function EndedState({
  auction,
  listing,
  viewerMaxBid,
  topBidderName,
}: {
  auction: AuctionViewModel;
  listing: Listing | null;
  viewerMaxBid?: number;
  topBidderName?: string | null;
}) {
  const router = useRouter();
  const { show } = useToast();
  const { user } = useSession();
  const { requireAuth, wall } = useSignupWall();
  const qc = useQueryClient();
  const [paying, setPaying] = useState(false);
  const [resolving, setResolving] = useState<'accept' | 'decline' | 'accept-highest' | null>(
    null,
  );
  /** One idempotency key per user-initiated pay attempt — minted once,
   *  held across retries (a retry replays the bound intent server-side)
   *  and cleared only when the attempt reaches a terminal state. Minting
   *  per click would stack dead attempts.
   *  (native parity: useAuctionDetail payIdempotencyKeyRef). */
  const payAttemptKeyRef = useRef<string | null>(null);
  /** Same rule for the second-chance accept write. */
  const secondChanceKeyRef = useRef<string | null>(null);
  const outcome = auctionOutcome(auction);
  const sold = outcome === 'sold';
  // Server-declared winner wins over the ledger derivation — ties and
  // post-settle adjustments resolve server-side.
  const viewerWon =
    sold &&
    (auction.winnerBidderId != null
      ? auction.winnerBidderId === user?.id
      : viewerMaxBid != null && viewerMaxBid >= auction.currentBid);
  /** The viewer actually bid on this run. */
  const viewerBid = viewerMaxBid != null;
  /** The viewer held the top bid — relevant even when the win lapsed
   *  (payment expired) or the reserve kept it from converting. */
  const viewerWasTop = viewerBid && viewerMaxBid >= auction.currentBid;
  // Seller-of-record reads their own outcome, not a bidder's.
  const isSeller = user != null && auction.sellerId === user.id;
  /** The server addressed a second-chance offer to this viewer. */
  const secondChanced =
    user != null &&
    auction.secondChanceOfferedTo != null &&
    auction.secondChanceOfferedTo === user.id;
  // Ticks on the panel's shared now-clock — the parent re-renders each
  // second while the detail query holds the 1s tick.
  const deadlineLeftMs =
    auction.paymentDeadlineAt != null
      ? Date.parse(auction.paymentDeadlineAt) - Date.now()
      : null;
  const awaitingPayment =
    auction.serverLifecycle === 'awaiting_payment' ||
    auction.serverLifecycle === 'second_chance_offered';
  /** Post-end states where the winner-pay route accepts a payment
   *  (routes/auctions.ts:902 — awaiting_payment or payment_expired;
   *  second_chance_offered is the offered flavour of payment_expired
   *  while the winner is still bound). */
  const paymentOpen =
    awaitingPayment || auction.serverLifecycle === 'payment_expired';
  /** The win already settled — the pay CTA must never resurface. */
  const paidOut =
    auction.serverLifecycle === 'settled' ||
    auction.terminalReason === 'settled' ||
    auction.terminalReason === 'buy_now';
  // The winner pays the hammer — the winning bid IS the capture total.
  // Live mode needs no listing row (the pay route provisions the order;
  // the listing is paused by design). Fixture mode still records against
  // the listing, so it keeps the listing gate.
  const canCheckout =
    viewerWon &&
    !paidOut &&
    (DATA_MODE === 'live' ? paymentOpen : listing != null);
  /**
   * The hammer-priced pseudo-listing the order records against. The
   * payable total the button shows is the same ledger recordOrder
   * writes: hammer + protection + postage — never the bare hammer price.
   */
  const hammerListing = listing
    ? { ...listing, price: auction.currentBid, priceWithProtection: undefined }
    : null;
  const payable = hammerListing ? checkoutTotals([hammerListing]) : null;

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['auction', auction.id] });
    void qc.invalidateQueries({ queryKey: ['auctions'] });
    void qc.invalidateQueries({ queryKey: ['auction-bids-all'] });
  };

  /** Second-chance offer — accept binds the win to this viewer; decline
   *  releases it. Live-mode only by construction: fixture auctions never
   *  carry secondChanceOfferedTo. */
  const answerSecondChance = async (accept: boolean) => {
    if (!requireAuth('purchase')) return;
    setResolving(accept ? 'accept' : 'decline');
    try {
      if (accept) {
        // One key per accept attempt — a retry replays the same accept
        // server-side instead of minting a fresh write. Cleared on
        // success only, so an errored retry still replays.
        secondChanceKeyRef.current ??= auctionsService.newSecondChanceAttemptKey(auction.id);
        await auctionsService.acceptSecondChance(auction.id, secondChanceKeyRef.current);
        show('Second chance accepted — complete your order', 'success');
        secondChanceKeyRef.current = null;
      } else {
        await auctionsService.declineSecondChance(auction.id);
        show('Second chance declined', 'info');
      }
      refresh();
    } catch (e) {
      show(
        e instanceof Error && e.message ? e.message : 'Could not update the offer',
        'error',
      );
    } finally {
      setResolving(null);
    }
  };

  /** Seller accepts the standing highest bid below reserve — the backend
   *  converts the run into a sale for the top bidder. Live mode only: a
   *  fixture accept would fabricate a sale with no order behind it. */
  const acceptHighest = async () => {
    setResolving('accept-highest');
    try {
      await auctionsService.acceptHighestBid(auction.id);
      show('Highest bid accepted — the buyer can now check out', 'success');
      refresh();
    } catch (e) {
      show(
        e instanceof Error && e.message ? e.message : 'Could not accept the bid',
        'error',
      );
    } finally {
      setResolving(null);
    }
  };

  /**
   * Settle an outcome honestly: refresh the auction surfaces, drop the
   * attempt key only on a terminal state, and route to the real order
   * when the server can name it. 'pending' never upgrades itself.
   */
  const settlePaymentResult = (outcome: auctionsService.AuctionPaymentResult) => {
    refresh();
    void qc.invalidateQueries({ queryKey: ['orders'] });
    if (outcome.paymentStatus === 'paid') {
      payAttemptKeyRef.current = null;
      show('Payment confirmed', 'success');
      if (outcome.orderId) router.push(`/orders/${outcome.orderId}`);
      return;
    }
    if (outcome.paymentStatus === 'failed') {
      // Terminal — a fresh attempt needs a fresh key.
      payAttemptKeyRef.current = null;
      show(outcome.intent?.failureMessage ?? 'Payment failed — you can try again.', 'error');
      return;
    }
    if (outcome.paymentStatus === 'unpaid') {
      // Nothing committed — safe to say so plainly; the key can stay.
      show('Payment didn’t start — try again.', 'info');
      return;
    }
    // pending — keep the key so the next tap replays the in-flight
    // attempt rather than minting a second provider payment.
    if (outcome.orderId) {
      show('Payment is still processing — the order page updates when it clears.', 'info');
      router.push(`/orders/${outcome.orderId}`);
    } else {
      show('Payment is still processing — we will update when it lands.', 'info');
    }
  };

  /**
   * Live winner-pay — POST /auctions/:id/payment (the canonical route the
   * native app uses). The backend provisions the commerce order and the
   * winner-bound payment intent itself; the listing stays paused by
   * design, so POST /orders is never the path. 'paid' is the only
   * success; 'pending' means a provider capture is in flight — surface
   * its next-action URL (3DS/SCA) in a new tab and poll the authoritative
   * auction payment-status, the read that also self-heals the settle.
   */
  const payWin = async () => {
    payAttemptKeyRef.current ??= auctionsService.newAuctionPayAttemptKey();
    const result = await auctionsService.payAuction(auction.id, {
      idempotencyKey: payAttemptKeyRef.current,
    });
    if (result.paymentStatus !== 'pending') {
      settlePaymentResult(result);
      return;
    }
    const openActionUrl = (url: string) => {
      window.open(url, '_blank', 'noopener,noreferrer');
      show(
        'Finish the bank check in the new tab — this page updates when payment clears.',
        'info',
      );
    };
    if (result.intent?.nextActionUrl) openActionUrl(result.intent.nextActionUrl);
    const settled = await auctionsService.waitForAuctionPayment(auction.id, {
      onNextActionUrl: openActionUrl,
    });
    settlePaymentResult(settled);
  };

  const checkout = async () => {
    if (!requireAuth('purchase')) return;
    if (!canCheckout || paying) return;
    setPaying(true);
    try {
      if (DATA_MODE === 'live') {
        await payWin();
        return;
      }
      // Fixture — record the order at the hammer price, not the listing's
      // shelf price; protection fee recomputes off the honest amount.
      if (!hammerListing) throw new Error('Listing unavailable');
      const orders = recordOrder([hammerListing]);
      qc.setQueryData<CommerceOrder[]>(['orders', 'commerce'], (old) =>
        old ? [...old, ...orders] : old,
      );
      void qc.invalidateQueries({ queryKey: ['orders'] });
      void qc.invalidateQueries({ queryKey: ['listing', auction.listingId] });
      router.push(`/orders/${orders[0]?.id ?? ''}`);
    } catch (e) {
      show(
        e instanceof Error && e.message
          ? e.message
          : 'Could not complete the payment — try again',
        'error',
      );
    } finally {
      setPaying(false);
    }
  };

  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-border-subtle bg-surface-alt p-4">
      <p className="text-body-emphasis text-text-primary">
        {outcome === 'cancelled'
          ? isSeller
            ? 'You cancelled this auction'
            : 'Auction cancelled'
          : outcome === 'reserve_not_met'
            ? 'Reserve not met'
            : outcome === 'payment_expired'
              ? 'Payment window closed'
              : isSeller
                ? 'Your auction ended'
                : 'Auction ended'}
      </p>

      {/* Outcome line — the honest reason this run closed the way it did */}
      {outcome === 'cancelled' ? (
        <p className="text-caption text-text-secondary">
          {viewerBid
            ? `Your bid of ${formatPrice(viewerMaxBid)} lapsed with the cancellation.`
            : 'The seller cancelled this auction — no bids stand.'}
        </p>
      ) : null}
      {outcome === 'reserve_not_met' ? (
        <p className="text-caption text-text-secondary">
          {isSeller
            ? `The highest bid (${formatPrice(auction.currentBid)}) didn't reach your reserve — accept it or relist.`
            : viewerBid
              ? `Your highest bid ${formatPrice(viewerMaxBid)} — the seller may still accept it.`
              : "The highest bid didn't meet the seller's reserve — nothing sold."}
        </p>
      ) : null}
      {outcome === 'payment_expired' ? (
        <p className="text-caption text-text-secondary">
          {isSeller
            ? 'The winning bid went unpaid — the payment window has closed.'
            : viewerWasTop
              ? 'Your win lapsed — payment wasn\u2019t completed in time.'
              : 'The winning bid went unpaid — the payment window closed.'}
        </p>
      ) : null}

      {sold && topBidderName ? (
        <p className="text-caption text-text-secondary">
          {isSeller ? 'Sold to' : 'Winning bidder'} {maskBidder(topBidderName)}
          {awaitingPayment && !viewerWon ? ' · awaiting payment' : ''}
        </p>
      ) : null}
      {outcome === 'no_bids' ? (
        <p className="text-caption text-text-secondary">
          {isSeller
            ? 'Closed without qualifying bids — your item is unsold.'
            : 'Closed without qualifying bids — nothing sold.'}
        </p>
      ) : null}
      {sold && viewerBid ? (
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

      {/* Payment deadline — the winner's ticking window, not just a
          label. Colour is never the only channel: the text carries it. */}
      {viewerWon && deadlineLeftMs != null && deadlineLeftMs > 0 ? (
        <p
          role="status"
          className={`tnum mt-1 flex items-center gap-1.5 text-caption font-semibold ${
            deadlineLeftMs < 60 * 60_000 ? 'text-danger-text' : 'text-warning-text'
          }`}
        >
          <Icon name="clock" size={13} />
          Pay within {formatClock(deadlineLeftMs)}
        </p>
      ) : null}

      {/* Second-chance offer — addressed to this viewer by the server. */}
      {secondChanced && (outcome === 'sold' || outcome === 'payment_expired') ? (
        <div className="mt-2 flex flex-col gap-2 border-t border-border-subtle pt-3">
          <p className="text-caption font-semibold text-warning-text">
            Second chance — the seller is offering you this item
            {viewerBid ? ` at your highest bid of ${formatPrice(viewerMaxBid)}` : ''}
          </p>
          <div className="flex gap-2">
            <Button
              variant="primary"
              size="md"
              className="flex-1"
              disabled={resolving != null}
              onClick={() => void answerSecondChance(true)}
            >
              {resolving === 'accept' ? 'Accepting…' : 'Accept offer'}
            </Button>
            <Button
              variant="secondary"
              size="md"
              className="flex-1"
              disabled={resolving != null}
              onClick={() => void answerSecondChance(false)}
            >
              {resolving === 'decline' ? 'Declining…' : 'Decline'}
            </Button>
          </div>
        </div>
      ) : null}

      {/* Seller's reserve release — live mode only (the endpoint settles
          a real sale; fixture mode can't honour it honestly). */}
      {isSeller && outcome === 'reserve_not_met' && DATA_MODE === 'live' ? (
        <div className="mt-2 flex flex-col gap-2 border-t border-border-subtle pt-3">
          <Button
            variant="primary"
            size="md"
            fullWidth
            disabled={resolving != null}
            onClick={() => void acceptHighest()}
          >
            {resolving === 'accept-highest'
              ? 'Accepting…'
              : `Accept highest bid · ${formatPrice(auction.currentBid)}`}
          </Button>
          <Link
            href="/auctions/create"
            className="pressable self-center text-caption font-semibold text-text-secondary hover:text-text-primary"
          >
            Relist instead
          </Link>
        </div>
      ) : null}

      {viewerWon ? (
        paidOut ? (
          <div className="mt-2 flex flex-col gap-1.5 border-t border-border-subtle pt-3">
            <p className="text-caption font-semibold text-success-text">
              Payment confirmed — your order is being prepared.
            </p>
            <Link
              href="/orders"
              className="pressable self-start text-caption font-semibold text-brand hover:underline"
            >
              View your orders
            </Link>
          </div>
        ) : canCheckout ? (
          <>
            <Button
              variant="primary"
              size="md"
              fullWidth
              className="mt-2"
              disabled={paying}
              onClick={() => void checkout()}
            >
              {paying
                ? DATA_MODE === 'live'
                  ? 'Processing payment…'
                  : 'Creating order…'
                : `Pay ${formatPrice(
                    DATA_MODE === 'live' ? auction.currentBid : (payable?.total ?? auction.currentBid),
                  )}`}
            </Button>
            {/* The live capture is exactly the hammer — the platform fee
                is carved out of it server-side. The protection+postage
                breakdown is a fixture-order truth only. */}
            {DATA_MODE !== 'live' && payable ? (
              <p className="tnum text-meta text-text-secondary">
                {formatPrice(auction.currentBid)} winning bid +{' '}
                {formatPrice(payable.protectionFee)} protection
                {payable.shippingFee > 0 ? ` + ${formatPrice(payable.shippingFee)} postage` : ''}
              </p>
            ) : null}
          </>
        ) : DATA_MODE === 'live' ? (
          <p className="mt-1 text-caption text-text-muted">
            This win isn&apos;t payable right now — check your orders or contact support.
          </p>
        ) : (
          <p className="mt-1 text-caption text-text-muted">
            The listing behind this win is no longer active — the seller will be in touch.
          </p>
        )
      ) : null}
      {wall}
    </div>
  );
}
