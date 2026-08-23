import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  AnimatedPressable } from '../components/AnimatedPressable';
import { View,
  Text,
  StyleSheet,
  StatusBar,
  useWindowDimensions,
  ScrollView,
  RefreshControl,
  Pressable,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FlashList } from '@shopify/flash-list';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CachedImage } from '../components/CachedImage';
import Reanimated, { useSharedValue, useAnimatedStyle, useAnimatedScrollHandler, runOnJS } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { useAppTheme } from '../theme/ThemeContext';
import { useReducedMotion } from '../hooks/useReducedMotion';

import { Motion } from '../constants/motion';
import { Ionicons } from '@expo/vector-icons';
import { RouteProp, useNavigation, useRoute, useScrollToTop } from '@react-navigation/native';
import { RefreshIndicator } from '../components/RefreshIndicator';
import { EmptyState } from '../components/EmptyState';
import { MasonrySkeleton } from '../components/skeletons/MasonrySkeleton';
import { PinterestMasonryGrid } from '../components/discover/PinterestMasonryGrid';
import { DiscoverySectionHeader } from '../components/discover/DiscoverySectionHeader';
import { SyncRetryBanner } from '../components/SyncRetryBanner';
import { OfflineBanner } from '../components/OfflineBanner';
import { RootStackParamList } from '../navigation/types';
import type { Listing } from '../domain';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useBackendData } from '../context/BackendDataContext';
import { fetchFilteredListings } from '../services/listingsApi';
import { friendlyBackendError } from '../services/listingMapper';
import { useHaptic } from '../hooks/useHaptic';
import { AppButton } from '../components/ui/AppButton';
import { T } from '../components/ui/Text';
import { SharedTransitionView } from '../components/SharedTransitionView';

import { isSustainableGrade } from '../utils/sustainabilityScore';

import { Space, Radius, Elevation, Type, Typography, AspectRatio, Control } from '../theme/designTokens';
const GRID_SPACING = 16;

const BROWSE_SORT_PREF_KEY = 'thryftverse:browse-sort-pref:v1';
const BROWSE_GRID_DENSITY_PREF_KEY = 'thryftverse:browse-grid-density:v1';

type GridDensity = 'comfortable' | 'compact';

const SORT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'Recommended', label: 'Recommended' },
  { value: 'Newest', label: 'Newest' },
  { value: 'Price: Low to High', label: 'Price: Low to High' },
  { value: 'Price: High to Low', label: 'Price: High to Low' },
  { value: 'Most liked', label: 'Most liked' },
];

// Auction-only sort option — only surfaced when the browse context is
// auction-related (spec §08: "Do not show: Ending soon for fixed-price-only
// results"). Prevents an irrelevant sort from appearing in normal listing
// browse where no items have end times.
const AUCTION_SORT_OPTION = { value: 'Ending soon', label: 'Ending soon' };

function getSortOptions(categoryId: string, searchQuery?: string): Array<{ value: string; label: string }> {
  const isAuctionContext =
    categoryId.toLowerCase().includes('auction') ||
    (searchQuery?.toLowerCase().includes('auction') ?? false);
  return isAuctionContext ? [...SORT_OPTIONS, AUCTION_SORT_OPTION] : SORT_OPTIONS;
}

type BrowseRoute = RouteProp<RootStackParamList, 'Browse'>;

const toKey = (value: string) => value.trim().toLowerCase();

function getSubcategoryToken(categoryId: string, subcategoryId?: string, title?: string) {
  if (subcategoryId) {
    return subcategoryId
      .toLowerCase()
      .replace(/^[^-]+-/, '')
      .replace(/-/g, ' ')
      .trim();
  }

  if (!title) {
    return '';
  }

  const loweredTitle = title.toLowerCase().replace(/["']/g, '').trim();
  if (loweredTitle.startsWith('all ')) {
    return '';
  }

  const cleanedCategoryId = categoryId.toLowerCase();
  if (loweredTitle.startsWith(cleanedCategoryId)) {
    return loweredTitle.slice(cleanedCategoryId.length).trim();
  }

  return loweredTitle;
}

export default function BrowseScreen() {
  const { colors, isDark } = useAppTheme();
  const reducedMotion = useReducedMotion();
  const { width: windowWidth } = useWindowDimensions();
  const itemWidth = (windowWidth - 40 - GRID_SPACING) / 2;

  const styles = useMemo(() => StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },

    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Space.md,
      paddingTop: Space.sm,
      paddingBottom: Space.xs,
    },
    backBtn: { width: Control.hit, height: Control.hit, alignItems: 'center', justifyContent: 'center' },
    headerActions: { flexDirection: 'row', alignItems: 'center', gap: Space.xs },
    gridToggleBtn: { width: Control.hit, height: Control.hit, alignItems: 'center', justifyContent: 'center' },
    searchBtn: { width: Control.hit, height: Control.hit, borderRadius: Radius.full, alignItems: 'center', justifyContent: 'center' },

    titleContainer: {
      paddingHorizontal: Space.md,
      paddingTop: Space.sm,
      paddingBottom: Space.md,
    },
    hugeTitle: {
      fontSize: Type.title.size,
      fontFamily: Typography.family.bold,
      color: colors.textPrimary,
      letterSpacing: Type.title.letterSpacing,
      lineHeight: Type.title.lineHeight,
    },
    itemCountText: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.medium,
      color: colors.textSecondary,
      fontVariant: ['tabular-nums'],
    },
    itemCountPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xxs,
      paddingHorizontal: Space.sm,
      paddingVertical: Space.xxs + 1,
      borderRadius: Radius.full,
      backgroundColor: colors.surfaceAlt,
      marginTop: Space.xs + 2,
      alignSelf: 'flex-start',
    },

    filterBar: { paddingBottom: Space.md },
    filterRow: { paddingHorizontal: Space.md, gap: Space.sm, alignItems: 'center' },
    filterPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs + 2,
      paddingHorizontal: Space.sm + 2,
      paddingVertical: Space.sm,
      borderRadius: Radius.full,
      backgroundColor: 'transparent',
    },
    filterPillActive: {
      backgroundColor: colors.surfaceAlt,
    },
    filterPillTextActive: { color: colors.textPrimary, fontSize: Type.caption.size, fontFamily: Typography.family.semibold },
    filterPillOutline: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs + 2,
      paddingHorizontal: Space.sm + 2,
      paddingVertical: Space.sm,
      borderRadius: Radius.full,
      backgroundColor: 'transparent',
    },
    filterPillText: { color: colors.textMuted, fontSize: Type.caption.size, fontFamily: Typography.family.medium },
    saveSearchPillActive: {
      backgroundColor: colors.surfaceAlt,
    },
    saveSearchTextActive: {
      color: colors.brand,
      fontFamily: Typography.family.semibold,
    },
    sortTrigger: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs + 2,
      paddingHorizontal: Space.sm + 2,
      paddingVertical: Space.sm,
      borderRadius: Radius.full,
      backgroundColor: 'transparent',
    },
    sortTriggerActive: {
      backgroundColor: colors.surfaceAlt,
    },
    sortTriggerText: { color: colors.textMuted, fontSize: Type.caption.size, fontFamily: Typography.family.medium },
    sortTriggerTextActive: { color: colors.textPrimary, fontFamily: Typography.family.semibold },
    sortMenu: {
      marginHorizontal: Space.md,
      marginBottom: Space.sm,
      borderRadius: Radius.md,
      overflow: 'hidden',
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    sortMenuItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: Space.sm + 2,
      paddingHorizontal: Space.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    sortMenuItemText: {
      fontSize: Type.body.size,
      fontFamily: Typography.family.regular,
      color: colors.textPrimary,
    },
    sortMenuItemTextActive: {
      color: colors.brand,
      fontFamily: Typography.family.semibold,
    },
    activeBadgeRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      paddingHorizontal: Space.md,
      gap: Space.xs,
      paddingBottom: Space.sm,
    },
    activeBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingHorizontal: Space.sm,
      paddingVertical: Space.xs + 2,
      borderRadius: Radius.full,
      backgroundColor: colors.surfaceAlt,
    },
    activeBadgeText: {
      color: colors.textPrimary,
      fontSize: Type.caption.size,
      fontFamily: Typography.family.medium,
    },
    activeBadgeClose: {
      width: Control.iconCompact,
      height: Control.iconCompact,
      alignItems: 'center',
      justifyContent: 'center',
    },
    activeBadgeDivider: {
      width: StyleSheet.hairlineWidth,
      height: Space.md,
      backgroundColor: colors.borderSubtle,
      marginHorizontal: Space.xs / 2,
    },
    clearAllBtn: {
      paddingHorizontal: Space.sm,
      paddingVertical: Space.xs + 2,
      borderRadius: Radius.full,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    clearAllText: {
      color: colors.textSecondary,
      fontSize: Type.caption.size,
      fontFamily: Typography.family.medium,
    },
    syncRetryBanner: {
      marginHorizontal: Space.md,
      marginBottom: Space.sm + 2,
    },

    gridContent: { paddingHorizontal: Space.md, paddingBottom: 100 },
    rowWrapper: { justifyContent: 'space-between', marginBottom: Space.xl },
    loadingStateWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      paddingHorizontal: Space.md,
      rowGap: Space.xl,
    },
    loadingCard: {
      width: itemWidth,
    },
    loadingCardOffset: {
      marginTop: Space.lg,
    },
    loadingCardBody: {
      marginTop: Space.sm + 2,
      paddingHorizontal: Space.xs,
    },

    gridItem: { width: itemWidth },
    imageWrap: {
      width: itemWidth,
      borderRadius: Radius.sm,
      overflow: 'hidden',
      backgroundColor: colors.surfaceAlt,
      marginBottom: Space.smMd,
    },
    gridImageContainer: {
      width: '100%',
      aspectRatio: AspectRatio.portrait,
      borderRadius: Radius.lg,
    },
    gridImage: { width: '100%', height: '100%' },
    sharedImageLayer: {
      ...StyleSheet.absoluteFill,
    },
    likeBtn: {
      position: 'absolute',
      top: Space.sm + 2,
      right: Space.sm + 2,
      width: Control.hit,
      height: Control.hit,
      borderRadius: Radius.full,
      alignItems: 'center',
      justifyContent: 'center',
    },

    infoWrap: { paddingHorizontal: Space.xs },
    priceRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      marginBottom: Space.xs,
    },
    priceText: { color: colors.textPrimary, fontSize: Type.body.size, fontFamily: Typography.family.bold, fontVariant: ['tabular-nums'] },
    brandText: { color: colors.textSecondary, fontSize: Type.caption.size, fontFamily: Typography.family.bold, textTransform: 'uppercase' },
    sizeText: { color: colors.textMuted, fontSize: Type.caption.size, fontFamily: Typography.family.medium },
    sellerActionRow: {
      marginTop: Space.sm,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: Space.xs + 2,
    },
    sellerIdentityChip: {
      flex: 1,
      minHeight: Space.lg + Space.xs,
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs + 2,
      paddingHorizontal: Space.sm,
    },
    sellerActionAvatarWrap: {
      width: Control.iconCompact,
      height: Control.iconCompact,
      borderRadius: Radius.full,
    },
    sellerActionAvatar: {
      width: Control.iconCompact,
      height: Control.iconCompact,
      borderRadius: Radius.full,
    },
    sellerActionAvatarFallback: {
      width: Control.iconCompact,
      height: Control.iconCompact,
      borderRadius: Radius.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.background,
    },
    sellerActionHandle: {
      flex: 1,
      color: colors.textSecondary,
      fontSize: Type.meta.size,
      fontFamily: Typography.family.semibold,
    },
    sellerMessageBtn: {
      width: Space.lg + Space.xs,
      height: Space.lg + Space.xs,
      borderRadius: Radius.full,
      alignItems: 'center',
      justifyContent: 'center',
    },
  }), [colors, itemWidth]);

  const navigation = useNavigation<any>();
  const route = useRoute<BrowseRoute>();
  const { title, categoryId, subcategoryId, searchQuery } = route.params || { title: 'Browse All', categoryId: 'search' };
  const wishlist = useStore((state) => state.wishlist);
  const toggleWishlist = useStore((state) => state.toggleWishlist);
  const browseFilters = useStore((state) => state.browseFilters);
  const updateBrowseFilters = useStore((state) => state.updateBrowseFilters);
  const addSavedSearch = useStore((state) => state.addSavedSearch);
  const savedSearches = useStore((state) => state.savedSearches);
  const { show } = useToast();
  const { formatFromFiat } = useFormattedPrice();
  const { listings, source, isSyncing, lastError, refreshListings } = useBackendData();

  const [refreshing, setRefreshing] = useState(false);
  const scrollY = useSharedValue(0);
  const scrollRef = React.useRef<any>(null);
  const refreshTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const [backendListings, setBackendListings] = useState<Listing[] | null>(null);
  const [backendLoading, setBackendLoading] = useState(false);
  const [backendError, setBackendError] = useState<string | null>(null);
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [gridDensity, setGridDensity] = useState<GridDensity>('comfortable');
  const haptic = useHaptic();

  useEffect(() => {
    AsyncStorage.getItem(BROWSE_GRID_DENSITY_PREF_KEY).then((stored) => {
      if (stored === 'comfortable' || stored === 'compact') {
        setGridDensity(stored);
      }
    }).catch(() => {});
  }, []);

  const handleGridDensityChange = useCallback((density: GridDensity) => {
    setGridDensity(density);
    AsyncStorage.setItem(BROWSE_GRID_DENSITY_PREF_KEY, density).catch(() => {});
  }, []);

  const handleSortSelect = useCallback((sortValue: string) => {
    updateBrowseFilters({ sort: sortValue as any });
    setSortMenuOpen(false);
    AsyncStorage.setItem(BROWSE_SORT_PREF_KEY, sortValue).catch(() => {});
  }, [updateBrowseFilters]);

  useEffect(() => {
    AsyncStorage.getItem(BROWSE_SORT_PREF_KEY).then((stored) => {
      if (stored && getSortOptions(categoryId, searchQuery).some((opt) => opt.value === stored)) {
        updateBrowseFilters({ sort: stored as any });
      }
    }).catch(() => {});
  }, [updateBrowseFilters, categoryId, searchQuery]);

  useScrollToTop(scrollRef);

  useEffect(() => {
    if (categoryId === 'search' && searchQuery && browseFilters.query !== searchQuery) {
      updateBrowseFilters({ query: searchQuery });
      return;
    }

    if (categoryId !== 'search' && browseFilters.query) {
      updateBrowseFilters({ query: '' });
    }
  }, [categoryId, searchQuery, browseFilters.query, updateBrowseFilters]);

  useEffect(() => {
    const sortMap: Record<string, 'newest' | 'price_asc' | 'price_desc'> = {
      Newest: 'newest',
      'Price: Low to High': 'price_asc',
      'Price: High to Low': 'price_desc',
      'Most liked': 'newest',
      'Ending soon': 'newest',
    };

    const hasBackendFilters =
      browseFilters.query.trim().length > 0 ||
      browseFilters.brands.length > 0 ||
      browseFilters.sizes.length > 0 ||
      browseFilters.condition !== 'Any' ||
      browseFilters.sort !== 'Recommended' ||
      (categoryId && categoryId !== 'search' && categoryId !== 'all');

    if (!hasBackendFilters) {
      setBackendListings(null);
      return;
    }

    let cancelled = false;
    setBackendLoading(true);
    setBackendError(null);

    fetchFilteredListings({
      query: browseFilters.query.trim() || undefined,
      category: categoryId !== 'search' && categoryId !== 'all' ? categoryId : undefined,
      brand: browseFilters.brands[0],
      size: browseFilters.sizes[0],
      condition: browseFilters.condition !== 'Any' ? browseFilters.condition : undefined,
      minPrice: browseFilters.priceMin ?? undefined,
      maxPrice: browseFilters.priceMax ?? undefined,
      sort: sortMap[browseFilters.sort] || 'newest',
    })
      .then((result) => {
        if (cancelled) return;
        setBackendListings(result.listings);
        setBackendError(result.error ?? null);
      })
      .catch((error) => {
        if (!cancelled) setBackendError(friendlyBackendError(error));
      })
      .finally(() => {
        if (!cancelled) setBackendLoading(false);
      });

    return () => {
      cancelled = true;
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
    };
  }, [browseFilters, categoryId]);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.value = e.contentOffset.y;
    },
  });

  const handleRefresh = async () => {
    haptic.patterns.refresh();
    setRefreshing(true);
    await refreshListings();
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(() => {
      refreshTimerRef.current = null;
      setRefreshing(false);
    }, 400);
  };

  const hasActiveFilters =
    browseFilters.brands.length > 0 ||
    browseFilters.sizes.length > 0 ||
    browseFilters.condition !== 'Any' ||
    browseFilters.sustainableOnly ||
    browseFilters.priceMin != null ||
    browseFilters.priceMax != null;

  // Filtered-empty vs. regular empty: user-applied filters (brand, size,
  // condition, sustainable, query, sort) produce a filtered-empty state
  // distinct from "no data at all" for the current category. Per §14,
  // filtered-empty is a normal state, not an error.
  const hasAnyFiltering =
    hasActiveFilters ||
    browseFilters.query.trim().length > 0 ||
    browseFilters.sort !== 'Recommended';

  const handleClearFilters = useCallback(() => {
    updateBrowseFilters({
      query: '',
      sort: 'Recommended',
      brands: [],
      sizes: [],
      condition: 'Any',
      sustainableOnly: false,
      priceMin: null,
      priceMax: null,
    });
  }, [updateBrowseFilters]);

  // Save search — only available when there's a query or category to save
  const saveSearchLabel = searchQuery || title;
  const isCurrentSaved = savedSearches.some(
    (s) => s.query === saveSearchLabel &&
    s.filters.brands.join(',') === browseFilters.brands.join(',') &&
    s.filters.sizes.join(',') === browseFilters.sizes.join(',') &&
    s.filters.condition === browseFilters.condition
  );

  const handleSaveSearch = useCallback(() => {
    if (!saveSearchLabel || saveSearchLabel === 'Browse All') return;
    addSavedSearch({
      query: saveSearchLabel,
      filters: {
        brands: browseFilters.brands,
        sizes: browseFilters.sizes,
        condition: browseFilters.condition,
        sort: browseFilters.sort,
        category: categoryId !== 'search' && categoryId !== 'all' ? categoryId : undefined,
      },
      alertsEnabled: true,
    });
    show('Search saved with alerts enabled', 'success');
  }, [saveSearchLabel, browseFilters, categoryId, addSavedSearch, show]);

  const dataToRender = useMemo(() => {
    const normalizedCategory = toKey(categoryId);
    const normalizedSubcategory = getSubcategoryToken(categoryId, subcategoryId, title);
    const normalizedQuery = browseFilters.query.trim().toLowerCase();
    const selectedBrands = new Set(browseFilters.brands.map((brand) => brand.toLowerCase()));
    const selectedSizes = new Set(browseFilters.sizes.map((size) => size.toLowerCase()));

    const baseList = listings.filter((listing) => {
      if (normalizedCategory !== 'search' && listing.category?.toLowerCase() !== normalizedCategory) {
        return false;
      }

      if (normalizedCategory !== 'search' && normalizedSubcategory) {
        return listing.subcategory?.toLowerCase()?.includes(normalizedSubcategory) ?? false;
      }

      return true;
    });

    const filteredList = baseList.filter((listing) => {
      if (normalizedQuery) {
        const searchable = [
          listing.title,
          listing.brand,
          listing.description,
          listing.category,
          listing.subcategory,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        if (!searchable?.includes(normalizedQuery)) {
          return false;
        }
      }

      if (selectedBrands.size > 0 && !selectedBrands.has(listing.brand?.toLowerCase() ?? '')) {
        return false;
      }

      if (selectedSizes.size > 0 && !selectedSizes.has(listing.size?.toLowerCase() ?? '')) {
        return false;
      }

      if (browseFilters.condition !== 'Any' && listing.condition !== browseFilters.condition) {
        return false;
      }

      // Price range filter (GBP)
      if (browseFilters.priceMin != null && listing.price < browseFilters.priceMin) return false;
      if (browseFilters.priceMax != null && listing.price > browseFilters.priceMax) return false;

      // Sustainable — client-side heuristic: only A/B graded items.
      if (
        browseFilters.sustainableOnly &&
        !isSustainableGrade({
          condition: listing.condition,
          category: listing.category,
          subcategory: listing.subcategory,
          brand: listing.brand,
          sellerLocation: listing.seller?.location ?? null,
        })
      ) {
        return false;
      }

      return true;
    });

    const sorted = [...filteredList];
    switch (browseFilters.sort) {
      case 'Price: Low to High':
        sorted.sort((a, b) => a.price - b.price);
        break;
      case 'Price: High to Low':
        sorted.sort((a, b) => b.price - a.price);
        break;
      case 'Newest':
        sorted.sort((a, b) => {
          const aDate = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const bDate = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return bDate - aDate;
        });
        break;
      case 'Most liked':
        sorted.sort((a, b) => b.likes - a.likes);
        break;
      case 'Ending soon':
        sorted.sort((a, b) => {
          const aDate = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const bDate = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return aDate - bDate;
        });
        break;
      case 'Recommended':
      default:
        sorted.sort((a, b) => b.likes - a.likes);
        break;
    }

    return sorted;
  }, [browseFilters, categoryId, listings, subcategoryId, title]);

  const showBrowseLoadingSkeleton = isSyncing && dataToRender.length === 0 && !lastError;

  const renderBrowseLoadingState = () => (
    <View style={styles.loadingStateWrap}>
      <MasonrySkeleton numColumns={gridDensity === 'compact' ? 3 : 2} itemCount={gridDensity === 'compact' ? 9 : 6} horizontalPadding={Space.md} gap={3} />
    </View>
  );

  // Sustainability is a client-side heuristic, so it must be applied to both
  // the cached list and the backend-filtered list (the backend does not know
  // about the grade).
  const displayListings = useMemo(() => {
    const base = backendListings ?? dataToRender;
    if (!browseFilters.sustainableOnly) return base;
    return base.filter((listing) =>
      isSustainableGrade({
        condition: listing.condition,
        category: listing.category,
        subcategory: listing.subcategory,
        brand: listing.brand,
        sellerLocation: listing.seller?.location ?? null,
      }),
    );
  }, [backendListings, dataToRender, browseFilters.sustainableOnly]);
  const displayCount = displayListings.length;
  const isBackendActive = backendListings !== null;

  const AnimatedFlashList = Reanimated.createAnimatedComponent(FlashList);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />

      {/* Heavy Typography Header */}
      <View style={styles.header}>
        <AnimatedPressable style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} aria-hidden={true} />
        </AnimatedPressable>
        <View style={styles.headerActions}>
          <AnimatedPressable
            style={styles.gridToggleBtn}
            activeOpacity={0.8}
            onPress={() => handleGridDensityChange(gridDensity === 'comfortable' ? 'compact' : 'comfortable')}
            accessibilityRole="button"
            accessibilityLabel={gridDensity === 'comfortable' ? 'Switch to compact 3 column grid' : 'Switch to comfortable 2 column grid'}
            accessibilityState={{ selected: true }}
          >
            <Ionicons name={gridDensity === 'comfortable' ? 'grid-outline' : 'grid-sharp'} size={22} color={colors.textPrimary} aria-hidden={true} />
          </AnimatedPressable>
          <AnimatedPressable style={styles.searchBtn} activeOpacity={0.8} onPress={() => navigation.navigate('GlobalSearch')} accessibilityRole="button" accessibilityLabel="Search listings">
            <Ionicons name="search" size={22} color={colors.textPrimary} aria-hidden={true} />
          </AnimatedPressable>
        </View>
      </View>

      <View style={styles.titleContainer}>
        <Text style={styles.hugeTitle}>{title}</Text>
        <View style={styles.itemCountPill} accessibilityLiveRegion="polite" accessibilityLabel={backendLoading ? 'Loading items' : `${displayCount} items`}>
          <Ionicons name="pricetag-outline" size={12} color={colors.textMuted} aria-hidden={true} />
          <Text style={styles.itemCountText}>{backendLoading ? 'Loading…' : `${displayCount} items`}</Text>
        </View>
      </View>

      <View style={styles.filterBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          <AnimatedPressable
            style={[styles.filterPill, hasActiveFilters && styles.filterPillActive]}
            onPress={() => navigation.navigate('Filter', { categoryId, subcategoryId, title })}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Open filters"
            accessibilityState={{ selected: hasActiveFilters }}
            accessibilityHint={hasActiveFilters ? 'Filters are applied' : 'Opens filter options'}
          >
            <Ionicons name="options-outline" size={16} color={hasActiveFilters ? colors.textPrimary : colors.textMuted} aria-hidden={true} />
            <Text style={[styles.filterPillText, hasActiveFilters && styles.filterPillTextActive]}>{hasActiveFilters ? 'Filter on' : 'Filter'}</Text>
          </AnimatedPressable>
          <AnimatedPressable
            style={[styles.sortTrigger, browseFilters.sort !== 'Recommended' && styles.sortTriggerActive]}
            onPress={() => setSortMenuOpen((v) => !v)}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={`Sort by ${browseFilters.sort}`}
            accessibilityState={{ expanded: sortMenuOpen }}
          >
            <Ionicons name="swap-vertical" size={16} color={browseFilters.sort !== 'Recommended' ? colors.textPrimary : colors.textMuted} aria-hidden={true} />
            <Text style={[styles.sortTriggerText, browseFilters.sort !== 'Recommended' && styles.sortTriggerTextActive]}>{browseFilters.sort}</Text>
            <Ionicons name={sortMenuOpen ? 'chevron-up' : 'chevron-down'} size={12} color={browseFilters.sort !== 'Recommended' ? colors.textPrimary : colors.textMuted} aria-hidden={true} />
          </AnimatedPressable>
          <AnimatedPressable
            style={styles.filterPillOutline}
            onPress={() => navigation.navigate('Filter', { categoryId, subcategoryId, title })}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Filter by brand"
            accessibilityHint={browseFilters.brands.length > 0 ? `${browseFilters.brands.length} brands selected` : 'Opens brand filter'}
          >
            <Text style={[styles.filterPillText, browseFilters.brands.length > 0 && styles.filterPillTextActive]}>{browseFilters.brands.length > 0 ? `Brand (${browseFilters.brands.length})` : 'Brand'}</Text>
            <Ionicons name="chevron-down" size={12} color={browseFilters.brands.length > 0 ? colors.textPrimary : colors.textMuted} aria-hidden={true} />
          </AnimatedPressable>
          <AnimatedPressable
            style={styles.filterPillOutline}
            onPress={() => navigation.navigate('Filter', { categoryId, subcategoryId, title })}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Filter by size"
            accessibilityHint={browseFilters.sizes.length > 0 ? `${browseFilters.sizes.length} sizes selected` : 'Opens size filter'}
          >
            <Text style={[styles.filterPillText, browseFilters.sizes.length > 0 && styles.filterPillTextActive]}>{browseFilters.sizes.length > 0 ? `Size (${browseFilters.sizes.length})` : 'Size'}</Text>
            <Ionicons name="chevron-down" size={12} color={browseFilters.sizes.length > 0 ? colors.textPrimary : colors.textMuted} aria-hidden={true} />
          </AnimatedPressable>
          <AnimatedPressable
            style={styles.filterPillOutline}
            onPress={() => navigation.navigate('Filter', { categoryId, subcategoryId, title })}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Filter by condition"
            accessibilityHint={browseFilters.condition !== 'Any' ? `Condition: ${browseFilters.condition}` : 'Opens condition filter'}
          >
            <Text style={[styles.filterPillText, browseFilters.condition !== 'Any' && styles.filterPillTextActive]}>{browseFilters.condition !== 'Any' ? browseFilters.condition : 'Condition'}</Text>
            <Ionicons name="chevron-down" size={12} color={browseFilters.condition !== 'Any' ? colors.textPrimary : colors.textMuted} aria-hidden={true} />
          </AnimatedPressable>
          <AnimatedPressable
            style={[styles.filterPillOutline, browseFilters.sustainableOnly && styles.filterPillActive]}
            onPress={() => {
              haptic.light();
              updateBrowseFilters({ sustainableOnly: !browseFilters.sustainableOnly });
            }}
            activeOpacity={0.85}
            accessibilityRole="switch"
            accessibilityState={{ checked: browseFilters.sustainableOnly }}
            accessibilityLabel="Toggle sustainable items only"
          >
            <Ionicons
              name="leaf"
              size={16}
              color={browseFilters.sustainableOnly ? colors.textPrimary : colors.textMuted}
              aria-hidden={true}
            />
            <Text
              style={[
                styles.filterPillText,
                browseFilters.sustainableOnly && styles.filterPillTextActive,
              ]}
            >
              Sustainable
            </Text>
          </AnimatedPressable>
          {saveSearchLabel && saveSearchLabel !== 'Browse All' && (
            <AnimatedPressable
              style={[styles.filterPillOutline, isCurrentSaved && styles.saveSearchPillActive]}
              activeOpacity={0.85}
              onPress={isCurrentSaved ? undefined : handleSaveSearch}
              accessibilityLabel={isCurrentSaved ? 'Search saved with alerts' : 'Save this search with alerts'}
              accessibilityRole="button"
              accessibilityState={{ selected: isCurrentSaved }}
              accessibilityHint={isCurrentSaved ? 'Search is saved' : 'Saves this search and sends alerts for new matches'}
            >
              <Ionicons
                name={isCurrentSaved ? 'notifications' : 'notifications-outline'}
                size={16}
                color={isCurrentSaved ? colors.brand : colors.textSecondary}
                aria-hidden={true}
              />
              <Text style={[styles.filterPillText, isCurrentSaved && styles.saveSearchTextActive]}>
                {isCurrentSaved ? 'Saved' : 'Save search'}
              </Text>
            </AnimatedPressable>
          )}
        </ScrollView>
      </View>

      {sortMenuOpen ? (
        <View style={styles.sortMenu}>
          {getSortOptions(categoryId, searchQuery).map((opt, idx) => {
            const sortOpts = getSortOptions(categoryId, searchQuery);
            const isActive = browseFilters.sort === opt.value;
            return (
              <Pressable
                key={opt.value}
                onPress={() => handleSortSelect(opt.value)}
                style={[styles.sortMenuItem, idx === sortOpts.length - 1 && { borderBottomWidth: 0 }]}
                accessibilityRole="button"
                accessibilityLabel={`Sort by ${opt.label}`}
                accessibilityState={{ selected: isActive }}
              >
                <Text style={[styles.sortMenuItemText, isActive && styles.sortMenuItemTextActive]}>
                  {opt.label}
                </Text>
                {isActive ? <Ionicons name="checkmark" size={16} color={colors.brand} aria-hidden={true} /> : null}
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {hasActiveFilters ? (
        <View style={styles.activeBadgeRow}>
          {/* Active filters grouped by category — badges within a category
              are visually adjacent. Category prefix removed from badge text
              (the grouping makes it redundant). A hairline divider separates
              categories when multiple are active. */}
          {browseFilters.brands.map((brand) => (
            <View key={`brand-${brand}`} style={styles.activeBadge}>
              <Text style={styles.activeBadgeText}>{brand}</Text>
              <Pressable
                style={styles.activeBadgeClose}
                onPress={() => {
                  haptic.light();
                  updateBrowseFilters({ brands: browseFilters.brands.filter((b) => b !== brand) });
                }}
                accessibilityRole="button"
                accessibilityLabel={`Remove brand filter ${brand}`}
              >
                <Ionicons name="close" size={12} color={colors.textPrimary} aria-hidden={true} />
              </Pressable>
            </View>
          ))}
          {browseFilters.brands.length > 0 && (browseFilters.sizes.length > 0 || browseFilters.condition !== 'Any' || browseFilters.sustainableOnly) ? (
            <View style={styles.activeBadgeDivider} />
          ) : null}
          {browseFilters.sizes.map((size) => (
            <View key={`size-${size}`} style={styles.activeBadge}>
              <Text style={styles.activeBadgeText}>{size}</Text>
              <Pressable
                style={styles.activeBadgeClose}
                onPress={() => {
                  haptic.light();
                  updateBrowseFilters({ sizes: browseFilters.sizes.filter((s) => s !== size) });
                }}
                accessibilityRole="button"
                accessibilityLabel={`Remove size filter ${size}`}
              >
                <Ionicons name="close" size={12} color={colors.textPrimary} aria-hidden={true} />
              </Pressable>
            </View>
          ))}
          {browseFilters.sizes.length > 0 && (browseFilters.condition !== 'Any' || browseFilters.sustainableOnly) ? (
            <View style={styles.activeBadgeDivider} />
          ) : null}
          {browseFilters.condition !== 'Any' ? (
            <View style={styles.activeBadge}>
              <Text style={styles.activeBadgeText}>{browseFilters.condition}</Text>
              <Pressable
                style={styles.activeBadgeClose}
                onPress={() => {
                  haptic.light();
                  updateBrowseFilters({ condition: 'Any' });
                }}
                accessibilityRole="button"
                accessibilityLabel="Remove condition filter"
              >
                <Ionicons name="close" size={12} color={colors.textPrimary} aria-hidden={true} />
              </Pressable>
            </View>
          ) : null}
          {browseFilters.condition !== 'Any' && browseFilters.sustainableOnly ? (
            <View style={styles.activeBadgeDivider} />
          ) : null}
          {browseFilters.sustainableOnly ? (
            <View style={styles.activeBadge}>
              <Text style={styles.activeBadgeText}>Sustainable</Text>
              <Pressable
                style={styles.activeBadgeClose}
                onPress={() => {
                  haptic.light();
                  updateBrowseFilters({ sustainableOnly: false });
                }}
                accessibilityRole="button"
                accessibilityLabel="Remove sustainable filter"
              >
                <Ionicons name="close" size={12} color={colors.textPrimary} aria-hidden={true} />
              </Pressable>
            </View>
          ) : null}
          <Pressable
            style={styles.clearAllBtn}
            onPress={handleClearFilters}
            accessibilityRole="button"
            accessibilityLabel="Clear all filters"
          >
            <Text style={styles.clearAllText}>Clear all</Text>
          </Pressable>
        </View>
      ) : null}

      {lastError ? (
        <SyncRetryBanner
          message="Live browse sync is unavailable. Showing cached listings."
          onRetry={() => void refreshListings()}
          isRetrying={isSyncing}
          telemetryContext="browse_sync"
          containerStyle={styles.syncRetryBanner}
        />
      ) : null}

      <OfflineBanner onRetry={() => void refreshListings()} />

      {/* Masonry Grid - Pinterest/Depop Style */}
      <View style={{ flex: 1 }}>
        <RefreshIndicator scrollY={scrollY} isRefreshing={refreshing} topInset={40} />

        {backendLoading || showBrowseLoadingSkeleton ? (
          renderBrowseLoadingState()
        ) : backendError ? (
          <EmptyState
            icon="cloud-offline-outline"
            title="Filter unavailable"
            subtitle={friendlyBackendError(backendError)}
            ctaLabel="Clear filters"
            onCtaPress={handleClearFilters}
          />
        ) : lastError && displayListings.length === 0 ? (
          <EmptyState
            icon="cloud-offline-outline"
            iconColor={colors.danger}
            title="Browse unavailable"
            subtitle="We couldn't load listings. Check your connection and try again."
            ctaLabel="Retry"
            onCtaPress={() => void refreshListings()}
          />
        ) : displayListings.length > 0 ? (
          <PinterestMasonryGrid
            items={displayListings}
            onPressItem={(item) => navigation.push('ItemDetail', { itemId: item.id })}
            numColumns={gridDensity === 'compact' ? 3 : 2}
            showSaveButton
            gap={gridDensity === 'compact' ? Space.xs + 2 : 3}
            horizontalPadding={Space.md}
            testIDPrefix="golden-browse-product-card"
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => void handleRefresh()}
                tintColor={colors.brand}
                colors={[colors.brand]}
              />
            }
          />
        ) : hasAnyFiltering ? (
          // Filtered-empty — filters returned no results. Friendly, not an
          // error: the user can adjust or clear filters to recover.
          <View style={{ flex: 1 }}>
            <EmptyState
              icon="filter-outline"
              title="No items match your filters"
              subtitle="Try adjusting your filters or clearing them."
              ctaLabel="Clear filters"
              onCtaPress={handleClearFilters}
            />
          </View>
        ) : (
          // Regular empty — no data at all for this category/search. Distinct
          // from filtered-empty: there is nothing to show regardless of filters.
          <View style={{ flex: 1 }}>
            <EmptyState
              icon="pricetag-outline"
              title="No items here yet"
              subtitle="New listings are added every day. Check back soon or explore everything."
              ctaLabel="Explore all"
              onCtaPress={() => navigation.navigate('Browse', { categoryId: 'all', title: 'Explore' })}
            />
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

