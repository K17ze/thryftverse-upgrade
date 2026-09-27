/**
 * Recently-viewed listings — shared consumer store.
 *
 * Single source of truth for the `@thryftverse_recently_viewed_listings`
 * AsyncStorage key (previously duplicated inline in the creator pickers —
 * same key and entry shape, so existing device data keeps working).
 *
 * Consumers:
 * - PDP resolve records a view (ItemDetailScreen).
 * - Home/Explore mount a "Recently viewed" rail.
 * - Creator pickers read the same entries in their "Recent" tab.
 */
import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const RECENTLY_VIEWED_KEY = '@thryftverse_recently_viewed_listings';
const MAX_RECENT = 24;

export interface RecentListingEntry {
  id: string;
  sellerId: string;
  title: string;
  priceGbp: number;
  imageUrl: string | null;
  createdAt: string;
}

let cache: RecentListingEntry[] | null = null;
const listeners = new Set<(entries: RecentListingEntry[]) => void>();

function emit() {
  if (!cache) return;
  listeners.forEach((listener) => listener([...cache!]));
}

export async function getRecentlyViewed(): Promise<RecentListingEntry[]> {
  if (cache) return cache;
  try {
    const raw = await AsyncStorage.getItem(RECENTLY_VIEWED_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    cache = Array.isArray(parsed) ? parsed : [];
  } catch {
    cache = [];
  }
  return cache;
}

/**
 * Record a listing view. Dedupes by id, most-recent-first, capped.
 * Best-effort — never blocks the calling screen.
 */
export async function recordRecentlyViewed(
  entry: Omit<RecentListingEntry, 'createdAt'> & { createdAt?: string },
): Promise<void> {
  const next: RecentListingEntry = {
    id: entry.id,
    sellerId: entry.sellerId,
    title: entry.title,
    priceGbp: entry.priceGbp,
    imageUrl: entry.imageUrl,
    createdAt: entry.createdAt ?? new Date().toISOString() };
  try {
    const existing = await getRecentlyViewed();
    const filtered = existing.filter((e) => e.id !== next.id);
    cache = [next, ...filtered].slice(0, MAX_RECENT);
    await AsyncStorage.setItem(RECENTLY_VIEWED_KEY, JSON.stringify(cache));
    emit();
  } catch {
    // Storage failure must never break the PDP.
  }
}

export async function clearRecentlyViewed(): Promise<void> {
  cache = [];
  try {
    await AsyncStorage.removeItem(RECENTLY_VIEWED_KEY);
  } catch {
    // Best-effort.
  }
  emit();
}

/**
 * Subscribe to the recently-viewed list. Loads once on mount, then stays
 * in sync with every recorder (PDP, pickers) for the lifetime of the hook.
 */
export function useRecentlyViewedListings(): {
  entries: RecentListingEntry[];
  isLoading: boolean;
  refresh: () => void;
  clear: () => void;
} {
  const [entries, setEntries] = useState<RecentListingEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    getRecentlyViewed().then((loaded) => {
      if (!mounted) return;
      setEntries([...loaded]);
      setIsLoading(false);
    });
    const listener = (next: RecentListingEntry[]) => setEntries(next);
    listeners.add(listener);
    return () => {
      mounted = false;
      listeners.delete(listener);
    };
  }, []);

  const refresh = useCallback(() => {
    getRecentlyViewed().then((loaded) => setEntries([...loaded]));
  }, []);

  const clear = useCallback(() => {
    clearRecentlyViewed();
  }, []);

  return { entries, isLoading, refresh, clear };
}
