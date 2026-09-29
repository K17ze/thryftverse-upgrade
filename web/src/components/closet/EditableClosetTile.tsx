'use client';

/**
 * EditableClosetTile — an own-closet tile with a quiet Manage affordance
 * that routes into the per-listing seller surface
 * (/seller-hub/listings/[id] — mobile's tap-any-item → ManageListing
 * parity, so sold and paused tiles get it too). Composes ClosetTile
 * rather than re-authoring it; the chip is a sibling of the tile's Link,
 * never nested inside it.
 */

import Link from 'next/link';
import type { Listing } from '@/lib/contracts/domain';
import { ClosetTile } from '@/components/profile/ClosetGrid';
import { Icon } from '@/components/ui/Icon';

export function EditableClosetTile({ item, priority }: { item: Listing; priority?: boolean }) {
  return (
    <div className="group relative">
      <ClosetTile item={item} priority={priority} />
      <Link
        href={`/seller-hub/listings/${item.id}`}
        aria-label={`Manage ${item.title}`}
        className="pressable absolute right-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-overlay px-2.5 py-1 text-micro font-semibold text-scrim-text-primary transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:focus-visible:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100 [@media(hover:hover)]:group-hover:opacity-100"
      >
        <Icon name="edit" size={12} />
        Manage
      </Link>
    </div>
  );
}
