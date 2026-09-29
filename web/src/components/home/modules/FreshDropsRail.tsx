'use client';

/**
 * FreshDropsRail — "Fresh drops" module that leads the home feed: the
 * newest listings by createdAt, presented as the same snap-scroll shelf
 * grammar used by every other module band.
 *
 * Items derive from the feed units already on screen, not a bundled
 * dataset — in live mode the rail shows the freshest real listings the
 * feed returned, never fixture inventory.
 */

import type { DiscoveryFeedUnit, DiscoveryListingSummary } from '@/lib/contracts/domain';
import { ModuleSection } from './ModuleSection';
import { ListingRail } from './ListingRail';

const MAX_ITEMS = 8;

function freshItems(units: DiscoveryFeedUnit[]): DiscoveryListingSummary[] {
  return units
    .filter((u): u is Extract<DiscoveryFeedUnit, { type: 'listing' }> => u.type === 'listing')
    .map((u) => u.listing)
    .filter((l) => !l.isSold)
    .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
    .slice(0, MAX_ITEMS);
}

export function FreshDropsRail({ units }: { units: DiscoveryFeedUnit[] }) {
  const items = freshItems(units);
  if (items.length === 0) return null;
  return (
    <ModuleSection title="Fresh drops" href="/explore" bordered={false} moduleId="fresh-drops">
      <ListingRail items={items} label="Fresh drops" />
    </ModuleSection>
  );
}
