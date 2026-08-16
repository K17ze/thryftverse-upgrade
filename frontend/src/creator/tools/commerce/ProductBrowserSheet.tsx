/**
 * ProductBrowserSheet — extracted commerce product browser.
 *
 * A bottom sheet for browsing and selecting products to add to a composition.
 * Supports four source tabs: Closet (user's own listings), My Listings,
 * Saved (wishlist + saved products), and Discover/Search.
 *
 * Per spec 06_LOOK_RECONSTRUCTION: the product browser is the canonical
 * entry point for adding product-tag layers to a composition.
 */
import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Space, Radius, Type, Typography } from '../../../theme/designTokens';
import { useAppTheme, type ThemeColors } from '../../../theme/ThemeContext';
import { KeyboardAwareScrollView } from '../../../platform/keyboard/KeyboardProvider';
import {
  searchListingsFromApi,
  fetchUserListingsFromApi,
  fetchListingByIdFromApi,
  type ListingSearchResult,
  type ListingApiItem,
} from '../../../services/listingsApi';
import { useStore } from '../../../store/useStore';
import { createStableId } from '../../../utils/createStableId';
import { SheetContainer, PressScale } from '../../CreatorAnimations';
import { useHaptic } from '../../../hooks/useHaptic';

// ── Types ──────────────────────────────────────────────────────────

/**
 * A resolved product reference ready for composition layer creation.
 */
export interface ProductRef {
  id: string;
  listingId: string;
  title: string;
  priceGbp: number;
  imageUri: string;
  brand?: string;
  size?: string;
}

/**
 * Source tabs for the product browser.
 * - `closet`    — user's own active listings
 * - `listings`  — alias for closet (user's listings)
 * - `saved`     — wishlist + saved products
 * - `discover`  — search the marketplace
 */
export type ProductSource = 'closet' | 'listings' | 'saved' | 'discover';

export interface ProductBrowserSheetProps {
  visible: boolean;
  onClose: () => void;
  onProductSelect: (product: ProductRef) => void;
  /** Restrict visible source tabs. Default: all four. */
  sources?: ProductSource[];
}

// ── Internal types ─────────────────────────────────────────────────

type TabKey = ProductSource;

interface RecentListingEntry {
  id: string;
  sellerId: string;
  title: string;
  priceGbp: number;
  imageUrl: string | null;
  createdAt: string;
}

// ── Constants ──────────────────────────────────────────────────────

const RECENTLY_VIEWED_KEY = '@thryftverse_recently_viewed_listings';
const MAX_RECENT = 30;

const ALL_TABS: Array<{ key: TabKey; label: string; icon: React.ComponentProps<typeof Ionicons>['name'] }> = [
  { key: 'discover', label: 'Discover', icon: 'search-outline' },
  { key: 'closet', label: 'Closet', icon: 'shirt-outline' },
  { key: 'listings', label: 'My Listings', icon: 'pricetag-outline' },
  { key: 'saved', label: 'Saved', icon: 'bookmark-outline' },
];

// ── Helpers ────────────────────────────────────────────────────────

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
      createdAt: item.createdAt,
    };
    const filtered = existing.filter((e) => e.id !== entry.id);
    const next = [entry, ...filtered].slice(0, MAX_RECENT);
    await AsyncStorage.setItem(RECENTLY_VIEWED_KEY, JSON.stringify(next));
  } catch {
    // Best-effort — never block the picker.
  }
}

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
    category: item.category,
  };
}

function listingToProductRef(item: ListingSearchResult): ProductRef {
  return {
    id: item.id,
    listingId: item.id,
    title: item.title,
    priceGbp: item.priceGbp,
    imageUri: item.imageUrl ?? '',
    brand: item.brand ?? undefined,
    size: item.size ?? undefined,
  };
}

// ── Component ──────────────────────────────────────────────────────

export function ProductBrowserSheet({
  visible,
  onClose,
  onProductSelect,
  sources,
}: ProductBrowserSheetProps) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const currentUserId = useStore((state) => state.currentUser?.id);
  const savedProductIds = useStore((state) => state.savedProducts);
  const wishlistIds = useStore((state) => state.wishlist);

  const visibleTabs = useMemo(
    () => (sources ? ALL_TABS.filter((t) => sources.includes(t.key)) : ALL_TABS),
    [sources],
  );
  const defaultTab = visibleTabs[0]?.key ?? 'discover';

  const [activeTab, setActiveTab] = useState<TabKey>(defaultTab);

  // Reset to default tab when the sheet opens
  useEffect(() => {
    if (visible) setActiveTab(defaultTab);
  }, [visible, defaultTab]);

  // ── Discover/Search state ──────────────────────────────────────────
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ListingSearchResult[]>([]);
  const [isSearchLoading, setIsSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const searchReqIdRef = useRef(0);
  const searchMountedRef = useRef(true);

  // ── Closet / My Listings state ─────────────────────────────────────
  const [closetResults, setClosetResults] = useState<ListingSearchResult[]>([]);
  const [isClosetLoading, setIsClosetLoading] = useState(false);
  const [closetError, setClosetError] = useState<string | null>(null);
  const closetLoadedRef = useRef(false);

  // ── Saved state ────────────────────────────────────────────────────
  const [savedResults, setSavedResults] = useState<ListingSearchResult[]>([]);
  const [isSavedLoading, setIsSavedLoading] = useState(false);
  const [savedError, setSavedError] = useState<string | null>(null);
  const savedLoadedRef = useRef(false);

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
    if (activeTab !== 'discover') return;
    const timer = setTimeout(() => doSearch(query), 350);
    return () => clearTimeout(timer);
  }, [query, doSearch, activeTab]);

  // ── Closet / My Listings: load user's own listings ─────────────────
  useEffect(() => {
    if ((activeTab !== 'closet' && activeTab !== 'listings') || closetLoadedRef.current || !currentUserId) return;
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
    Promise.all(
      ids.slice(0, 50).map((id) =>
        fetchListingByIdFromApi(id)
          .then((res) => (res.ok && res.listing ? listingApiItemToSearchResult(res.listing) : null))
          .catch(() => null),
      ),
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

  // ── Selection ──────────────────────────────────────────────────────
  const handleSelect = useCallback(
    (item: ListingSearchResult) => {
      haptic.selection();
      recordRecentListing(item);
      onProductSelect(listingToProductRef(item));
      onClose();
    },
    [onProductSelect, onClose, haptic],
  );

  const handleRetry = useCallback(() => {
    if (activeTab === 'discover') {
      doSearch(query);
    } else if (activeTab === 'closet' || activeTab === 'listings') {
      closetLoadedRef.current = false;
      const prev = activeTab;
      setActiveTab('discover');
      setTimeout(() => setActiveTab(prev), 0);
    } else if (activeTab === 'saved') {
      savedLoadedRef.current = false;
      setActiveTab('discover');
      setTimeout(() => setActiveTab('saved'), 0);
    }
  }, [activeTab, doSearch, query]);

  // ── Active tab data ────────────────────────────────────────────────
  const activeResults =
    activeTab === 'discover'
      ? searchResults
      : activeTab === 'closet' || activeTab === 'listings'
        ? closetResults
        : savedResults;

  const activeLoading =
    activeTab === 'discover'
      ? isSearchLoading
      : activeTab === 'closet' || activeTab === 'listings'
        ? isClosetLoading
        : isSavedLoading;

  const activeError =
    activeTab === 'discover'
      ? searchError
      : activeTab === 'closet' || activeTab === 'listings'
        ? closetError
        : savedError;

  if (!visible) return null;

  return (
    <SheetContainer visible={true} onClose={onClose} maxHeight={0.85}>
      <KeyboardAwareScrollView
        contentContainerStyle={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        style={{ maxHeight: '100%' }}
      >
        {/* ── Header ──────────────────────────────────────────────── */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Add Item</Text>
          <PressScale
            onPress={onClose}
            style={styles.closeBtn}
            accessibilityLabel="Close product browser"
            accessibilityHint="Closes the product browser sheet"
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="close" size={22} color={colors.textSecondary} />
          </PressScale>
        </View>

        {/* ── Source tabs ─────────────────────────────────────────── */}
        <View style={styles.tabBar}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabBarContent}>
            {visibleTabs.map((tab) => {
              const isActive = activeTab === tab.key;
              return (
                <Pressable
                  key={tab.key}
                  onPress={() => { haptic.light(); setActiveTab(tab.key); }}
                  style={[styles.tab, isActive && styles.tabActive]}
                  accessibilityLabel={tab.label}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: isActive }}
                >
                  <Ionicons name={tab.icon} size={16} color={isActive ? colors.brand : colors.textSecondary} />
                  <Text style={[styles.tabLabel, { color: isActive ? colors.brand : colors.textSecondary }]}>
                    {tab.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {/* ── Search input (Discover tab only) ────────────────────── */}
        {activeTab === 'discover' && (
          <View style={styles.searchRow}>
            <Ionicons name="search" size={18} color={colors.textMuted} style={styles.searchIcon} />
            <TextInput
              style={[styles.searchInput, { color: colors.textPrimary, borderColor: colors.border }]}
              placeholder="Search listings..."
              placeholderTextColor={colors.textMuted}
              value={query}
              onChangeText={setQuery}
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
              accessibilityLabel="Search listings"
            />
            {isSearchLoading && <ActivityIndicator size="small" color={colors.brand} />}
          </View>
        )}

        {/* ── Results / states ────────────────────────────────────── */}
        {activeError ? (
          <View style={styles.errorBody}>
            <Text style={[styles.errorText, { color: colors.textMuted }]}>Couldn't load items</Text>
            <Pressable
              onPress={handleRetry}
              style={[styles.retryBtn, { borderColor: colors.border }]}
              accessibilityLabel="Retry"
              accessibilityRole="button"
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Text style={[styles.retryBtnText, { color: colors.brand }]}>Retry</Text>
            </Pressable>
          </View>
        ) : activeLoading ? (
          <View style={styles.loadingBody}>
            <ActivityIndicator size="large" color={colors.brand} />
          </View>
        ) : (
          <FlatList
            data={activeResults}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => handleSelect(item)}
                style={[styles.resultRow, { borderBottomColor: colors.border }]}
                accessibilityLabel={`Select ${item.title}`}
                accessibilityRole="button"
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <View style={[styles.resultThumb, { backgroundColor: colors.surfaceAlt }]}>
                  {item.imageUrl ? (
                    <Image source={{ uri: item.imageUrl }} style={styles.resultThumbImg} contentFit="cover" />
                  ) : (
                    <Ionicons name="pricetag" size={16} color={colors.textSecondary} />
                  )}
                </View>
                <View style={styles.resultInfo}>
                  <Text style={[styles.resultName, { color: colors.textPrimary }]} numberOfLines={1}>
                    {item.title}
                  </Text>
                  {item.brand && (
                    <Text style={[styles.resultSubtext, { color: colors.textMuted }]} numberOfLines={1}>
                      {item.brand}
                    </Text>
                  )}
                  <Text style={[styles.resultPrice, { color: colors.brand }]}>
                    £{item.priceGbp.toFixed(0)}
                  </Text>
                </View>
              </Pressable>
            )}
            style={styles.resultList}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              activeTab === 'discover' ? (
                hasSearched && !isSearchLoading ? (
                  <View style={styles.emptyState}>
                    <Text style={[styles.emptyText, { color: colors.textMuted }]}>No listings found</Text>
                  </View>
                ) : null
              ) : (
                <View style={styles.emptyState}>
                  <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                    {activeTab === 'closet' || activeTab === 'listings'
                      ? 'No listings yet'
                      : 'No saved items'}
                  </Text>
                </View>
              )
            }
          />
        )}
      </KeyboardAwareScrollView>
    </SheetContainer>
  );
}

// ── Styles ─────────────────────────────────────────────────────────

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
    },
    title: {
      fontFamily: Typography.family.semibold,
      fontSize: Type.subtitle.size,
    },
    closeBtn: {
      width: 44,
      height: 44,
      justifyContent: 'center',
      alignItems: 'center',
      borderRadius: Radius.sm,
    },
    // ── Tab bar ──
    tabBar: {
      flexDirection: 'row',
      paddingHorizontal: Space.md,
      paddingVertical: Space.xs,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    tabBarContent: {
      gap: Space.xs,
      paddingVertical: Space.xs,
    },
    tab: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingVertical: Space.sm - 2,
      paddingHorizontal: Space.md,
      borderRadius: Radius.full,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'transparent',
    },
    tabActive: {
      borderColor: colors.brand,
      backgroundColor: colors.brand + '14',
    },
    tabLabel: {
      fontFamily: Typography.family.medium,
      fontSize: Type.captionElevated.size,
    },
    // ── Search ──
    searchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
      gap: Space.sm,
    },
    searchIcon: {},
    searchInput: {
      flex: 1,
      borderWidth: 1,
      borderRadius: Radius.md,
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
      fontSize: Type.body.size,
    },
    // ── Results ──
    resultList: {
      paddingHorizontal: Space.md,
      paddingBottom: Space.xl,
    },
    resultRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      paddingVertical: Space.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    resultThumb: {
      width: 48,
      height: 48,
      borderRadius: Radius.sm,
      justifyContent: 'center',
      alignItems: 'center',
      overflow: 'hidden',
    },
    resultThumbImg: {
      width: '100%',
      height: '100%',
    },
    resultInfo: {
      flex: 1,
      gap: 2,
    },
    resultName: {
      fontFamily: Typography.family.medium,
      fontSize: Type.body.size,
    },
    resultSubtext: {
      fontFamily: Typography.family.regular,
      fontSize: Type.caption.size,
    },
    resultPrice: {
      fontFamily: Typography.family.bold,
      fontSize: Type.caption.size,
    },
    // ── States ──
    loadingBody: {
      paddingVertical: Space.xl,
      alignItems: 'center',
    },
    emptyState: {
      paddingVertical: Space.xl,
      alignItems: 'center',
    },
    emptyText: {
      fontFamily: Typography.family.medium,
      fontSize: Type.body.size,
    },
    errorBody: {
      paddingVertical: Space.xl,
      alignItems: 'center',
      gap: Space.sm,
    },
    errorText: {
      fontFamily: Typography.family.medium,
      fontSize: Type.body.size,
    },
    retryBtn: {
      paddingHorizontal: Space.lg,
      paddingVertical: Space.sm,
      borderRadius: Radius.md,
      borderWidth: StyleSheet.hairlineWidth,
    },
    retryBtnText: {
      fontFamily: Typography.family.semibold,
      fontSize: Type.body.size,
    },
  });
}
