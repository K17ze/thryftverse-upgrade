import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Reanimated, { FadeInDown, useSharedValue } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { ActiveTheme, Colors } from '../constants/colors';
import { Type, Space, Radius } from '../theme/designTokens';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useBackendData } from '../context/BackendDataContext';
import { EmptyState } from '../components/EmptyState';
import { RefreshIndicator } from '../components/RefreshIndicator';
import { MasonryGrid } from '../components/ProductCardV2';
import { AppSegmentControl } from '../components/ui/AppSegmentControl';
import { AppInput } from '../components/ui/AppInput';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { useHaptic } from '../hooks/useHaptic';
import { CollectionCard } from '../components/closet/CollectionCard';

type TabKey = 'SAVED' | 'WISHLIST' | 'COLLECTIONS';
type NavT = StackNavigationProp<RootStackParamList>;

const TABS = [
  { value: 'SAVED' as TabKey, label: 'Saved', icon: <Ionicons name="bookmark-outline" size={14} color={Colors.textSecondary} /> },
  { value: 'WISHLIST' as TabKey, label: 'Wishlist', icon: <Ionicons name="heart-outline" size={14} color={Colors.textSecondary} /> },
  { value: 'COLLECTIONS' as TabKey, label: 'Collections', icon: <Ionicons name="folder-open-outline" size={14} color={Colors.textSecondary} /> },
];

export default function ClosetScreen() {
  const navigation = useNavigation<NavT>();
  const haptic = useHaptic();
  const [activeTab, setActiveTab] = useState<TabKey>('SAVED');
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const scrollY = useSharedValue(0);

  const wishlistIds = useStore((state) => state.wishlist);
  const savedProductIds = useStore((state) => state.savedProducts);
  const collections = useStore((state) => state.collections);
  const { listings, refreshListings } = useBackendData();

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshListings();
    setTimeout(() => setRefreshing(false), 350);
  };

  const savedItems = useMemo(
    () => listings.filter((l) => savedProductIds?.includes(l.id) ?? false),
    [listings, savedProductIds]
  );

  const wishlistItems = useMemo(
    () => listings.filter((l) => wishlistIds?.includes(l.id) ?? false),
    [listings, wishlistIds]
  );

  const filteredSaved = useMemo(
    () => savedItems.filter((l) =>
      !searchQuery ||
      l.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.brand?.toLowerCase().includes(searchQuery.toLowerCase())
    ),
    [savedItems, searchQuery]
  );

  const filteredWishlist = useMemo(
    () => wishlistItems.filter((l) =>
      !searchQuery ||
      l.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.brand?.toLowerCase().includes(searchQuery.toLowerCase())
    ),
    [wishlistItems, searchQuery]
  );

  const filteredCollections = useMemo(
    () => collections.filter((c) =>
      !searchQuery ||
      c.name.toLowerCase().includes(searchQuery.toLowerCase())
    ),
    [collections, searchQuery]
  );

  const totalCount = savedProductIds.length + wishlistIds.length + collections.length;

  const handleTabChange = (tab: TabKey) => {
    haptic.light();
    setActiveTab(tab);
  };

  const renderSavedContent = () => {
    if (filteredSaved.length === 0) {
      return (
        <EmptyState
          icon="bookmark-outline"
          title="No saved products yet"
          subtitle="Tap the bookmark on any product to save it here."
          ctaLabel="Browse"
          onCtaPress={() => navigation.navigate('Browse', { categoryId: 'all', title: 'Browse' })}
        />
      );
    }
    return (
      <Reanimated.View entering={FadeInDown.duration(300)}>
        <MasonryGrid
          items={filteredSaved}
          onPressItem={(item) => navigation.push('ItemDetail', { itemId: item.id })}
          numColumns={2}
          showSeller
          showSaveButton
        />
      </Reanimated.View>
    );
  };

  const renderWishlistContent = () => {
    if (filteredWishlist.length === 0) {
      return (
        <EmptyState
          icon="heart-outline"
          title="Your wishlist is empty"
          subtitle="Heart items to track them."
          ctaLabel="Browse"
          onCtaPress={() => navigation.navigate('Browse', { categoryId: 'all', title: 'Browse' })}
        />
      );
    }
    return (
      <Reanimated.View entering={FadeInDown.duration(300)}>
        <MasonryGrid
          items={filteredWishlist}
          onPressItem={(item) => navigation.push('ItemDetail', { itemId: item.id })}
          numColumns={2}
          showSeller
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
          onCtaPress={() => {
            // Navigate to first saved item or show create modal
            // For now, just navigate to saved tab to start building
            setActiveTab('SAVED');
          }}
        />
      );
    }
    return (
      <Reanimated.View entering={FadeInDown.duration(300)} style={styles.collectionsList}>
        {filteredCollections.map((collection) => (
          <CollectionCard
            key={collection.id}
            collection={collection}
            onPress={() => navigation.push('CollectionDetail', { collectionId: collection.id })}
          />
        ))}
      </Reanimated.View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'} backgroundColor={Colors.background} />

      {/* Header */}
      <View style={styles.header}>
        <AnimatedPressable style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.85}>
          <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
        </AnimatedPressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerLabel}>CLOSET</Text>
          <Text style={styles.headerTitle}>Closet</Text>
        </View>
        <Text style={styles.countBadge}>{totalCount}</Text>
      </View>

      <RefreshIndicator scrollY={scrollY} isRefreshing={refreshing} topInset={20} />

      <Reanimated.ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        onScroll={(event) => {
          scrollY.value = event.nativeEvent.contentOffset.y;
        }}
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
            placeholder={`Search ${activeTab.toLowerCase()}`}
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

        {/* Tabs */}
        <View style={styles.tabsWrap}>
          <AppSegmentControl
            options={TABS}
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
  header: {
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    paddingBottom: Space.md - Space.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
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
    ...Type.meta,
    color: Colors.brand,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  headerTitle: {
    ...Type.subtitle,
    color: Colors.textPrimary,
    fontFamily: 'Inter_700Bold',
    fontSize: 22,
    marginTop: 2,
  },
  countBadge: {
    ...Type.caption,
    color: Colors.textMuted,
    fontFamily: 'Inter_700Bold',
    minWidth: 24,
    textAlign: 'right',
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
  collectionsList: {
    paddingHorizontal: Space.md,
  },
});
