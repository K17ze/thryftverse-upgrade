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
  type DimensionValue } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  useReducedMotion } from 'react-native-reanimated';
import { Space, Radius, Typography, FontFamily, Control } from '../../../theme/designTokens';
import { TypographyV2 } from '../../../theme/typography.v2';
import { IconGrammar } from '../../../theme/designTokens';
import { Motion } from '../../../theme/motionTokens';
import { useAppTheme, type ThemeColors } from '../../../theme/ThemeContext';
import { useFormattedPrice } from '../../../hooks/useFormattedPrice';
import { KeyboardAwareScrollView } from '../../../platform/keyboard/KeyboardProvider';
import {
  searchListingsFromApi,
  fetchUserListingsFromApi,
  fetchListingByIdFromApi,
  type ListingSearchResult,
  type ListingApiItem } from '../../../services/listingsApi';
import { useStore } from '../../../store/useStore';
import { createStableId } from '../../../utils/createStableId';
import { SheetContainer, PressScale } from '../../CreatorAnimations';
import { useHaptic } from '../../../hooks/useHaptic';
import { AppIcon } from '../../../components/common/AppIcon';
import { IconSize } from '../../../theme/iconTokens';

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
  { key: 'listings', label: 'Listings', icon: 'bag-handle-outline' },
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
      createdAt: item.createdAt };
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
    category: item.category };
}

function listingToProductRef(item: ListingSearchResult): ProductRef {
  return {
    id: item.id,
    listingId: item.id,
    title: item.title,
    priceGbp: item.priceGbp,
    imageUri: item.imageUrl ?? '',
    brand: item.brand ?? undefined,
    size: item.size ?? undefined };
}

// ── SkeletonBlock — one-time shimmer sweep (AGENTS.md §14, §17) ──────
function SkeletonBlock({ width, height, radius }: { width: DimensionValue; height: number; radius?: number }) {
  const { colors } = useAppTheme();
  const reduceMotion = useReducedMotion();
  const shimmerSV = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) return;
    shimmerSV.value = 0;
    shimmerSV.value = withTiming(1, { duration: Motion.duration.crawl });
  }, [reduceMotion, shimmerSV]);

  const style = useAnimatedStyle(() => ({
    backgroundColor: colors.surfaceAlt,
    opacity: 0.5 + 0.3 * shimmerSV.value }));

  return (
    <Reanimated.View style={[{ width, height, borderRadius: radius ?? Radius.sm }, style]} />
  );
}

// ── ProductTileSkeleton — matches a single product row (64pt, thumb + text + price) ──
function ProductTileSkeleton() {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: Space.sm, height: 64, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'transparent' }}>
      <SkeletonBlock width={48} height={48} radius={Radius.md} />
      <View style={{ flex: 1, gap: Space.xs }}>
        <SkeletonBlock width={'70%'} height={TypographyV2.body.size + 2} radius={Radius.sm} />
        <SkeletonBlock width={40} height={TypographyV2.captionElevated.size + 2} radius={Radius.sm} />
      </View>
      <SkeletonBlock width={20} height={20} radius={Radius.full} />
    </View>
  );
}

// ── SearchLoadingSkeleton — 3 product tile skeletons in a row (inline) ──
function SearchLoadingSkeleton() {
  return (
    <View style={{ paddingVertical: Space.sm, gap: 0 }}>
      {[0, 1, 2].map((i) => (
        <ProductTileSkeleton key={i} />
      ))}
    </View>
  );
}

// ── ProductCardSkeleton — matches a single media-first grid card ──
function ProductCardSkeleton() {
  return (
    <View style={{ flex: 1, paddingHorizontal: Space.xs, paddingVertical: Space.sm }}>
      <SkeletonBlock width={'100%'} height={120} radius={Radius.md} />
      <View style={{ gap: Space.xxs, marginTop: Space.xs }}>
        <SkeletonBlock width={'80%'} height={TypographyV2.captionElevated.size + 2} radius={Radius.sm} />
        <SkeletonBlock width={40} height={TypographyV2.captionElevated.size + 2} radius={Radius.sm} />
      </View>
    </View>
  );
}

// ── ProductGridSkeleton — 2-column media-first card grid (loading state) ──
function ProductGridSkeleton() {
  return (
    <View style={{ paddingHorizontal: Space.md, paddingVertical: Space.sm }}>
      {[0, 1, 2].map((i) => (
        <View key={i} style={{ flexDirection: 'row', gap: Space.sm }}>
          <ProductCardSkeleton />
          <ProductCardSkeleton />
        </View>
      ))}
    </View>
  );
}

// ── Component ──────────────────────────────────────────────────────

export function ProductBrowserSheet({
  visible,
  onClose,
  onProductSelect,
  sources }: ProductBrowserSheetProps) {
  const { colors } = useAppTheme();
  const { currencySymbol } = useFormattedPrice();
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
  const [selectedProduct, setSelectedProduct] = useState<ListingSearchResult | null>(null);

  // Reset to default tab when the sheet opens
  useEffect(() => {
    if (visible) {
      setActiveTab(defaultTab);
      setSelectedProduct(null);
    }
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
      setSelectedProduct(item);
    },
    [haptic],
  );

  const handleDone = useCallback(() => {
    if (!selectedProduct) return;
    haptic.medium();
    onProductSelect(listingToProductRef(selectedProduct));
    onClose();
  }, [selectedProduct, haptic, onProductSelect, onClose]);

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
          <PressScale
            onPress={onClose}
            style={styles.closeBtn}
            accessibilityLabel="Close product browser"
            accessibilityHint="Closes the product browser sheet"
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <AppIcon name="close" size={IconSize.lg} color="textSecondary" opticalCenter={true} accessible={false} />
          </PressScale>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Tag Product</Text>
          <PressScale
            onPress={handleDone}
            style={styles.doneBtn}
            accessibilityLabel="Done"
            accessibilityRole="button"
            accessibilityHint="Tags the selected product and closes the sheet"
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Text style={[styles.doneBtnText, { color: colors.brand }]}>Done</Text>
          </PressScale>
        </View>

        {/* ── Source tabs — underline indicators ─────────────────── */}
        <View style={[styles.tabBar, { borderBottomColor: colors.border }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabBarContent}>
            {visibleTabs.map((tab) => {
              const isActive = activeTab === tab.key;
              return (
                <Pressable
                  key={tab.key}
                  onPress={() => { haptic.light(); setActiveTab(tab.key); }}
                  style={styles.tab}
                  accessibilityLabel={tab.label}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: isActive }}
                >
                  <Text style={[styles.tabLabel, { color: isActive ? colors.brand : colors.textSecondary, textDecorationLine: isActive ? 'underline' : 'none' }]}>
                    {tab.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {/* ── Search input (Discover tab only) ────────────────────── */}
        {activeTab === 'discover' && (
          <View style={[styles.searchRow, { backgroundColor: colors.surfaceAlt }]}>
            <AppIcon name="search" size={IconSize.sm} color="textMuted" style={styles.searchIcon} opticalCenter={true} accessible={false} />
            <TextInput
              style={[styles.searchInput, { color: colors.textPrimary }]}
              placeholder="Search"
              placeholderTextColor={colors.textMuted}
              value={query}
              onChangeText={setQuery}
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
              accessibilityLabel="Search products"
            />
            {isSearchLoading && (
              <View style={{ flex: 1 }}>
                <SearchLoadingSkeleton />
              </View>
            )}
          </View>
        )}

        {/* ── Results / states ────────────────────────────────────── */}
        {activeError ? (
          <View style={styles.errorBody}>
            <Text style={[styles.errorText, { color: colors.textMuted }]}>Couldn't load</Text>
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
          <ProductGridSkeleton />
        ) : (
          <FlatList
            data={activeResults}
            keyExtractor={(item) => item.id}
            numColumns={2}
            columnWrapperStyle={styles.productGridRow}
            renderItem={({ item }) => {
              const isSelected = selectedProduct?.id === item.id;
              return (
                <Pressable
                  onPress={() => handleSelect(item)}
                  style={styles.productCard}
                  accessibilityLabel={`Select ${item.title}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <View style={styles.productImageWrap}>
                    {item.imageUrl ? (
                      <Image source={{ uri: item.imageUrl }} style={styles.productImage} contentFit="cover" />
                    ) : (
                      <View style={[styles.productImagePlaceholder, { backgroundColor: colors.surfaceAlt }]}>
                        <AppIcon name="tag" size={IconSize.sm} color="textSecondary" opticalCenter={true} accessible={false} />
                      </View>
                    )}
                    {isSelected && (
                      <View style={styles.selectedBadge}>
                        <AppIcon name="checkmarkCircle" size={IconSize.md} color="brand" opticalCenter={true} accessible={false} />
                      </View>
                    )}
                  </View>
                  <Text style={[styles.productName, { color: colors.textPrimary }]} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <Text style={[styles.productPrice, { color: colors.textPrimary }]}>
                    {currencySymbol}{item.priceGbp.toFixed(0)}
                  </Text>
                </Pressable>
              );
            }}
            style={styles.resultList}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              activeTab === 'discover' ? (
                hasSearched && !isSearchLoading ? (
                  <View style={styles.emptyState}>
                    <Text style={[styles.emptyText, { color: colors.textMuted }]}>No products</Text>
                  </View>
                ) : null
              ) : (
                <View style={styles.emptyState}>
                  <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                    No products
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
      paddingVertical: Space.sm },
    title: {
      flex: 1,
      textAlign: 'center',
      fontFamily: Typography.family.semibold,
      fontSize: TypographyV2.sectionTitle.size },
    closeBtn: {
      width: 44,
      height: 44,
      justifyContent: 'center',
      alignItems: 'center' },
    doneBtn: {
      width: 44,
      height: 44,
      justifyContent: 'center',
      alignItems: 'center' },
    doneBtnText: {
      fontFamily: Typography.family.semibold,
      fontSize: TypographyV2.bodyStrong.size },
    // ── Tab bar ──
    tabBar: {
      flexDirection: 'row',
      paddingHorizontal: Space.md,
      paddingVertical: Space.xs,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border },
    tabBarContent: {
      gap: Space.md,
      paddingVertical: Space.xs },
    tab: {
      paddingVertical: Space.sm,
      paddingHorizontal: Space.xs },
    tabLabel: {
      fontFamily: FontFamily.medium,
      fontSize: TypographyV2.body.size },
    // ── Search ──
    searchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginHorizontal: Space.md,
      marginVertical: Space.sm,
      height: 36,
      borderRadius: Radius.sm,
      paddingHorizontal: Space.sm,
      gap: Space.xs },
    searchIcon: {},
    searchInput: {
      flex: 1,
      fontFamily: FontFamily.regular,
      fontSize: TypographyV2.captionElevated.size,
      padding: 0 },
    // ── Results ──
    resultList: {
      paddingHorizontal: Space.md,
      paddingBottom: Space.xl },
    productGridRow: {
      gap: Space.sm },
    productCard: {
      flex: 1,
      paddingHorizontal: Space.xs,
      paddingVertical: Space.sm },
    productImageWrap: {
      width: '100%',
      aspectRatio: 1,
      borderRadius: Radius.md,
      overflow: 'hidden',
      marginBottom: Space.xs },
    productImage: {
      width: '100%',
      height: '100%' },
    productImagePlaceholder: {
      width: '100%',
      height: '100%',
      justifyContent: 'center',
      alignItems: 'center' },
    selectedBadge: {
      position: 'absolute',
      top: Space.xs,
      right: Space.xs },
    productName: {
      fontFamily: Typography.family.regular,
      fontSize: TypographyV2.captionElevated.size },
    productPrice: {
      fontFamily: Typography.family.semibold,
      fontSize: TypographyV2.captionElevated.size },
    // ── States ──
    emptyState: {
      paddingVertical: Space.xl,
      alignItems: 'center' },
    emptyText: {
      fontFamily: Typography.family.regular,
      fontSize: TypographyV2.bodyStrong.size },
    errorBody: {
      paddingVertical: Space.xl,
      alignItems: 'center',
      gap: Space.sm },
    errorText: {
      fontFamily: Typography.family.medium,
      fontSize: TypographyV2.body.size },
    retryBtn: {
      height: 50,
      paddingHorizontal: Space.xl,
      borderRadius: Radius.lg,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.brand },
    retryBtnText: {
      fontFamily: FontFamily.semibold,
      fontSize: TypographyV2.bodyStrong.size,
      color: colors.textInverse } });
}
