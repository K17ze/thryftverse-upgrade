import React, {
  useState,
  useCallback,
  useEffect,
  useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  TextInput,
  ActivityIndicator,
  useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import {
  FlashList,
  ListRenderItem } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { AppIcon } from '../../../components/common/AppIcon';
import { IconGrammar } from '../../../theme/designTokens';
import { useAppTheme } from '../../../theme/ThemeContext';
import { useFormattedPrice } from '../../../hooks/useFormattedPrice';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  searchListingsFromApi,
  fetchUserListingsFromApi,
  fetchListingByIdFromApi,
  type ListingSearchResult,
  type ListingApiItem } from '../../../services/listingsApi';
import { useStore } from '../../../store/useStore';
import { createStableId } from '../../../utils/createStableId';
import { useHaptic } from '../../../hooks/useHaptic';
import type { CreatorLayer } from '../../core/projectStore/composition';
import { PickerShell, baseLayer, createStyles } from './pickerShared';

// ── Product Picker ─────────────────────────────────────────────────
// Per spec 10 (Look Architecture V3), the Add item drawer sources are:
//   My closet/listings · Saved · Marketplace search · Recently viewed
// Selecting an item adds a visual object, not a settings row.

const RECENTLY_VIEWED_KEY = '@thryftverse_recently_viewed_listings';
const MAX_RECENT = 30;

// Recently-viewed cache entry — stores just enough to reconstruct the
// listing card without a round-trip. The canonical listing ID is always
// preserved so the published look can resolve to the live listing.
interface RecentListingEntry {
  id: string;
  sellerId: string;
  title: string;
  priceGbp: number;
  imageUrl: string | null;
  createdAt: string;
}

async function getRecentListings(): Promise<RecentListingEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(RECENTLY_VIEWED_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function recordRecentListing(item: ListingSearchResult): Promise<void> {
  try {
    const existing = await getRecentListings();
    const entry: RecentListingEntry = {
      id: item.id,
      sellerId: item.sellerId,
      title: item.title,
      priceGbp: item.priceGbp,
      imageUrl: item.imageUrl,
      createdAt: item.createdAt };
    const filtered = existing.filter((e) => e.id !== entry.id);
    const next = [entry, ...filtered].slice(0, MAX_RECENT);
    await AsyncStorage.setItem(RECENTLY_VIEWED_KEY, JSON.stringify(next));
  } catch {
    // Best-effort — never block the picker.
  }
}

// Map a full ListingApiItem (from user listings / fetch-by-id) to the
// ListingSearchResult shape the picker renders.
function listingApiItemToSearchResult(item: ListingApiItem): ListingSearchResult {
  return {
    id: item.id,
    sellerId: item.sellerId,
    title: item.title,
    description: item.description,
    priceGbp: item.priceGbp,
    imageUrl: item.imageUrl,
    rank: 0,
    createdAt: item.createdAt,
    seller: item.seller ?? null,
    brand: item.brand,
    size: item.size,
    condition: item.condition,
    category: item.category };
}

type ProductSourceTab = 'closet' | 'saved' | 'search' | 'recent';

export const ProductPicker = React.memo(function ProductPicker({ onClose, onAddLayer }: { onClose: () => void; onAddLayer: (layer: CreatorLayer) => void }) {
  const { colors } = useAppTheme();
  const { currencySymbol } = useFormattedPrice();
  const haptic = useHaptic();
  const { width: screenWidth } = useWindowDimensions();
  const styles = React.useMemo(() => createStyles(colors, screenWidth), [colors, screenWidth]);
  const currentUserId = useStore((state) => state.currentUser?.id);
  const savedProductIds = useStore((state) => state.savedProducts);
  const wishlistIds = useStore((state) => state.wishlist);

  const [activeTab, setActiveTab] = useState<ProductSourceTab>('search');

  // ── Search state (Marketplace search) ──────────────────────────────
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ListingSearchResult[]>([]);
  const [isSearchLoading, setIsSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const searchReqIdRef = useRef(0);
  const searchMountedRef = useRef(true);

  // ── Closet state (My closet/listings) ──────────────────────────────
  const [closetResults, setClosetResults] = useState<ListingSearchResult[]>([]);
  const [isClosetLoading, setIsClosetLoading] = useState(false);
  const [closetError, setClosetError] = useState<string | null>(null);
  const closetLoadedRef = useRef(false);

  // ── Saved state (Saved = savedProducts + wishlist) ─────────────────
  const [savedResults, setSavedResults] = useState<ListingSearchResult[]>([]);
  const [isSavedLoading, setIsSavedLoading] = useState(false);
  const [savedError, setSavedError] = useState<string | null>(null);
  const savedLoadedRef = useRef(false);

  // ── Recent state (Recently viewed) ─────────────────────────────────
  const [recentResults, setRecentResults] = useState<ListingSearchResult[]>([]);
  const [isRecentLoading, setIsRecentLoading] = useState(false);
  const recentLoadedRef = useRef(false);

  useEffect(() => {
    searchMountedRef.current = true;
    return () => { searchMountedRef.current = false; };
  }, []);

  // ── Search effect (debounced) ──────────────────────────────────────
  const doSearch = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (trimmed.length < 2) {
      setSearchResults([]);
      setHasSearched(false);
      setSearchError(null);
      setIsSearchLoading(false);
      return;
    }
    const reqId = ++searchReqIdRef.current;
    setIsSearchLoading(true);
    setSearchError(null);
    try {
      const res = await searchListingsFromApi(trimmed, 50);
      if (reqId !== searchReqIdRef.current || !searchMountedRef.current) return;
      setSearchResults(res.items);
      setHasSearched(true);
    } catch (err) {
      if (reqId !== searchReqIdRef.current || !searchMountedRef.current) return;
      setSearchError((err as Error).message || 'Search failed');
      setSearchResults([]);
      setHasSearched(true);
    } finally {
      if (reqId === searchReqIdRef.current && searchMountedRef.current) setIsSearchLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => doSearch(query), 350);
    return () => clearTimeout(timer);
  }, [query, doSearch]);

  // ── Closet: load user's own listings when tab is first opened ──────
  useEffect(() => {
    if (activeTab !== 'closet' || closetLoadedRef.current || !currentUserId) return;
    closetLoadedRef.current = true;
    let cancelled = false;
    setIsClosetLoading(true);
    setClosetError(null);
    fetchUserListingsFromApi(currentUserId, { status: 'active', limit: 50 })
      .then((res) => {
        if (cancelled) return;
        setClosetResults(res.items.map(listingApiItemToSearchResult));
      })
      .catch((err) => {
        if (cancelled) return;
        setClosetError((err as Error).message || 'Could not load your listings');
        setClosetResults([]);
      })
      .finally(() => {
        if (!cancelled) setIsClosetLoading(false);
      });
    return () => { cancelled = true; };
  }, [activeTab, currentUserId]);

  // ── Saved: load saved + wishlisted listings by ID ──────────────────
  useEffect(() => {
    if (activeTab !== 'saved' || savedLoadedRef.current) return;
    savedLoadedRef.current = true;
    const ids = Array.from(new Set([...savedProductIds, ...wishlistIds]));
    if (ids.length === 0) {
      setSavedResults([]);
      return;
    }
    let cancelled = false;
    setIsSavedLoading(true);
    setSavedError(null);
    // Fetch each listing by ID. The store only retains IDs, so we
    // resolve them individually. Failures for individual IDs are
    // silently skipped — partial results are better than blocking.
    Promise.all(
      ids.slice(0, 50).map((id) =>
        fetchListingByIdFromApi(id)
          .then((res) => (res.ok && res.listing ? listingApiItemToSearchResult(res.listing) : null))
          .catch(() => null)
      )
    )
      .then((items) => {
        if (cancelled) return;
        setSavedResults(items.filter((x): x is ListingSearchResult => x !== null));
      })
      .catch((err) => {
        if (cancelled) return;
        setSavedError((err as Error).message || 'Could not load saved items');
        setSavedResults([]);
      })
      .finally(() => {
        if (!cancelled) setIsSavedLoading(false);
      });
    return () => { cancelled = true; };
  }, [activeTab, savedProductIds, wishlistIds]);

  // ── Recent: load recently viewed listings from AsyncStorage ────────
  useEffect(() => {
    if (activeTab !== 'recent' || recentLoadedRef.current) return;
    recentLoadedRef.current = true;
    let cancelled = false;
    setIsRecentLoading(true);
    getRecentListings()
      .then((entries) => {
        if (cancelled) return;
        // Map RecentListingEntry to ListingSearchResult shape
        setRecentResults(
          entries.map((e) => ({
            id: e.id,
            sellerId: e.sellerId,
            title: e.title,
            description: '',
            priceGbp: e.priceGbp,
            imageUrl: e.imageUrl,
            rank: 0,
            createdAt: e.createdAt,
            seller: null }))
        );
      })
      .catch(() => {
        if (!cancelled) setRecentResults([]);
      })
      .finally(() => {
        if (!cancelled) setIsRecentLoading(false);
      });
    return () => { cancelled = true; };
  }, [activeTab]);

  const handleSelect = useCallback((item: ListingSearchResult) => {
    haptic.selection();
    // Record in recently viewed for future "Recent" tab population
    recordRecentListing(item);
    onAddLayer({
      ...baseLayer(createStableId('product'), 10),
      type: 'product',
      width: 0.2,
      height: 0.1,
      payload: {
        listingId: item.id,
        snapshotTitle: item.title,
        snapshotImageUrl: item.imageUrl ?? undefined,
        snapshotPriceGbp: item.priceGbp,
        availability: 'active' } });
    onClose();
  }, [onAddLayer, onClose, haptic]);

  // ── Active tab data ────────────────────────────────────────────────
  const activeResults = activeTab === 'search'
    ? searchResults
    : activeTab === 'closet'
      ? closetResults
      : activeTab === 'saved'
        ? savedResults
        : recentResults;
  const activeLoading = activeTab === 'search'
    ? isSearchLoading
    : activeTab === 'closet'
      ? isClosetLoading
      : activeTab === 'saved'
        ? isSavedLoading
        : isRecentLoading;
  const activeError = activeTab === 'search'
    ? searchError
    : activeTab === 'closet'
      ? closetError
      : activeTab === 'saved'
        ? savedError
        : null;

  const handleRetry = useCallback(() => {
    if (activeTab === 'search') {
      doSearch(query);
    } else if (activeTab === 'closet') {
      closetLoadedRef.current = false;
      // Re-trigger by toggling state — force re-load
      setActiveTab('search');
      setTimeout(() => setActiveTab('closet'), 0);
    } else if (activeTab === 'saved') {
      savedLoadedRef.current = false;
      setActiveTab('search');
      setTimeout(() => setActiveTab('saved'), 0);
    }
  }, [activeTab, doSearch, query]);

  const renderProductItem = useCallback<ListRenderItem<ListingSearchResult>>(({ item }) => (
    <Pressable onPress={() => handleSelect(item)} style={styles.resultRow} accessibilityLabel={`Select ${item.title}`}
    accessibilityHint="Adds this listing to the canvas" accessibilityRole="button" hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
      <View style={styles.resultThumb}>
        {item.imageUrl ? <Image source={{ uri: item.imageUrl }} style={styles.resultThumbImg} /> : <AppIcon name="bag-handle-outline" size={IconGrammar.metadata} color="textSecondary" opticalCenter={true} accessible={false} />}
      </View>
      <View style={styles.resultInfo}>
        <Text style={styles.resultName} numberOfLines={1}>{item.title}</Text>
        <Text style={styles.resultPrice}>{currencySymbol}{item.priceGbp.toFixed(0)}</Text>
      </View>
    </Pressable>
  ), [handleSelect, styles, currencySymbol]);

  const tabs: Array<{ key: ProductSourceTab; label: string }> = [
    { key: 'search', label: 'Search' },
    { key: 'closet', label: 'My Closet' },
    { key: 'saved', label: 'Saved' },
    { key: 'recent', label: 'Recent' },
  ];

  return (
    <PickerShell title="Add Item" onClose={onClose} compact>
      {/* ── Source tabs ─────────────────────────────────────────────── */}
      <View style={styles.productTabBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.productTabBarContent}>
          {tabs.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <Pressable
                key={tab.key}
                onPress={() => { haptic.light(); setActiveTab(tab.key); }}
                style={styles.productTab}
                accessibilityLabel={tab.label}
                accessibilityHint="Shows this product tab"
                accessibilityRole="tab"
                accessibilityState={{ selected: isActive }}
              >
                <Text style={[styles.productTabLabel, { color: isActive ? colors.textPrimary : colors.textSecondary }]}>{tab.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* ── Search input (only visible on Search tab) ───────────────── */}
      {activeTab === 'search' && (
        <View style={styles.searchRow}>
          <Ionicons name="search" size={IconGrammar.metadata} color={colors.textMuted} style={styles.searchIcon} aria-hidden={true} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search listings..."
            placeholderTextColor={colors.textMuted}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            accessibilityLabel="Search listings"
            accessibilityHint="Type to search listings"
          />
          {isSearchLoading && <ActivityIndicator size="small" color={colors.brand} />}
        </View>
      )}

      {/* ── Results / states ────────────────────────────────────────── */}
      {activeError ? (
        <View style={styles.errorBody}>
          <Text style={styles.errorText}>Couldn't load items</Text>
          <Pressable onPress={handleRetry} style={styles.retryBtn} accessibilityLabel="Retry"
          accessibilityHint="Retries loading listings" accessibilityRole="button" hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </Pressable>
        </View>
      ) : activeLoading ? (
        <View style={styles.loadingBody}>
          <ActivityIndicator size="large" color={colors.brand} />
        </View>
      ) : (
        <FlashList
          data={activeResults}
          keyExtractor={(item) => item.id}
          renderItem={renderProductItem}
          style={styles.resultList}
          keyboardShouldPersistTaps="handled"
          drawDistance={250}
          ListEmptyComponent={
            activeTab === 'search'
              ? hasSearched && !isSearchLoading
                ? <View style={styles.emptyState}><Text style={styles.emptyText}>No listings found</Text></View>
                : null
              : !activeLoading
                ? <View style={styles.emptyState}>
                    <Text style={styles.emptyText}>
                      {activeTab === 'closet'
                        ? 'No active listings in your closet'
                        : activeTab === 'saved'
                          ? 'No saved items yet'
                          : 'No recently viewed items'}
                    </Text>
                  </View>
                : null
          }
        />
      )}
    </PickerShell>
  );
});
