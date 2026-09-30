import React from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import type { Listing } from '@/lib/contracts/domain';

export function OffersScopeBanner({
  scopedListingId,
  scopedListing,
}: {
  scopedListingId: string | null;
  scopedListing?: Listing;
}) {
  if (!scopedListingId) return null;

  return (
    <div className="mt-3 flex items-center gap-2 text-caption text-text-secondary">
      <Icon name="offer" size={14} className="shrink-0 text-text-muted" />
      <span className="clamp-1 min-w-0">
        Offers for{' '}
        <span className="font-medium text-text-primary">
          {scopedListing?.title ?? 'this item'}
        </span>
      </span>
      <Link
        href="/offers"
        className="pressable ml-auto inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 font-medium text-text-primary hover:bg-surface-alt"
      >
        <Icon name="close" size={13} />
        All offers
      </Link>
    </div>
  );
}
