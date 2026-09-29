'use client';

/**
 * Co-Own watchlist — the starred assets the session is tracking.
 *
 * Fixture mode and guests stay device-local (localStorage only — the
 * /co-own/watchlist routes are auth-required, so an unauthenticated
 * session never reaches the API). Live + signed-in: the persisted list
 * hydrates from GET /co-own/watchlist once per resolved account — the
 * arm/apply pair below carries the same epoch discipline as
 * hydrateSavedLists — and every star writes through POST/DELETE behind
 * an optimistic local flip. A failed write rolls the star back and
 * records `syncError` for a mounted surface to toast (same grammar as
 * useStore's savedSyncError).
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { DATA_MODE } from '@/lib/api/client';
import { parseApiError } from '@/lib/api/http';
import {
  addToCoOwnWatchlist,
  removeFromCoOwnWatchlist,
} from '@/lib/api/services/coown';
import {
  sessionEpoch,
  sessionIdentityIsCurrent,
  sessionUserId,
} from '@/lib/session/identityEpoch';

/** A failed server write, parked for a mounted surface to toast once. */
export interface CoOwnWatchlistSyncError {
  message: string;
  at: number;
}

interface CoOwnWatchlistState {
  /** Co-Own asset ids the session watches. */
  watchedIds: string[];
  /** Hydration guards — the account + session epoch the current ids were
   *  hydrated under. Session-only; never persisted, so a reload always
   *  re-arms the server read. */
  hydratedForUserId: string | null;
  hydratedEpoch: number | null;
  syncError: CoOwnWatchlistSyncError | null;
  toggleWatch: (assetId: string) => void;
  isWatching: (assetId: string) => boolean;
  clearSyncError: () => void;
}

export const useCoOwnWatchlist = create<CoOwnWatchlistState>()(
  persist(
    (set, get) => ({
      watchedIds: [],
      hydratedForUserId: null,
      hydratedEpoch: null,
      syncError: null,
      toggleWatch: (assetId) => {
        const nowWatching = !get().watchedIds.includes(assetId);
        // Optimistic local flip — the star responds immediately in every
        // mode; for guests and fixtures this write is the whole story.
        set((s) => ({
          watchedIds: nowWatching
            ? [...s.watchedIds, assetId]
            : s.watchedIds.filter((id) => id !== assetId),
        }));

        // Live + authed: write through. Guests, unresolved sessions and
        // fixture mode stay local-only — never call the API for them.
        const userId = DATA_MODE === 'live' ? sessionUserId() : null;
        if (!userId) return;

        const write = nowWatching
          ? addToCoOwnWatchlist(assetId)
          : removeFromCoOwnWatchlist(assetId);
        void write.catch((error: unknown) => {
          set((s) => ({
            // Roll the row back only while it still holds this toggle's
            // outcome — a newer toggle of the same asset is the fresher
            // intent and stands.
            watchedIds:
              s.watchedIds.includes(assetId) === nowWatching
                ? nowWatching
                  ? s.watchedIds.filter((id) => id !== assetId)
                  : [...s.watchedIds, assetId]
                : s.watchedIds,
            syncError: {
              message: parseApiError(error, 'Could not update the watchlist').message,
              at: Date.now(),
            },
          }));
        });
      },
      isWatching: (assetId) => get().watchedIds.includes(assetId),
      clearSyncError: () => set({ syncError: null }),
    }),
    {
      name: 'thryftverse.web.coown-watchlist',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ watchedIds: s.watchedIds }),
    },
  ),
);

// ── Server hydration (live mode) ─────────────────────────────────────
// The react-query read (lib/hooks/coown-hub-queries.ts) owns the fetch;
// the store only arms and applies it, so every surface that consumes the
// query feeds hydration through the same cache entry.

interface PendingWatchlistHydration {
  userId: string;
  epoch: number;
  /** Local ids at arm time — the split point for reconciling stars
   *  toggled while the server read is in flight. */
  baseline: Set<string>;
}

let pendingHydration: PendingWatchlistHydration | null = null;

/**
 * Arm the once-per-account hydration. Captures the session epoch and the
 * current local ids; the resolved server list lands through
 * applyServerCoOwnWatchlist. Idempotent per (userId, epoch) — a
 * sign-out/sign-in cycle bumps the epoch, so the same account rehydrates
 * after resetAccountSlices wiped the list.
 */
export function armCoOwnWatchlistHydration(forUserId: string): void {
  if (DATA_MODE !== 'live' || !forUserId) return;
  const epoch = sessionEpoch();
  const state = useCoOwnWatchlist.getState();
  if (state.hydratedForUserId === forUserId && state.hydratedEpoch === epoch) return;
  if (pendingHydration?.userId === forUserId && pendingHydration.epoch === epoch) return;
  pendingHydration = {
    userId: forUserId,
    epoch,
    baseline: new Set(state.watchedIds),
  };
}

/**
 * Apply a resolved server watchlist — the server list is the account
 * truth (mobile parity: hydrateCoOwnWatchlist replaces, so rows unwatched
 * on another device drop here). Toggles made while the read was in
 * flight keep their intent: local additions stay watched (their POST is
 * already on the wire), removals stay removed even when the stale list
 * still carried the row. A read resolving after a sign-out or account
 * switch is dropped by the epoch guard.
 */
export function applyServerCoOwnWatchlist(
  forUserId: string,
  assetIds: string[],
): void {
  const pending = pendingHydration;
  if (!pending || pending.userId !== forUserId) return;
  pendingHydration = null;
  if (!sessionIdentityIsCurrent(forUserId, pending.epoch)) return;

  const current = useCoOwnWatchlist.getState().watchedIds;
  const serverIds = new Set(assetIds);
  const removedInFlight = new Set(
    [...pending.baseline].filter((id) => !current.includes(id)),
  );
  useCoOwnWatchlist.setState({
    watchedIds: [
      // Server order is newest-star-first (created_at DESC); keep it.
      ...assetIds.filter((id) => !removedInFlight.has(id)),
      // Local ids added during the read that the list couldn't know yet.
      ...current.filter((id) => !pending.baseline.has(id) && !serverIds.has(id)),
    ],
    hydratedForUserId: forUserId,
    hydratedEpoch: pending.epoch,
    syncError: null,
  });
}
