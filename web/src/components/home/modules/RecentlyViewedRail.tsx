'use client';

/**
 * RecentlyViewedRail — "Recently viewed" module at the head of the home
 * feed. Persisted PDP views resolve back to listings; ids that no longer
 * resolve drop silently. Guests and empty histories render nothing —
 * absence is the honest state, never a skeleton.
 */

import { useMemo } from 'react';
import type { DiscoveryListingSummary, Listing } from '@/lib/contracts/domain';
import { mapListingToDiscoverySummary } from '@/lib/contracts/domain';
import { listingById } from '@/lib/data/fixtures';
import { useSession } from '@/lib/session/SessionProvider';
import { useHydrated } from '@/lib/store/useStore';
import { useRecentlyViewed } from '@/lib/store/recentlyViewed';
import { useToast } from '@/components/ui/Toast';
import { ModuleSection } from './ModuleSection';
import { ListingRail } from './ListingRail';

export function RecentlyViewedRail() {
  const hydrated = useHydrated();
  const { isGuest } = useSession();
  const { show } = useToast();
  const ids = useRecentlyViewed((s) => s.listingIds);
  const clear = useRecentlyViewed((s) => s.clear);

  const items = useMemo<DiscoveryListingSummary[]>(() => {
    if (!hydrated) return [];
    return ids
      .map(listingById)
      .filter((l): l is Listing => l != null)
      .map(mapListingToDiscoverySummary);
  }, [hydrated, ids]);

  if (isGuest || items.length === 0) return null;

  return (
    <ModuleSection
      title="Recently viewed"
      bordered={false}
      action={{
        label: 'Clear',
        onClick: () => {
          clear();
          show('Recently viewed cleared', 'success');
        },
      }}
    >
      <ListingRail items={items} label="Recently viewed" />
    </ModuleSection>
  );
}
