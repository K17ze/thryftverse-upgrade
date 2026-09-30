'use client';

/**
 * PdpRecentlyViewed — the session's own browse trail as the PDP's last
 * rail. Reads the persisted recently-viewed store (the same dataset the
 * home module renders), resolves ids back to real listings — fixture
 * mode reads the bundled catalogue, live mode fetches GET /listings/:id —
 * drops the current item and anything that no longer resolves.
 * Hydration-gated — persisted reads can't drive the first render — and
 * self-omits when there's genuinely nothing else in the trail.
 */

import type { Listing } from '@/lib/contracts/domain';
import { mapListingToDiscoverySummary } from '@/lib/contracts/domain';
import { ProductTile } from '@/components/cards/ProductTile';
import { useRecentlyViewedListings } from '@/lib/hooks/home-modules';
import { useSession } from '@/lib/session/SessionProvider';
import { PdpSectionTitle } from './PdpSectionTitle';

const RAIL_CAP = 10;

export function PdpRecentlyViewed({ listing }: { listing: Listing }) {
  // Same rule as the home module — guest sessions render nothing rather
  // than a trail they can't act on.
  const { isGuest } = useSession();
  const { items } = useRecentlyViewedListings(listing.id);

  // The trail holding only this item — or nothing at all — renders
  // nothing; absence is the honest state.
  if (isGuest || items.length === 0) return null;

  return (
    <section
      className="border-t border-border-subtle py-6"
      aria-labelledby="pdp-recently-viewed"
    >
      <PdpSectionTitle id="pdp-recently-viewed" className="mb-4 px-4 sm:px-6">
        Recently viewed
      </PdpSectionTitle>
      <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 sm:px-6" role="list">
        {items.slice(0, RAIL_CAP).map((item) => (
          <div key={item.id} role="listitem" className="w-[150px] shrink-0 sm:w-[180px]">
            <ProductTile item={mapListingToDiscoverySummary(item)} />
          </div>
        ))}
      </div>
    </section>
  );
}
