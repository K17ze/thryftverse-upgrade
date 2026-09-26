'use client';

/**
 * EditableClosetTile — an own-closet tile with a quiet Edit affordance
 * that routes into the existing sell-flow edit path (/sell?edit=<id>).
 * Composes ClosetTile rather than re-authoring it; the chip is a sibling
 * of the tile's Link, never nested inside it. Sold tiles can't be edited
 * (the sell flow only resolves live listings) so they don't get a chip.
 */

import Link from 'next/link';
import type { Listing } from '@/lib/contracts/domain';
import { ClosetTile } from '@/components/profile/ClosetGrid';
import { Icon } from '@/components/ui/Icon';

function isEditable(listing: Listing): boolean {
  return !listing.isSold && listing.status !== 'sold';
}

export function EditableClosetTile({ item, priority }: { item: Listing; priority?: boolean }) {
  if (!isEditable(item)) return <ClosetTile item={item} priority={priority} />;
  return (
    <div className="group relative">
      <ClosetTile item={item} priority={priority} />
      <Link
        href={`/sell?edit=${item.id}`}
        aria-label={`Edit ${item.title}`}
        className="pressable absolute right-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-overlay px-2.5 py-1 text-micro font-semibold text-scrim-text-primary transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:focus-visible:opacity-100 [@media(hover:hover)]:group-hover:opacity-100"
      >
        <Icon name="edit" size={12} />
        Edit
      </Link>
    </div>
  );
}
