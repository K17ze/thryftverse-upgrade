'use client';

/**
 * PdpRecentlyViewed — the session's own browse trail as the PDP's last
 * rail. Reads the persisted recently-viewed store (the same dataset the
 * home module renders), resolves ids back to real listings, drops the
 * current item and anything that no longer resolves. Hydration-gated —
 * persisted reads can't drive the first render — and self-omits when
 * there's genuinely nothing else in the trail.
 */

import { useMemo } from 'react';
import type { Listing } from '@/lib/contracts/domain';
import { mapListingToDiscoverySummary } from '@/lib/contracts/domain';
import { ProductTile } from '@/components/cards/ProductTile';
import { listingById } from '@/lib/data/fixtures';
import { useSession } from '@/lib/session/SessionProvider';
import { useHydrated } from '@/lib/store/useStore';
import { useRecentlyViewed } from '@/lib/store/recentlyViewed';

const RAIL_CAP = 10;

export function PdpRecentlyViewed({ listing }: { listing: Listing }) {
  const hydrated = useHydrated();
  // Same rule as the home module — guest sessions render nothing rather
  // than a trail they can't act on.
  const { isGuest } = useSession();
  const ids = useRecentlyViewed((s) => s.listingIds);

  const items = useMemo(() => {
    if (!hydrated) return [];
    return ids
      .filter((id) => id !== listing.id)
      .map(listingById)
      .filter((l): l is Listing => l != null)
      .slice(0, RAIL_CAP);
  }, [hydrated, ids, listing.id]);

  // The trail holding only this item — or nothing at all — renders
  // nothing; absence is the honest state.
  if (isGuest || items.length === 0) return null;

  return (
    <section
      className="border-t border-border-subtle py-6"
      aria-labelledby="pdp-recently-viewed"
    >
      <h2
        id="pdp-recently-viewed"
        className="mb-4 px-4 text-section-title font-semibold text-text-primary sm:px-6"
      >
        Recently viewed
      </h2>
      <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 sm:px-6" role="list">
        {items.map((item) => (
          <div key={item.id} role="listitem" className="w-[150px] shrink-0 sm:w-[180px]">
            <ProductTile item={mapListingToDiscoverySummary(item)} />
          </div>
        ))}
      </div>
    </section>
  );
}
