import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Image,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Space, Radius, Type, Typography } from '../../theme/designTokens';
import { RadiusRoleValue } from '../../theme/surfaceRadiusRules';
import { useAppTheme } from '../../theme/ThemeContext';
import { useHaptic } from '../../hooks/useHaptic';
import { useStore } from '../../store/useStore';
import { useBackendData } from '../../context/BackendDataContext';
import { searchListingsFromApi, type Listing, type ListingSearchResult } from '../../services/listingsApi';

// ───────────────────────────────────────────────────────────────────────────
// Look Source Tray — commerce source tray for the Look Composer.
//
// Per spec 10 + 2026 HIG: a bottom tray where users can pull in items from
// their closet, their own listings, or search for products. Tapping an item
// adds it to the canvas as a product tag layer via addLookProduct.
//
// Four tabs:
//   Discover    — a curated selection of recent listings from all sellers,
//                 acting as a generic discovery feed
//   Closet      — saved items from the user's closet (useStore.savedProducts
//                 filtered against useBackendData.listings)
//   Listings    — the user's own active listings (useBackendData.listings
//                 filtered by sellerId === currentUser?.id)
//   Search      — search for any product (searchListingsFromApi)
//
// The tray is a compact, collapsible surface. When collapsed it shows only
// the tab bar; when expanded it shows a horizontal scroll of item thumbnails.
// Each thumbnail is a 64×80 card with the item image, title, and price.
// ───────────────────────────────────────────────────────────────────────────

export interface LookSourceTrayProps {
  /** Called when the user taps an item to add it to the canvas. */
  onAddItem: (item: {
    listingId: string;
    snapshotTitle: string;
    snapshotImageUrl?: string;
    snapshotPriceGbp?: number;
  }) => void;
  /** Whether the tray is expanded. */
  expanded: boolean;
  /** Toggle expand/collapse. */
  onToggle: () => void;
}

type TabKey = 'foryou' | 'closet' | 'listings' | 'search';

interface TrayItem {
  id: string;
  title: string;
  imageUrl: string | null;
  priceGbp?: number;
  brand?: string | null;
}

export function LookSourceTray({ onAddItem, expanded, onToggle }: LookSourceTrayProps) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const haptic = useHaptic();
  const currentUser = useStore((state) => state.currentUser);
  const savedProductIds = useStore((state) => state.savedProducts);
  const { listings } = useBackendData();

  const [activeTab, setActiveTab] = useState<TabKey>('foryou');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ListingSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // ── Discover: a curated selection of recent listings from all sellers,
  //    sorted by recency (most recent first). Acts as a generic discovery
  //    feed until a dedicated recommendation API is available. ──
  const forYouItems = useMemo<TrayItem[]>(() => {
    return listings
      .filter((l) => l.status !== 'sold')
      .slice(0, 20)
      .map((l: Listing) => ({
        id: l.id,
        title: l.title ?? 'Untitled',
        imageUrl: l.images?.[0] ?? null,
        priceGbp: l.price ?? undefined,
        brand: l.brand,
      }));
  }, [listings]);

  // ── Closet items: saved products filtered against available listings ──
  const closetItems = useMemo<TrayItem[]>(() => {
    return listings
      .filter((l) => savedProductIds.includes(l.id))
      .slice(0, 20)
      .map((l: Listing) => ({
        id: l.id,
        title: l.title ?? 'Untitled',
        imageUrl: l.images?.[0] ?? null,
        priceGbp: l.price ?? undefined,
        brand: l.brand,
      }));
  }, [listings, savedProductIds]);

  // ── Listings: the user's own active listings ──
  const userListings = useMemo<TrayItem[]>(() => {
    if (!currentUser?.id) return [];
    return listings
      .filter((l) => l.sellerId === currentUser.id && l.status !== 'sold')
      .slice(0, 20)
      .map((l: Listing) => ({
        id: l.id,
        title: l.title ?? 'Untitled',
        imageUrl: l.images?.[0] ?? null,
        priceGbp: l.price ?? undefined,
        brand: l.brand,
      }));
  }, [listings, currentUser?.id]);

  // ── Search: debounced query against the API ──
  useEffect(() => {
    if (activeTab !== 'search') return;
    const trimmed = searchQuery.trim();
    if (trimmed.length < 2) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    const timer = setTimeout(async () => {
      try {
        const result = await searchListingsFromApi(trimmed, 20);
        setSearchResults(result.items);
      } catch {
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [searchQuery, activeTab]);

  const searchItems = useMemo<TrayItem[]>(() => {
    return searchResults.map((r) => ({
      id: r.id,
      title: r.title,
      imageUrl: r.imageUrl,
      priceGbp: r.priceGbp,
      brand: r.brand,
    }));
  }, [searchResults]);

  const handleItemPress = useCallback((item: TrayItem) => {
    haptic.selection();
    onAddItem({
      listingId: item.id,
      snapshotTitle: item.title,
      snapshotImageUrl: item.imageUrl ?? undefined,
      snapshotPriceGbp: item.priceGbp,
    });
  }, [haptic, onAddItem]);

  const handleTabChange = useCallback((tab: TabKey) => {
    haptic.selection();
    setActiveTab(tab);
  }, [haptic]);

  const currentItems =
    activeTab === 'foryou' ? forYouItems :
    activeTab === 'closet' ? closetItems :
    activeTab === 'listings' ? userListings :
    activeTab === 'search' ? searchItems :
    [];
  const isEmpty = currentItems.length === 0 && !isSearching;

  const tabs: { key: TabKey; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { key: 'foryou', label: 'Discover', icon: 'sparkles-outline' },
    { key: 'closet', label: 'Closet', icon: 'heart-outline' },
    { key: 'listings', label: 'Listings', icon: 'pricetag-outline' },
    { key: 'search', label: 'Search', icon: 'search-outline' },
  ];

  return (
    <View style={[styles.container, { paddingBottom: 0 }]}>
      {/* ── Tab bar + collapse toggle ── */}
      <View style={[styles.tabBar, { borderBottomColor: colors.border }]}>
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <Pressable
              key={tab.key}
              onPress={() => handleTabChange(tab.key)}
              style={({ pressed }) => [
                styles.tabBtn,
                pressed && styles.tabBtnPressed,
              ]}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
              accessibilityLabel={`${tab.label} tab`}
              accessibilityHint={`Shows items from your ${tab.label.toLowerCase()}`}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
            >
              <Ionicons
                name={tab.icon}
                size={16}
                color={isActive ? colors.brand : colors.textSecondary}
              />
              <Text
                style={[
                  styles.tabLabel,
                  { color: isActive ? colors.brand : colors.textSecondary },
                ]}
                numberOfLines={1}
              >
                {tab.label}
              </Text>
              {isActive && (
                <View style={[styles.tabIndicator, { backgroundColor: colors.brand }]} />
              )}
            </Pressable>
          );
        })}

        {/* Expand/collapse toggle */}
        <Pressable
          onPress={() => { haptic.light(); onToggle(); }}
          style={styles.collapseBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel={expanded ? 'Collapse source tray' : 'Expand source tray'}
          accessibilityHint="Toggles the source tray visibility"
          accessibilityRole="button"
        >
          <Ionicons
            name={expanded ? 'chevron-down' : 'chevron-up'}
            size={20}
            color={colors.textSecondary}
          />
        </Pressable>
      </View>

      {/* ── Expanded content ── */}
      {expanded && (
        <View style={[styles.content, { backgroundColor: colors.surface }]}>
          {/* Search input (only on search tab) */}
          {activeTab === 'search' && (
            <View style={[styles.searchRow, { borderBottomColor: colors.border }]}>
              <Ionicons name="search-outline" size={18} color={colors.textMuted} />
              <TextInput
                style={[styles.searchInput, { color: colors.textPrimary }]}
                placeholder="Search products..."
                placeholderTextColor={colors.textMuted}
                value={searchQuery}
                onChangeText={setSearchQuery}
                returnKeyType="search"
                accessibilityLabel="Search products"
                accessibilityHint="Search for products to add to your look"
              />
              {searchQuery.length > 0 && (
                <Pressable
                  onPress={() => { haptic.light(); setSearchQuery(''); }}
                  hitSlop={8}
                  accessibilityLabel="Clear search"
                  accessibilityRole="button"
                >
                  <Ionicons name="close-circle" size={18} color={colors.textMuted} />
                </Pressable>
              )}
            </View>
          )}

          {/* Loading state */}
          {isSearching && (
            <View style={styles.stateContainer}>
              <ActivityIndicator size="small" color={colors.brand} />
              <Text style={[styles.stateText, { color: colors.textSecondary }]}>Searching…</Text>
            </View>
          )}

          {/* Empty state */}
          {!isSearching && isEmpty && (
            <View style={styles.stateContainer}>
              <Ionicons
                name={
                  activeTab === 'foryou' ? 'sparkles-outline' :
                  activeTab === 'closet' ? 'heart-outline' :
                  activeTab === 'listings' ? 'pricetag-outline' :
                  'search-outline'
                }
                size={28}
                color={colors.textMuted}
              />
              <Text style={[styles.stateText, { color: colors.textSecondary }]}>
                {activeTab === 'foryou' && 'No recommendations available'}
                {activeTab === 'closet' && 'No saved items yet'}
                {activeTab === 'listings' && 'No active listings'}
                {activeTab === 'search' && searchQuery.trim().length < 2 && 'Type to search products'}
                {activeTab === 'search' && searchQuery.trim().length >= 2 && 'No products found'}
              </Text>
            </View>
          )}

          {/* Item thumbnails — horizontal scroll */}
          {!isSearching && !isEmpty && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.itemScroll}
            >
              {currentItems.map((item) => (
                <Pressable
                  key={item.id}
                  onPress={() => handleItemPress(item)}
                  style={({ pressed }) => [
                    styles.itemCard,
                    { backgroundColor: colors.surfaceAlt, borderColor: colors.border },
                    pressed && styles.itemCardPressed,
                  ]}
                  hitSlop={{ top: 4, bottom: 4, left: 2, right: 2 }}
                  accessibilityLabel={`Add ${item.title} to look`}
                  accessibilityHint="Adds this item as a product tag on the canvas"
                  accessibilityRole="button"
                >
                  {item.imageUrl ? (
                    <Image
                      source={{ uri: item.imageUrl }}
                      style={styles.itemImage}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={[styles.itemImagePlaceholder, { backgroundColor: colors.surfaceAlt }]}>
                      <Ionicons name="image-outline" size={20} color={colors.textMuted} />
                    </View>
                  )}
                  <Text
                    style={[styles.itemTitle, { color: colors.textPrimary }]}
                    numberOfLines={1}
                  >
                    {item.title}
                  </Text>
                  {item.priceGbp !== undefined && (
                    <Text style={[styles.itemPrice, { color: colors.brand }]}>
                      £{item.priceGbp.toFixed(0)}
                    </Text>
                  )}
                </Pressable>
              ))}
            </ScrollView>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    // The tray sits at the bottom, above the action bar.
  },
  // ── Tab bar ──
  tabBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    height: 40,
  },
  tabBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Space.sm,
    height: 40,
    position: 'relative',
  },
  tabBtnPressed: {
    opacity: 0.6,
  },
  tabLabel: {
    fontFamily: Typography.family.medium,
    fontSize: Type.caption.size,
  },
  tabIndicator: {
    position: 'absolute',
    bottom: 0,
    left: Space.sm,
    right: Space.sm,
    height: 2,
    borderRadius: RadiusRoleValue.pillAvatar,
  },
  collapseBtn: {
    marginLeft: 'auto',
    width: 44,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // ── Expanded content ──
  content: {
    paddingVertical: Space.sm,
    minHeight: 100,
  },
  // ── Search row ──
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  searchInput: {
    flex: 1,
    fontFamily: Typography.family.regular,
    fontSize: Type.body.size,
    paddingVertical: 4,
  },
  // ── State container (loading/empty) ──
  stateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.sm,
    paddingVertical: Space.lg,
    paddingHorizontal: Space.md,
  },
  stateText: {
    fontFamily: Typography.family.medium,
    fontSize: Type.caption.size,
  },
  // ── Item scroll ──
  itemScroll: {
    paddingHorizontal: Space.md,
    gap: Space.sm,
    alignItems: 'center',
  },
  // ── Item card — 72×96 compact thumbnail with title + price ──
  itemCard: {
    width: 72,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.md,
    overflow: 'hidden',
    padding: 4,
    gap: 2,
  },
  itemCardPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.97 }],
  },
  itemImage: {
    width: 64,
    height: 64,
    borderRadius: Radius.sm,
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  itemImagePlaceholder: {
    width: 64,
    height: 64,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemTitle: {
    fontFamily: Typography.family.medium,
    fontSize: 9,
    marginTop: 2,
  },
  itemPrice: {
    fontFamily: Typography.family.semibold,
    fontSize: 10,
  },
});
