import React, { useMemo, useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  RefreshControl } from 'react-native';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useBackendData } from '../context/BackendDataContext';
import { useStore } from '../store/useStore';
import { PinterestMasonryGrid } from '../components/discover/PinterestMasonryGrid';
import { Space, Radius } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { useHaptic } from '../hooks/useHaptic';
import { EmptyState } from '../components/EmptyState';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { SkeletonLoader } from '../components/SkeletonLoader';
import { fetchFilteredListings } from '../services/listingsApi';
import { mapListingToDiscoverySummary } from '../contracts/DiscoveryListingSummary';
import type { Listing } from '../domain';
import { ProductAnalytics } from '../platform/product/productAnalytics';

const { width: SCREEN_W } = Dimensions.get('window');

type NavT = NativeStackNavigationProp<RootStackParamList>;
type RouteT = RouteProp<RootStackParamList, 'ExploreCollection'>;

export default function ExploreCollectionScreen() {
  const route = useRoute<RouteT>();
  const navigation = useNavigation<NavT>();
  const haptic = useHaptic();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { listings, isSyncing, refreshListings } = useBackendData();
  const savedProducts = useStore((state) => state.savedProducts);
  const toggleSavedProduct = useStore((state) => state.toggleSavedProduct);

  const { title, subtitle, source } = route.params;

  const [backendListings, setBackendListings] = useState<Listing[] | null>(null);
  const [isFetching, setIsFetching] = useState(false);

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
      navigation.push('ItemDetail', { itemId: item.id });
    },
    [haptic, navigation],
  );

  const handleSaveToggle = useCallback(
    (listing: ReturnType<typeof mapListingToDiscoverySummary>) => {
      toggleSavedProduct(listing.id);
    },
    [toggleSavedProduct],
  );

  const isItemSaved = useCallback(
    (listingId: string) => savedProducts.includes(listingId),
    [savedProducts],
  );

  const listHeader = useMemo(
    () => (
      <View style={styles.headerInfo}>
        {subtitle ? (
          <Text style={styles.headerSubtitle}>{subtitle}</Text>
        ) : null}
        <Text style={styles.headerCount}>{filteredListings.length} items</Text>
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
        <View style={styles.loadingWrap}>
          <SkeletonLoader width={120} height={18} borderRadius={Radius.md} style={{ marginBottom: Space.md }} />
          <View style={styles.loadingGrid}>
            {Array.from({ length: 4 }).map((_, i) => (
              <View key={i} style={styles.loadingCard}>
                <SkeletonLoader width="100%" height={180} borderRadius={Radius.md} />
                <SkeletonLoader width="60%" height={14} borderRadius={Radius.sm} style={{ marginTop: Space.sm }} />
                <SkeletonLoader width="40%" height={14} borderRadius={Radius.sm} style={{ marginTop: Space.xs }} />
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
    </FlagshipScreen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    headerInfo: {
      paddingHorizontal: Space.md,
      paddingBottom: Space.sm,
      gap: Space.xs },
    headerSubtitle: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textMuted },
    headerCount: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textSecondary },
    loadingWrap: {
      flex: 1,
      paddingHorizontal: Space.md,
      paddingTop: Space.md },
    loadingGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      gap: Space.sm },
    loadingCard: {
      width: (SCREEN_W - Space.md * 2 - Space.sm) / 2,
      marginBottom: Space.md } });
}
