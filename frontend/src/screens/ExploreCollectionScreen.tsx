import React, { useMemo, useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  useWindowDimensions,
  RefreshControl } from 'react-native';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useBackendData } from '../context/BackendDataContext';
import { useStore } from '../store/useStore';
import { PinterestMasonryGrid } from '../components/discover/PinterestMasonryGrid';
import { Space, Radius } from '../theme/designTokens';
import { TypographyV2, MAX_FONT_SCALE } from '../theme/typography.v2';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { useHaptic } from '../hooks/useHaptic';
import { useSignupWall } from '../hooks/useSignupWall';
import { SaveToCollectionModal } from '../components/closet/SaveToCollectionModal';
import { EmptyState } from '../components/EmptyState';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { SkeletonLoader } from '../components/SkeletonLoader';
import { DISCOVERY_GRID_INSET, DISCOVERY_GRID_PADDING } from '../components/discovery/unifiedDiscoveryStyles';
import { fetchFilteredListings } from '../services/listingsApi';
import { mapListingToDiscoverySummary } from '../contracts/DiscoveryListingSummary';
import type { Listing } from '../domain';
import { ProductAnalytics } from '../platform/product/productAnalytics';
import { openProductDetail } from '../platform/product/openProductDetail';

type NavT = NativeStackNavigationProp<RootStackParamList>;
type RouteT = RouteProp<RootStackParamList, 'ExploreCollection'>;

export default function ExploreCollectionScreen() {
  const route = useRoute<RouteT>();
  const navigation = useNavigation<NavT>();
  const haptic = useHaptic();
  const { requireAuth } = useSignupWall();
  const { colors } = useAppTheme();
  const { width: SCREEN_W } = useWindowDimensions();
  const styles = useMemo(() => createStyles(colors, SCREEN_W), [colors, SCREEN_W]);
  const { listings, isSyncing, refreshListings } = useBackendData();
  const savedProducts = useStore((state) => state.savedProducts);
  const toggleSavedProduct = useStore((state) => state.toggleSavedProduct);

  const { title, subtitle, source } = route.params ?? {};

  const [backendListings, setBackendListings] = useState<Listing[] | null>(null);
  const [isFetching, setIsFetching] = useState(false);
  // Long-press on a tile bookmark opens the save-to-collection picker
  // (the "file to board" tier; tap stays instant quick-save).
  const [savePickerItemId, setSavePickerItemId] = useState<string | null>(null);

  useEffect(() => {
    if (source.type === 'category' && source.categoryId && source.categoryId !== 'all') {
      let cancelled = false;
      setIsFetching(true);
      fetchFilteredListings({ category: source.categoryId, sort: 'newest', limit: 100 })
        .then((result) => {
          if (!cancelled) setBackendListings(result.listings);
        })
        .finally(() => { if (!cancelled) setIsFetching(false); });
      return () => { cancelled = true; };
    }
    if (source.type === 'brand' && source.brand) {
      let cancelled = false;
      setIsFetching(true);
      fetchFilteredListings({ brand: source.brand, sort: 'newest', limit: 100 })
        .then((result) => {
          if (!cancelled) setBackendListings(result.listings);
        })
        .finally(() => { if (!cancelled) setIsFetching(false); });
      return () => { cancelled = true; };
    }
    setBackendListings(null);
  }, [source.type, source.type === 'category' ? source.categoryId : undefined, source.type === 'brand' ? source.brand : undefined]);

  const filteredListings = useMemo(() => {
    const baseList = backendListings ?? listings;
    let result = [...baseList];
    switch (source.type) {
      case 'category':
        if (backendListings) {
          // Already filtered by backend
        } else {
          result = result.filter((l) => l.category === source.categoryId || l.subcategory === source.categoryId);
        }
        break;
      case 'brand':
        if (backendListings) {
          // Already filtered by backend
        } else {
          result = result.filter((l) => l.brand?.toLowerCase().includes(source.brand.toLowerCase()));
        }
        break;
      case 'price_drop':
        result = result.filter((l) => l.originalPrice && l.originalPrice > l.price);
        break;
      case 'newest':
        result.sort((a, b) => {
          const da = a.createdAt ? Date.parse(a.createdAt) : 0;
          const db = b.createdAt ? Date.parse(b.createdAt) : 0;
          return db - da;
        });
        break;
      case 'closet_affinity':
        if (savedProducts.length > 0) {
          const savedSet = new Set(savedProducts);
          result = result.filter((l) => savedSet.has(l.id));
        }
        break;
      case 'auction':
        // Auction filter not supported by current Listing model; show all
        break;
    }
    return result;
  }, [backendListings, listings, source, savedProducts]);

  const handleRefresh = useCallback(async () => {
    await refreshListings();
  }, [refreshListings]);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await handleRefresh();
    setIsRefreshing(false);
  }, [handleRefresh]);

  const handleItemPress = useCallback(
    (item: Listing) => {
      haptic.light();
      ProductAnalytics.itemView(item.id);
      openProductDetail(navigation, { referenceKind: 'listing', canonicalId: item.id, sourceSurface: 'ExploreCollection' });
    },
    [haptic, navigation],
  );

  const handleSaveToggle = useCallback(
    (listing: ReturnType<typeof mapListingToDiscoverySummary>) => {
      toggleSavedProduct(listing.id);
    },
    [toggleSavedProduct],
  );

  const handleSaveLongPress = useCallback(
    (listing: ReturnType<typeof mapListingToDiscoverySummary>) => {
      if (!requireAuth('save_item')) return;
      haptic.selection();
      setSavePickerItemId(listing.id);
    },
    [requireAuth, haptic],
  );

  const isItemSaved = useCallback(
    (listingId: string) => savedProducts.includes(listingId),
    [savedProducts],
  );

  // Quiet meta line — the header owns the title, so the content header only
  // carries what the title can't: optional context + the honest count. One
  // line, meta scale, aligned to the tile gutter via the bleed margin.
  const listHeader = useMemo(
    () => (
      <View style={styles.headerInfo}>
        <Text style={styles.headerMeta} numberOfLines={2} maxFontSizeMultiplier={MAX_FONT_SCALE.utility}>
          {subtitle ? `${subtitle} · ` : ''}
          {filteredListings.length} items
        </Text>
      </View>
    ),
    [subtitle, filteredListings.length, styles],
  );

  if ((isSyncing || isFetching) && filteredListings.length === 0) {
    return (
      <FlagshipScreen
        scrollEnabled={false}
        contentStyle={{ paddingHorizontal: 0, paddingTop: 0 }}
        header={<FlagshipHeader title={title} onBack={() => navigation.goBack()} />}
      >
        {/* Loading frame mirrors the 2-column masonry rhythm — varied tile
            heights, one text line, same gutter — so there is no
            loading→final geometry shift (AGENTS.md §14). */}
        <View style={styles.loadingWrap}>
          <View style={styles.loadingGrid}>
            {[0, 1].map((col) => (
              <View key={col} style={styles.loadingColumn}>
                {SKELETON_HEIGHTS.filter((_, i) => i % 2 === col).map((height, i) => (
                  <View key={i} style={styles.loadingCard}>
                    <SkeletonLoader width="100%" height={height} borderRadius={Radius.lg} />
                    <SkeletonLoader width="60%" height={12} borderRadius={Radius.sm} style={{ marginTop: Space.sm }} />
                  </View>
                ))}
              </View>
            ))}
          </View>
        </View>
      </FlagshipScreen>
    );
  }

  if (filteredListings.length === 0) {
    return (
      <FlagshipScreen
        scrollEnabled={false}
        contentStyle={{ paddingHorizontal: 0, paddingTop: 0 }}
        header={<FlagshipHeader title={title} onBack={() => navigation.goBack()} />}
      >
        <EmptyState
          icon="albums-outline"
          title="No items yet"
          subtitle="This collection doesn't have any matching items right now."
          ctaLabel="Browse All"
          onCtaPress={() => navigation.navigate('Browse', { categoryId: 'all', title: 'Browse' })}
        />
      </FlagshipScreen>
    );
  }

  return (
    <FlagshipScreen
      scrollEnabled={false}
      contentStyle={{ paddingHorizontal: 0, paddingTop: 0 }}
      header={<FlagshipHeader title={title} onBack={() => navigation.goBack()} />}
    >
      <PinterestMasonryGrid
        items={filteredListings}
        onPressItem={handleItemPress}
        onItemSaveToggle={handleSaveToggle}
        onItemSaveLongPress={handleSaveLongPress}
        isItemSaved={isItemSaved}
        listHeaderComponent={listHeader}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor={colors.brand}
          />
        }
      />
      <SaveToCollectionModal
        visible={savePickerItemId !== null}
        itemId={savePickerItemId ?? ''}
        onClose={() => setSavePickerItemId(null)}
      />
    </FlagshipScreen>
  );
}

// Matches PinterestMasonryGrid's default gap so the loading frame and the
// meta line land on the same geometry as the rendered tiles.
const GRID_GAP = Space.xs + 2;

// Varied tile heights — the loading frame mirrors the masonry rhythm rather
// than a uniform catalogue grid (AGENTS.md §14).
const SKELETON_HEIGHTS = [196, 236, 172, 216, 184, 228];

function createStyles(colors: ThemeColors, screenWidth: number) {
  return StyleSheet.create({
    headerInfo: {
      // Bleed out of the grid's content inset, then re-apply the tile
      // gutter as padding so the meta line aligns with the tiles.
      marginHorizontal: -DISCOVERY_GRID_INSET,
      paddingHorizontal: DISCOVERY_GRID_PADDING,
      paddingTop: Space.xs,
      paddingBottom: Space.sm },
    headerMeta: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: TypographyV2.meta.letterSpacing,
      lineHeight: TypographyV2.meta.lineHeight,
      color: colors.textMuted },
    loadingWrap: {
      flex: 1,
      paddingHorizontal: Space.md,
      paddingTop: Space.md },
    loadingGrid: {
      flexDirection: 'row',
      gap: GRID_GAP },
    loadingColumn: {
      width: (screenWidth - Space.md * 2 - GRID_GAP) / 2 },
    loadingCard: {
      marginBottom: Space.sm } });
}
