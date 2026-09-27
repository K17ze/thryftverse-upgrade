'use client';

/**
 * Auction board ledger rows — the flat, hairline-separated grammar mobile
 * uses outside the live grid. AuctionScheduleRow renders the upcoming
 * scope as a programme (date · time, title, opening bid); AuctionResultRow
 * renders the results scope as a settled ledger (outcome, bid count,
 * hammer price). Whole row navigates via a stretched link.
 */

import Link from 'next/link';
import type { AuctionViewModel, MyBidStatus } from '@/lib/contracts/auction';
import { AppImage } from '@/components/ui/AppImage';
import { Icon } from '@/components/ui/Icon';
import { formatScheduled } from '@/components/live/UpcomingRail';
import { auctionOutcome, type AuctionOutcome } from '@/lib/data/fixtures-auctions';
import { formatPrice } from '@/lib/utils/format';

/** Scheduled programme row — "Tue 12 Nov · 19:45", title, opening bid. */
export function AuctionScheduleRow({ auction }: { auction: AuctionViewModel }) {
  return (
    <li className="relative">
      <div className="flex items-center gap-3 py-3.5 sm:gap-4">
        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-md bg-surface-alt">
          <AppImage
            src={auction.image}
            alt={auction.title}
            fill
            sizes="64px"
            className="h-full w-full"
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="tnum text-label font-semibold uppercase tracking-wide text-text-secondary">
            {formatScheduled(auction.startsAt)}
          </p>
          <p className="clamp-1 mt-0.5 text-body-emphasis text-text-primary">
            {auction.title}
          </p>
          <p className="tnum mt-0.5 text-meta text-text-muted">
            Opening bid {formatPrice(auction.startingBid)}
          </p>
        </div>
        <Icon name="forward" size={16} className="shrink-0 text-text-muted" />
      </div>
      <Link
        href={`/auctions/${auction.id}`}
        className="absolute inset-0 z-[1]"
        aria-label={`${auction.title}, opens ${formatScheduled(auction.startsAt)}, starting bid ${formatPrice(auction.startingBid)}`}
      />
    </li>
  );
}

const RESULT_TONE: Record<string, string> = {
  won: 'text-success-text',
  lost: 'text-danger-text',
  sold: 'text-text-secondary',
  unsold: 'text-text-muted',
  cancelled: 'text-text-muted',
  reserve: 'text-warning-text',
};

const OUTCOME_LABEL: Record<AuctionOutcome, string> = {
  sold: 'Sold',
  reserve_not_met: 'Reserve not met',
  cancelled: 'Cancelled',
  payment_expired: 'Payment expired',
  no_bids: 'No bids',
};

/**
 * Settled ledger row — the outcome is the headline: Won / Lost for the
 * viewer's own record, then the truthful close for everyone else's —
 * Sold / Reserve not met / Cancelled / Payment expired / No bids. A
 * hammer price only exists when a sale actually happened; reserve-not-met
 * and cancelled runs quote their highest bid instead.
 */
export function AuctionResultRow({
  auction,
  viewerStatus,
}: {
  auction: AuctionViewModel;
  /** The viewer's relationship when they bid — won/lost override Sold. */
  viewerStatus?: MyBidStatus | null;
}) {
  const resolved = auctionOutcome(auction);
  const outcome =
    viewerStatus === 'won'
      ? { key: 'won', label: 'You won' }
      : viewerStatus === 'lost'
        ? { key: 'lost', label: resolved === 'sold' ? 'Outbid' : OUTCOME_LABEL[resolved ?? 'no_bids'] }
        : resolved != null
          ? {
              key:
                resolved === 'sold'
                  ? 'sold'
                  : resolved === 'reserve_not_met' || resolved === 'payment_expired'
                    ? 'reserve'
                    : resolved === 'cancelled'
                      ? 'cancelled'
                      : 'unsold',
              label: OUTCOME_LABEL[resolved],
            }
          : { key: 'unsold', label: 'No bids' };

  return (
    <li className="relative">
      <div className="flex items-center gap-3 py-3.5 sm:gap-4">
        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-md bg-surface-alt">
          <AppImage
            src={auction.image}
            alt={auction.title}
            fill
            sizes="64px"
            className="h-full w-full"
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="clamp-1 text-body-emphasis text-text-primary">{auction.title}</p>
          <p className={`mt-0.5 text-caption font-semibold ${RESULT_TONE[outcome.key]}`}>
            {outcome.label}
            {auction.bidCount > 0
              ? ` · ${auction.bidCount} ${auction.bidCount === 1 ? 'bid' : 'bids'}`
              : ''}
          </p>
          {auction.bidCount > 0 ? (
            <p className="tnum mt-0.5 text-meta text-text-muted">
              {resolved === 'sold' ? 'Hammer' : 'Highest bid'}{' '}
              {formatPrice(auction.currentBid)}
            </p>
          ) : null}
        </div>
        {viewerStatus === 'won' ? (
          <Link
            href={`/auctions/${auction.id}`}
            className="pressable relative z-[2] -mx-1 shrink-0 rounded px-2 py-1 text-caption font-semibold text-brand hover:bg-brand-subtle"
          >
            Complete order
          </Link>
        ) : (
          <Icon name="forward" size={16} className="shrink-0 text-text-muted" />
        )}
      </div>
      <Link
        href={`/auctions/${auction.id}`}
        className="absolute inset-0 z-[1]"
        aria-label={`${auction.title}, ${outcome.label}, ${
          auction.bidCount > 0
            ? `${resolved === 'sold' ? 'hammer' : 'highest bid'} ${formatPrice(auction.currentBid)}`
            : 'no bids'
        }`}
      />
    </li>
  );
}
