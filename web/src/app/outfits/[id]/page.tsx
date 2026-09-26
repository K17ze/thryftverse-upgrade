'use client';

/**
 * Outfit detail — read surface for a saved outfit: the slot canvas in view
 * mode (each placed item links to its PDP), plus the full item grid below.
 * Delete uses the same confirm-sheet grammar as the /outfits grid.
 */

import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconButton } from '@/components/ui/IconButton';
import { Sheet } from '@/components/ui/Sheet';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { BackBar } from '@/components/profile/BackBar';
import { ProductTile } from '@/components/cards/ProductTile';
import { OutfitCanvas } from '@/components/outfits/OutfitCanvas';
import { outfitItemsList, outfitListings } from '@/components/outfits/outfitItems';
import { mapListingToDiscoverySummary } from '@/lib/contracts/domain';
import { useOutfits } from '@/lib/store/outfits';
import { useHydrated } from '@/lib/store/useStore';
import { timeAgo } from '@/lib/utils/format';

export default function OutfitDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { show } = useToast();
  const hydrated = useHydrated();
  const id = String(params.id ?? '');
  const outfit = useOutfits((s) => s.outfits.find((o) => o.id === id));
  const removeOutfit = useOutfits((s) => s.removeOutfit);
  const [confirming, setConfirming] = useState(false);

  const items = useMemo(
    () => (outfit ? outfitListings(outfit) : {}),
    [outfit],
  );
  const list = outfitItemsList(items);

  if (!hydrated) {
    return (
      <div className="mx-auto max-w-[1200px]" aria-busy aria-label="Loading outfit">
        <BackBar />
        <div className="px-4 pt-2 sm:px-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="mt-2 h-4 w-32" />
          <Skeleton className="mt-5 aspect-[4/5] w-full max-w-[520px] rounded-xl" />
        </div>
      </div>
    );
  }

  if (!outfit) {
    return (
      <div className="mx-auto max-w-[1200px]">
        <BackBar />
        <EmptyState
          icon="layers"
          title="Outfit not found"
          subtitle="This outfit may have been deleted."
          actionLabel="Your outfits"
          onAction={() => router.push('/outfits')}
        />
      </div>
    );
  }

  const shareOutfit = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      show('Outfit link copied', 'success');
    } catch {
      show('Could not copy link', 'error');
    }
  };

  const deleteOutfit = () => {
    removeOutfit(outfit.id);
    show(`Deleted “${outfit.name}”`, 'info');
    router.push('/outfits');
  };

  return (
    <div className="mx-auto max-w-[1200px] pb-16">
      <BackBar
        actions={
          <>
            <IconButton name="share" aria-label="Share outfit" onClick={shareOutfit} />
            <IconButton
              name="trash"
              aria-label="Delete outfit"
              onClick={() => setConfirming(true)}
            />
          </>
        }
      />

      <div className="px-4 pt-1 sm:px-6">
        <h1 className="text-screen-title font-bold text-text-primary">
          {outfit.name}
        </h1>
        <p className="mt-1 text-meta text-text-muted">
          <span className="tnum">
            {list.length} {list.length === 1 ? 'item' : 'items'}
          </span>
          {outfit.createdAt ? ` · ${timeAgo(outfit.createdAt)}` : ''}
        </p>
      </div>

      {/* Canvas — each placed item links to its PDP */}
      <div className="mx-auto mt-5 w-full max-w-[520px] px-4 sm:px-6">
        <OutfitCanvas items={items} linkToItems />
      </div>

      {/* Items — every piece links to /item/[id] */}
      {list.length > 0 ? (
        <section aria-label="Items in this outfit" className="mt-8">
          <div className="mb-4 flex items-baseline justify-between px-4 sm:px-6">
            <h2 className="text-section-title font-semibold text-text-primary">
              Items
            </h2>
            <span className="tnum text-meta text-text-muted">
              {list.length} {list.length === 1 ? 'item' : 'items'}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-6 px-4 sm:grid-cols-3 sm:px-6 lg:grid-cols-4">
            {list.map((listing) => (
              <ProductTile
                key={listing.id}
                item={mapListingToDiscoverySummary(listing)}
              />
            ))}
          </div>
        </section>
      ) : null}

      <Sheet
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Delete outfit"
        maxWidth={420}
      >
        <div className="px-5 py-5">
          <p className="text-body text-text-secondary">
            Delete “{outfit.name}”? This can’t be undone.
          </p>
          <div className="mt-5 flex gap-3">
            <Button variant="secondary" fullWidth onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button variant="danger" fullWidth onClick={deleteOutfit}>
              Delete
            </Button>
          </div>
        </div>
      </Sheet>
    </div>
  );
}
