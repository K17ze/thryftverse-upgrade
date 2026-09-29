'use client';

/**
 * Client state — mirrors the mobile app's useStore slices the web needs:
 * wishlist (favourites), saved products, bag, look engagement, and
 * session identity. Persisted to localStorage so state survives reloads.
 *
 * Live-mode writes are optimistic with revert-on-failure: a failed POST
 * snaps the list back and raises `savedSyncError` so surfaces can say the
 * sync failed instead of quietly diverging. `hydrateSavedLists` writes are
 * sequenced by the session epoch — a resolution that lands after an
 * identity change is dropped, never written onto the new account.
 */

import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { DATA_MODE } from '@/lib/api/client';
import { fetchSavedList, writeSavedList } from '@/lib/api/services/saved';
import { setLookLiked, setLookSaved } from '@/lib/api/services/social';
import { sessionEpoch, sessionIdentityIsCurrent } from '@/lib/session/identityEpoch';

interface BagItem {
  listingId: string;
  addedAt: string;
}

/**
 * Latest-write-wins per (scope, item): a response is stale when a newer
 * op for the same item started after it. Stale resolutions are ignored —
 * the newest in-flight op owns the final state and the error channel —
 * so rapid toggles can't resurrect a reverted state or hide a failure.
 */
const writeSeq = new Map<string, number>();

/**
 * POST the toggle to the server in live mode — optimistic mirror with
 * item-scoped rollback: a failed write reverts only that id (sibling
 * toggles keep their state) and raises `savedSyncError`. Resolves the
 * caller's promise with the persisted outcome so toasts can defer to
 * truth instead of claiming success at press time.
 */
function writeThroughSavedList(
  list: 'wishlist' | 'saved',
  listingId: string,
  nowHas: boolean,
): Promise<boolean> {
  if (DATA_MODE !== 'live') return Promise.resolve(true);
  const key = `${list}:${listingId}`;
  const seq = (writeSeq.get(key) ?? 0) + 1;
  writeSeq.set(key, seq);
  return writeSavedList(list, listingId, nowHas ? 'add' : 'remove')
    .then(() => {
      if (writeSeq.get(key) !== seq) return true;
      writeSeq.delete(key);
      useStore.setState({ savedSyncError: null });
      return true;
    })
    .catch(() => {
      if (writeSeq.get(key) !== seq) return true;
      writeSeq.delete(key);
      useStore.setState((s) => {
        const cur = s[list];
        const reverted = nowHas
          ? cur.filter((x) => x !== listingId)
          : cur.includes(listingId)
            ? cur
            : [...cur, listingId];
        return list === 'wishlist' ? { wishlist: reverted } : { saved: reverted };
      });
      useStore.setState({ savedSyncError: list });
      return false;
    });
}

/** Same optimistic+revert grammar for the look-scoped edges (like/save) —
 *  looks are a different domain than saved listings, so they get their
 *  own endpoint and their own slice. */
function writeThroughLook(
  edge: 'like' | 'save',
  lookId: string,
  on: boolean,
): Promise<boolean> {
  if (DATA_MODE !== 'live') return Promise.resolve(true);
  const key = `look-${edge}:${lookId}`;
  const seq = (writeSeq.get(key) ?? 0) + 1;
  writeSeq.set(key, seq);
  const write = edge === 'like' ? setLookLiked(lookId, on) : setLookSaved(lookId, on);
  return write
    .then(() => {
      if (writeSeq.get(key) !== seq) return true;
      writeSeq.delete(key);
      useStore.setState({ savedSyncError: null });
      return true;
    })
    .catch(() => {
      if (writeSeq.get(key) !== seq) return true;
      writeSeq.delete(key);
      useStore.setState((s) => {
        const cur = edge === 'like' ? s.likedLooks : s.savedLooks;
        const reverted = on
          ? cur.filter((x) => x !== lookId)
          : cur.includes(lookId)
            ? cur
            : [...cur, lookId];
        return edge === 'like' ? { likedLooks: reverted } : { savedLooks: reverted };
      });
      useStore.setState({ savedSyncError: edge === 'like' ? 'like' : 'save' });
      return false;
    });
}

interface AppState {
  // Wishlist (favourites)
  wishlist: string[];
  /** Optimistic toggle — resolves true once the state is durable
   *  (fixture: immediately; live: after the write lands). False means
   *  the write failed and the local change was rolled back. */
  toggleWishlist: (id: string) => Promise<boolean>;
  isWishlisted: (id: string) => boolean;

  // Saved products (bookmark to collections)
  saved: string[];
  toggleSaved: (id: string) => Promise<boolean>;
  isSaved: (id: string) => boolean;

  // Saved looks — a separate domain from `saved` (listings). Posting a
  // look id to the saved-listings endpoint was the old lie; look saves
  // go through /looks/:id/save in live mode.
  savedLooks: string[];
  toggleSavedLook: (id: string) => Promise<boolean>;
  isLookSaved: (id: string) => boolean;

  // Bag / bundle
  bag: BagItem[];
  addToBag: (id: string) => void;
  /** Bundle adds — atomic multi-add, deduped against the existing bag. */
  addManyToBag: (ids: string[]) => void;
  removeFromBag: (id: string) => void;
  clearBag: () => void;
  isInBag: (id: string) => boolean;

  // Feed engagement — look likes write through to /looks/:id/like with
  // revert-on-failure (same pattern as the follows store).
  likedLooks: string[];
  toggleLikedLook: (id: string) => Promise<boolean>;

  // Listing management — last-bump timestamps per listing id. Persisted so
  // the 1-per-24h cooldown survives reloads; the fixtures do the data write.
  listingBumps: Record<string, string>;
  recordListingBump: (id: string) => void;

  // Sync honesty channels (runtime state — never persisted):
  /** Set when a live write failed after rollback ('wishlist' | 'saved' |
   *  'like' | 'save'); cleared on the next successful write. */
  savedSyncError: string | null;
  /** True when the live hydrate failed — the local lists may be stale
   *  relative to the server; cleared on a successful hydrate. */
  savedListsStale: boolean;

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
        return writeThroughSavedList('wishlist', id, next);
      },
      isWishlisted: (id) => get().wishlist.includes(id),

      saved: [],
      toggleSaved: (id) => {
        const next = !get().saved.includes(id);
        set((s) => ({
          saved: next ? [...s.saved, id] : s.saved.filter((x) => x !== id),
        }));
        return writeThroughSavedList('saved', id, next);
      },
      isSaved: (id) => get().saved.includes(id),

      savedLooks: [],
      toggleSavedLook: (id) => {
        const next = !get().savedLooks.includes(id);
        set((s) => ({
          savedLooks: next
            ? [...s.savedLooks, id]
            : s.savedLooks.filter((x) => x !== id),
        }));
        return writeThroughLook('save', id, next);
      },
      isLookSaved: (id) => get().savedLooks.includes(id),

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
      toggleLikedLook: (id) => {
        const next = !get().likedLooks.includes(id);
        set((s) => ({
          likedLooks: next
            ? [...s.likedLooks, id]
            : s.likedLooks.filter((x) => x !== id),
        }));
        return writeThroughLook('like', id, next);
      },

      listingBumps: {},
      recordListingBump: (id) =>
        set((s) => ({
          listingBumps: { ...s.listingBumps, [id]: new Date().toISOString() },
        })),

      savedSyncError: null,
      savedListsStale: false,

      hasSeenOnboarding: false,
      markOnboardingSeen: () => set({ hasSeenOnboarding: true }),
    }),
    {
      name: 'thryftverse.web.store',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        wishlist: s.wishlist,
        saved: s.saved,
        savedLooks: s.savedLooks,
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
 *
 * `forUserId` pins the write to the identity that requested it: if the
 * session moved on (logout, expiry, a different account) before the read
 * resolved, the lists are dropped instead of landing on the wrong account.
 * A failed read flags the store stale — the local lists are kept (better
 * than empty) but never silently trusted.
 */
export async function hydrateSavedLists(forUserId?: string): Promise<void> {
  if (DATA_MODE !== 'live') return;
  const epoch = sessionEpoch();
  const stillCurrent = () =>
    !forUserId || sessionIdentityIsCurrent(forUserId, epoch);
  try {
    const [wishlist, saved] = await Promise.all([
      fetchSavedList('wishlist'),
      fetchSavedList('saved'),
    ]);
    if (!stillCurrent()) return;
    useStore.setState({
      wishlist: wishlist.itemIds,
      saved: saved.itemIds,
      savedListsStale: false,
      savedSyncError: null,
    });
  } catch {
    // Guest or offline — keep the local lists, but flag them stale so a
    // surface can say so instead of presenting them as server truth.
    if (stillCurrent()) useStore.setState({ savedListsStale: true });
  }
}
