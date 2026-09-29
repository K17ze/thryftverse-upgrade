'use client';

/**
 * Outfit detail — read surface for a saved outfit: the slot canvas in view
 * mode (each placed item links to its PDP), plus the full item grid below.
 * Delete uses the same confirm-sheet grammar as the /outfits grid.
 */

import { useRef, useState } from 'react';
import { notFound, useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { Sheet } from '@/components/ui/Sheet';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { INPUT_CLASS } from '@/components/sell/SellField';
import { BackBar } from '@/components/profile/BackBar';
import { ProductTile } from '@/components/cards/ProductTile';
import { OutfitCanvas } from '@/components/outfits/OutfitCanvas';
import { outfitItemsList, useOutfitListings } from '@/components/outfits/outfitItems';
import { mapListingToDiscoverySummary } from '@/lib/contracts/domain';
import { useOutfits } from '@/lib/store/outfits';
import { useHydrated } from '@/lib/store/useStore';
import { timeAgo } from '@/lib/utils/format';
import type { SavedOutfit } from '@/lib/store/outfits';

/**
 * Outfit detail body — owns the slot resolution (live-aware hook) and the
 * read/edit surface. Split from the route component so the resolution hook
 * runs after the hydration + existence guards.
 */
function OutfitDetailBody({ outfit }: { outfit: SavedOutfit }) {
  const router = useRouter();
  const { show } = useToast();
  const removeOutfit = useOutfits((s) => s.removeOutfit);
  const renameOutfit = useOutfits((s) => s.renameOutfit);
  const [confirming, setConfirming] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Slot resolution through the live-aware hook — live ids fetch the real
  // listings (misses dropped, the count stays honest); fixture keeps the
  // catalogue.
  const items = useOutfitListings(outfit);
  const list = outfitItemsList(items);

  // Outfits are device-local (localStorage, matching mobile's local-only
  // persistence) — a shared URL can never resolve for a recipient, so no
  // share affordance is offered.

  const deleteOutfit = () => {
    removeOutfit(outfit.id);
    show(`Deleted “${outfit.name}”`, 'info');
    router.push('/outfits');
  };

  const commitRename = () => {
    const next = nameDraft.trim();
    if (next && next !== outfit.name) {
      renameOutfit(outfit.id, next);
      show('Outfit renamed', 'success');
    }
    setRenaming(false);
  };

  return (
    <div className="mx-auto max-w-[1200px] pb-16">
      <BackBar
        actions={
          <>
            <IconButton
              name="edit"
              aria-label="Rename outfit"
              onClick={() => {
                setNameDraft(outfit.name);
                setRenaming(true);
                requestAnimationFrame(() => nameInputRef.current?.select());
              }}
            />
            <IconButton
              name="trash"
              aria-label="Delete outfit"
              onClick={() => setConfirming(true)}
            />
          </>
        }
      />

      <div className="px-4 pt-1 sm:px-6">
        <h1 className="text-screen-title text-text-primary">
          {outfit.name}
        </h1>
        <p className="mt-1 text-meta text-text-muted">
          <span className="tnum">
            {list.length} {list.length === 1 ? 'item' : 'items'}
          </span>
          {outfit.createdAt ? ` · ${timeAgo(outfit.createdAt)}` : ''}
        </p>
      </div>

      {/* Desktop two-pane — the slot canvas anchors left (sticky) and the
          shoppable item grid fills beside it; on mobile this stays the
          stacked canvas-then-items column. */}
      <div className="lg:grid lg:grid-cols-[minmax(0,480px)_minmax(0,1fr)] lg:gap-10 lg:px-6">
        <div className="mx-auto mt-5 w-full max-w-[520px] px-4 sm:px-6 lg:sticky lg:top-20 lg:mx-0 lg:mt-8 lg:max-w-none lg:self-start lg:px-0">
          {/* Canvas — each placed item links to its PDP */}
          <OutfitCanvas items={items} linkToItems />
        </div>

        {/* Items — every piece links to /item/[id] */}
        {list.length > 0 ? (
          <section aria-label="Items in this outfit" className="mt-8">
            <div className="mb-4 flex items-baseline justify-between px-4 sm:px-6 lg:px-0">
              <h2 className="text-section-title font-semibold text-text-primary">
                Items
              </h2>
              <span className="tnum text-meta text-text-muted">
                {list.length} {list.length === 1 ? 'item' : 'items'}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-6 px-4 sm:grid-cols-3 sm:px-6 lg:grid-cols-2 lg:px-0 xl:grid-cols-3">
              {list.map((listing) => (
                <ProductTile
                  key={listing.id}
                  item={mapListingToDiscoverySummary(listing)}
                />
              ))}
            </div>
          </section>
        ) : null}
      </div>

      {/* Rename — the persisted overlay writes through renameOutfit. */}
      <Sheet
        open={renaming}
        onClose={() => setRenaming(false)}
        title="Rename outfit"
        maxWidth={420}
      >
        <div className="px-5 py-5">
          <label
            htmlFor="outfit-rename"
            className="text-caption font-medium text-text-secondary"
          >
            Outfit name
          </label>
          <input
            id="outfit-rename"
            ref={nameInputRef}
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename();
            }}
            maxLength={60}
            autoComplete="off"
            className={`${INPUT_CLASS} mt-1.5`}
          />
          <div className="mt-5 flex gap-3">
            <Button variant="secondary" fullWidth onClick={() => setRenaming(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              fullWidth
              disabled={!nameDraft.trim()}
              onClick={commitRename}
            >
              Save
            </Button>
          </div>
        </div>
      </Sheet>

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

export default function OutfitDetailPage() {
  const params = useParams();
  const hydrated = useHydrated();
  const id = String(params.id ?? '');
  const outfit = useOutfits((s) => s.outfits.find((o) => o.id === id));

  if (!hydrated) {
    return (
      <div className="mx-auto max-w-[1200px]" aria-busy aria-label="Loading outfit">
        <BackBar />
        <div className="px-4 pt-2 sm:px-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="mt-2 h-4 w-32" />
          <div className="lg:grid lg:grid-cols-[minmax(0,480px)_minmax(0,1fr)] lg:gap-10">
            <Skeleton className="mt-5 aspect-[4/5] w-full max-w-[520px] rounded-xl lg:mt-8 lg:max-w-none" />
            <div className="hidden lg:mt-8 lg:grid lg:grid-cols-2 lg:content-start lg:gap-4 xl:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="aspect-[3/4] rounded-lg" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Definitive miss after hydration — the not-found boundary owns it.
  // Outfits are session-owned records the server can never resolve, so
  // this is the only 404 the route can give (deep links to deleted
  // outfits land on the designed not-found, not a soft EmptyState).
  if (!outfit) {
    notFound();
  }

  return <OutfitDetailBody outfit={outfit} />;
}
