'use client';

/**
 * FreshDropsRail — "Fresh drops" module that leads the home feed: the
 * newest listings by createdAt, presented as the same snap-scroll shelf
 * grammar used by every other module band.
 */

import type { DiscoveryListingSummary } from '@/lib/contracts/domain';
import { mapListingToDiscoverySummary } from '@/lib/contracts/domain';
import { LISTINGS } from '@/lib/data/fixtures';
import { ModuleSection } from './ModuleSection';
import { ListingRail } from './ListingRail';

const FRESH_ITEMS: DiscoveryListingSummary[] = LISTINGS.filter((l) => !l.isSold)
  .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
  .slice(0, 8)
  .map(mapListingToDiscoverySummary);

export function FreshDropsRail() {
  return (
    <ModuleSection title="Fresh drops" href="/explore" bordered={false}>
      <ListingRail items={FRESH_ITEMS} label="Fresh drops" />
    </ModuleSection>
  );
}
