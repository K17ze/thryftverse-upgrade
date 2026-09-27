'use client';

/**
 * Auction watchlist — the persisted Watch set behind the auction detail
 * toggle. Same grammar as components/live/liveReminders.ts: a
 * localStorage-backed Set read through useSyncExternalStore. Fixture mode
 * is local-only; live mode writes through to the auctions service
 * (`/auctions/:id/watch`) and read-seeds the set once per session from
 * `/auctions/watchlist` (union merge — server-known ids land, local flags
 * are never deleted). The backend doesn't echo a per-viewer flag on
 * auction rows, so the local set stays the render truth in both modes —
 * the same merge the mobile app runs for reminders.
 */

import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { DATA_MODE } from '@/lib/api/client';
import { fetchAuctionWatchlist, setAuctionWatched } from '@/lib/api/services/auctions';
import { useSession } from '@/lib/session/SessionProvider';

const WATCH_KEY = 'thryftverse.auction.watchlist.v1';
const EMPTY: ReadonlySet<string> = new Set();

let cache: Set<string> | null = null;
const listeners = new Set<() => void>();

function readSet(): Set<string> {
  if (cache) return cache;
  if (typeof window === 'undefined') return new Set();
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(WATCH_KEY) ?? '[]',
    ) as unknown;
    cache = new Set(
      Array.isArray(parsed)
        ? parsed.filter((x): x is string => typeof x === 'string')
        : [],
    );
  } catch {
    cache = new Set();
  }
  return cache;
}

function writeSet(next: Set<string>) {
  cache = next;
  try {
    window.localStorage.setItem(WATCH_KEY, JSON.stringify([...next]));
  } catch {
    // best-effort — the in-memory set still drives the UI this session.
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getServerSnapshot = (): ReadonlySet<string> => EMPTY;

// ── Read-seeding (live mode) ─────────────────────────────────────────────
// Same merge grammar as liveReminders: the server list unions INTO the
// local set — local flags set this session are never deleted by a stale
// server read, and watched ids the backend already knows land locally.
// Runs once per session per client.

let seedStarted = false;

function mergeServerWatches(ids: string[]): void {
  if (ids.length === 0) return;
  const next = readSet();
  let changed = false;
  for (const id of ids) {
    if (!next.has(id)) {
      next.add(id);
      changed = true;
    }
  }
  if (changed) writeSet(next);
}

function ensureWatchlistSeeded(): void {
  if (seedStarted || DATA_MODE !== 'live' || typeof window === 'undefined') return;
  seedStarted = true;
  void fetchAuctionWatchlist()
    .then((items) => mergeServerWatches(items.map((item) => item.id)))
    .catch(() => {
      // A failed read never blocks the local watchlist — the toggle stays
      // session-local until a remount retries the seed.
      seedStarted = false;
    });
}

export function useAuctionWatchlist(): {
  watched: ReadonlySet<string>;
  /** Flips the flag and persists it; returns the new state for toasts. */
  toggle: (auctionId: string) => boolean;
} {
  const { isGuest } = useSession();
  const watched = useSyncExternalStore(subscribe, readSet, getServerSnapshot);

  // Live mode: read-seed the account watchlist once — a no-op in fixture
  // mode, for guests (authed endpoint), and after the first seed of the
  // session.
  useEffect(() => {
    if (!isGuest) ensureWatchlistSeeded();
  }, [isGuest]);

  const toggle = useCallback((auctionId: string) => {
    const next = new Set(readSet());
    const on = !next.has(auctionId);
    if (on) next.add(auctionId);
    else next.delete(auctionId);
    writeSet(next);

    if (DATA_MODE === 'live') {
      // Server-side write — the local flag stays the optimistic truth
      // since auction rows don't echo a per-viewer watched state.
      void setAuctionWatched(auctionId, on).catch(() => {});
    }
    return on;
  }, []);

  return { watched, toggle };
}
