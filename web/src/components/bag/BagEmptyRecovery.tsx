'use client';

import { useRouter } from 'next/navigation';
import { useStore } from '@/lib/store/useStore';
import { useSession } from '@/lib/session/SessionProvider';
import {
  useRecentlyViewedListings,
  useResolvedListings,
} from '@/lib/hooks/home-modules';
import { mapListingToDiscoverySummary } from '@/lib/contracts/domain';
import { ModuleSection } from '@/components/home/modules/ModuleSection';
import { ListingRail } from '@/components/home/modules/ListingRail';

/** Commerce recovery under the empty state — a dead-end "Start shopping"
 *  wastes the session; real media rails (saved items, then the recently
 *  viewed trail) give the empty bag somewhere honest to go. */
export function BagEmptyRecovery() {
  const router = useRouter();
  const { isGuest } = useSession();
  const wishlist = useStore((s) => s.wishlist);
  const { items: saved } = useResolvedListings(wishlist);
  const { items: recent } = useRecentlyViewedListings();

  const savedSummaries = saved.map(mapListingToDiscoverySummary);
  const recentSummaries = (isGuest ? [] : recent).map(mapListingToDiscoverySummary);
  if (savedSummaries.length === 0 && recentSummaries.length === 0) return null;

  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 pb-16 sm:px-6">
      {savedSummaries.length > 0 ? (
        <ModuleSection
          title="Saved for later"
          bordered={false}
          moduleId="bag-saved-recovery"
          action={{ label: 'View all', onClick: () => router.push('/saved') }}
        >
          <ListingRail items={savedSummaries} label="Saved for later" />
        </ModuleSection>
      ) : null}
      {recentSummaries.length > 0 ? (
        <ModuleSection
          title="Recently viewed"
          bordered={false}
          moduleId="bag-recent-recovery"
        >
          <ListingRail items={recentSummaries} label="Recently viewed" />
        </ModuleSection>
      ) : null}
    </div>
  );
}
