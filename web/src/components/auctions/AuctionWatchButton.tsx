'use client';

/**
 * AuctionWatchButton — the watch/unwatch affordance, one component three
 * surfaces: 'media' rides on card imagery (mobile AuctionRunwayCard
 * grammar — eye glyph, filled when watching, scrim legibility), 'plain'
 * sits inside ledger rows, 'block' is the detail rail's labelled row.
 * All variants share the persisted auction watchlist; guests hit the
 * account wall since the watchlist is account-bound.
 */

import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { useAuctionWatchlist } from '@/components/auctions/auctionWatchlist';
import { useSignupWall } from '@/components/auth/SignupWall';
import { useHydrated } from '@/lib/store/useStore';

interface AuctionWatchButtonProps {
  auctionId: string;
  /** media — glyph on imagery (drop-scrim legibility, no chrome);
   *  plain — transparent glyph inside a row;
   *  block — full-width labelled row (the detail grammar). */
  variant?: 'media' | 'plain' | 'block';
  className?: string;
}

export function AuctionWatchButton({
  auctionId,
  variant = 'plain',
  className = '',
}: AuctionWatchButtonProps) {
  const { show } = useToast();
  const { requireAuth } = useSignupWall();
  const hydrated = useHydrated();
  const { watched, toggle } = useAuctionWatchlist();
  const isWatched = hydrated && watched.has(auctionId);

  const onPress = () => {
    if (!requireAuth('save_item')) return;
    const on = toggle(auctionId);
    show(
      on ? 'Watching — you can find it in your watchlist' : 'Removed from watchlist',
      'info',
    );
  };

  const label = isWatched ? 'Watching — remove from watchlist' : 'Watch this auction';

  if (variant === 'block') {
    return (
      <button
        type="button"
        aria-pressed={isWatched}
        onClick={onPress}
        className={`pressable flex h-11 items-center justify-center gap-2 rounded-md border text-body-emphasis font-semibold ${
          isWatched
            ? 'border-border bg-brand-subtle text-text-primary'
            : 'border-border text-text-primary hover:border-text-muted'
        } ${className}`}
      >
        <Icon name="eye" size={18} filled={isWatched} />
        {isWatched ? 'Watching' : 'Watch this auction'}
      </button>
    );
  }

  return (
    <button
      type="button"
      aria-pressed={isWatched}
      aria-label={label}
      onClick={onPress}
      className={`pressable inline-flex h-11 w-11 items-center justify-center rounded-full ${
        variant === 'media'
          ? 'text-scrim-text-primary drop-scrim'
          : isWatched
            ? 'text-brand'
            : 'text-text-muted hover:text-text-primary'
      } ${className}`}
    >
      <Icon name="eye" filled={isWatched} size={20} />
    </button>
  );
}
