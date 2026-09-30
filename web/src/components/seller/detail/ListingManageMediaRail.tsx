'use client';

import { AppImage } from '@/components/ui/AppImage';
import type { Listing } from '@/lib/contracts/domain';
import type { ManagedListingRow } from '@/components/seller/listingManagementModel';

interface ListingManageMediaRailProps {
  listing: Listing;
  status: ManagedListingRow['status'] | null;
}

export function ListingManageMediaRail({ listing, status }: ListingManageMediaRailProps) {
  if (!listing.images.length) return null;

  return (
    <ul
      className="no-scrollbar mt-6 flex gap-2 overflow-x-auto pb-1 lg:mt-0"
      aria-label="Listing photos"
    >
      {listing.images.map((uri, i) => (
        <li key={uri} className="relative h-36 w-28 shrink-0">
          <AppImage
            src={uri}
            alt={`${listing.title} photo ${i + 1}`}
            fill
            sizes="112px"
            className="rounded-md"
          />
          {status === 'sold' || status === 'paused' ? (
            <span className="absolute inset-0 bg-overlay/30" />
          ) : null}
        </li>
      ))}
    </ul>
  );
}
