'use client';

/**
 * Saved outfits — persisted slot-map outfits built in the outfit builder.
 * Mirrors the mobile Outfit contract (services/styleGraph.ts): an outfit is
 * a fixed set of garment slots, each holding at most one item. We persist
 * listing ids only — the Listing resolves at render so price/media changes
 * flow through and dead ids drop out gracefully.
 * Separate store from useStore so persisted slices stay composable
 * (mirrors savedSearches.ts).
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

/** Fixed slot model — 1:1 port of the mobile OutfitSlot union. */
export type OutfitSlot = 'top' | 'bottom' | 'shoes' | 'outerwear' | 'accessory';

/** Canonical slot order — drives canvas layout, card collages, item lists. */
export const OUTFIT_SLOTS: OutfitSlot[] = [
  'top',
  'bottom',
  'shoes',
  'outerwear',
  'accessory',
];

/** slot → listingId. Sparse: only filled slots carry a key. */
export type OutfitItems = Partial<Record<OutfitSlot, string>>;

export interface SavedOutfit {
  id: string;
  name: string;
  items: OutfitItems;
  createdAt: string;
}

/** Fallback name — mirrors the mobile generateOutfitName default. */
export const DEFAULT_OUTFIT_NAME = 'My outfit';

/** Mobile gates save on ≥2 filled slots (saveCtaTitle) — same rule here. */
export const MIN_OUTFIT_ITEMS = 2;

interface OutfitsState {
  outfits: SavedOutfit[];
  /** Persist a new outfit; returns the stored record (resolved name included). */
  saveOutfit: (name: string, items: OutfitItems) => SavedOutfit;
  removeOutfit: (id: string) => void;
  renameOutfit: (id: string, name: string) => void;
}

let counter = 0;
const nextId = () =>
  `of-${Date.now().toString(36)}-${(counter++).toString(36)}${Math.random()
    .toString(36)
    .slice(2, 6)}`;

const cleanName = (name: string) => name.trim() || DEFAULT_OUTFIT_NAME;

/** Drop empty slots so persisted outfits never carry undefined values. */
function compactItems(items: OutfitItems): OutfitItems {
  const out: OutfitItems = {};
  for (const slot of OUTFIT_SLOTS) {
    const id = items[slot];
    if (id) out[slot] = id;
  }
  return out;
}

export const useOutfits = create<OutfitsState>()(
  persist(
    (set) => ({
      outfits: [],
      saveOutfit: (name, items) => {
        const outfit: SavedOutfit = {
          id: nextId(),
          name: cleanName(name),
          items: compactItems(items),
          createdAt: new Date().toISOString(),
        };
        set((s) => ({ outfits: [outfit, ...s.outfits] }));
        return outfit;
      },
      removeOutfit: (id) =>
        set((s) => ({ outfits: s.outfits.filter((o) => o.id !== id) })),
      renameOutfit: (id, name) =>
        set((s) => ({
          outfits: s.outfits.map((o) =>
            o.id === id ? { ...o, name: cleanName(name) } : o,
          ),
        })),
    }),
    {
      name: 'thryftverse.web.outfits',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ outfits: s.outfits }),
    },
  ),
);
