'use client';

import { Badge } from '@/components/ui/Badge';
import { formatPrice, timeAgo } from '@/lib/utils/format';
import type { Listing } from '@/lib/contracts/domain';
import type { ManagedListingRow } from '@/components/seller/listingManagementModel';

interface ListingManageIdentityProps {
  listing: Listing;
  status: ManagedListingRow['status'] | null;
}

export function ListingManageIdentity({ listing, status }: ListingManageIdentityProps) {
  return (
    <div className="mt-4 flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h2 className="clamp-2 text-section-title font-semibold text-text-primary">
          {listing.title}
        </h2>
        <p className="tnum mt-1 text-body text-text-secondary">
          {formatPrice(listing.price)}
          {listing.brand ? ` · ${listing.brand}` : ''}
          {listing.size ? ` · Size ${listing.size}` : ''}
        </p>
        {listing.createdAt ? (
          <p className="mt-1 text-meta text-text-muted">
            Listed {timeAgo(listing.createdAt)}
          </p>
        ) : null}
      </div>
      <Badge
        variant={
          status === 'active' ? 'success' : status === 'draft' ? 'warning' : 'neutral'
        }
      >
        {status === 'active'
          ? 'Active'
          : status === 'paused'
            ? 'Paused'
            : status === 'draft'
              ? 'Draft'
              : 'Sold'}
      </Badge>
    </div>
  );
}
