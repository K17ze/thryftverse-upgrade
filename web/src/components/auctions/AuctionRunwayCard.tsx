'use client';

/**
 * AuctionRunwayCard — the live scope's dominant object, and its smaller
 * companions. Mirrors mobile's LiveComposition: the ending-soonest
 * auction takes the runway (large media, live pulse, urgency countdown
 * chip, price lockup and seller below on the canvas); the next two live
 * auctions stack beside it as supporting tiles. One stretched link per
 * surface — the whole card is the bid path.
 */

import Link from 'next/link';
import type { AuctionViewModel } from '@/lib/contracts/auction';
import { AppImage } from '@/components/ui/AppImage';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { AuctionCountdownChip } from '@/components/auctions/AuctionCountdown';
import { AuctionWatchButton } from '@/components/auctions/AuctionWatchButton';
import { LiveBadge } from '@/components/live/LiveBadge';
import { auctionChipLabel, auctionChipUrgency } from '@/components/auctions/AuctionCard';
import { userById } from '@/lib/data/fixtures';
import { formatPrice } from '@/lib/utils/format';

export function AuctionRunwayCard({
  auction,
  priority = false,
}: {
  auction: AuctionViewModel;
  /** Opt-in — pass only when this card is the page's LCP candidate. */
  priority?: boolean;
}) {
  // Wire-provided seller identity first (live mapper populates it);
  // fixture catalogue only for fixture-mode ids — a live id colliding
  // with a catalogue id would attribute the lot to the wrong member.
  const seller = auction.seller ?? userById(auction.sellerId);
  const label = auctionChipLabel(auction);
  const urgency = auctionChipUrgency(auction);

  return (
    <article className="group relative flex h-full flex-col">
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-surface-alt sm:aspect-[16/10] lg:aspect-auto lg:min-h-[320px] lg:flex-1">
        <AppImage
          src={auction.image}
          alt={auction.title}
          fill
          priority={priority}
          sizes="(max-width: 1024px) 100vw, 62vw"
          className="h-full w-full"
        />
        <LiveBadge className="absolute left-3 top-3" />
        {/* Watch — the featured lot's re-entry point (mobile topRow:
            state badge left, watch glyph right). Above the stretched link. */}
        <AuctionWatchButton
          auctionId={auction.id}
          variant="media"
          className="absolute right-1 top-1 z-[2]"
        />
        <div className="absolute bottom-3 left-3">
          <AuctionCountdownChip label={label} urgency={urgency} />
        </div>
      </div>

      <div className="flex items-end justify-between gap-4 px-1 pt-3">
        <div className="min-w-0">
          <h3 className="clamp-1 text-item-title font-semibold text-text-primary">
            {auction.title}
          </h3>
          <div className="mt-1 flex items-center gap-1.5 text-text-secondary">
            <Avatar src={seller?.avatar} name={seller?.username ?? null} size={20} />
            <span className="clamp-1 text-meta font-medium">
              @{seller?.username ?? 'seller'}
            </span>
            {/* Verification rides the fixture User; the wire seller shape
                carries no verification field, so the badge stays off
                rather than being assumed. */}
            {seller && 'isVerified' in seller && seller.isVerified ? (
              <Icon name="verified" size={11} className="text-commerce-trust" />
            ) : null}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-meta font-semibold uppercase tracking-wide text-text-muted">
            Current bid
          </p>
          <p className="tnum text-price-hero font-bold text-text-primary">
            {formatPrice(auction.currentBid)}
          </p>
          <p className="tnum text-meta text-text-muted">
            {auction.bidCount} {auction.bidCount === 1 ? 'bid' : 'bids'}
          </p>
        </div>
      </div>

      <Link
        href={`/auctions/${auction.id}`}
        className="absolute inset-0 z-[1] rounded-xl"
        aria-label={`${auction.title}, current bid ${formatPrice(auction.currentBid)}, ${label}`}
      />
    </article>
  );
}

/**
 * Supporting tile — the row companion stacked beside the runway: edge
 * media, title, urgency countdown and the standing bid.
 */
export function AuctionSupportingTile({ auction }: { auction: AuctionViewModel }) {
  const label = auctionChipLabel(auction);
  const urgency = auctionChipUrgency(auction);
  const hot = urgency === 'final' || urgency === 'soon';

  return (
    <article className="group relative flex items-center gap-3">
      <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-lg bg-surface-alt sm:h-28 sm:w-28">
        <AppImage
          src={auction.image}
          alt={auction.title}
          fill
          sizes="112px"
          className="h-full w-full"
        />
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="clamp-2 text-body-emphasis font-medium text-text-primary">
          {auction.title}
        </h3>
        <p
          className={`tnum mt-1 text-meta font-semibold ${
            urgency === 'final'
              ? 'text-danger-text'
              : urgency === 'soon'
                ? 'text-warning-text'
                : 'text-text-muted'
          }`}
        >
          {label}
        </p>
        <p className="tnum mt-0.5 text-caption-elevated font-semibold text-text-primary">
          {formatPrice(auction.currentBid)}
          <span className="ml-1.5 font-normal text-text-muted">
            · {auction.bidCount} {auction.bidCount === 1 ? 'bid' : 'bids'}
          </span>
        </p>
      </div>
      <Icon
        name="forward"
        size={16}
        className={`shrink-0 ${hot ? 'text-text-primary' : 'text-text-muted'}`}
      />
      <Link
        href={`/auctions/${auction.id}`}
        className="absolute inset-0 z-[1]"
        aria-label={`${auction.title}, current bid ${formatPrice(auction.currentBid)}, ${label}`}
      />
    </article>
  );
}
