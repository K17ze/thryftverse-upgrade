/**
 * Closet view-model — pure derivations for the Closet surface (Saved /
 * Wishlist / Collections / Outfits). Extracted from ClosetScreen with the
 * logic preserved verbatim; the screen and hooks own state and effects,
 * this module owns the deterministic projections.
 */
import type { Listing } from './listing';

export type ClosetTabKey = 'SAVED' | 'WISHLIST' | 'COLLECTIONS' | 'OUTFITS';
export type ClosetSortOption =
  | 'Default'
  | 'Price: Low to High'
  | 'Price: High to Low'
  | 'Newest'
  | 'Recently saved';

export const CLOSET_SORT_OPTIONS: ClosetSortOption[] = [
  'Default',
  'Recently saved',
  'Price: Low to High',
  'Price: High to Low',
  'Newest',
];

/** Minimal collection shape needed by the closet projections. The store's
 *  `Collection` type satisfies this structurally. */
export interface ClosetCollectionLike {
  id: string;
  name: string;
  itemIds: string[];
  updatedAt?: number;
  isPrivate?: boolean;
}

/** Minimal outfit shape needed by the closet projections. The store's
 *  `Outfit` type satisfies this structurally. */
export interface ClosetOutfitLike {
  id: string;
  name: string;
  itemIds: string[];
  backgroundColor?: string;
}

/** Board card projection consumed by MoodboardCollectionGrid. */
export interface ClosetBoard {
  id: string;
  title: string;
  itemCount: number;
  covers: string[];
  updatedAt?: number;
  isPrivate: boolean;
}

export interface ClosetStats {
  totalItems: number;
  totalValue: number;
  totalSavings: number;
  collectionsCount: number;
}

/**
 * Sort a closet listing set. `recentSourceIds` is the source ID array for
 * the active tab (wishlist IDs on WISHLIST, saved IDs elsewhere) used by
 * 'Recently saved' ordering — most recently added first.
 */
export function sortClosetItems<T extends { id: string; price: number; createdAt?: string }>(
  items: T[],
  sortBy: ClosetSortOption,
  recentSourceIds?: string[]
): T[] {
  switch (sortBy) {
    case 'Price: Low to High':
      return [...items].sort((a, b) => a.price - b.price);
    case 'Price: High to Low':
      return [...items].sort((a, b) => b.price - a.price);
    case 'Newest':
      return [...items].sort((a, b) => {
        const da = a.createdAt ? Date.parse(a.createdAt) : 0;
        const db = b.createdAt ? Date.parse(b.createdAt) : 0;
        return (db as number) - (da as number);
      });
    case 'Recently saved': {
      // Sort by the order in the source array (most recently added first)
      const idOrder = new Map((recentSourceIds ?? []).map((id, idx) => [id, idx]));
      return [...items].sort((a, b) => {
        const ia = idOrder.get(a.id) ?? 0;
        const ib = idOrder.get(b.id) ?? 0;
        return ib - ia;
      });
    }
    case 'Default':
    default:
      return items;
  }
}

/**
 * Search + brand + price-drop filtering shared by the Saved and Wishlist
 * tabs. `priceDropsOnly` applies only on the Wishlist tab.
 */
export function filterClosetListings<
  T extends { title?: string; brand?: string | null; price: number; originalPrice?: number }
>(
  items: T[],
  options: {
    searchQuery?: string;
    activeBrand?: string | null;
    priceDropsOnly?: boolean;
  }
): T[] {
  const { searchQuery = '', activeBrand = null, priceDropsOnly = false } = options;
  let filtered = items.filter(
    (l) =>
      !searchQuery ||
      l.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.brand?.toLowerCase().includes(searchQuery.toLowerCase())
  );
  if (activeBrand) {
    filtered = filtered.filter((l) => l.brand === activeBrand);
  }
  if (priceDropsOnly) {
    filtered = filtered.filter((l) => l.originalPrice != null && l.originalPrice > l.price);
  }
  return filtered;
}

/** Name-substring filtering for the Collections and Outfits tabs. */
export function filterClosetNamed<T extends { name: string }>(
  items: T[],
  searchQuery: string
): T[] {
  return items.filter(
    (c) => !searchQuery || c.name.toLowerCase().includes(searchQuery.toLowerCase())
  );
}

/** Wishlist items currently cheaper than their original price. */
export function countClosetPriceDrops(
  items: ReadonlyArray<{ price: number; originalPrice?: number }>
): number {
  return items.filter((l) => l.originalPrice != null && l.originalPrice > l.price).length;
}

/** Closet stats — total value and savings across saved + wishlist. */
export function computeClosetStats(
  savedItems: ReadonlyArray<{ id: string; price?: number; originalPrice?: number }>,
  wishlistItems: ReadonlyArray<{ id: string; price?: number; originalPrice?: number }>,
  collectionsCount: number
): ClosetStats {
  const allItems = [...savedItems, ...wishlistItems];
  const uniqueItems = Array.from(new Map(allItems.map((l) => [l.id, l])).values());
  const totalValue = uniqueItems.reduce((sum, l) => sum + (l.price ?? 0), 0);
  const totalSavings = uniqueItems.reduce((sum, l) => {
    if (l.originalPrice != null && l.price != null && l.originalPrice > l.price) {
      return sum + (l.originalPrice - l.price);
    }
    return sum;
  }, 0);
  return {
    totalItems: uniqueItems.length,
    totalValue,
    totalSavings,
    collectionsCount,
  };
}

/** Unique non-empty brands from the active tab's items, sorted, max 12. */
export function extractClosetBrands(
  items: ReadonlyArray<{ brand?: string | null }>
): string[] {
  const brands = items
    .map((l) => l.brand)
    .filter((b): b is string => !!b && b.trim().length > 0);
  return Array.from(new Set(brands)).sort((a, b) => a.localeCompare(b)).slice(0, 12);
}

/** Map collections to board cards — first four item images as covers. */
export function buildClosetBoards(
  collections: ReadonlyArray<ClosetCollectionLike>,
  listings: ReadonlyArray<Listing>
): ClosetBoard[] {
  return collections.map((collection) => {
    const covers = collection.itemIds
      .slice(0, 4)
      .map((id) => listings.find((l) => l.id === id))
      .filter(
        (l): l is Listing => !!l && Array.isArray(l.images) && l.images.length > 0
      )
      .map((l) => l.images[0]);
    return {
      id: collection.id,
      title: collection.name,
      itemCount: collection.itemIds?.length ?? 0,
      covers,
      updatedAt: collection.updatedAt,
      isPrivate: collection.isPrivate === true,
    };
  });
}

/** Map outfits to card data — first four item images as thumbnails. */
export function buildClosetOutfitThumbs<T extends ClosetOutfitLike>(
  outfits: ReadonlyArray<T>,
  listings: ReadonlyArray<Listing>
): Array<T & { thumbs: string[] }> {
  return outfits.map((outfit) => {
    const thumbs = outfit.itemIds
      .slice(0, 4)
      .map((id) => listings.find((l) => l.id === id))
      .filter(
        (l): l is Listing => !!l && Array.isArray(l.images) && l.images.length > 0
      )
      .map((l) => l.images[0]);
    return {
      ...outfit,
      thumbs,
    };
  });
}

/** Visible label per tab — note COLLECTIONS renders as "Closets". */
export function closetTabLabel(tab: ClosetTabKey): string {
  return tab === 'SAVED'
    ? 'Saved'
    : tab === 'WISHLIST'
      ? 'Wishlist'
      : tab === 'COLLECTIONS'
        ? 'Closets'
        : 'Outfits';
}

/** Search-field placeholder per active tab. */
export function closetSearchPlaceholder(tab: ClosetTabKey): string {
  switch (tab) {
    case 'SAVED':
      return 'Search saved items';
    case 'WISHLIST':
      return 'Search wishlist';
    case 'COLLECTIONS':
      return 'Search collections';
    case 'OUTFITS':
      return 'Search outfits';
  }
}

/** Header count pill — the active tab's filtered item count. */
export function closetTabCount(
  tab: ClosetTabKey,
  filteredSaved: readonly unknown[],
  filteredWishlist: readonly unknown[],
  filteredCollections: readonly unknown[],
  filteredOutfits: readonly unknown[]
): number {
  switch (tab) {
    case 'SAVED':
      return filteredSaved.length;
    case 'WISHLIST':
      return filteredWishlist.length;
    case 'COLLECTIONS':
      return filteredCollections.length;
    case 'OUTFITS':
      return filteredOutfits.length;
  }
}
