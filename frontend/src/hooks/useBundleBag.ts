/**
 * Bundle bag — persistent staging store.
 *
 * The backend transacts one listing per order, so the bag is a staging
 * surface, not a combined cart: entries are listing ids the buyer parked
 * for later purchase, grouped per seller by every consumer. Persisted in
 * AsyncStorage so a staged item survives app restarts (the PDP "Add to
 * bag" affordance and the bag screen share this single slice).
 */
import { useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const BUNDLE_BAG_KEY = '@thryftverse_bundle_bag_items';

export interface BundleBagEntry {
  listingId: string;
  sellerId: string;
  addedAt: string;
}

let cache: BundleBagEntry[] | null = null;
const listeners = new Set<(entries: BundleBagEntry[]) => void>();

function emit() {
  if (!cache) return;
  listeners.forEach((listener) => listener([...cache!]));
}

export async function getBundleBagEntries(): Promise<BundleBagEntry[]> {
  if (cache) return cache;
  try {
    const raw = await AsyncStorage.getItem(BUNDLE_BAG_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    cache = Array.isArray(parsed) ? parsed.filter(isEntry) : [];
  } catch {
    cache = [];
  }
  return cache;
}

function isEntry(value: unknown): value is BundleBagEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Record<string, unknown>;
  return typeof entry.listingId === 'string'
    && typeof entry.sellerId === 'string'
    && typeof entry.addedAt === 'string';
}

async function persist(next: BundleBagEntry[]): Promise<void> {
  cache = next;
  emit();
  try {
    await AsyncStorage.setItem(BUNDLE_BAG_KEY, JSON.stringify(next));
  } catch {
    // Storage failure must never break the staging action.
  }
}

export async function addToBundleBag(listingId: string, sellerId: string): Promise<void> {
  const existing = await getBundleBagEntries();
  if (existing.some((e) => e.listingId === listingId)) return;
  await persist([
    { listingId, sellerId, addedAt: new Date().toISOString() },
    ...existing.filter((e) => e.listingId !== listingId),
  ]);
}

export async function removeFromBundleBag(listingId: string): Promise<void> {
  const existing = await getBundleBagEntries();
  if (!existing.some((e) => e.listingId === listingId)) return;
  await persist(existing.filter((e) => e.listingId !== listingId));
}

export async function pruneBundleBag(listingIds: string[]): Promise<void> {
  const drop = new Set(listingIds);
  const existing = await getBundleBagEntries();
  const next = existing.filter((e) => !drop.has(e.listingId));
  if (next.length === existing.length) return;
  await persist(next);
}

/**
 * Subscribe to the bag. Loads once on mount, then stays in sync with
 * every recorder (PDP dock, bag screen) for the lifetime of the hook.
 */
export function useBundleBag(): {
  entries: BundleBagEntry[];
  isLoading: boolean;
} {
  const [entries, setEntries] = useState<BundleBagEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    getBundleBagEntries().then((loaded) => {
      if (!mounted) return;
      setEntries([...loaded]);
      setIsLoading(false);
    });
    const listener = (next: BundleBagEntry[]) => setEntries(next);
    listeners.add(listener);
    return () => {
      mounted = false;
      listeners.delete(listener);
    };
  }, []);

  return { entries, isLoading };
}

/** Stable id set from entries — keeps consumer memo deps honest. */
export function useBundleBagIdSet(): { ids: Set<string>; isLoading: boolean } {
  const { entries, isLoading } = useBundleBag();
  const ids = useMemo(() => new Set(entries.map((e) => e.listingId)), [entries]);
  return { ids, isLoading };
}
