'use client';

/**
 * OutfitBuilder — the composer surface.
 * Slot-grid canvas on the left, saved-items tray on the right (stacked on
 * mobile), name field + gated save CTA under the canvas. Port of the mobile
 * OutfitBuilderScreen semantics: items are picked from saved/favourites into
 * fixed garment slots; save requires ≥2 filled slots and persists to the
 * outfits store.
 */

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Listing } from '@/lib/contracts/domain';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { INPUT_CLASS } from '@/components/sell/SellField';
import { listingsForIds } from '@/components/profile/fixtures';
import { useStore, useHydrated } from '@/lib/store/useStore';
import {
  OUTFIT_SLOTS,
  MIN_OUTFIT_ITEMS,
  DEFAULT_OUTFIT_NAME,
  useOutfits,
  type OutfitSlot,
} from '@/lib/store/outfits';
import { OutfitCanvas, type OutfitCanvasItems } from './OutfitCanvas';
import { OutfitTray, type TrayFilter } from './OutfitTray';
import { inferListingSlot, saveCtaLabel, toOutfitItems } from './outfitItems';

export function OutfitBuilder() {
  const router = useRouter();
  const { show } = useToast();
  const hydrated = useHydrated();

  const wishlist = useStore((s) => s.wishlist);
  const saved = useStore((s) => s.saved);
  const saveOutfit = useOutfits((s) => s.saveOutfit);

  /** Tray source — favourites ∪ saved, resolved against fixtures. */
  const sourceItems = useMemo(
    () => listingsForIds([...new Set([...wishlist, ...saved])]),
    [wishlist, saved],
  );

  const [name, setName] = useState('');
  const [items, setItems] = useState<OutfitCanvasItems>({});
  const [trayFilter, setTrayFilter] = useState<TrayFilter>('all');

  const filled = OUTFIT_SLOTS.filter((s) => items[s]).length;
  const selectedIds = useMemo(
    () =>
      new Set(
        OUTFIT_SLOTS.map((s) => items[s]?.id).filter(
          (id): id is string => Boolean(id),
        ),
      ),
    [items],
  );

  const toggleItem = (listing: Listing) => {
    const slot = inferListingSlot(listing);
    setItems((prev) => ({
      ...prev,
      [slot]: prev[slot]?.id === listing.id ? undefined : listing,
    }));
  };

  const removeFromSlot = (slot: OutfitSlot) =>
    setItems((prev) => ({ ...prev, [slot]: undefined }));

  const handleSave = () => {
    if (filled < MIN_OUTFIT_ITEMS) return;
    const outfit = saveOutfit(name || DEFAULT_OUTFIT_NAME, toOutfitItems(items));
    show(`Saved “${outfit.name}”`, 'success');
    router.push('/outfits');
  };

  if (!hydrated) {
    return (
      <div
        className="mx-auto max-w-[1200px] px-4 pb-16 pt-5 sm:px-6"
        aria-busy
        aria-label="Loading outfit builder"
      >
        <Skeleton className="h-7 w-32" />
        <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,380px)]">
          <Skeleton className="aspect-[4/5] w-full max-w-[560px] rounded-xl" />
          <div className="grid grid-cols-3 gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="aspect-[4/5] rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1200px] px-4 pb-16 pt-5 sm:px-6">
      <div className="flex items-center justify-between">
        <h1 className="text-screen-title font-bold text-text-primary">
          New outfit
        </h1>
        <Button
          variant="quiet"
          size="sm"
          icon="trash"
          disabled={filled === 0}
          onClick={() => setItems({})}
        >
          Clear
        </Button>
      </div>

      <div className="mt-5 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(320px,380px)]">
        {/* ── Composer: canvas + name + save ── */}
        <div>
          <div className="mx-auto w-full max-w-[560px]">
            <OutfitCanvas
              items={items}
              activeSlot={trayFilter === 'all' ? null : trayFilter}
              onSlotPress={(slot) => setTrayFilter(slot)}
              onRemoveItem={removeFromSlot}
            />
          </div>

          <div className="mt-5">
            <label
              htmlFor="outfit-name"
              className="text-caption font-medium text-text-secondary"
            >
              Outfit name
            </label>
            <input
              id="outfit-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={DEFAULT_OUTFIT_NAME}
              maxLength={60}
              autoComplete="off"
              className={`${INPUT_CLASS} mt-1.5`}
            />
          </div>

          <div className="mt-4 flex items-center gap-3">
            <Button
              variant="primary"
              size="lg"
              fullWidth
              disabled={filled < MIN_OUTFIT_ITEMS}
              onClick={handleSave}
            >
              {saveCtaLabel(filled)}
            </Button>
          </div>
        </div>

        {/* ── Tray: saved/favourited items to pull from ── */}
        <div className="border-t border-border-subtle pt-6 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
          <OutfitTray
            items={sourceItems}
            filter={trayFilter}
            onFilterChange={setTrayFilter}
            selectedIds={selectedIds}
            onToggleItem={toggleItem}
          />
        </div>
      </div>
    </div>
  );
}
