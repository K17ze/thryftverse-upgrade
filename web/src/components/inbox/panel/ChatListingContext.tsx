'use client';

/**
 * ChatListingContext — header card displaying the item under discussion
 * in marketplace conversations, with thumbnail, price, sold state, and PDP link.
 */

import Link from 'next/link';
import { AppImage } from '@/components/ui/AppImage';
import { Badge } from '@/components/ui/Badge';
import { Icon } from '@/components/ui/Icon';
import { formatPrice } from '@/lib/utils/format';

interface ListingContextData {
  id: string;
  title: string;
  price: number;
  image?: string;
  isSold?: boolean;
}

interface ChatListingContextProps {
  listing?: ListingContextData | null;
}

export function ChatListingContext({ listing }: ChatListingContextProps) {
  if (!listing) return null;

  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-border-subtle px-3 py-2.5 md:px-4 bg-surface">
      {listing.image ? (
        <AppImage
          src={listing.image}
          alt={listing.title}
          sizes="44px"
          className="h-11 w-11 shrink-0 rounded-md"
          fallbackIcon="bag"
        />
      ) : null}
      <div className="min-w-0 flex-1">
        <p className="clamp-1 text-body font-medium text-text-primary">
          {listing.title}
        </p>
        <p className="mt-0.5 flex items-center gap-2 text-body font-semibold text-text-primary">
          <span className="tnum">{formatPrice(listing.price)}</span>
          {listing.isSold ? <Badge variant="neutral">Sold</Badge> : null}
        </p>
      </div>
      <Link
        href={`/item/${listing.id}`}
        className="pressable inline-flex shrink-0 items-center gap-1 text-body-emphasis font-semibold text-text-primary"
      >
        View
        <Icon name="forward" size={14} />
      </Link>
    </div>
  );
}
