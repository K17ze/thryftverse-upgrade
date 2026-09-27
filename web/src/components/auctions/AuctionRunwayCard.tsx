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
import { auctionChipLabel, auctionChipUrgency } from '@/components/auctions/AuctionCard';
import { userById } from '@/lib/data/fixtures';
import { formatPrice } from '@/lib/utils/format';

/** The white-dot LIVE pulse — same grammar as AuctionCard's badge. */
function LivePulse() {
  return (
    <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-md bg-danger px-2 py-1 text-meta font-bold uppercase tracking-[0.08em] text-scrim-text-primary">
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-80" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-white" />
      </span>
      Live
    </span>
  );
}

export function AuctionRunwayCard({
  auction,
  priority = true,
}: {
  auction: AuctionViewModel;
  priority?: boolean;
}) {
  const seller = userById(auction.sellerId);
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
        <LivePulse />
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
            {seller?.isVerified ? (
              <Icon name="verified" size={11} className="text-success-text" />
            ) : null}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-meta font-medium uppercase tracking-wide text-text-muted">
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
