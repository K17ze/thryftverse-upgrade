'use client';

/**
 * AuctionEndedState — terminal outcome view: sold, reserve not met, cancelled,
 * payment expired, or no bids, plus payment settlement flow for the winner.
 */

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import type { AuctionViewModel } from '@/lib/contracts/auction';
import type { Listing } from '@/lib/contracts/domain';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { useSession } from '@/lib/session/SessionProvider';
import { useSignupWall } from '@/components/auth/SignupWall';
import { DATA_MODE } from '@/lib/api/client';
import * as auctionsService from '@/lib/api/services/auctions';
import { maskBidder } from '@/components/auctions/BidHistory';
import { auctionOutcome, formatClock } from '@/lib/data/fixtures-auctions';
import { recordOrder } from '@/lib/data/fixtures-commerce';
import { checkoutTotals } from '@/lib/commerce/postage';
import { formatPrice } from '@/lib/utils/format';

interface AuctionEndedStateProps {
  auction: AuctionViewModel;
  listing: Listing | null;
  viewerMaxBid?: number;
  topBidderName?: string | null;
}

export function AuctionEndedState({
  auction,
  listing,
  viewerMaxBid,
  topBidderName,
}: AuctionEndedStateProps) {
  const router = useRouter();
  const { show } = useToast();
  const { user } = useSession();
  const { requireAuth, wall } = useSignupWall();
  const qc = useQueryClient();
  const [paying, setPaying] = useState(false);
  const [resolving, setResolving] = useState<'accept' | 'decline' | 'accept-highest' | null>(null);

  const payAttemptKeyRef = useRef<string | null>(null);
  const secondChanceKeyRef = useRef<string | null>(null);

  const outcome = auctionOutcome(auction);
  const sold = outcome === 'sold';
  const viewerWon =
    sold &&
    (auction.winnerBidderId != null
      ? auction.winnerBidderId === user?.id
      : viewerMaxBid != null && viewerMaxBid >= auction.currentBid);
  const viewerBid = viewerMaxBid != null;
  const viewerWasTop = viewerBid && viewerMaxBid >= auction.currentBid;
  const isSeller = user != null && auction.sellerId === user.id;
  const secondChanced =
    user != null &&
    auction.secondChanceOfferedTo != null &&
    auction.secondChanceOfferedTo === user.id;

  const deadlineLeftMs =
    auction.paymentDeadlineAt != null
      ? Date.parse(auction.paymentDeadlineAt) - Date.now()
      : null;
  const awaitingPayment =
    auction.serverLifecycle === 'awaiting_payment' ||
    auction.serverLifecycle === 'second_chance_offered';
  const paymentOpen = awaitingPayment || auction.serverLifecycle === 'payment_expired';
  const paidOut =
    auction.serverLifecycle === 'settled' ||
    auction.terminalReason === 'settled' ||
    auction.terminalReason === 'buy_now';

  const canCheckout =
    viewerWon &&
    !paidOut &&
    (DATA_MODE === 'live' ? paymentOpen : listing != null);

  const hammerListing = listing
    ? { ...listing, price: auction.currentBid, priceWithProtection: undefined }
    : null;
  const payable = hammerListing ? checkoutTotals([hammerListing]) : null;

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['auction', auction.id] });
    void qc.invalidateQueries({ queryKey: ['auctions'] });
    void qc.invalidateQueries({ queryKey: ['auction-bids-all'] });
  };

  const answerSecondChance = async (accept: boolean) => {
    if (!requireAuth('purchase')) return;
    setResolving(accept ? 'accept' : 'decline');
    try {
      if (accept) {
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

  const settlePaymentResult = (res: auctionsService.AuctionPaymentResult) => {
    refresh();
    void qc.invalidateQueries({ queryKey: ['orders'] });
    if (res.paymentStatus === 'paid') {
      payAttemptKeyRef.current = null;
      show('Payment confirmed', 'success');
      if (res.orderId) router.push(`/orders/${res.orderId}`);
      return;
    }
    if (res.paymentStatus === 'failed') {
      payAttemptKeyRef.current = null;
      show(res.intent?.failureMessage ?? 'Payment failed — you can try again.', 'error');
      return;
    }
    if (res.paymentStatus === 'unpaid') {
      show('Payment didn’t start — try again.', 'info');
      return;
    }
    if (res.orderId) {
      show('Payment is still processing — the order page updates when it clears.', 'info');
      router.push(`/orders/${res.orderId}`);
    } else {
      show('Payment is still processing — we will update when it lands.', 'info');
    }
  };

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
      if (!hammerListing) throw new Error('Listing unavailable');
      const orders = recordOrder([hammerListing]);
      void qc.invalidateQueries({ queryKey: ['orders'] });
      void qc.invalidateQueries({ queryKey: ['listing', auction.listingId] });
      // recordOrder can return an empty batch — never push a bare
      // '/orders/' detail route; the index is the honest fallback.
      const orderId = orders[0]?.id;
      router.push(orderId ? `/orders/${orderId}` : '/orders');
    } catch (e) {
      show(
        e instanceof Error && e.message ? e.message : 'Could not complete the payment — try again',
        'error',
      );
    } finally {
      setPaying(false);
    }
  };

  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-border-subtle bg-surface-alt p-4">
      <p className="text-body-emphasis font-semibold text-text-primary">
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
              ? 'Your win lapsed — payment wasn’t completed in time.'
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
