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
import { ActiveTheme, Colors } from '../constants/colors';
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
  const navigation = useNavigation<NavT>();
  const haptic = useHaptic();
  const { formatFromFiat } = useFormattedPrice();
  const reducedMotionEnabled = useReducedMotion();
  const [activeTab, setActiveTab] = useState<TabKey>('SAVED');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('Default');
  const [showSortMenu, setShowSortMenu] = useState(false);
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
          style={[styles.brandChip, !activeBrand && styles.brandChipActive]}
          onPress={() => { haptic.light(); setActiveBrand(null); }}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityState={{ selected: !activeBrand }}
          accessibilityLabel="All brands"
        >
          <Text style={[styles.brandChipText, !activeBrand && styles.brandChipTextActive]}>All</Text>
        </AnimatedPressable>
        {availableBrands.map((brand) => (
          <AnimatedPressable
            key={brand}
            style={[styles.brandChip, activeBrand === brand && styles.brandChipActive]}
            onPress={() => {
              haptic.light();
              setActiveBrand((prev) => (prev === brand ? null : brand));
            }}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityState={{ selected: activeBrand === brand }}
            accessibilityLabel={`Filter by brand ${brand}`}
          >
            <Text style={[styles.brandChipText, activeBrand === brand && styles.brandChipTextActive]}>{brand}</Text>
          </AnimatedPressable>
        ))}
      </ScrollView>
    );
  };

  const renderSortBar = () => (
    <View style={styles.sortBar}>
      <Text style={styles.resultCount}>{tabCount} {tabCount === 1 ? 'item' : 'items'}</Text>
      <AnimatedPressable
        style={styles.sortBtn}
        onPress={() => setShowSortMenu((v) => !v)}
        activeOpacity={0.85}
      >
        <Text style={styles.sortLabel}>{sortBy}</Text>
        <Ionicons name={showSortMenu ? 'chevron-up' : 'chevron-down'} size={14} color={Colors.textMuted} />
      </AnimatedPressable>
    </View>
  );

  const renderSortMenu = () => {
    if (!showSortMenu || activeTab === 'COLLECTIONS') return null;
    return (
      <View style={styles.sortMenu}>
        {SORT_OPTIONS.map((opt) => (
          <AnimatedPressable
            key={opt}
            style={[styles.sortOption, sortBy === opt && styles.sortOptionActive]}
            onPress={() => {
              haptic.light();
              setSortBy(opt);
              setShowSortMenu(false);
            }}
            activeOpacity={0.85}
          >
            <Text style={[styles.sortOptionText, sortBy === opt && styles.sortOptionTextActive]}>{opt}</Text>
            {sortBy === opt && <Ionicons name="checkmark" size={16} color={Colors.brand} />}
          </AnimatedPressable>
        ))}
      </View>
    );
  };

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
        {renderSortBar()}
        {renderSortMenu()}
        {/* Brand filter chips */}
        {availableBrands.length > 1 ? renderBrandChips() : null}
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
        {renderSortBar()}
        {renderSortMenu()}
        {/* Brand filter chips */}
        {availableBrands.length > 1 ? renderBrandChips() : null}
        {/* Price drop filter chip — only on wishlist */}
        {priceDropCount > 0 ? (
          <View style={styles.filterChipRow}>
            <AnimatedPressable
              style={[styles.filterChip, showPriceDropsOnly && styles.filterChipActive]}
              onPress={() => {
                haptic.light();
                setShowPriceDropsOnly((v) => !v);
              }}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityState={{ selected: showPriceDropsOnly }}
              accessibilityLabel={`Filter price drops: ${priceDropCount} items on sale`}
            >
              <Ionicons name="pricetag-outline" size={13} color={showPriceDropsOnly ? Colors.background : Colors.brand} />
              <Text style={[styles.filterChipText, showPriceDropsOnly && styles.filterChipTextActive]}>
                Price drops ({priceDropCount})
              </Text>
            </AnimatedPressable>
          </View>
        ) : null}
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
        {renderSortBar()}
        <MoodboardCollectionGrid
          boards={boardData}
          onPressBoard={(id) => navigation.navigate('CollectionDetail', { collectionId: id })}
        />
        {/* FAB-style create button on Collections tab */}
        <AppButton
          title="Create Collection"
          icon={<Ionicons name="add" size={16} color={Colors.background} />}
          onPress={handleCreateCollection}
          style={styles.createCollectionBtn}
        />
      </Reanimated.View>
    );
  };


  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'} backgroundColor={Colors.background} />

      {/* Animated Header Border */}
      <Reanimated.View style={[styles.headerBorder, headerBgStyle]} pointerEvents="none" />

      {/* Header */}
      <View style={styles.header}>
        <AnimatedPressable style={styles.backBtn} onPress={handleGoBack} activeOpacity={0.85}>
          <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
        </AnimatedPressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Closet</Text>
        </View>
        <AnimatedPressable
          style={styles.shareBtn}
          onPress={handleShareCloset}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Share closet"
        >
          <Ionicons name="share-outline" size={20} color={Colors.textPrimary} />
        </AnimatedPressable>
        <View style={styles.countPill}>
          <Ionicons name={TAB_ICONS[activeTab]} size={12} color={Colors.textMuted} />
          <Text style={styles.countBadge}>{tabCount}</Text>
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
            prefix={<Ionicons name="search" size={18} color={Colors.textMuted} />}
            suffix={
              searchQuery.length > 0 ? (
                <AnimatedPressable onPress={() => setSearchQuery('')} accessibilityLabel="Clear search">
                  <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
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

        {/* Closet stats summary — total items, value, savings */}
        {closetStats.totalItems > 0 ? (
          <View style={styles.statsCard}>
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{closetStats.totalItems}</Text>
                <Text style={styles.statLabel}>Items</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{formatFromFiat(closetStats.totalValue, 'GBP')}</Text>
                <Text style={styles.statLabel}>Total value</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{closetStats.collectionsCount}</Text>
                <Text style={styles.statLabel}>Collections</Text>
              </View>
            </View>
            {closetStats.totalSavings > 0 ? (
              <View style={styles.savingsRow}>
                <Ionicons name="trending-down" size={12} color={Colors.success} />
                <Text style={styles.savingsText}>
                  {formatFromFiat(closetStats.totalSavings, 'GBP')} in price drops tracked
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Tabs */}
        <View style={styles.tabsWrap}>
          <View style={styles.tabBar}>
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
                  <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
                    {tab === 'SAVED' ? 'Saved' : tab === 'WISHLIST' ? 'Wishlist' : 'Collections'}
                  </Text>
                  {isActive && <View style={styles.tabIndicator} />}
                </AnimatedPressable>
              );
            })}
          </View>
        </View>

        {/* Content */}
        {activeTab === 'SAVED' && renderSavedContent()}
        {activeTab === 'WISHLIST' && renderWishlistContent()}
        {activeTab === 'COLLECTIONS' && renderCollectionsContent()}

        <View style={{ height: DockConstants.singleActionHeight }} />
      </Reanimated.ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  headerBorder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 90,
    backgroundColor: Colors.background,
    borderBottomColor: Colors.border,
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
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 22,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
  },
  tabBar: {
    flexDirection: 'row',
    gap: Space.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  tabItem: {
    paddingVertical: Space.sm,
    position: 'relative',
  },
  tabLabel: {
    fontSize: 15,
    fontFamily: Typography.family.medium,
    color: Colors.textSecondary,
  },
  tabLabelActive: {
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
  },
  tabIndicator: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: Colors.textPrimary,
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
    backgroundColor: Colors.surfaceAlt,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  countBadge: {
    fontSize: 12,
    fontFamily: Typography.family.bold,
    color: Colors.textMuted,
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
    color: Colors.textSecondary,
  },
  sortBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceAlt,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sortLabel: {
    fontSize: 12,
    fontFamily: Typography.family.semibold,
    color: Colors.textSecondary,
  },
  sortMenu: {
    marginHorizontal: Space.md,
    marginBottom: Space.sm,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  sortOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  sortOptionActive: {
    backgroundColor: Colors.surfaceAlt,
  },
  sortOptionText: {
    fontSize: 14,
    fontFamily: Typography.family.medium,
    color: Colors.textPrimary,
  },
  sortOptionTextActive: {
    fontFamily: Typography.family.bold,
    color: Colors.brand,
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
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    minHeight: 32,
  },
  filterChipActive: {
    backgroundColor: Colors.brand,
    borderColor: Colors.brand,
  },
  filterChipText: {
    fontSize: 12,
    fontFamily: Typography.family.semibold,
    color: Colors.brand,
  },
  filterChipTextActive: {
    color: Colors.background,
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
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
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
    backgroundColor: Colors.border,
  },
  statValue: {
    fontSize: 17,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
    letterSpacing: -0.3,
  },
  statLabel: {
    fontSize: 11,
    fontFamily: Typography.family.medium,
    color: Colors.textMuted,
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
    borderTopColor: Colors.border,
  },
  savingsText: {
    fontSize: 12,
    fontFamily: Typography.family.semibold,
    color: Colors.success,
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
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    minHeight: 32,
    justifyContent: 'center',
  },
  brandChipActive: {
    backgroundColor: Colors.brand,
    borderColor: Colors.brand,
  },
  brandChipText: {
    fontSize: 12,
    fontFamily: Typography.family.semibold,
    color: Colors.textSecondary,
  },
  brandChipTextActive: {
    color: Colors.background,
  },
});