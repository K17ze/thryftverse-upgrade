'use client';

/**
 * Client state — mirrors the mobile app's useStore slices the web needs:
 * wishlist (favourites), saved products, bag, and session identity.
 * Persisted to localStorage so state survives reloads.
 */

import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { DATA_MODE } from '@/lib/api/client';
import { fetchSavedList, writeSavedList } from '@/lib/api/services/saved';

interface BagItem {
  listingId: string;
  addedAt: string;
}

/** POST the toggle to the server in live mode — fire-and-forget; the local
 *  store is the optimistic mirror, same as the mobile savedLists slice. */
function writeThroughSavedList(list: 'wishlist' | 'saved', listingId: string, nowHas: boolean) {
  if (DATA_MODE !== 'live') return;
  void writeSavedList(list, listingId, nowHas ? 'add' : 'remove').catch(() => {
    // A failed write leaves the optimistic state — the next hydrate re-syncs.
  });
}

interface AppState {
  // Wishlist (favourites)
  wishlist: string[];
  toggleWishlist: (id: string) => void;
  isWishlisted: (id: string) => boolean;

  // Saved products (bookmark to collections)
  saved: string[];
  toggleSaved: (id: string) => void;
  isSaved: (id: string) => boolean;

  // Bag / bundle
  bag: BagItem[];
  addToBag: (id: string) => void;
  /** Bundle adds — atomic multi-add, deduped against the existing bag. */
  addManyToBag: (ids: string[]) => void;
  removeFromBag: (id: string) => void;
  clearBag: () => void;
  isInBag: (id: string) => boolean;

  // Feed engagement
  likedLooks: string[];
  toggleLikedLook: (id: string) => void;

  // Listing management — last-bump timestamps per listing id. Persisted so
  // the 1-per-24h cooldown survives reloads; the fixtures do the data write.
  listingBumps: Record<string, string>;
  recordListingBump: (id: string) => void;

  // Session flags
  hasSeenOnboarding: boolean;
  markOnboardingSeen: () => void;
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      wishlist: [],
      toggleWishlist: (id) => {
        const next = !get().wishlist.includes(id);
        set((s) => ({
          wishlist: next ? [...s.wishlist, id] : s.wishlist.filter((x) => x !== id),
        }));
        writeThroughSavedList('wishlist', id, next);
      },
      isWishlisted: (id) => get().wishlist.includes(id),

      saved: [],
      toggleSaved: (id) => {
        const next = !get().saved.includes(id);
        set((s) => ({
          saved: next ? [...s.saved, id] : s.saved.filter((x) => x !== id),
        }));
        writeThroughSavedList('saved', id, next);
      },
      isSaved: (id) => get().saved.includes(id),

      bag: [],
      addToBag: (id) =>
        set((s) =>
          s.bag.some((b) => b.listingId === id)
            ? s
            : { bag: [...s.bag, { listingId: id, addedAt: new Date().toISOString() }] },
        ),
      addManyToBag: (ids) =>
        set((s) => {
          const existing = new Set(s.bag.map((b) => b.listingId));
          const fresh = ids.filter((id) => !existing.has(id));
          if (fresh.length === 0) return s;
          const addedAt = new Date().toISOString();
          return {
            bag: [...s.bag, ...fresh.map((listingId) => ({ listingId, addedAt }))],
          };
        }),
      removeFromBag: (id) =>
        set((s) => ({ bag: s.bag.filter((b) => b.listingId !== id) })),
      clearBag: () => set({ bag: [] }),
      isInBag: (id) => get().bag.some((b) => b.listingId === id),

      likedLooks: [],
      toggleLikedLook: (id) =>
        set((s) => ({
          likedLooks: s.likedLooks.includes(id)
            ? s.likedLooks.filter((x) => x !== id)
            : [...s.likedLooks, id],
        })),

      listingBumps: {},
      recordListingBump: (id) =>
        set((s) => ({
          listingBumps: { ...s.listingBumps, [id]: new Date().toISOString() },
        })),

      hasSeenOnboarding: false,
      markOnboardingSeen: () => set({ hasSeenOnboarding: true }),
    }),
    {
      name: 'thryftverse.web.store',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        wishlist: s.wishlist,
        saved: s.saved,
        bag: s.bag,
        likedLooks: s.likedLooks,
        listingBumps: s.listingBumps,
        hasSeenOnboarding: s.hasSeenOnboarding,
      }),
    },
  ),
);

/**
 * True once the component has mounted on the client. Persisted store values
 * differ between SSR and the first client render for returning sessions —
 * SSR-rendered consumers must gate persisted reads behind this hook.
 */
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return hydrated;
}

/**
 * Live mode: pull the server-authoritative wishlist/saved lists into the
 * store once the session resolves. Call this from the session provider —
 * it no-ops in fixture mode.
 */
export async function hydrateSavedLists(): Promise<void> {
  if (DATA_MODE !== 'live') return;
  try {
    const [wishlist, saved] = await Promise.all([
      fetchSavedList('wishlist'),
      fetchSavedList('saved'),
    ]);
    useStore.setState({ wishlist: wishlist.itemIds, saved: saved.itemIds });
  } catch {
    // Guest or offline — keep the local lists.
  }
}
