import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../../store/useStore';
import { useBackendData } from '../../context/BackendDataContext';
import { fetchSavedList } from '../../services/savedListsApi';
import type { Listing } from '../../domain';
import {
  sortClosetItems,
  filterClosetListings,
  filterClosetNamed,
  countClosetPriceDrops,
  computeClosetStats,
  extractClosetBrands,
  buildClosetBoards,
  buildClosetOutfitThumbs,
  closetSearchPlaceholder,
  closetTabCount,
  type ClosetTabKey,
  type ClosetSortOption,
} from '../../domain/closet';

interface UseClosetDataParams {
  activeTab: ClosetTabKey;
  searchQuery: string;
  sortBy: ClosetSortOption;
  showPriceDropsOnly: boolean;
  activeBrand: string | null;
}

/**
 * Owns the closet data lifecycle: store subscriptions (saved, wishlist,
 * collections, outfits), the backend listing snapshot, the collections
 * sync effect with its error/loading state, pull-to-refresh (listings +
 * collections, with the 350ms refresh-indicator settle), and every
 * derived projection (filtered sets, stats, brands, boards, outfit cards,
 * tab count, search placeholder).
 */
export function useClosetData({
  activeTab,
  searchQuery,
  sortBy,
  showPriceDropsOnly,
  activeBrand,
}: UseClosetDataParams) {
  const wishlistIds = useStore((state) => state.wishlist);
  const savedProductIds = useStore((state) => state.savedProducts);
  const collections = useStore((state) => state.collections);
  const outfits = useStore((state) => state.outfits);
  const loadCollectionsFromApi = useStore((state) => state.loadCollectionsFromApi);
  const { listings, refreshListings, isSyncing, lastError } = useBackendData();

  const [collectionsSyncError, setCollectionsSyncError] = useState(false);
  const [collectionsLoading, setCollectionsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Server-hydrated saved/wishlist items — the saved tabs render these rather
  // than intersecting ids with the paginated feed snapshot (which made any
  // saved listing not in a loaded page invisible).
  const [hydratedSavedItems, setHydratedSavedItems] = useState<Listing[]>([]);
  const [hydratedWishlistItems, setHydratedWishlistItems] = useState<Listing[]>([]);

  const loadSavedLists = useCallback(async () => {
    const [wishlistRes, savedRes] = await Promise.all([
      fetchSavedList('wishlist'),
      fetchSavedList('saved'),
    ]);
    setHydratedWishlistItems(wishlistRes.items);
    setHydratedSavedItems(savedRes.items);
    // Keep the id lists (heart/bookmark state) in sync with the server.
    useStore.setState({
      wishlist: wishlistRes.itemIds,
      savedProducts: savedRes.itemIds,
    });
  }, []);

  useEffect(() => {
    let mounted = true;
    setCollectionsLoading(true);
    void loadCollectionsFromApi()
      .then(() => { if (mounted) { setCollectionsSyncError(false); setCollectionsLoading(false); } })
      .catch(() => { if (mounted) { setCollectionsSyncError(true); setCollectionsLoading(false); } });
    void loadSavedLists().catch(() => undefined);
    return () => {
      mounted = false;
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
    };
  }, [loadCollectionsFromApi, loadSavedLists]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([refreshListings(), loadCollectionsFromApi(), loadSavedLists()]);
      setCollectionsSyncError(false);
    } catch {
      setCollectionsSyncError(true);
    } finally {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = setTimeout(() => {
        refreshTimerRef.current = null;
        setRefreshing(false);
      }, 350);
    }
  }, [refreshListings, loadCollectionsFromApi, loadSavedLists]);

  // Hydrated items filtered by the live id lists (so removes reflect
  // instantly) plus any feed-resident listing for a just-added id the
  // hydrate predates.
  const savedItems = useMemo(() => {
    const ids = new Set(savedProductIds ?? []);
    const hydratedIds = new Set(hydratedSavedItems.map((l) => l.id));
    return [
      ...hydratedSavedItems.filter((l) => ids.has(l.id)),
      ...listings.filter((l) => ids.has(l.id) && !hydratedIds.has(l.id)),
    ];
  }, [hydratedSavedItems, listings, savedProductIds]);

  const wishlistItems = useMemo(() => {
    const ids = new Set(wishlistIds ?? []);
    const hydratedIds = new Set(hydratedWishlistItems.map((l) => l.id));
    return [
      ...hydratedWishlistItems.filter((l) => ids.has(l.id)),
      ...listings.filter((l) => ids.has(l.id) && !hydratedIds.has(l.id)),
    ];
  }, [hydratedWishlistItems, listings, wishlistIds]);

  const sortItems = useCallback(
    (items: Listing[]) =>
      sortClosetItems(
        items,
        sortBy,
        activeTab === 'WISHLIST' ? wishlistIds : savedProductIds
      ),
    [sortBy, activeTab, wishlistIds, savedProductIds]
  );

  const filteredSaved = useMemo(
    () =>
      sortItems(filterClosetListings(savedItems, { searchQuery, activeBrand })),
    [savedItems, searchQuery, sortItems, activeBrand]
  );

  const filteredWishlist = useMemo(
    () =>
      sortItems(
        filterClosetListings(wishlistItems, {
          searchQuery,
          activeBrand,
          priceDropsOnly: showPriceDropsOnly,
        })
      ),
    [wishlistItems, searchQuery, sortItems, showPriceDropsOnly, activeBrand]
  );

  const filteredCollections = useMemo(
    () => filterClosetNamed(collections, searchQuery),
    [collections, searchQuery]
  );

  const filteredOutfits = useMemo(
    () => filterClosetNamed(outfits, searchQuery),
    [outfits, searchQuery]
  );

  const priceDropCount = useMemo(
    () => countClosetPriceDrops(wishlistItems),
    [wishlistItems]
  );

  // Closet stats — total value and savings across saved + wishlist
  const closetStats = useMemo(
    () => computeClosetStats(savedItems, wishlistItems, collections.length),
    [savedItems, wishlistItems, collections]
  );

  // Brand filter — extract unique brands from the active tab's items
  const availableBrands = useMemo(
    () =>
      extractClosetBrands(activeTab === 'WISHLIST' ? wishlistItems : savedItems),
    [activeTab, savedItems, wishlistItems]
  );

  const collectionBoards = useMemo(
    () => buildClosetBoards(filteredCollections, listings),
    [filteredCollections, listings]
  );

  const outfitCards = useMemo(
    () => buildClosetOutfitThumbs(filteredOutfits, listings),
    [filteredOutfits, listings]
  );

  const tabCount = useMemo(
    () =>
      closetTabCount(
        activeTab,
        filteredSaved,
        filteredWishlist,
        filteredCollections,
        filteredOutfits
      ),
    [activeTab, filteredSaved, filteredWishlist, filteredCollections, filteredOutfits]
  );

  const searchPlaceholder = useMemo(
    () => closetSearchPlaceholder(activeTab),
    [activeTab]
  );

  return {
    // raw sources
    listings,
    collections,
    outfits,
    savedItems,
    wishlistItems,
    // backend/sync state
    isSyncing,
    lastError,
    refreshing,
    collectionsLoading,
    collectionsSyncError,
    // derived projections
    filteredSaved,
    filteredWishlist,
    filteredCollections,
    collectionBoards,
    outfitCards,
    priceDropCount,
    closetStats,
    availableBrands,
    tabCount,
    searchPlaceholder,
    // actions
    handleRefresh,
  };
}
