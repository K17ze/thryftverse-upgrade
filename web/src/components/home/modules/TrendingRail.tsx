'use client';

/**
 * TrendingRail — "Trending this week" module band. A snap-scroll shelf of
 * the most-viewed live listings, inserted into the home feed after the
 * first masonry chunk.
 */

import type { DiscoveryListingSummary } from '@/lib/contracts/domain';
import { mapListingToDiscoverySummary } from '@/lib/contracts/domain';
import { LISTINGS } from '@/lib/data/fixtures';
import { ModuleSection } from './ModuleSection';
import { ListingRail } from './ListingRail';

// Fixture dataset is static — rank once at module scope.
const TRENDING_ITEMS: DiscoveryListingSummary[] = LISTINGS.filter((l) => !l.isSold)
  .sort((a, b) => (b.views ?? 0) - (a.views ?? 0))
  .slice(0, 8)
  .map(mapListingToDiscoverySummary);

export function TrendingRail() {
  return (
    <ModuleSection title="Trending this week" href="/explore" linkLabel="Explore">
      <ListingRail items={TRENDING_ITEMS} label="Trending this week" />
    </ModuleSection>
  );
}
