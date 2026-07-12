import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  AnimatedPressable } from '../components/AnimatedPressable';
import { View,
  Text,
  StyleSheet,
  StatusBar,
  Dimensions,
  ScrollView,
  RefreshControl
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CachedImage } from '../components/CachedImage';
import Reanimated, { useSharedValue, useAnimatedStyle, withTiming, withSequence, withDelay, useAnimatedScrollHandler, runOnJS, FadeInDown } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useAppTheme } from '../theme/ThemeContext';

import { Motion } from '../constants/motion';
import { Ionicons } from '@expo/vector-icons';
import { RouteProp, useNavigation, useRoute, useScrollToTop } from '@react-navigation/native';
import { RefreshIndicator } from '../components/RefreshIndicator';
import { EmptyState } from '../components/EmptyState';
import { SkeletonLoader } from '../components/SkeletonLoader';
import { MasonrySkeleton } from '../components/skeletons/MasonrySkeleton';
import { PinterestMasonryGrid } from '../components/discover/PinterestMasonryGrid';
import { DiscoverySectionHeader } from '../components/discover/DiscoverySectionHeader';
import { SyncRetryBanner } from '../components/SyncRetryBanner';
import { RootStackParamList } from '../navigation/types';
import { Listing } from '../data/mockData';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useBackendData } from '../context/BackendDataContext';
import { fetchFilteredListings } from '../services/listingsApi';
import { friendlyBackendError } from '../services/listingMapper';
import { useHaptic } from '../hooks/useHaptic';
import { AppButton } from '../components/ui/AppButton';
import { Space, Radius, Elevation } from '../theme/designTokens';
import { T } from '../components/ui/Text';
import { SharedTransitionView } from '../components/SharedTransitionView';
import { useReducedMotion } from '../hooks/useReducedMotion';

import { Typography } from '../theme/designTokens';

const { width } = Dimensions.get('window');
const GRID_SPACING = 16;
// 2 column grid with margins
const ITEM_WIDTH = (width - 40 - GRID_SPACING) / 2;

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
  const reducedMotionEnabled = useReducedMotion();

  const [refreshing, setRefreshing] = useState(false);
  const scrollY = useSharedValue(0);
  const scrollRef = React.useRef<any>(null);

  const [backendListings, setBackendListings] = useState<Listing[] | null>(null);
  const [backendLoading, setBackendLoading] = useState(false);
  const [backendError, setBackendError] = useState<string | null>(null);

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
    };

    const hasBackendFilters =
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
      category: categoryId !== 'search' && categoryId !== 'all' ? categoryId : undefined,
      brand: browseFilters.brands[0],
      size: browseFilters.sizes[0],
      condition: browseFilters.condition !== 'Any' ? browseFilters.condition : undefined,
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

    return () => { cancelled = true; };
  }, [browseFilters, categoryId]);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.value = e.contentOffset.y;
    },
  });

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshListings();
    setTimeout(() => setRefreshing(false), 400);
  };

  const hasActiveFilters =
    browseFilters.brands.length > 0 ||
    browseFilters.sizes.length > 0 ||
    browseFilters.condition !== 'Any';

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
      case 'Recommended':
      default:
        sorted.sort((a, b) => b.likes - a.likes);
        break;
    }

    return sorted;
  }, [browseFilters, categoryId, listings, subcategoryId, title]);

  const showBrowseLoadingSkeleton = isSyncing && dataToRender.length === 0 && !lastError;

  const renderBrowseLoadingState = () => (
    <Reanimated.View entering={FadeInDown.duration(200)} style={styles.loadingStateWrap}>
      <MasonrySkeleton numColumns={2} itemCount={6} horizontalPadding={Space.md} gap={3} />
    </Reanimated.View>
  );

  const displayListings = backendListings ?? dataToRender;
  const displayCount = displayListings.length;
  const isBackendActive = backendListings !== null;

  const AnimatedFlashList = Reanimated.createAnimatedComponent(FlashList);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />

      {/* Heavy Typography Header */}
      <Reanimated.View entering={FadeInDown.duration(300).delay(30)} style={styles.header}>
        <AnimatedPressable style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.8} accessibilityLabel="Go back">
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </AnimatedPressable>
        <AnimatedPressable style={[styles.searchBtn, { backgroundColor: colors.surface }]} activeOpacity={0.8} onPress={() => navigation.navigate('GlobalSearch')} accessibilityLabel="Search listings">
          <Ionicons name="search" size={20} color={colors.textPrimary} />
        </AnimatedPressable>
      </Reanimated.View>

      <Reanimated.View entering={FadeInDown.duration(300).delay(60)} style={styles.titleContainer}>
        <Text style={[styles.hugeTitle, { color: colors.textPrimary }]}>{title}</Text>
        <Text style={[styles.itemCountText, { color: colors.textMuted }]}>{backendLoading ? 'Loading…' : `${displayCount} items`}</Text>
      </Reanimated.View>

      <Reanimated.View entering={FadeInDown.duration(300).delay(90)} style={styles.filterBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          <AnimatedPressable
            style={[styles.filterPill, hasActiveFilters && styles.filterPillActive, hasActiveFilters && { backgroundColor: colors.textPrimary, borderColor: colors.textPrimary }, !hasActiveFilters && { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => navigation.navigate('Filter', { categoryId, subcategoryId, title })}
            activeOpacity={0.85}
            accessibilityLabel="Open filters"
          >
            <Ionicons name="options-outline" size={14} color={hasActiveFilters ? colors.background : colors.textPrimary} />
            <Text style={[styles.filterPillText, hasActiveFilters && styles.filterPillTextActive, hasActiveFilters && { color: colors.background }]}>{hasActiveFilters ? 'Filter on' : 'Filter'}</Text>
          </AnimatedPressable>
          <AnimatedPressable
            style={[styles.filterPillOutline, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => navigation.navigate('Filter', { categoryId, subcategoryId, title })}
            activeOpacity={0.85}
            accessibilityLabel="Filter by brand"
          >
            <Text style={[styles.filterPillText, { color: colors.textPrimary }]}>{browseFilters.brands.length > 0 ? `Brand (${browseFilters.brands.length})` : 'Brand'}</Text>
            <Ionicons name="chevron-down" size={12} color={colors.textMuted} />
          </AnimatedPressable>
          <AnimatedPressable
            style={[styles.filterPillOutline, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => navigation.navigate('Filter', { categoryId, subcategoryId, title })}
            activeOpacity={0.85}
            accessibilityLabel="Filter by size"
          >
            <Text style={[styles.filterPillText, { color: colors.textPrimary }]}>{browseFilters.sizes.length > 0 ? `Size (${browseFilters.sizes.length})` : 'Size'}</Text>
            <Ionicons name="chevron-down" size={12} color={colors.textMuted} />
          </AnimatedPressable>
          <AnimatedPressable
            style={[styles.filterPillOutline, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => navigation.navigate('Filter', { categoryId, subcategoryId, title })}
            activeOpacity={0.85}
            accessibilityLabel="Filter by condition"
          >
            <Text style={[styles.filterPillText, { color: colors.textPrimary }]}>{browseFilters.condition !== 'Any' ? browseFilters.condition : 'Condition'}</Text>
            <Ionicons name="chevron-down" size={12} color={colors.textMuted} />
          </AnimatedPressable>
          {saveSearchLabel && saveSearchLabel !== 'Browse All' && (
            <AnimatedPressable
              style={[styles.filterPillOutline, { backgroundColor: colors.surface, borderColor: colors.border }, isCurrentSaved && { borderColor: colors.brand, backgroundColor: `${colors.brand}08` }]}
              activeOpacity={0.85}
              onPress={isCurrentSaved ? undefined : handleSaveSearch}
              accessibilityLabel={isCurrentSaved ? 'Search saved with alerts' : 'Save this search with alerts'}
              accessibilityRole="button"
            >
              <Ionicons
                name={isCurrentSaved ? 'notifications' : 'notifications-outline'}
                size={14}
                color={isCurrentSaved ? colors.brand : colors.textSecondary}
              />
              <Text style={[styles.filterPillText, { color: colors.textPrimary }, isCurrentSaved && { color: colors.brand }]}>
                {isCurrentSaved ? 'Saved' : 'Save search'}
              </Text>
            </AnimatedPressable>
          )}
        </ScrollView>
      </Reanimated.View>

      {lastError ? (
        <SyncRetryBanner
          message="Live browse sync is unavailable. Showing cached listings."
          onRetry={() => void refreshListings()}
          isRetrying={isSyncing}
          telemetryContext="browse_sync"
          containerStyle={styles.syncRetryBanner}
        />
      ) : null}

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
            onCtaPress={() =>
              updateBrowseFilters({
                query: '',
                sort: 'Recommended',
                brands: [],
                sizes: [],
                condition: 'Any',
              })
            }
          />
        ) : displayListings.length > 0 ? (
          <PinterestMasonryGrid
            items={displayListings}
            onPressItem={(item) => navigation.push('ItemDetail', { itemId: item.id })}
            numColumns={2}
            showSaveButton
            gap={3}
            horizontalPadding={Space.md}
          />
        ) : (
          <Reanimated.View entering={FadeInDown.duration(300)} style={{ flex: 1 }}>
            <EmptyState
              icon="search-outline"
              title="No matches found"
              subtitle="Try clearing filters or searching for another keyword."
              ctaLabel="Clear filters"
              onCtaPress={() =>
                updateBrowseFilters({
                  query: '',
                  sort: 'Recommended',
                  brands: [],
                  sizes: [],
                  condition: 'Any',
                })
              }
            />
          </Reanimated.View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    paddingBottom: Space.xs,
  },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  searchBtn: { width: 44, height: 44, borderRadius: Radius.full, alignItems: 'center', justifyContent: 'center' },

  titleContainer: {
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    paddingBottom: Space.lg,
  },
  hugeTitle: {
    fontSize: 32,
    fontFamily: Typography.family.bold,
    letterSpacing: -0.8,
    lineHeight: 38,
  },
  itemCountText: {
    fontSize: 14,
    fontFamily: Typography.family.medium,
    marginTop: 6,
  },

  filterBar: { paddingBottom: 16 },
  filterRow: { paddingHorizontal: 20, gap: 8, alignItems: 'center' },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
  },
  filterPillActive: {
    borderWidth: StyleSheet.hairlineWidth,
  },
  filterPillTextActive: { fontSize: 13, fontFamily: Typography.family.semibold },
  filterPillOutline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
  },
  filterPillText: { fontSize: 13, fontFamily: Typography.family.medium },
  saveSearchPillActive: {
    borderWidth: 1,
  },
  saveSearchTextActive: {
    fontFamily: Typography.family.semibold,
  },
  syncRetryBanner: {
    marginHorizontal: 20,
    marginBottom: 14,
  },

  gridContent: { paddingHorizontal: 20, paddingBottom: 100 },
  rowWrapper: { justifyContent: 'space-between', marginBottom: 32 },
  loadingStateWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    rowGap: 32,
  },
  loadingCard: {
    width: ITEM_WIDTH,
  },
  loadingCardOffset: {
    marginTop: 24,
  },
  loadingCardBody: {
    marginTop: 10,
    paddingHorizontal: 4,
  },

  gridItem: { width: ITEM_WIDTH },
  imageWrap: {
    width: ITEM_WIDTH,
    borderRadius: Radius.sm,
    overflow: 'hidden',
    marginBottom: 12,
  },
  gridImageContainer: {
    width: '100%',
    aspectRatio: 0.8,
    borderRadius: Radius.lg,
  },
  gridImage: { width: '100%', height: '100%' },
  sharedImageLayer: {
    ...StyleSheet.absoluteFill,
  },
  likeBtn: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  infoWrap: { paddingHorizontal: 4 },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  priceText: { fontSize: 18, fontFamily: Typography.family.bold },
  brandText: { fontSize: 12, fontFamily: Typography.family.bold, textTransform: 'uppercase' },
  sizeText: { fontSize: 13, fontFamily: Typography.family.medium },
  sellerActionRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  sellerIdentityChip: {
    flex: 1,
    minHeight: 28,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
  },
  sellerActionAvatarWrap: {
    width: 18,
    height: 18,
    borderRadius: 9,
  },
  sellerActionAvatar: {
    width: 18,
    height: 18,
    borderRadius: 9,
  },
  sellerActionAvatarFallback: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sellerActionHandle: {
    flex: 1,
    fontSize: 11,
    fontFamily: Typography.family.semibold,
  },
  sellerMessageBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});