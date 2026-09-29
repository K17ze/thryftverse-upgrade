'use client';

/**
 * RecentlyViewedRail — "Recently viewed" module at the head of the home
 * feed. Persisted PDP views resolve back to listings — fixture ids read
 * the bundled catalogue, live ids fetch through GET /listings/:id; ids
 * that no longer resolve drop silently. Guests and empty histories
 * render nothing — absence is the honest state, never a skeleton.
 */

import { mapListingToDiscoverySummary } from '@/lib/contracts/domain';
import { useRecentlyViewedListings } from '@/lib/hooks/home-modules';
import { useSession } from '@/lib/session/SessionProvider';
import { useRecentlyViewed } from '@/lib/store/recentlyViewed';
import { useToast } from '@/components/ui/Toast';
import { ModuleSection } from './ModuleSection';
import { ListingRail } from './ListingRail';

export function RecentlyViewedRail() {
  const { isGuest } = useSession();
  const { show } = useToast();
  const clear = useRecentlyViewed((s) => s.clear);
  const { items } = useRecentlyViewedListings();
  const summaries = items.map(mapListingToDiscoverySummary);

  if (isGuest || summaries.length === 0) return null;

  return (
    <ModuleSection
      title="Recently viewed"
      bordered={false}
      moduleId="recently-viewed"
      action={{
        label: 'Clear',
        onClick: () => {
          clear();
          show('Recently viewed cleared', 'success');
        },
      }}
    >
      <ListingRail items={summaries} label="Recently viewed" />
    </ModuleSection>
  );
}
