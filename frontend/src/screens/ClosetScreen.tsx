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
import { Type, Space, Radius, DockConstants } from '../theme/designTokens';
import { useAppTheme } from '../theme/ThemeContext';
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
  const { colors, isDark } = useAppTheme();

  const t = StyleSheet.create({
    container: { backgroundColor: colors.background },
    headerBorder: { backgroundColor: colors.background, borderBottomColor: colors.border },
    backBtn: { borderColor: colors.border, backgroundColor: 'transparent' },
    shareBtn: { borderColor: colors.border, backgroundColor: 'transparent' },
    headerTitle: { color: colors.textPrimary },
    tabBar: { borderBottomColor: colors.border },
    tabLabel: { color: colors.textSecondary },
    tabLabelActive: { color: colors.textPrimary },
    tabIndicator: { backgroundColor: colors.textPrimary },
    countPill: { backgroundColor: 'transparent', borderColor: colors.border },
    countBadge: { color: colors.textMuted },
    resultCount: { color: colors.textSecondary },
    sortBtn: { backgroundColor: 'transparent', borderColor: colors.border },
    sortLabel: { color: colors.textSecondary },
    sortMenu: { backgroundColor: 'transparent', borderColor: 'transparent' },
    sortOption: { borderBottomColor: colors.border },
    sortOptionActive: { backgroundColor: 'transparent' },
    sortOptionText: { color: colors.textPrimary },
    sortOptionTextActive: { color: colors.brand },
    filterChip: { backgroundColor: 'transparent', borderColor: colors.border },
    filterChipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
    filterChipText: { color: colors.brand },
    filterChipTextActive: { color: colors.background },
    statsCard: { backgroundColor: 'transparent', borderColor: 'transparent' },
    statDivider: { backgroundColor: colors.border },
    statValue: { color: colors.textPrimary },
    statLabel: { color: colors.textMuted },
    savingsRow: { borderTopColor: colors.border },
    savingsText: { color: colors.success },
    brandChip: { backgroundColor: 'transparent', borderColor: colors.border },
    brandChipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
    brandChipText: { color: colors.textSecondary },
    brandChipTextActive: { color: colors.background },
  });

  const navigation = useNavigation<NavT>();
  const haptic = useHaptic();
  const { formatFromFiat } = useFormattedPrice();
  const [activeTab, setActiveTab] = useState<TabKey>('SAVED');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('Default');
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showPriceDropsOnly, setShowPriceDropsOnly] = useState(false);
  const [activeBrand, setActiveBrand] = useState<string | null>(null);
  const [collectionsSyncError, setCollectionsSyncError] = useState(false);
  const scrollY = useSharedValue(0);
  const refreshTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const wishlistIds = useStore((state) => state.wishlist);
  const savedProductIds = useStore((state) => state.savedProducts);
  const collections = useStore((state) => state.collections);
  const loadCollectionsFromApi = useStore((state) => state.loadCollectionsFromApi);
  const currentUser = useStore((state) => state.currentUser);
  const { listings, refreshListings, isSyncing, lastError } = useBackendData();
  const reducedMotionEnabled = useReducedMotion();

  React.useEffect(() => {
    let mounted = true;
    void loadCollectionsFromApi()
      .then(() => { if (mounted) setCollectionsSyncError(false); })
      .catch(() => { if (mounted) setCollectionsSyncError(true); });
    return () => {
      mounted = false;
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
    };
  }, [loadCollectionsFromApi]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([refreshListings(), loadCollectionsFromApi()]);
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
          style={[styles.brandChip, t.brandChip, !activeBrand && styles.brandChipActive, !activeBrand && t.brandChipActive]}
          onPress={() => { haptic.light(); setActiveBrand(null); }}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityState={{ selected: !activeBrand }}
          accessibilityLabel="All brands"
        >
          <Text style={[styles.brandChipText, t.brandChipText, !activeBrand && styles.brandChipTextActive, !activeBrand && t.brandChipTextActive]}>All</Text>
        </AnimatedPressable>
        {availableBrands.map((brand) => (
          <AnimatedPressable
            key={brand}
            style={[styles.brandChip, t.brandChip, activeBrand === brand && styles.brandChipActive, activeBrand === brand && t.brandChipActive]}
            onPress={() => {
              haptic.light();
              setActiveBrand((prev) => (prev === brand ? null : brand));
            }}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityState={{ selected: activeBrand === brand }}
            accessibilityLabel={`Filter by brand ${brand}`}
          >
            <Text style={[styles.brandChipText, t.brandChipText, activeBrand === brand && styles.brandChipTextActive, activeBrand === brand && t.brandChipTextActive]}>{brand}</Text>
          </AnimatedPressable>
        ))}
      </ScrollView>
    );
  };

  const renderSortBar = () => (
    <View style={styles.sortBar}>
      <Text style={[styles.resultCount, t.resultCount]}>{tabCount} {tabCount === 1 ? 'item' : 'items'}</Text>
      <AnimatedPressable
        style={[styles.sortBtn, t.sortBtn]}
        onPress={() => setShowSortMenu((v) => !v)}
        activeOpacity={0.85}
      >
        <Text style={[styles.sortLabel, t.sortLabel]}>{sortBy}</Text>
        <Ionicons name={showSortMenu ? 'chevron-up' : 'chevron-down'} size={14} color={colors.textMuted} />
      </AnimatedPressable>
    </View>
  );

  const renderSortMenu = () => {
    if (!showSortMenu || activeTab === 'COLLECTIONS') return null;
    return (
      <View style={[styles.sortMenu, t.sortMenu]}>
        {SORT_OPTIONS.map((opt) => (
          <AnimatedPressable
            key={opt}
            style={[styles.sortOption, t.sortOption, sortBy === opt && styles.sortOptionActive, sortBy === opt && t.sortOptionActive]}
            onPress={() => {
              haptic.light();
              setSortBy(opt);
              setShowSortMenu(false);
            }}
            activeOpacity={0.85}
          >
            <Text style={[styles.sortOptionText, t.sortOptionText, sortBy === opt && styles.sortOptionTextActive, sortBy === opt && t.sortOptionTextActive]}>{opt}</Text>
            {sortBy === opt && <Ionicons name="checkmark" size={16} color={colors.brand} />}
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
              style={[styles.filterChip, t.filterChip, showPriceDropsOnly && styles.filterChipActive, showPriceDropsOnly && t.filterChipActive]}
              onPress={() => {
                haptic.light();
                setShowPriceDropsOnly((v) => !v);
              }}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityState={{ selected: showPriceDropsOnly }}
              accessibilityLabel={`Filter price drops: ${priceDropCount} items on sale`}
            >
              <Ionicons name="pricetag-outline" size={13} color={showPriceDropsOnly ? colors.background : colors.brand} />
              <Text style={[styles.filterChipText, t.filterChipText, showPriceDropsOnly && styles.filterChipTextActive, showPriceDropsOnly && t.filterChipTextActive]}>
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
          icon={<Ionicons name="add" size={16} color={colors.background} />}
          onPress={handleCreateCollection}
          style={styles.createCollectionBtn}
        />
      </Reanimated.View>
    );
  };


  return (
    <SafeAreaView style={[styles.container, t.container]} edges={['top']}>
      <StatusBar barStyle={!isDark ? 'dark-content' : 'light-content'} backgroundColor={colors.background} />

      {/* Animated Header Border */}
      <Reanimated.View style={[styles.headerBorder, t.headerBorder, headerBgStyle]} pointerEvents="none" />

      {/* Header */}
      <View style={styles.header}>
        <AnimatedPressable style={[styles.backBtn, t.backBtn]} onPress={handleGoBack} activeOpacity={0.85}>
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </AnimatedPressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, t.headerTitle]}>Closet</Text>
        </View>
        <AnimatedPressable
          style={[styles.shareBtn, t.shareBtn]}
          onPress={handleShareCloset}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Share closet"
        >
          <Ionicons name="share-outline" size={20} color={colors.textPrimary} />
        </AnimatedPressable>
        <View style={[styles.countPill, t.countPill]}>
          <Ionicons name={TAB_ICONS[activeTab]} size={12} color={colors.textMuted} />
          <Text style={[styles.countBadge, t.countBadge]}>{tabCount}</Text>
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
        {(lastError || collectionsSyncError) && (
          <View style={{ paddingHorizontal: Space.md, marginBottom: Space.sm }}>
            <SyncRetryBanner
              message={collectionsSyncError ? 'Collections are temporarily unavailable. Your saved items are still here.' : 'Saved items are unavailable. Showing cached results.'}
              onRetry={() => void handleRefresh()}
              isRetrying={isSyncing || refreshing}
              telemetryContext="closet_sync"
            />
          </View>
        )}

        {/* Closet stats summary — total items, value, savings */}
        {closetStats.totalItems > 0 ? (
          <View style={[styles.statsCard, t.statsCard]}>
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={[styles.statValue, t.statValue]}>{closetStats.totalItems}</Text>
                <Text style={[styles.statLabel, t.statLabel]}>Items</Text>
              </View>
              <View style={[styles.statDivider, t.statDivider]} />
              <View style={styles.statItem}>
                <Text style={[styles.statValue, t.statValue]}>{formatFromFiat(closetStats.totalValue, 'GBP')}</Text>
                <Text style={[styles.statLabel, t.statLabel]}>Total value</Text>
              </View>
              <View style={[styles.statDivider, t.statDivider]} />
              <View style={styles.statItem}>
                <Text style={[styles.statValue, t.statValue]}>{closetStats.collectionsCount}</Text>
                <Text style={[styles.statLabel, t.statLabel]}>Collections</Text>
              </View>
            </View>
            {closetStats.totalSavings > 0 ? (
              <View style={[styles.savingsRow, t.savingsRow]}>
                <Ionicons name="trending-down" size={12} color={colors.success} />
                <Text style={[styles.savingsText, t.savingsText]}>
                  {formatFromFiat(closetStats.totalSavings, 'GBP')} in price drops tracked
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Tabs */}
        <View style={styles.tabsWrap}>
          <View style={[styles.tabBar, t.tabBar]}>
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
                  <Text style={[styles.tabLabel, t.tabLabel, isActive && styles.tabLabelActive, isActive && t.tabLabelActive]}>
                    {tab === 'SAVED' ? 'Saved' : tab === 'WISHLIST' ? 'Wishlist' : 'Collections'}
                  </Text>
                  {isActive && <View style={[styles.tabIndicator, t.tabIndicator]} />}
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
    borderWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    borderWidth: 0,
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
    borderWidth: 0,
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
    borderWidth: StyleSheet.hairlineWidth,
  },
  sortLabel: {
    fontSize: 12,
    fontFamily: Typography.family.semibold,
  },
  sortMenu: {
    marginHorizontal: Space.md,
    marginBottom: Space.sm,
    borderRadius: 0,
    borderWidth: 0,
    overflow: 'visible',
  },
  sortOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
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
    borderWidth: StyleSheet.hairlineWidth,
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
    borderRadius: 0,
    borderWidth: 0,
    padding: Space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
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
    borderWidth: StyleSheet.hairlineWidth,
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
});
