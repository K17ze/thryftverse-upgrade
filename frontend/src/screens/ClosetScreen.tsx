import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  RefreshControl,
  ScrollView,
  Share,
  Alert,
  Dimensions,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Reanimated, {
  useSharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAppTheme } from '../theme/ThemeContext';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useBackendData } from '../context/BackendDataContext';
import { EmptyState } from '../components/EmptyState';
import { FlagshipEmptyGraphic, FlagshipHeader } from '../components/flagship';
import { SyncRetryBanner } from '../components/SyncRetryBanner';
import { SkeletonLoader } from '../components/SkeletonLoader';
import { RefreshIndicator } from '../components/RefreshIndicator';
import { MasonryGrid } from '../components/ProductCardV2';
import { ClosetMediaMosaic } from '../components/closet/ClosetMediaMosaic';
import { AppInput } from '../components/ui/AppInput';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { useHaptic } from '../hooks/useHaptic';
import { AppButton } from '../components/ui/AppButton';
import { MoodboardCollectionGrid } from '../components/profile/MoodboardCollectionGrid';
import { BoardEmptyGraphic } from '../components/profile/BoardEmptyGraphic';
import { OutfitCard } from '../components/outfit/OutfitCard';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { Type, Space, Radius, DockConstants, Typography, Stroke, LetterSpacing, Layout, AspectRatio } from '../theme/designTokens';
type TabKey = 'SAVED' | 'WISHLIST' | 'COLLECTIONS' | 'OUTFITS';
type SortOption = 'Default' | 'Price: Low to High' | 'Price: High to Low' | 'Newest' | 'Recently saved';
type NavT = NativeStackNavigationProp<RootStackParamList>;

const SORT_OPTIONS: SortOption[] = ['Default', 'Recently saved', 'Price: Low to High', 'Price: High to Low', 'Newest'];

// ── Mosaic geometry — matches ClosetMediaMosaic tile dimensions so the
//    loading skeleton preserves the final 3:4 portrait silhouette and
//    avoids layout shift when media decodes (AGENTS.md §14, §16). ──
const { width: SCREEN_W } = Dimensions.get('window');
const SKEL_COLUMNS = 3;
const SKEL_GAP = Space.sm;
const SKEL_PADDING = Space.md;
const SKEL_TILE_W =
  (SCREEN_W - SKEL_PADDING * 2 - SKEL_GAP * (SKEL_COLUMNS - 1)) / SKEL_COLUMNS;
const SKEL_TILE_H = SKEL_TILE_W / AspectRatio.portrait;

// ── Board card skeleton geometry — matches ClosetBoardCard 2-column grid ──
const BOARD_COLS = 2;
const BOARD_GAP = Space.sm;
const BOARD_CARD_W = (SCREEN_W - Space.md * 2 - BOARD_GAP) / BOARD_COLS;
const BOARD_CARD_H = BOARD_CARD_W / AspectRatio.portrait + 8;

export default function ClosetScreen() {
  const { colors, isDark } = useAppTheme();

  const t = StyleSheet.create({
    container: { backgroundColor: colors.background },
    headerBorder: { backgroundColor: colors.background, borderBottomColor: colors.border },
    tabBar: { borderBottomColor: colors.border },
    tabLabel: { color: colors.textSecondary },
    tabLabelActive: { color: colors.textPrimary },
    tabIndicator: { backgroundColor: colors.textPrimary },
    countPill: { backgroundColor: 'transparent', borderColor: colors.border },
    countBadge: { color: colors.textMuted },
    sortMenu: { backgroundColor: 'transparent', borderColor: 'transparent' },
    sortOption: { borderBottomColor: colors.border },
    sortOptionActive: { backgroundColor: 'transparent' },
    sortOptionText: { color: colors.textPrimary },
    sortOptionTextActive: { color: colors.brand },
    filterChip: { backgroundColor: 'transparent', borderColor: colors.border },
    filterChipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
    filterChipText: { color: colors.brand },
    filterChipTextActive: { color: colors.background },
    identityStrip: {
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    paddingBottom: Space.sm,
    marginBottom: Space.sm,
    borderBottomWidth: Stroke.hairline,
    borderBottomColor: colors.border,
  },
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
  const [collectionsLoading, setCollectionsLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [manageMode, setManageMode] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');
  const scrollY = useSharedValue(0);
  const refreshTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const wishlistIds = useStore((state) => state.wishlist);
  const savedProductIds = useStore((state) => state.savedProducts);
  const collections = useStore((state) => state.collections);
  const outfits = useStore((state) => state.outfits);
  const removeOutfit = useStore((state) => state.removeOutfit);
  const loadCollectionsFromApi = useStore((state) => state.loadCollectionsFromApi);
  const deleteCollection = useStore((state) => state.deleteCollection);
  const deleteCollectionOnApi = useStore((state) => state.deleteCollectionOnApi);
  const renameCollection = useStore((state) => state.renameCollection);
  const reorderCollections = useStore((state) => state.reorderCollections);
  const currentUser = useStore((state) => state.currentUser);
  const { listings, refreshListings, isSyncing, lastError } = useBackendData();
  React.useEffect(() => {
    let mounted = true;
    setCollectionsLoading(true);
    void loadCollectionsFromApi()
      .then(() => { if (mounted) { setCollectionsSyncError(false); setCollectionsLoading(false); } })
      .catch(() => { if (mounted) { setCollectionsSyncError(true); setCollectionsLoading(false); } });
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

  const filteredOutfits = useMemo(
    () => outfits.filter((o) =>
      !searchQuery ||
      o.name.toLowerCase().includes(searchQuery.toLowerCase())
    ),
    [outfits, searchQuery]
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
      case 'OUTFITS': return filteredOutfits.length;
    }
  }, [activeTab, filteredSaved, filteredWishlist, filteredCollections, filteredOutfits]);

  const searchPlaceholder = useMemo(() => {
    switch (activeTab) {
      case 'SAVED': return 'Search saved items';
      case 'WISHLIST': return 'Search wishlist';
      case 'COLLECTIONS': return 'Search collections';
      case 'OUTFITS': return 'Search outfits';
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

  const handleCreateOutfit = useCallback(() => {
    haptic.medium();
    navigation.navigate('OutfitBuilder');
  }, [haptic, navigation]);

  const handleDeleteCollection = useCallback((id: string, name: string) => {
    haptic.medium();
    Alert.alert(
      'Delete Collection?',
      `"${name}" will be permanently removed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            haptic.medium();
            void deleteCollectionOnApi(id).catch(() => {
              // Fallback to local delete if API fails
              deleteCollection(id);
            });
          },
        },
      ]
    );
  }, [haptic, deleteCollection, deleteCollectionOnApi]);

  const handleStartRename = useCallback((id: string, currentName: string) => {
    haptic.light();
    setRenamingId(id);
    setRenameText(currentName);
  }, [haptic]);

  const handleConfirmRename = useCallback(() => {
    if (renamingId && renameText.trim().length > 0) {
      haptic.light();
      renameCollection(renamingId, renameText.trim());
    }
    setRenamingId(null);
    setRenameText('');
  }, [renamingId, renameText, haptic, renameCollection]);

  const handleCancelRename = useCallback(() => {
    setRenamingId(null);
    setRenameText('');
  }, []);

  const handleMoveCollection = useCallback((index: number, direction: -1 | 1) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= collections.length) return;
    haptic.light();
    reorderCollections(index, newIndex);
  }, [haptic, reorderCollections, collections.length]);

  const handleToggleManage = useCallback(() => {
    haptic.light();
    setManageMode((v) => !v);
  }, [haptic]);

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
    OUTFITS: 'shirt-outline' as const,
  };

  const renderLoadingSkeleton = () => (
    <View style={styles.skeletonWrap}>
      <View style={styles.skeletonRow}>
        <SkeletonLoader width={SKEL_TILE_W} height={SKEL_TILE_H} borderRadius={Radius.lg} />
        <SkeletonLoader width={SKEL_TILE_W} height={SKEL_TILE_H} borderRadius={Radius.lg} />
        <SkeletonLoader width={SKEL_TILE_W} height={SKEL_TILE_H} borderRadius={Radius.lg} />
      </View>
      <View style={styles.skeletonRow}>
        <SkeletonLoader width={SKEL_TILE_W} height={SKEL_TILE_H} borderRadius={Radius.lg} />
        <SkeletonLoader width={SKEL_TILE_W} height={SKEL_TILE_H} borderRadius={Radius.lg} />
        <SkeletonLoader width={SKEL_TILE_W} height={SKEL_TILE_H} borderRadius={Radius.lg} />
      </View>
    </View>
  );

  const renderCollectionsSkeleton = () => (
    <View style={styles.boardSkeletonWrap}>
      <View style={styles.boardSkeletonRow}>
        <SkeletonLoader width={BOARD_CARD_W} height={BOARD_CARD_H} borderRadius={Radius.lg} />
        <SkeletonLoader width={BOARD_CARD_W} height={BOARD_CARD_H} borderRadius={Radius.lg} />
      </View>
      <View style={styles.boardSkeletonRow}>
        <SkeletonLoader width={BOARD_CARD_W} height={BOARD_CARD_H} borderRadius={Radius.lg} />
        <SkeletonLoader width={BOARD_CARD_W} height={BOARD_CARD_H} borderRadius={Radius.lg} />
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
      <>
        {/* 3-column media mosaic — 3:4 portrait thumbnails, media-first */}
        <ClosetMediaMosaic
          items={filteredSaved}
          onPressItem={(item) => navigation.navigate('ItemDetail', { itemId: item.id })}
          showSaveButton
        />
      </>
    );
  };

  const renderWishlistContent = () => {
    if (isSyncing && listings.length === 0) return renderLoadingSkeleton();
    if (filteredWishlist.length === 0) {
      return (
        <EmptyState
          graphic={<FlagshipEmptyGraphic variant="bag" size={120} />}
          title="Your wishlist is empty"
          subtitle="Heart items to track price drops and get notified when they go on sale."
          ctaLabel="Browse"
          onCtaPress={handleBrowse}
        />
      );
    }
    return (
      <>
        <ClosetMediaMosaic
          items={filteredWishlist}
          onPressItem={(item) => navigation.navigate('ItemDetail', { itemId: item.id })}
          showWishlistButton
        />
      </>
    );
  };

    const renderCollectionsContent = () => {
    if (collectionsLoading && collections.length === 0) return renderCollectionsSkeleton();
    if (filteredCollections.length === 0) {
      return (
        <EmptyState
          graphic={<BoardEmptyGraphic title="No collections" subtitle="Create your first board" icon="folder-open-outline" size={140} />}
          title="No collections yet"
          subtitle="Group saved items by style, season, or vibe."
          ctaLabel="Create collection"
          onCtaPress={handleCreateCollection}
        />
      );
    }

    const boardData = filteredCollections.map((collection) => {
      const covers = collection.itemIds
        .slice(0, 4)
        .map((id) => listings.find((l) => l.id === id))
        .filter((l): l is NonNullable<typeof listings[0]> => !!l && Array.isArray(l.images) && l.images.length > 0)
        .map((l) => l.images[0]);
      return {
        id: collection.id,
        title: collection.name,
        itemCount: collection.itemIds?.length ?? 0,
        covers,
        updatedAt: collection.updatedAt,
        isPrivate: collection.isPrivate === true,
      };
    });

    return (
      <>
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
      </>
    );
  };

  const renderOutfitsContent = () => {
    if (filteredOutfits.length === 0) {
      if (outfits.length === 0) {
        return (
          <EmptyState
            graphic={<FlagshipEmptyGraphic variant="bag" size={120} />}
            title="No outfits yet"
            subtitle="Combine items from your closet into styled outfits."
            ctaLabel="Create Outfit"
            onCtaPress={handleCreateOutfit}
          />
        );
      }
      return (
        <EmptyState
          icon="search-outline"
          title="No outfits found"
          subtitle={`No outfits matching "${searchQuery}".`}
        />
      );
    }

    const outfitBoardData = filteredOutfits.map((outfit) => {
      const thumbs = outfit.itemIds
        .slice(0, 4)
        .map((id) => listings.find((l) => l.id === id))
        .filter((l): l is NonNullable<typeof listings[0]> => !!l && Array.isArray(l.images) && l.images.length > 0)
        .map((l) => l.images[0]);
      return {
        ...outfit,
        thumbs,
      };
    });

    return (
      <>
        <View style={styles.outfitsGrid}>
          {outfitBoardData.map((outfit) => (
            <OutfitCard
              key={outfit.id}
              name={outfit.name}
              itemIds={outfit.itemIds}
              thumbnailUris={outfit.thumbs}
              backgroundColor={outfit.backgroundColor}
              onPress={() => navigation.navigate('OutfitBuilder')}
              onLongPress={() => {
                Alert.alert(
                  'Delete Outfit?',
                  `"${outfit.name}" will be removed from your outfits.`,
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Delete',
                      style: 'destructive',
                      onPress: () => {
                        haptic.medium();
                        removeOutfit(outfit.id);
                      },
                    },
                  ]
                );
              }}
              style={styles.outfitCard}
            />
          ))}
        </View>
        <AppButton
          title="Create Outfit"
          icon={<Ionicons name="add" size={16} color={colors.background} />}
          onPress={handleCreateOutfit}
          style={styles.createCollectionBtn}
        />
      </>
    );
  };


  return (
    <SafeAreaView style={[styles.container, t.container]} edges={['top']}>
      <StatusBar barStyle={!isDark ? 'dark-content' : 'light-content'} backgroundColor={colors.background} />

      {/* Animated Header Border */}
      <Reanimated.View style={[styles.headerBorder, t.headerBorder, headerBgStyle]} pointerEvents="none" />

      {/* Header — FlagshipHeader primitive (canonical header, 44pt back hit area) */}
      <FlagshipHeader
        title="Closet"
        onBack={handleGoBack}
        rightAction={
          <View style={styles.headerRightActions}>
            <AnimatedPressable
              style={styles.shareBtn}
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
        }
      />

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

        {/* Tabs — immediately after header, before any stats/filters */}
        <View style={styles.tabsWrap}>
          <View style={[styles.tabBar, t.tabBar]}>
            {(['SAVED', 'WISHLIST', 'COLLECTIONS', 'OUTFITS'] as TabKey[]).map((tab) => {
              const isActive = activeTab === tab;
              const tabCounts = {
                SAVED: savedItems.length,
                WISHLIST: wishlistItems.length,
                COLLECTIONS: collections.length,
                OUTFITS: outfits.length,
              };
              const tabLabel = tab === 'SAVED' ? 'Saved' : tab === 'WISHLIST' ? 'Wishlist' : tab === 'COLLECTIONS' ? 'Collections' : 'Outfits';
              return (
                <AnimatedPressable
                  key={tab}
                  style={styles.tabItem}
                  onPress={() => handleTabChange(tab)}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isActive }}
                  accessibilityLabel={`${tabLabel.toLowerCase()} tab, ${tabCounts[tab]} items`}
                >
                  <Text style={[styles.tabLabel, t.tabLabel, isActive && styles.tabLabelActive, isActive && t.tabLabelActive]}>
                    {tabLabel}
                  </Text>
                  {isActive && <View style={[styles.tabIndicator, t.tabIndicator]} />}
                </AnimatedPressable>
              );
            })}
          </View>
        </View>

        {/* Compact search + sort/filter toolbar — single icons, not chip walls */}
        <View style={styles.closetToolbar}>
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
            containerStyle={{ flex: 1, marginBottom: 0 }}
          />
          {activeTab === 'SAVED' || activeTab === 'WISHLIST' ? (
            <>
              <AnimatedPressable
                style={styles.closetToolbarBtn}
                onPress={() => setShowSortMenu((v) => !v)}
                accessibilityLabel={`Sort by ${sortBy}`}
                accessibilityRole="button"
              >
                <Ionicons name="swap-vertical" size={20} color={colors.textPrimary} />
              </AnimatedPressable>
              <AnimatedPressable
                style={styles.closetToolbarBtn}
                onPress={() => { haptic.light(); setShowFilters((v) => !v); }}
                accessibilityLabel={showFilters ? 'Close filters' : 'Open filters'}
                accessibilityRole="button"
              >
                <Ionicons name="options-outline" size={20} color={colors.textPrimary} />
                {activeBrand ? (
                  <View style={styles.closetToolbarBadge}>
                    <Text style={styles.closetToolbarBadgeText}>1</Text>
                  </View>
                ) : null}
              </AnimatedPressable>
            </>
          ) : null}
        </View>

        {/* Sort menu — compact dropdown */}
        {showSortMenu && (activeTab === 'SAVED' || activeTab === 'WISHLIST') ? (
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
        ) : null}

        {/* Brand filter panel — only visible when filter icon is tapped */}
        {showFilters && (activeTab === 'SAVED' || activeTab === 'WISHLIST') && availableBrands.length > 1 ? (
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
        ) : null}

        {/* Price drop filter — only on wishlist, compact chip */}
        {activeTab === 'WISHLIST' && priceDropCount > 0 ? (
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

        {/* Content — grid follows the identity strip */}
        {/* Closet identity strip — flat canvas + hairline dividers, no card.
            This is the closet's headline (value, items, collections, savings),
            promoted to the first viewport so the surface reads as an identity
            moment, not a footer (AGENTS.md §4 — no card-on-card, hierarchy). */}
        {closetStats.totalItems > 0 ? (
          <View style={t.identityStrip}>
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

        {activeTab === 'SAVED' && renderSavedContent()}
        {activeTab === 'WISHLIST' && renderWishlistContent()}
        {activeTab === 'COLLECTIONS' && renderCollectionsContent()}
        {activeTab === 'OUTFITS' && renderOutfitsContent()}

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
    height: Space.xxl + Space.xl + Space.sm + 2,
    zIndex: 1,
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  shareBtn: {
    width: Space.xl + Space.sm,
    height: Space.xl + Space.sm,
    borderRadius: Radius.md,
    borderWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBar: {
    flexDirection: 'row',
    gap: Space.lg,
    borderBottomWidth: Stroke.hairline,
  },
  tabItem: {
    paddingVertical: Space.sm,
    position: 'relative',
  },
  tabLabel: {
    fontSize: Type.bodyStrong.size,
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
    height: Stroke.emphasis,
    borderTopLeftRadius: Radius.none + 1,
    borderTopRightRadius: Radius.none + 1,
  },
  countPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    paddingHorizontal: Space.xs + 2,
    paddingVertical: Space.xs,
    borderRadius: Radius.full,
    borderWidth: 0,
  },
  countBadge: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.bold,
  },
  searchWrap: {
    paddingHorizontal: Space.md,
    marginBottom: Space.md,
  },
  closetToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.md,
    gap: Space.sm,
    marginBottom: Space.sm,
  },
  closetToolbarBtn: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  closetToolbarBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    minWidth: 16,
    height: 16,
    borderRadius: Radius.full,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  closetToolbarBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontFamily: Typography.family.bold,
    lineHeight: 12,
  },
  tabsWrap: {
    paddingHorizontal: Space.md,
    marginBottom: Space.sm,
  },
  scrollContent: {
    paddingTop: Space.xs,
  },
  sortMenu: {
    marginHorizontal: Space.md,
    marginBottom: Space.sm,
    borderRadius: Radius.none,
    borderWidth: 0,
    overflow: 'visible',
  },
  sortOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingVertical: Space.smMd,
    borderBottomWidth: Stroke.hairline,
  },
  sortOptionActive: {
  },
  sortOptionText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.medium,
  },
  sortOptionTextActive: {
    fontFamily: Typography.family.bold,
  },
  filterChipRow: {
    flexDirection: 'row',
    paddingHorizontal: Space.md,
    marginBottom: Space.sm,
    gap: Space.sm,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs / 2 + 1,
    paddingHorizontal: Space.smMd,
    paddingVertical: Space.xs / 2 + 2,
    borderRadius: Radius.md,
    borderWidth: Stroke.hairline,
    minHeight: Space.xl + Space.xs,
  },
  filterChipActive: {
  },
  filterChipText: {
    fontSize: Type.caption.size,
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
  outfitsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: Space.md,
    gap: Space.sm,
    paddingTop: Space.sm,
  },
  outfitCard: {
    width: (Layout.screenWidth - Space.md * 2 - Space.sm) / 2,
  },
  skeletonWrap: {
    paddingHorizontal: SKEL_PADDING,
    gap: SKEL_GAP,
    marginTop: Space.sm,
  },
  skeletonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  boardSkeletonWrap: {
    paddingHorizontal: Space.md,
    gap: BOARD_GAP,
    marginTop: Space.sm,
  },
  boardSkeletonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    gap: Space.xs / 2,
  },
  statDivider: {
    width: Stroke.standard,
    height: Space.lg + 4,
  },
  statValue: {
    fontSize: Type.sectionTitle.size,
    fontFamily: Typography.family.bold,
    letterSpacing: LetterSpacing.tight + LetterSpacing.wide,
  },
  statLabel: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.medium,
    textTransform: 'uppercase',
    letterSpacing: LetterSpacing.caps + LetterSpacing.tight,
  },
  savingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs / 2 + 1,
    marginTop: Space.sm,
    paddingTop: Space.sm,
    borderTopWidth: Stroke.hairline,
  },
  savingsText: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
  },
  brandChipScroll: {
    marginBottom: Space.sm,
  },
  brandChipContent: {
    paddingHorizontal: Space.md,
    gap: Space.xs + 2,
  },
  brandChip: {
    paddingHorizontal: Space.smMd,
    paddingVertical: Space.xs / 2 + 2,
    borderRadius: Radius.md,
    borderWidth: Stroke.hairline,
    minHeight: Space.xl + Space.xs,
    justifyContent: 'center',
  },
  brandChipActive: {
  },
  brandChipText: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
  },
  brandChipTextActive: {
  },
});
