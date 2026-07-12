import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  RefreshControl,
  ScrollView,
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Reanimated, {
  FadeInDown,
  useSharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useAppTheme } from '../theme/ThemeContext';
import { Type, Space, Radius, DockConstants } from '../theme/designTokens';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useBackendData } from '../context/BackendDataContext';
import { EmptyState } from '../components/EmptyState';
import { FlagshipEmptyGraphic } from '../components/flagship';
import { SyncRetryBanner } from '../components/SyncRetryBanner';
import { SkeletonLoader } from '../components/SkeletonLoader';
import { RefreshIndicator } from '../components/RefreshIndicator';
import { MasonryGrid } from '../components/ProductCardV2';
import { AppInput } from '../components/ui/AppInput';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { useHaptic } from '../hooks/useHaptic';
import { AppButton } from '../components/ui/AppButton';
import { BottomSheet } from '../components/BottomSheet';
import { Typography } from '../theme/designTokens';
import { MoodboardCollectionGrid } from '../components/profile/MoodboardCollectionGrid';
import { BoardEmptyGraphic } from '../components/profile/BoardEmptyGraphic';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useReducedMotion } from '../hooks/useReducedMotion';

type TabKey = 'SAVED' | 'WISHLIST' | 'COLLECTIONS';
type SortOption = 'Default' | 'Price: Low to High' | 'Price: High to Low' | 'Newest' | 'Recently saved';
type NavT = StackNavigationProp<RootStackParamList>;

const SORT_OPTIONS: SortOption[] = ['Default', 'Recently saved', 'Price: Low to High', 'Price: High to Low', 'Newest'];

export default function ClosetScreen() {
  const { colors, isDark } = useAppTheme();
  const navigation = useNavigation<NavT>();
  const haptic = useHaptic();
  const { formatFromFiat } = useFormattedPrice();
  const reducedMotionEnabled = useReducedMotion();
  const [activeTab, setActiveTab] = useState<TabKey>('SAVED');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('Default');
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [showFilterSheet, setShowFilterSheet] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showPriceDropsOnly, setShowPriceDropsOnly] = useState(false);
  const [activeBrand, setActiveBrand] = useState<string | null>(null);
  const scrollY = useSharedValue(0);

  const wishlistIds = useStore((state) => state.wishlist);
  const savedProductIds = useStore((state) => state.savedProducts);
  const collections = useStore((state) => state.collections);
  const loadCollectionsFromApi = useStore((state) => state.loadCollectionsFromApi);
  const currentUser = useStore((state) => state.currentUser);
  const { listings, refreshListings, isSyncing, lastError } = useBackendData();

  React.useEffect(() => {
    void loadCollectionsFromApi();
  }, [loadCollectionsFromApi]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshListings();
    await loadCollectionsFromApi();
    setTimeout(() => setRefreshing(false), 350);
  };

  const handleGoBack = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate('MainTabs');
    }
  }, [navigation]);

  const handleBrowse = useCallback(() => {
    navigation.navigate('GlobalSearch');
  }, [navigation]);

  const savedItems = useMemo(
    () => listings.filter((l) => savedProductIds?.includes(l.id) ?? false),
    [listings, savedProductIds]
  );

  const wishlistItems = useMemo(
    () => listings.filter((l) => wishlistIds?.includes(l.id) ?? false),
    [listings, wishlistIds]
  );

  const sortItems = useCallback((items: typeof listings) => {
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
        const sourceIds = activeTab === 'WISHLIST' ? wishlistIds : savedProductIds;
        const idOrder = new Map((sourceIds ?? []).map((id, idx) => [id, idx]));
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
  }, [sortBy, activeTab, wishlistIds, savedProductIds]);

  const filteredSaved = useMemo(() => {
    let filtered = savedItems.filter((l) =>
      !searchQuery ||
      l.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.brand?.toLowerCase().includes(searchQuery.toLowerCase())
    );
    if (activeBrand) {
      filtered = filtered.filter((l) => l.brand === activeBrand);
    }
    return sortItems(filtered);
  }, [savedItems, searchQuery, sortItems, activeBrand]);

  const filteredWishlist = useMemo(() => {
    let filtered = wishlistItems.filter((l) =>
      !searchQuery ||
      l.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.brand?.toLowerCase().includes(searchQuery.toLowerCase())
    );
    if (activeBrand) {
      filtered = filtered.filter((l) => l.brand === activeBrand);
    }
    if (showPriceDropsOnly) {
      filtered = filtered.filter((l) => l.originalPrice != null && l.originalPrice > l.price);
    }
    return sortItems(filtered);
  }, [wishlistItems, searchQuery, sortItems, showPriceDropsOnly, activeBrand]);

  const filteredCollections = useMemo(
    () => collections.filter((c) =>
      !searchQuery ||
      c.name.toLowerCase().includes(searchQuery.toLowerCase())
    ),
    [collections, searchQuery]
  );

  const priceDropCount = useMemo(
    () => wishlistItems.filter((l) => l.originalPrice != null && l.originalPrice > l.price).length,
    [wishlistItems]
  );

  // Closet stats — total value and savings across saved + wishlist
  const closetStats = useMemo(() => {
    const allItems = [...savedItems, ...wishlistItems];
    const uniqueItems = Array.from(new Map(allItems.map((l) => [l.id, l])).values());
    const totalValue = uniqueItems.reduce((sum, l) => sum + (l.price ?? 0), 0);
    const totalSavings = uniqueItems.reduce((sum, l) => {
      if (l.originalPrice != null && l.originalPrice > l.price) {
        return sum + (l.originalPrice - l.price);
      }
      return sum;
    }, 0);
    return {
      totalItems: uniqueItems.length,
      totalValue,
      totalSavings,
      collectionsCount: collections.length,
    };
  }, [savedItems, wishlistItems, collections]);

  // Brand filter — extract unique brands from the active tab's items
  const availableBrands = useMemo(() => {
    const source = activeTab === 'WISHLIST' ? wishlistItems : savedItems;
    const brands = source
      .map((l) => l.brand)
      .filter((b): b is string => !!b && b.trim().length > 0);
    return Array.from(new Set(brands)).sort((a, b) => a.localeCompare(b)).slice(0, 12);
  }, [activeTab, savedItems, wishlistItems]);

  const handleShareCloset = useCallback(async () => {
    haptic.light();
    const username = currentUser?.username ?? 'on Thryftverse';
    try {
      await Share.share({
        message: `Check out my closet @${username} on Thryftverse!`,
      });
    } catch { /* user cancelled */ }
  }, [haptic, currentUser]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (activeBrand) count++;
    if (showPriceDropsOnly) count++;
    if (sortBy !== 'Default') count++;
    return count;
  }, [activeBrand, showPriceDropsOnly, sortBy]);

  const handleClearFilters = useCallback(() => {
    haptic.light();
    setActiveBrand(null);
    setShowPriceDropsOnly(false);
    setSortBy('Default');
  }, [haptic]);

  const tabCount = useMemo(() => {
    switch (activeTab) {
      case 'SAVED': return filteredSaved.length;
      case 'WISHLIST': return filteredWishlist.length;
      case 'COLLECTIONS': return filteredCollections.length;
    }
  }, [activeTab, filteredSaved, filteredWishlist, filteredCollections]);

  const searchPlaceholder = useMemo(() => {
    switch (activeTab) {
      case 'SAVED': return 'Search saved items';
      case 'WISHLIST': return 'Search wishlist';
      case 'COLLECTIONS': return 'Search collections';
    }
  }, [activeTab]);

  const handleTabChange = (tab: TabKey) => {
    haptic.light();
    setActiveTab(tab);
  };

  const handleCreateCollection = useCallback(() => {
    haptic.medium();
    navigation.navigate('CreateCollection');
  }, [haptic, navigation]);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.value = e.contentOffset.y;
    },
  });

  const headerBgStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [0, 40], [0, 1], Extrapolation.CLAMP),
    borderBottomWidth: interpolate(scrollY.value, [0, 40], [0, 1], Extrapolation.CLAMP),
  }));

  const TAB_ICONS = {
    SAVED: 'bookmark-outline' as const,
    WISHLIST: 'heart-outline' as const,
    COLLECTIONS: 'folder-open-outline' as const,
  };

  const renderBrandChips = () => {
    if (availableBrands.length <= 1) return null;
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.brandChipScroll}
        contentContainerStyle={styles.brandChipContent}
      >
        <AnimatedPressable
          style={[styles.brandChip, { backgroundColor: colors.surface, borderColor: colors.border }, !activeBrand && { backgroundColor: colors.brand, borderColor: colors.brand }]}
          onPress={() => { haptic.light(); setActiveBrand(null); }}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityState={{ selected: !activeBrand }}
          accessibilityLabel="All brands"
        >
          <Text style={[styles.brandChipText, { color: !activeBrand ? colors.background : colors.textSecondary }]}>All</Text>
        </AnimatedPressable>
        {availableBrands.map((brand) => (
          <AnimatedPressable
            key={brand}
            style={[styles.brandChip, { backgroundColor: colors.surface, borderColor: colors.border }, activeBrand === brand && { backgroundColor: colors.brand, borderColor: colors.brand }]}
            onPress={() => {
              haptic.light();
              setActiveBrand((prev) => (prev === brand ? null : brand));
            }}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityState={{ selected: activeBrand === brand }}
            accessibilityLabel={`Filter by brand ${brand}`}
          >
            <Text style={[styles.brandChipText, { color: activeBrand === brand ? colors.background : colors.textSecondary }]}>{brand}</Text>
          </AnimatedPressable>
        ))}
      </ScrollView>
    );
  };

  const renderCompactFilterBar = () => (
    <View style={styles.sortBar}>
      <Text style={[styles.resultCount, { color: colors.textSecondary }]}>{tabCount} {tabCount === 1 ? 'item' : 'items'}</Text>
      {activeTab !== 'COLLECTIONS' && (
        <AnimatedPressable
          style={[styles.sortBtn, { backgroundColor: colors.surfaceAlt, borderColor: activeFilterCount > 0 ? colors.brand : colors.border }]}
          onPress={() => setShowFilterSheet(true)}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={`Filter and sort${activeFilterCount > 0 ? `, ${activeFilterCount} active` : ''}`}
        >
          <Ionicons name="options-outline" size={14} color={activeFilterCount > 0 ? colors.brand : colors.textMuted} />
          <Text style={[styles.sortLabel, { color: activeFilterCount > 0 ? colors.brand : colors.textSecondary }]}>
            {activeFilterCount > 0 ? `Filters (${activeFilterCount})` : 'Filter'}
          </Text>
        </AnimatedPressable>
      )}
    </View>
  );

  const renderFilterSheet = () => (
    <BottomSheet
      visible={showFilterSheet}
      onDismiss={() => setShowFilterSheet(false)}
    >
      {/* Sheet title */}
      <View style={styles.sheetTitleRow}>
        <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>Filter & Sort</Text>
        <AnimatedPressable
          onPress={() => setShowFilterSheet(false)}
          activeOpacity={0.85}
          hitSlop={8}
          accessibilityLabel="Close filter sheet"
          accessibilityRole="button"
        >
          <Ionicons name="close" size={20} color={colors.textMuted} />
        </AnimatedPressable>
      </View>

      {/* Sort section */}
      <View style={styles.sheetSection}>
        <Text style={[styles.sheetSectionTitle, { color: colors.textSecondary }]}>Sort by</Text>
        {SORT_OPTIONS.map((opt) => (
          <AnimatedPressable
            key={opt}
            style={[styles.sheetOption, { borderBottomColor: colors.border }, sortBy === opt && { backgroundColor: colors.surfaceAlt }]}
            onPress={() => { haptic.light(); setSortBy(opt); }}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityState={{ selected: sortBy === opt }}
          >
            <Text style={[styles.sheetOptionText, { color: sortBy === opt ? colors.brand : colors.textPrimary }]}>{opt}</Text>
            {sortBy === opt && <Ionicons name="checkmark" size={16} color={colors.brand} />}
          </AnimatedPressable>
        ))}
      </View>

      {/* Brand filter section — only for SAVED and WISHLIST tabs */}
      {availableBrands.length > 1 && (
        <View style={styles.sheetSection}>
          <Text style={[styles.sheetSectionTitle, { color: colors.textSecondary }]}>Brand</Text>
          <View style={styles.sheetChipWrap}>
            <AnimatedPressable
              style={[styles.sheetChip, { backgroundColor: colors.surface, borderColor: colors.border }, !activeBrand && { backgroundColor: colors.brand, borderColor: colors.brand }]}
              onPress={() => { haptic.light(); setActiveBrand(null); }}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityState={{ selected: !activeBrand }}
              accessibilityLabel="All brands"
            >
              <Text style={[styles.sheetChipText, { color: !activeBrand ? colors.background : colors.textSecondary }]}>All</Text>
            </AnimatedPressable>
            {availableBrands.map((brand) => (
              <AnimatedPressable
                key={brand}
                style={[styles.sheetChip, { backgroundColor: colors.surface, borderColor: colors.border }, activeBrand === brand && { backgroundColor: colors.brand, borderColor: colors.brand }]}
                onPress={() => {
                  haptic.light();
                  setActiveBrand((prev) => (prev === brand ? null : brand));
                }}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityState={{ selected: activeBrand === brand }}
                accessibilityLabel={`Filter by brand ${brand}`}
              >
                <Text style={[styles.sheetChipText, { color: activeBrand === brand ? colors.background : colors.textSecondary }]}>{brand}</Text>
              </AnimatedPressable>
            ))}
          </View>
        </View>
      )}

      {/* Price drop toggle — only on wishlist */}
      {activeTab === 'WISHLIST' && priceDropCount > 0 && (
        <View style={styles.sheetSection}>
          <Text style={[styles.sheetSectionTitle, { color: colors.textSecondary }]}>Availability</Text>
          <AnimatedPressable
            style={[styles.sheetOption, { borderBottomColor: colors.border }, showPriceDropsOnly && { backgroundColor: colors.surfaceAlt }]}
            onPress={() => { haptic.light(); setShowPriceDropsOnly((v) => !v); }}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityState={{ selected: showPriceDropsOnly }}
            accessibilityLabel={`Filter price drops: ${priceDropCount} items on sale`}
          >
            <View style={styles.sheetOptionLeft}>
              <Ionicons name="pricetag-outline" size={15} color={colors.brand} />
              <Text style={[styles.sheetOptionText, { color: showPriceDropsOnly ? colors.brand : colors.textPrimary }]}>
                Price drops ({priceDropCount})
              </Text>
            </View>
            {showPriceDropsOnly && <Ionicons name="checkmark" size={16} color={colors.brand} />}
          </AnimatedPressable>
        </View>
      )}

      {/* Clear all */}
      {activeFilterCount > 0 && (
        <AppButton
          title="Clear all filters"
          variant="secondary"
          size="md"
          onPress={handleClearFilters}
          style={styles.clearFiltersBtn}
        />
      )}
    </BottomSheet>
  );

  const renderLoadingSkeleton = () => (
    <View style={styles.skeletonWrap}>
      <View style={styles.skeletonRow}>
        <SkeletonLoader width="48%" height={200} borderRadius={Radius.lg} />
        <SkeletonLoader width="48%" height={260} borderRadius={Radius.lg} />
      </View>
      <View style={styles.skeletonRow}>
        <SkeletonLoader width="48%" height={240} borderRadius={Radius.lg} />
        <SkeletonLoader width="48%" height={180} borderRadius={Radius.lg} />
      </View>
    </View>
  );

  const renderSavedContent = () => {
    if (isSyncing && listings.length === 0) return renderLoadingSkeleton();
    if (filteredSaved.length === 0) {
      return (
        <EmptyState
          graphic={<FlagshipEmptyGraphic variant="bag" size={120} />}
          title="No saved products yet"
          subtitle="Tap the bookmark on any product to save it here."
          ctaLabel="Browse"
          onCtaPress={handleBrowse}
        />
      );
    }
    return (
      <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300).delay(50)}>
        {renderCompactFilterBar()}
        <MasonryGrid
          items={filteredSaved}
          onPressItem={(item) => navigation.navigate('ItemDetail', { itemId: item.id })}
          numColumns={2}
          showSaveButton
        />
      </Reanimated.View>
    );
  };

  const renderWishlistContent = () => {
    if (isSyncing && listings.length === 0) return renderLoadingSkeleton();
    if (filteredWishlist.length === 0) {
      return (
        <EmptyState
          graphic={<FlagshipEmptyGraphic variant="bag" size={120} />}
          title="Your wishlist is empty"
          subtitle="Heart items to track them."
          ctaLabel="Browse"
          onCtaPress={handleBrowse}
        />
      );
    }
    return (
      <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300).delay(50)}>
        {renderCompactFilterBar()}
        <MasonryGrid
          items={filteredWishlist}
          onPressItem={(item) => navigation.navigate('ItemDetail', { itemId: item.id })}
          numColumns={2}
          showSaveButton
        />
      </Reanimated.View>
    );
  };

    const renderCollectionsContent = () => {
    if (filteredCollections.length === 0) {
      return (
        <EmptyState
          graphic={<BoardEmptyGraphic title="No collections" subtitle="Create your first moodboard" icon="folder-open-outline" size={140} />}
          title="No collections yet"
          subtitle="Group your saved items into boards."
          ctaLabel="Create Collection"
          onCtaPress={handleCreateCollection}
        />
      );
    }

    const boardData = filteredCollections.map((collection) => {
      const covers = collection.itemIds
        .slice(0, 3)
        .map((id) => listings.find((l) => l.id === id))
        .filter((l): l is NonNullable<typeof listings[0]> => !!l && Array.isArray(l.images) && l.images.length > 0)
        .map((l) => l.images[0]);
      return {
        id: collection.id,
        title: collection.name,
        itemCount: collection.itemIds?.length ?? 0,
        covers,
      };
    });

    return (
      <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300).delay(50)}>
        {renderCompactFilterBar()}
        <MoodboardCollectionGrid
          boards={boardData}
          onPressBoard={(id) => navigation.navigate('CollectionDetail', { collectionId: id })}
        />
        {/* FAB-style create button on Collections tab */}
        <AppButton
          title="Create Collection"
          icon={<Ionicons name="add" size={16} color={colors.background} />}
          onPress={handleCreateCollection}
          style={styles.createCollectionBtn}
        />
      </Reanimated.View>
    );
  };


  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />

      {/* Animated Header Border */}
      <Reanimated.View style={[styles.headerBorder, headerBgStyle, { backgroundColor: colors.background, borderBottomColor: colors.border }]} pointerEvents="none" />

      {/* Header */}
      <View style={styles.header}>
        <AnimatedPressable style={[styles.backBtn, { borderColor: colors.border, backgroundColor: colors.surface }]} onPress={handleGoBack} activeOpacity={0.85}>
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </AnimatedPressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Closet</Text>
        </View>
        <AnimatedPressable
          style={[styles.shareBtn, { borderColor: colors.border, backgroundColor: colors.surface }]}
          onPress={handleShareCloset}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Share closet"
        >
          <Ionicons name="share-outline" size={20} color={colors.textPrimary} />
        </AnimatedPressable>
        <View style={[styles.countPill, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
          <Ionicons name={TAB_ICONS[activeTab]} size={12} color={colors.textMuted} />
          <Text style={[styles.countBadge, { color: colors.textMuted }]}>{tabCount}</Text>
        </View>
      </View>

      <RefreshIndicator scrollY={scrollY} isRefreshing={refreshing} topInset={20} />

      <Reanimated.ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="transparent"
            colors={['transparent']}
            progressBackgroundColor="transparent"
          />
        }
      >
        {/* Search Bar */}
        <View style={styles.searchWrap}>
          <AppInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder={searchPlaceholder}
            prefix={<Ionicons name="search" size={18} color={colors.textMuted} />}
            suffix={
              searchQuery.length > 0 ? (
                <AnimatedPressable onPress={() => setSearchQuery('')} accessibilityLabel="Clear search">
                  <Ionicons name="close-circle" size={18} color={colors.textMuted} />
                </AnimatedPressable>
              ) : null
            }
            containerStyle={{ marginBottom: 0 }}
          />
        </View>

        {/* Error banner */}
        {lastError && (
          <View style={{ paddingHorizontal: Space.md, marginBottom: Space.sm }}>
            <SyncRetryBanner
              message="Saved items are unavailable. Showing cached results."
              onRetry={() => void refreshListings()}
              isRetrying={isSyncing}
              telemetryContext="closet_sync"
            />
          </View>
        )}

        {/* Tabs */}
        <View style={styles.tabsWrap}>
          <View style={[styles.tabBar, { borderBottomColor: colors.border }]}>
            {(['SAVED', 'WISHLIST', 'COLLECTIONS'] as TabKey[]).map((tab) => {
              const isActive = activeTab === tab;
              const tabCounts = {
                SAVED: savedItems.length,
                WISHLIST: wishlistItems.length,
                COLLECTIONS: collections.length,
              };
              return (
                <AnimatedPressable
                  key={tab}
                  style={styles.tabItem}
                  onPress={() => handleTabChange(tab)}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isActive }}
                  accessibilityLabel={`${tab.toLowerCase()} tab, ${tabCounts[tab]} items`}
                >
                  <Text style={[styles.tabLabel, { color: isActive ? colors.textPrimary : colors.textSecondary }]}>
                    {tab === 'SAVED' ? 'Saved' : tab === 'WISHLIST' ? 'Wishlist' : 'Collections'}
                  </Text>
                  {isActive && <View style={[styles.tabIndicator, { backgroundColor: colors.textPrimary }]} />}
                </AnimatedPressable>
              );
            })}
          </View>
        </View>

        {/* Content */}
        {activeTab === 'SAVED' && renderSavedContent()}
        {activeTab === 'WISHLIST' && renderWishlistContent()}
        {activeTab === 'COLLECTIONS' && renderCollectionsContent()}

        {/* Closet stats summary — behind media per audit 8.7 */}
        {closetStats.totalItems > 0 ? (
          <View style={[styles.statsCardBehind, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.statsSectionTitle, { color: colors.textSecondary }]}>Closet summary</Text>
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: colors.textPrimary }]}>{closetStats.totalItems}</Text>
                <Text style={[styles.statLabel, { color: colors.textMuted }]}>Items</Text>
              </View>
              <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: colors.textPrimary }]}>{formatFromFiat(closetStats.totalValue, 'GBP')}</Text>
                <Text style={[styles.statLabel, { color: colors.textMuted }]}>Total value</Text>
              </View>
              <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: colors.textPrimary }]}>{closetStats.collectionsCount}</Text>
                <Text style={[styles.statLabel, { color: colors.textMuted }]}>Collections</Text>
              </View>
            </View>
            {closetStats.totalSavings > 0 ? (
              <View style={[styles.savingsRow, { borderTopColor: colors.border }]}>
                <Ionicons name="trending-down" size={12} color={colors.success} />
                <Text style={[styles.savingsText, { color: colors.success }]}>
                  {formatFromFiat(closetStats.totalSavings, 'GBP')} in price drops tracked
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}

        <View style={{ height: DockConstants.singleActionHeight }} />
      </Reanimated.ScrollView>

      {/* Compact filter sheet — consolidates sort, brand, and price drop filters per audit 8.7 */}
      {renderFilterSheet()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerBorder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 90,
    zIndex: 1,
  },
  header: {
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    paddingBottom: Space.md - Space.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    zIndex: 2,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 22,
    fontFamily: Typography.family.bold,
  },
  tabBar: {
    flexDirection: 'row',
    gap: Space.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tabItem: {
    paddingVertical: Space.sm,
    position: 'relative',
  },
  tabLabel: {
    fontSize: 15,
    fontFamily: Typography.family.medium,
  },
  tabLabelActive: {
    fontFamily: Typography.family.bold,
  },
  tabIndicator: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    borderTopLeftRadius: 1,
    borderTopRightRadius: 1,
  },
  countPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  countBadge: {
    fontSize: 12,
    fontFamily: Typography.family.bold,
  },
  searchWrap: {
    paddingHorizontal: Space.md,
    marginBottom: Space.sm,
  },
  tabsWrap: {
    paddingHorizontal: Space.md,
    marginBottom: Space.md,
  },
  scrollContent: {
    paddingTop: Space.sm,
  },
  sortBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    marginBottom: Space.sm,
  },
  resultCount: {
    fontSize: 12,
    fontFamily: Typography.family.semibold,
  },
  sortBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  sortLabel: {
    fontSize: 12,
    fontFamily: Typography.family.semibold,
  },
  sortMenu: {
    marginHorizontal: Space.md,
    marginBottom: Space.sm,
    borderRadius: Radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  sortOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  sortOptionActive: {
  },
  sortOptionText: {
    fontSize: 14,
    fontFamily: Typography.family.medium,
  },
  sortOptionTextActive: {
    fontFamily: Typography.family.bold,
  },
  filterChipRow: {
    flexDirection: 'row',
    paddingHorizontal: Space.md,
    marginBottom: Space.sm,
    gap: 8,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.md,
    borderWidth: 1,
    minHeight: 32,
  },
  filterChipActive: {
  },
  filterChipText: {
    fontSize: 12,
    fontFamily: Typography.family.semibold,
  },
  filterChipTextActive: {
  },
  collectionsList: {
    paddingHorizontal: Space.md,
  },
  createCollectionBtn: {
    marginTop: Space.lg,
    marginBottom: Space.md,
  },
  skeletonWrap: {
    paddingHorizontal: Space.md,
    gap: Space.sm,
    marginTop: Space.sm,
  },
  skeletonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Space.sm,
  },
  statsCard: {
    marginHorizontal: Space.md,
    marginBottom: Space.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Space.md,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  statDivider: {
    width: 1,
    height: 28,
  },
  statValue: {
    fontSize: 17,
    fontFamily: Typography.family.bold,
    letterSpacing: -0.3,
  },
  statLabel: {
    fontSize: 11,
    fontFamily: Typography.family.medium,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  savingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: Space.sm,
    paddingTop: Space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  savingsText: {
    fontSize: 12,
    fontFamily: Typography.family.semibold,
  },
  brandChipScroll: {
    marginBottom: Space.sm,
  },
  brandChipContent: {
    paddingHorizontal: Space.md,
    gap: 6,
  },
  brandChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.md,
    borderWidth: 1,
    minHeight: 32,
    justifyContent: 'center',
  },
  brandChipActive: {
  },
  brandChipText: {
    fontSize: 12,
    fontFamily: Typography.family.semibold,
  },
  brandChipTextActive: {
  },
  // Compact filter bar — active state
  sortBtnActive: {
  },
  sortLabelActive: {
  },
  // Stats card behind media
  statsCardBehind: {
    marginHorizontal: Space.md,
    marginTop: Space.xl,
    marginBottom: Space.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Space.md,
  },
  statsSectionTitle: {
    fontSize: 13,
    fontFamily: Typography.family.semibold,
    marginBottom: Space.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  // Filter sheet styles
  sheetTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Space.md,
  },
  sheetTitle: {
    fontSize: 18,
    fontFamily: Typography.family.bold,
  },
  sheetSection: {
    marginBottom: Space.md,
  },
  sheetSectionTitle: {
    fontSize: 13,
    fontFamily: Typography.family.semibold,
    marginBottom: Space.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  sheetOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sheetOptionActive: {
    paddingHorizontal: Space.sm,
    borderRadius: Radius.md,
    marginHorizontal: -Space.sm,
  },
  sheetOptionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  sheetOptionText: {
    fontSize: 14,
    fontFamily: Typography.family.medium,
  },
  sheetOptionTextActive: {
    fontFamily: Typography.family.bold,
  },
  sheetChipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  sheetChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Radius.md,
    borderWidth: 1,
    minHeight: 36,
    justifyContent: 'center',
  },
  sheetChipActive: {
  },
  sheetChipText: {
    fontSize: 13,
    fontFamily: Typography.family.semibold,
  },
  sheetChipTextActive: {
  },
  clearFiltersBtn: {
    marginTop: Space.sm,
  },
});