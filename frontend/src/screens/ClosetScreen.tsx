import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  RefreshControl,
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
import { Type, Space, Radius } from '../theme/designTokens';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useBackendData } from '../context/BackendDataContext';
import { EmptyState } from '../components/EmptyState';
import { SyncRetryBanner } from '../components/SyncRetryBanner';
import { SkeletonLoader } from '../components/SkeletonLoader';
import { RefreshIndicator } from '../components/RefreshIndicator';
import { MasonryGrid } from '../components/ProductCardV2';
import { AppSegmentControl } from '../components/ui/AppSegmentControl';
import { AppInput } from '../components/ui/AppInput';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { useHaptic } from '../hooks/useHaptic';
import { CollectionCard } from '../components/closet/CollectionCard';
import { AppButton } from '../components/ui/AppButton';
import { Typography } from '../constants/typography';

type TabKey = 'SAVED' | 'WISHLIST' | 'COLLECTIONS';
type SortOption = 'Recently Added' | 'Price: Low to High' | 'Price: High to Low' | 'Newest';
type NavT = StackNavigationProp<RootStackParamList>;

const SORT_OPTIONS: SortOption[] = ['Recently Added', 'Price: Low to High', 'Price: High to Low', 'Newest'];

export default function ClosetScreen() {
  const navigation = useNavigation<NavT>();
  const haptic = useHaptic();
  const [activeTab, setActiveTab] = useState<TabKey>('SAVED');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('Recently Added');
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const scrollY = useSharedValue(0);

  const wishlistIds = useStore((state) => state.wishlist);
  const savedProductIds = useStore((state) => state.savedProducts);
  const collections = useStore((state) => state.collections);
  const createCollection = useStore((state) => state.createCollection);
  const { listings, refreshListings, isSyncing, lastError } = useBackendData();

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshListings();
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
      case 'Recently Added':
      default:
        return items;
    }
  }, [sortBy]);

  const filteredSaved = useMemo(() => {
    const filtered = savedItems.filter((l) =>
      !searchQuery ||
      l.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.brand?.toLowerCase().includes(searchQuery.toLowerCase())
    );
    return sortItems(filtered);
  }, [savedItems, searchQuery, sortItems]);

  const filteredWishlist = useMemo(() => {
    const filtered = wishlistItems.filter((l) =>
      !searchQuery ||
      l.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.brand?.toLowerCase().includes(searchQuery.toLowerCase())
    );
    return sortItems(filtered);
  }, [wishlistItems, searchQuery, sortItems]);

  const filteredCollections = useMemo(
    () => collections.filter((c) =>
      !searchQuery ||
      c.name.toLowerCase().includes(searchQuery.toLowerCase())
    ),
    [collections, searchQuery]
  );

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
    setSearchQuery('');
  };

  const handleCreateCollection = useCallback(() => {
    haptic.medium();
    // Quick inline creation with default name
    const newId = createCollection('New Collection');
    navigation.navigate('CollectionDetail', { collectionId: newId });
  }, [createCollection, haptic, navigation]);

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
          icon="bookmark-outline"
          title="No saved products yet"
          subtitle="Tap the bookmark on any product to save it here."
          ctaLabel="Browse"
          onCtaPress={handleBrowse}
          suggestedActions={[
            { label: 'Trending', onPress: () => navigation.navigate('Browse', { categoryId: 'all', title: 'Trending' }) },
            { label: 'New Arrivals', onPress: () => navigation.navigate('Browse', { categoryId: 'all', title: 'New Arrivals' }) },
          ]}
        />
      );
    }
    return (
      <Reanimated.View entering={FadeInDown.duration(300).delay(50)}>
        {renderSortBar()}
        {renderSortMenu()}
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
          icon="heart-outline"
          title="Your wishlist is empty"
          subtitle="Heart items to track them."
          ctaLabel="Browse"
          onCtaPress={handleBrowse}
          suggestedActions={[
            { label: 'Streetwear', onPress: () => navigation.navigate('Browse', { categoryId: 'streetwear', title: 'Streetwear' }) },
            { label: 'Vintage', onPress: () => navigation.navigate('Browse', { categoryId: 'vintage', title: 'Vintage' }) },
          ]}
        />
      );
    }
    return (
      <Reanimated.View entering={FadeInDown.duration(300).delay(50)}>
        {renderSortBar()}
        {renderSortMenu()}
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
          icon="folder-open-outline"
          title="No collections yet"
          subtitle="Group your saved items into boards."
          ctaLabel="Create Collection"
          onCtaPress={handleCreateCollection}
        />
      );
    }
    return (
      <Reanimated.View entering={FadeInDown.duration(300).delay(50)} style={styles.collectionsList}>
        {renderSortBar()}
        {filteredCollections.map((collection, index) => (
          <Reanimated.View
            key={collection.id}
            entering={FadeInDown.duration(250).delay(index * 40)}
          >
            <CollectionCard
              collection={collection}
              onPress={() => navigation.navigate('CollectionDetail', { collectionId: collection.id })}
            />
          </Reanimated.View>
        ))}
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
          <Text style={styles.headerLabel}>CLOSET</Text>
          <Text style={styles.headerTitle}>Closet</Text>
        </View>
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

        {/* Tabs */}
        <View style={styles.tabsWrap}>
          <AppSegmentControl
            options={[
              { value: 'SAVED', label: `Saved`, icon: <Ionicons name="bookmark-outline" size={14} color={Colors.textSecondary} /> },
              { value: 'WISHLIST', label: `Wishlist`, icon: <Ionicons name="heart-outline" size={14} color={Colors.textSecondary} /> },
              { value: 'COLLECTIONS', label: `Collections`, icon: <Ionicons name="folder-open-outline" size={14} color={Colors.textSecondary} /> },
            ]}
            value={activeTab}
            onChange={handleTabChange}
            fullWidth
          />
        </View>

        {/* Content */}
        {activeTab === 'SAVED' && renderSavedContent()}
        {activeTab === 'WISHLIST' && renderWishlistContent()}
        {activeTab === 'COLLECTIONS' && renderCollectionsContent()}

        <View style={{ height: 120 }} />
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
  headerLabel: {
    fontSize: 10,
    fontFamily: Typography.family.bold,
    color: Colors.brand,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  headerTitle: {
    fontSize: 22,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
    marginTop: 2,
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
});
