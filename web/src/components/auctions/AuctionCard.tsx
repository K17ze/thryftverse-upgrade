'use client';

/**
 * AuctionCard — media-first hub tile. Live pulse badge, countdown chip on
 * media, current bid + bid count, window progress hairline, buy-now line
 * and the seller identity. Whole tile navigates via a stretched link.
 */

import Link from 'next/link';
import type { AuctionViewModel, CountdownUrgency } from '@/lib/contracts/auction';
import { AppImage } from '@/components/ui/AppImage';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { AuctionCountdownChip } from '@/components/auctions/AuctionCountdown';
import { countdownUrgency, formatDuration } from '@/lib/data/fixtures-auctions';
import { listingById, userById } from '@/lib/data/fixtures';
import { formatPrice } from '@/lib/utils/format';

const MIN_MS = 60 * 1000;

/** "8:30pm" — wall-clock start for scheduled auctions, not a countdown. */
function startTime(iso: string): string {
  return new Date(iso)
    .toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true })
    .replace(/\s/g, '')
    .toLowerCase();
}

/**
 * Card chip grammar — honest urgency only. Live ticks down from the real
 * endsAt ("Ends in 34m" / "Ends in 2h 14m"), collapsing to "Ending soon"
 * inside the last ten minutes. Scheduled auctions announce a wall-clock
 * start; ended auctions just say so.
 */
function chipLabel(auction: AuctionViewModel): string {
  if (auction.lifecycle === 'ended') return 'Ended';
  if (auction.lifecycle === 'upcoming') return `Starts ${startTime(auction.startsAt)}`;
  return auction.msToEnd < 10 * MIN_MS
    ? 'Ending soon'
    : `Ends in ${formatDuration(auction.msToEnd)}`;
}

function chipUrgency(auction: AuctionViewModel): CountdownUrgency {
  if (auction.lifecycle === 'live' && auction.msToEnd < 10 * MIN_MS) {
    return auction.msToEnd < 5 * MIN_MS ? 'final' : 'soon';
  }
  return countdownUrgency(auction);
}

interface AuctionCardProps {
  auction: AuctionViewModel;
  priority?: boolean;
}

export function AuctionCard({ auction, priority }: AuctionCardProps) {
  const seller = userById(auction.sellerId);
  const listing = listingById(auction.listingId);
  const ratio = listing?.mediaAspectRatio ?? 0.8;
  const label = chipLabel(auction);
  const urgency = chipUrgency(auction);

  return (
    <article className="group relative">
      <div className="relative overflow-hidden rounded-lg bg-surface-alt">
        <AppImage
          src={auction.image}
          alt={auction.title}
          aspectRatio={ratio}
          priority={priority}
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
        />

        {/* Live pulse — the only badge that moves, reduced-motion safe */}
        {auction.lifecycle === 'live' ? (
          <span className="absolute left-2 top-2 inline-flex items-center gap-1.5 rounded-md bg-danger px-2 py-1 text-meta font-bold uppercase tracking-[0.08em] text-scrim-text-primary">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-80" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-white" />
            </span>
            Live
          </span>
        ) : null}

        {/* Countdown — anchored to the media edge, scrim legible */}
        <div className="absolute bottom-2 left-2">
          <AuctionCountdownChip label={label} urgency={urgency} />
        </div>
      </div>

      <div className="flex flex-col gap-1 px-1 pt-2">
        <h3 className="clamp-1 text-body-emphasis text-text-primary">{auction.title}</h3>

        <div className="flex items-baseline justify-between gap-2">
          <span className="tnum text-price-list font-bold text-text-primary">
            {formatPrice(auction.currentBid)}
          </span>
          <span className="tnum text-meta text-text-muted">
            {auction.bidCount} {auction.bidCount === 1 ? 'bid' : 'bids'}
          </span>
        </div>

        {auction.buyNowPrice != null ? (
          <span className="tnum text-meta text-text-secondary">
            Buy now {formatPrice(auction.buyNowPrice)}
          </span>
        ) : null}

        {/* Window progress — brand while live, hairline once settled */}
        <div className="mt-1 h-0.5 w-full overflow-hidden rounded-full bg-surface-alt">
          <div
            className={`h-full rounded-full ${
              auction.lifecycle === 'ended' ? 'bg-border' : 'bg-brand'
            }`}
            style={{ width: `${Math.round(auction.progress * 100)}%` }}
          />
        </div>

        <div className="mt-0.5 flex items-center gap-1.5 text-text-secondary">
          <Avatar src={seller?.avatar} name={seller?.username ?? null} size={20} />
          <span className="clamp-1 text-meta font-medium">@{seller?.username ?? 'seller'}</span>
          {seller?.isVerified ? (
            <Icon name="verified" size={11} className="text-success-text" />
          ) : null}
        </div>
      </div>

      <Link
        href={`/auctions/${auction.id}`}
        className="absolute inset-0 z-[1] rounded-lg"
        aria-label={`${auction.title}, current bid ${formatPrice(auction.currentBid)}, ${label}`}
      />
    </article>
  );
}
