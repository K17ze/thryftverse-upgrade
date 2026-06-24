import React, { useMemo, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
} from 'react-native';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/types';
import { useBackendData } from '../context/BackendDataContext';
import { useStore } from '../store/useStore';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { ProductCardV2 } from '../components/ProductCardV2';
import { MasonryGrid } from '../components/ProductCardV2';
import { Colors } from '../constants/colors';
import { Type, Space, Radius, Typography } from '../theme/designTokens';
import { useHaptic } from '../hooks/useHaptic';
import { EmptyState } from '../components/EmptyState';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { SkeletonLoader } from '../components/SkeletonLoader';
import { useToast } from '../context/ToastContext';
import { fetchFilteredListings } from '../services/listingsApi';
import { Listing } from '../data/mockData';
import { ProductAnalytics } from '../platform/product/productAnalytics';

const { width: SCREEN_W } = Dimensions.get('window');

type NavT = StackNavigationProp<RootStackParamList>;
type RouteT = RouteProp<RootStackParamList, 'ExploreCollection'>;

export default function ExploreCollectionScreen() {
  const route = useRoute<RouteT>();
  const navigation = useNavigation<NavT>();
  const haptic = useHaptic();
  const { show } = useToast();
  const { listings, isSyncing, lastError, refreshListings } = useBackendData();
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
  }, [source.type, source.categoryId, source.brand]);

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
      case 'saved_affinity':
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

  const handleRefresh = async () => {
    await refreshListings();
  };

  const renderHeader = () => (
    <Reanimated.View entering={FadeInDown.duration(300)} style={styles.headerInfo}>
      {subtitle ? (
        <Text style={styles.headerSubtitle}>{subtitle}</Text>
      ) : null}
      <Text style={styles.headerCount}>{filteredListings.length} items</Text>
    </Reanimated.View>
  );

  if ((isSyncing || isFetching) && filteredListings.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ScreenHeader title={title} onBack={() => navigation.goBack()} />
        <View style={styles.loadingWrap}>
          <SkeletonLoader width={120} height={18} borderRadius={8} style={{ marginBottom: 16 }} />
          <View style={styles.loadingGrid}>
            {Array.from({ length: 4 }).map((_, i) => (
              <View key={i} style={styles.loadingCard}>
                <SkeletonLoader width="100%" height={180} borderRadius={Radius.md} />
                <SkeletonLoader width="60%" height={14} borderRadius={6} style={{ marginTop: 8 }} />
                <SkeletonLoader width="40%" height={14} borderRadius={6} style={{ marginTop: 4 }} />
              </View>
            ))}
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (filteredListings.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ScreenHeader title={title} onBack={() => navigation.goBack()} />
        <EmptyState
          icon="albums-outline"
          title="No items yet"
          subtitle="This collection doesn't have any matching items right now."
          ctaLabel="Browse All"
          onCtaPress={() => navigation.navigate('Browse', { categoryId: 'all', title: 'Browse' })}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenHeader title={title} onBack={() => navigation.goBack()} />
      {renderHeader()}
      <MasonryGrid
        items={filteredListings}
        onPressItem={(item) => {
          haptic.light();
          ProductAnalytics.itemView(item.id);
          navigation.push('ItemDetail', { itemId: item.id });
        }}
        showSaveButton
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  headerInfo: {
    paddingHorizontal: Space.md,
    paddingBottom: Space.sm,
    gap: 4,
  },
  headerSubtitle: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.medium,
    color: Colors.textMuted,
  },
  headerCount: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.medium,
    color: Colors.textSecondary,
  },
  loadingWrap: {
    flex: 1,
    paddingHorizontal: Space.md,
    paddingTop: Space.md,
  },
  loadingGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: Space.sm,
  },
  loadingCard: {
    width: (SCREEN_W - Space.md * 2 - Space.sm) / 2,
    marginBottom: Space.md,
  },
});
