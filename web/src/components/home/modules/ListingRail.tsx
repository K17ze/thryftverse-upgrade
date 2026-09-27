'use client';

/**
 * ListingRail — horizontal snap-scroll shelf of ProductTiles at a fixed
 * rail width on the shared Rail primitive (edge-fade scroll affordance).
 * The single pattern every home module shelf collapses to on mobile.
 */

import type { DiscoveryListingSummary } from '@/lib/contracts/domain';
import { ProductTile } from '@/components/cards/ProductTile';
import { Rail } from './Rail';

interface ListingRailProps {
  items: DiscoveryListingSummary[];
  label: string;
}

export function ListingRail({ items, label }: ListingRailProps) {
  if (items.length === 0) return null;
  return (
    <Rail label={label}>
      {items.map((item) => (
        <div
          key={item.id}
          role="listitem"
          className="w-[180px] shrink-0 snap-start sm:w-[220px]"
        >
          <ProductTile item={item} />
        </div>
      ))}
    </Rail>
  );
}
