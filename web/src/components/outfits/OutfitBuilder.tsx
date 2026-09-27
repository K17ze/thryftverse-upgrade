'use client';

/**
 * OutfitBuilder — the composer surface.
 * Slot-grid canvas on the left, saved-items tray on the right (stacked on
 * mobile), name field + gated save CTA under the canvas. Port of the mobile
 * OutfitBuilderScreen semantics: items are picked from saved/favourites into
 * fixed garment slots; save requires ≥2 filled slots and persists to the
 * outfits store. Header grammar matches mobile: back/close, undo+redo once
 * there's history to traverse, and a confirmed Clear (never a one-tap
 * wipe of a composed outfit).
 */

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Listing } from '@/lib/contracts/domain';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { INPUT_CLASS } from '@/components/sell/SellField';
import { useSignupWall } from '@/components/auth/SignupWall';
import { BackBar } from '@/components/profile/BackBar';
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
import { OutfitSuggestionCard } from './OutfitSuggestionCard';
import { inferListingSlot, saveCtaLabel, toOutfitItems } from './outfitItems';
import { suggestCompletion } from './styleGraph';
import { LISTINGS } from '@/lib/data/fixtures';

export function OutfitBuilder() {
  const router = useRouter();
  const { show } = useToast();
  const { requireAuth, wall } = useSignupWall();
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
  const [confirmClear, setConfirmClear] = useState(false);

  // Undo/redo — snapshot history of the slot map. Every mutation goes
  // through `apply` so the past trail and redo stack stay honest.
  const [past, setPast] = useState<OutfitCanvasItems[]>([]);
  const [future, setFuture] = useState<OutfitCanvasItems[]>([]);
  const canUndo = past.length > 0;
  const canRedo = future.length > 0;

  const apply = (next: OutfitCanvasItems) => {
    setPast((p) => [...p, items]);
    setFuture([]);
    setItems(next);
  };

  const undo = () => {
    if (!canUndo) return;
    const prev = past[past.length - 1];
    setPast(past.slice(0, -1));
    setFuture([items, ...future]);
    setItems(prev);
  };

  const redo = () => {
    if (!canRedo) return;
    const next = future[0];
    setFuture(future.slice(1));
    setPast([...past, items]);
    setItems(next);
  };

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
    apply({
      ...items,
      [slot]: items[slot]?.id === listing.id ? undefined : listing,
    });
  };

  const removeFromSlot = (slot: OutfitSlot) =>
    apply({ ...items, [slot]: undefined });

  /** Complete-the-look — StyleGraph heuristic over real listings. The
   *  candidate pool is the member's own rail (saved + favourites) first,
   *  then the wider catalogue — both resolve to real items, never
   *  fabricated suggestions. */
  const suggestion = useMemo(() => {
    const placed = new Set(
      Object.values(items)
        .map((l) => l?.id)
        .filter((x): x is string => Boolean(x)),
    );
    const pool = [
      ...sourceItems,
      ...LISTINGS.filter((l) => !sourceItems.some((s) => s.id === l.id)),
    ].filter((l) => !placed.has(l.id));
    return suggestCompletion(items, pool);
  }, [items, sourceItems]);

  const clearAll = () => {
    apply({});
    setConfirmClear(false);
    show('Outfit cleared', 'info');
  };

  const handleSave = () => {
    // Save is account-bound — deep-linked guests get the soft wall.
    if (!requireAuth('save_item')) return;
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
    <div className="mx-auto max-w-[1200px] pb-16">
      <BackBar
        actions={
          <Button
            variant="quiet"
            size="sm"
            icon="trash"
            disabled={filled === 0}
            onClick={() => setConfirmClear(true)}
          >
            Clear
          </Button>
        }
      />

      <div className="flex items-center justify-between px-4 pt-1 sm:px-6">
        <h1 className="text-screen-title font-bold text-text-primary">
          New outfit
        </h1>
      </div>

      {/* Undo/redo — progressive disclosure: only visible once there's
          history to traverse (mobile OutfitBuilderUndoRedoBar). */}
      {canUndo || canRedo ? (
        <div className="mt-1 flex items-center gap-1 px-4 sm:px-6" role="toolbar" aria-label="Edit history">
          <Button
            variant="quiet"
            size="sm"
            disabled={!canUndo}
            onClick={undo}
          >
            Undo
          </Button>
          <Button
            variant="quiet"
            size="sm"
            disabled={!canRedo}
            onClick={redo}
          >
            Redo
          </Button>
        </div>
      ) : null}

      <div className="mt-5 grid gap-8 px-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,380px)]">
        {/* ── Composer: canvas + name + save ── */}
        <div>
          <div className="mx-auto w-full max-w-[560px]">
            <OutfitCanvas
              items={items}
              activeSlot={trayFilter === 'all' ? null : trayFilter}
              onSlotPress={(slot) => setTrayFilter(slot)}
              onRemoveItem={removeFromSlot}
            />

            {/* Complete the look — shown only while a suggestion exists
                (empty slots remain and a candidate scores). */}
            {suggestion && filled > 0 ? (
              <OutfitSuggestionCard
                suggestion={suggestion}
                onApply={() => {
                  apply({ ...items, [suggestion.slot]: suggestion.item });
                  show(`Added ${suggestion.item.title}`, 'success');
                }}
              />
            ) : null}
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

      {/* Clear confirmation — a composed outfit is real work; never wipe it
          on a stray tap (mobile ConfirmationSheet parity). */}
      <Sheet
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        title="Clear outfit"
        maxWidth={420}
      >
        <div className="px-5 py-5">
          <p className="text-body text-text-secondary">
            Remove all {filled} {filled === 1 ? 'item' : 'items'} from this outfit?
          </p>
          <div className="mt-5 flex gap-3">
            <Button
              variant="secondary"
              fullWidth
              onClick={() => setConfirmClear(false)}
            >
              Cancel
            </Button>
            <Button variant="danger" fullWidth onClick={clearAll}>
              Clear
            </Button>
          </div>
        </div>
      </Sheet>
      {wall}
    </div>
  );
}
