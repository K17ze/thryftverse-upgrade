import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  type SharedValue,
} from 'react-native-reanimated';
import { Space, Radius, Type, Typography, Elevation } from '../../theme/designTokens';
import { IconGrammar } from '../../theme/designTokens';
import { RadiusRoleValue } from '../../theme/surfaceRadiusRules';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { useHaptic } from '../../hooks/useHaptic';
import { useMotionConfig } from '../../hooks/useMotionConfig';
import { useStore } from '../../store/useStore';
import { useBackendData } from '../../context/BackendDataContext';
import { searchListingsFromApi, type Listing, type ListingSearchResult } from '../../services/listingsApi';

// ───────────────────────────────────────────────────────────────────────────
// Look Source Tray — commerce peek drawer for the Look Composer.
//
// Per 06_LOOK_RECONSTRUCTION_SPEC §"Commerce source tray redesign" + 2026 HIG:
// a collapsed peek drawer that expands into a product source sheet.
//
// Two states:
//   Collapsed — a 48pt peek bar at the bottom with "Items" label + chevron.
//               Tap to expand. Transparent background with a subtle scrim so
//               the label is readable over any canvas.
//   Expanded  — a rounded sheet (Level 3 precision sheet, one elevation level)
//               slides up showing the product list. No nested cards — product
//               thumbnails are flat (image + title + price).
//
// Drag-to-canvas (P1): each product card in the expanded sheet is draggable.
//   Pan a card upward onto the canvas → a floating preview follows the finger.
//   Release over the canvas → the product is added at the drop position via
//   onDropProduct (if provided) or onAddItem (fallback, center placement).
//   Release outside the canvas → the drag cancels (preview fades, no add).
//   Tap a card → adds via onAddItem (fallback, center placement).
//
// Auto-collapse: after adding an item (tap or drag), the tray collapses back
// to the peek state so the canvas remains dominant.
//
// Four tabs (preserved from original):
//   Discover — recent listings from all sellers (discovery feed)
//   Closet   — saved items (useStore.savedProducts filtered against listings)
//   Listings — user's own active listings
//   Search   — search for any product (searchListingsFromApi)
//
// Motion: spring-based expand/collapse (Motion.spring.sheet). Reduced motion
// collapses to instant timing (useMotionConfig).
// ───────────────────────────────────────────────────────────────────────────

const PEEK_HEIGHT = 48;
const CONTENT_HEIGHT = 240;
const EXPANDED_HEIGHT = PEEK_HEIGHT + CONTENT_HEIGHT;
const PREVIEW_SIZE = 80;

export interface LookSourceTrayProps {
  /** Called when the user taps an item to add it to the canvas (center). */
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
  /** Called when the user drags a product onto the canvas. Optional.
   *  When provided, receives the drop position in screen coordinates so
   *  the parent can place the product at the drop point. When not
   *  provided, drag-to-canvas falls back to onAddItem (center placement). */
  onDropProduct?: (item: {
    listingId: string;
    snapshotTitle: string;
    snapshotImageUrl?: string;
    snapshotPriceGbp?: number;
  }, dropPosition: { x: number; y: number }) => void;
}

type TabKey = 'foryou' | 'closet' | 'listings' | 'search';

interface TrayItem {
  id: string;
  title: string;
  imageUrl: string | null;
  priceGbp?: number;
  brand?: string | null;
}

// ───────────────────────────────────────────────────────────────────────────
// DraggableProductCard — a flat product thumbnail supporting both tap
// (add to center) and pan (drag to canvas). Uses Gesture.Race so a tap
// doesn't trigger the pan and vice versa.
// ───────────────────────────────────────────────────────────────────────────

interface DraggableProductCardProps {
  item: TrayItem;
  onPress: (item: TrayItem) => void;
  onDragStart: (item: TrayItem) => void;
  onDragEnd: (item: TrayItem, x: number, y: number, isOverCanvas: boolean) => void;
  previewX: SharedValue<number>;
  previewY: SharedValue<number>;
  previewVisible: SharedValue<number>;
  trayYSV: SharedValue<number>;
  colors: ThemeColors;
}

const DraggableProductCard = React.memo(function DraggableProductCard({
  item,
  onPress,
  onDragStart,
  onDragEnd,
  previewX,
  previewY,
  previewVisible,
  trayYSV,
  colors,
}: DraggableProductCardProps) {
  const tapGesture = useMemo(
    () =>
      Gesture.Tap().onEnd(() => {
        runOnJS(onPress)(item);
      }),
    [item, onPress]
  );

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(8)
        .onStart((e) => {
          'worklet';
          previewX.value = e.absoluteX;
          previewY.value = e.absoluteY;
          previewVisible.value = withTiming(1, { duration: 100 });
          runOnJS(onDragStart)(item);
        })
        .onUpdate((e) => {
          'worklet';
          previewX.value = e.absoluteX;
          previewY.value = e.absoluteY;
        })
        .onEnd((e) => {
          'worklet';
          previewVisible.value = withTiming(0, { duration: 120 });
          const isOverCanvas = e.absoluteY < trayYSV.value;
          runOnJS(onDragEnd)(item, e.absoluteX, e.absoluteY, isOverCanvas);
        }),
    [item, onDragStart, onDragEnd, previewX, previewY, previewVisible, trayYSV]
  );

  const composedGesture = useMemo(
    () => Gesture.Race(panGesture, tapGesture),
    [panGesture, tapGesture]
  );

  return (
    <GestureDetector gesture={composedGesture}>
      <View
        style={styles.itemCard}
        accessibilityLabel={`Add ${item.title} to look`}
        accessibilityHint="Tap to add or drag onto the canvas"
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
            <Ionicons name="image-outline" size={IconGrammar.standard} color={colors.textMuted} />
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
      </View>
    </GestureDetector>
  );
});

// ───────────────────────────────────────────────────────────────────────────
// LookSourceTray — main component
// ───────────────────────────────────────────────────────────────────────────

export function LookSourceTray({
  onAddItem,
  expanded,
  onToggle,
  onDropProduct,
}: LookSourceTrayProps) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const motionConfig = useMotionConfig();
  const currentUser = useStore((state) => state.currentUser);
  const savedProductIds = useStore((state) => state.savedProducts);
  const { listings } = useBackendData();

  const [activeTab, setActiveTab] = useState<TabKey>('foryou');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ListingSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [draggingItem, setDraggingItem] = useState<TrayItem | null>(null);

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

  // ── Refs for reading latest expanded state in callbacks ──
  const expandedRef = useRef(expanded);
  expandedRef.current = expanded;
  const trayRef = useRef<View>(null);

  // ── Animation shared values ──
  const heightSV = useSharedValue(expanded ? EXPANDED_HEIGHT : PEEK_HEIGHT);
  const contentOpacitySV = useSharedValue(expanded ? 1 : 0);
  const chevronSV = useSharedValue(expanded ? 1 : 0);
  const sheetBgSV = useSharedValue(expanded ? 1 : 0);

  // ── Drag shared values ──
  const previewX = useSharedValue(0);
  const previewY = useSharedValue(0);
  const previewVisible = useSharedValue(0);
  const trayXSV = useSharedValue(0);
  const trayYSV = useSharedValue(0);

  // ── Animate expand/collapse ──
  useEffect(() => {
    if (motionConfig.isReducedMotion) {
      heightSV.value = withTiming(expanded ? EXPANDED_HEIGHT : PEEK_HEIGHT, motionConfig.timing);
      contentOpacitySV.value = withTiming(expanded ? 1 : 0, motionConfig.timing);
      chevronSV.value = withTiming(expanded ? 1 : 0, motionConfig.timing);
      sheetBgSV.value = withTiming(expanded ? 1 : 0, motionConfig.timing);
    } else {
      heightSV.value = withSpring(expanded ? EXPANDED_HEIGHT : PEEK_HEIGHT, motionConfig.spring.sheet);
      contentOpacitySV.value = withSpring(expanded ? 1 : 0, motionConfig.spring.sheet);
      chevronSV.value = withSpring(expanded ? 1 : 0, motionConfig.spring.sheet);
      sheetBgSV.value = withSpring(expanded ? 1 : 0, motionConfig.spring.sheet);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, motionConfig.isReducedMotion]);

  // ── Measure tray position for drag offset + drop detection ──
  const measureTray = useCallback(() => {
    trayRef.current?.measureInWindow((x, y, _w, _h) => {
      trayXSV.value = x;
      trayYSV.value = y;
    });
  }, [trayXSV, trayYSV]);

  // Initial measurement on mount
  useEffect(() => {
    measureTray();
  }, [measureTray]);

  // Re-measure after expand/collapse animation completes (tray top Y changes
  // with height since the tray is anchored to the bottom).
  useEffect(() => {
    const delay = motionConfig.isReducedMotion ? 0 : 350;
    const timer = setTimeout(measureTray, delay);
    return () => clearTimeout(timer);
  }, [expanded, measureTray, motionConfig.isReducedMotion]);

  // ── Tap add: add item + auto-collapse ──
  const handleItemPress = useCallback((item: TrayItem) => {
    haptic.selection();
    onAddItem({
      listingId: item.id,
      snapshotTitle: item.title,
      snapshotImageUrl: item.imageUrl ?? undefined,
      snapshotPriceGbp: item.priceGbp,
    });
    // Auto-collapse after adding so the canvas remains dominant
    if (expandedRef.current) {
      onToggle();
    }
  }, [haptic, onAddItem, onToggle]);

  // ── Drag start: set dragging item for floating preview ──
  const handleDragStart = useCallback((_item: TrayItem) => {
    setDraggingItem(_item);
    haptic.light();
  }, [haptic]);

  // ── Drag end: drop on canvas or cancel ──
  const handleDragEnd = useCallback((item: TrayItem, x: number, y: number, isOverCanvas: boolean) => {
    setDraggingItem(null);
    if (isOverCanvas) {
      haptic.success();
      const itemPayload = {
        listingId: item.id,
        snapshotTitle: item.title,
        snapshotImageUrl: item.imageUrl ?? undefined,
        snapshotPriceGbp: item.priceGbp,
      };
      if (onDropProduct) {
        onDropProduct(itemPayload, { x, y });
      } else {
        // No drop handler — fall back to center placement
        onAddItem(itemPayload);
      }
      // Auto-collapse after adding
      if (expandedRef.current) {
        onToggle();
      }
    } else {
      // Not over canvas — cancel (preview already fading)
      haptic.light();
    }
  }, [haptic, onAddItem, onDropProduct, onToggle]);

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
    { key: 'foryou', label: 'Discover', icon: 'compass-outline' },
    { key: 'closet', label: 'Closet', icon: 'heart-outline' },
    { key: 'listings', label: 'Listings', icon: 'pricetag-outline' },
    { key: 'search', label: 'Search', icon: 'search-outline' },
  ];

  // ── Animated styles ──
  const containerAnimStyle = useAnimatedStyle(() => ({
    height: heightSV.value,
  }));

  const contentAnimStyle = useAnimatedStyle(() => ({
    opacity: contentOpacitySV.value,
    transform: [{ translateY: (1 - contentOpacitySV.value) * 16 }],
  }));

  const chevronAnimStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${chevronSV.value * 180}deg` }],
  }));

  const sheetBgAnimStyle = useAnimatedStyle(() => ({
    opacity: sheetBgSV.value,
  }));

  const previewAnimStyle = useAnimatedStyle(() => ({
    opacity: previewVisible.value,
    transform: [
      { translateX: previewX.value - trayXSV.value - PREVIEW_SIZE / 2 },
      { translateY: previewY.value - trayYSV.value - PREVIEW_SIZE / 2 },
    ],
  }));

  return (
    <View onLayout={measureTray} ref={trayRef} style={styles.wrapper}>
      <Reanimated.View style={[styles.container, containerAnimStyle]}>
        {/* ── Subtle scrim — always visible so the peek bar is readable ── */}
        <View
          style={[
            StyleSheet.absoluteFill,
            styles.scrim,
            {
              backgroundColor: colors.surface,
              borderTopColor: colors.borderSubtle,
            },
          ]}
          pointerEvents="none"
        />

        {/* ── Sheet background — fades in when expanded ── */}
        <Reanimated.View
          style={[
            StyleSheet.absoluteFill,
            styles.sheetBg,
            {
              backgroundColor: colors.surface,
              borderTopColor: colors.border,
            },
            sheetBgAnimStyle,
          ]}
          pointerEvents="none"
        />

        {/* ── Peek bar (48pt — always visible) ── */}
        <Pressable
          onPress={() => { haptic.light(); onToggle(); }}
          style={({ pressed }) => [styles.peekBar, pressed && styles.peekBarPressed]}
          accessibilityLabel={expanded ? 'Collapse source tray' : 'Expand source tray'}
          accessibilityHint="Toggles the source tray visibility"
          accessibilityRole="button"
        >
          <Ionicons name="bag-outline" size={IconGrammar.standard} color={colors.textSecondary} />
          <Text style={[styles.peekLabel, { color: colors.textPrimary }]}>
            Items
          </Text>
          <Reanimated.View style={chevronAnimStyle}>
            <Ionicons name="chevron-up" size={IconGrammar.standard} color={colors.textSecondary} />
          </Reanimated.View>
        </Pressable>

        {/* ── Expanded content ── */}
        <Reanimated.View
          style={[styles.content, contentAnimStyle]}
          pointerEvents={expanded ? 'auto' : 'none'}
        >
          {/* Tab bar */}
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
                    size={IconGrammar.metadata}
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
          </View>

          {/* Search input (only on search tab) */}
          {activeTab === 'search' && (
            <View style={[styles.searchRow, { borderBottomColor: colors.border }]}>
              <Ionicons name="search-outline" size={IconGrammar.metadata} color={colors.textMuted} />
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
                  <Ionicons name="close-circle" size={IconGrammar.metadata} color={colors.textMuted} />
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

          {/* Empty state — text-only, no decorative icon */}
          {!isSearching && isEmpty && (
            <View style={styles.stateContainer}>
              <Text style={[styles.stateText, { color: colors.textSecondary }]}>
                {activeTab === 'foryou' && 'No recommendations available'}
                {activeTab === 'closet' && 'No saved items yet'}
                {activeTab === 'listings' && 'No active listings'}
                {activeTab === 'search' && searchQuery.trim().length < 2 && 'Type to search products'}
                {activeTab === 'search' && searchQuery.trim().length >= 2 && 'No products found'}
              </Text>
            </View>
          )}

          {/* Item thumbnails — horizontal scroll with draggable cards */}
          {!isSearching && !isEmpty && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.itemScroll}
            >
              {currentItems.map((item) => (
                <DraggableProductCard
                  key={item.id}
                  item={item}
                  onPress={handleItemPress}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                  previewX={previewX}
                  previewY={previewY}
                  previewVisible={previewVisible}
                  trayYSV={trayYSV}
                  colors={colors}
                />
              ))}
            </ScrollView>
          )}
        </Reanimated.View>
      </Reanimated.View>

      {/* ── Floating drag preview — follows the finger during pan ── */}
      <Reanimated.View
        style={[styles.dragPreview, previewAnimStyle]}
        pointerEvents="none"
      >
        {draggingItem?.imageUrl ? (
          <Image
            source={{ uri: draggingItem.imageUrl }}
            style={styles.previewImage}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.previewImage, { backgroundColor: colors.surfaceAlt }]}>
            <Ionicons name="image-outline" size={IconGrammar.hero} color={colors.textMuted} />
          </View>
        )}
        <Text style={[styles.previewTitle, { color: colors.textPrimary }]} numberOfLines={1}>
          {draggingItem?.title ?? ''}
        </Text>
        {draggingItem?.priceGbp !== undefined && (
          <Text style={[styles.previewPrice, { color: colors.brand }]}>
            £{draggingItem.priceGbp.toFixed(0)}
          </Text>
        )}
      </Reanimated.View>
    </View>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Styles
// ───────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // ── Wrapper — holds the animated container + floating drag preview ──
  wrapper: {
    // The tray sits at the bottom, above the action bar.
    // Positioned by the parent (sourceTrayContainer in LookComposerScreen).
  },
  // ── Container — clips content, rounded top corners ──
  container: {
    overflow: 'hidden',
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
  },
  // ── Scrim — always visible, subtle so peek bar is readable ──
  scrim: {
    opacity: 0.5,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
  },
  // ── Sheet background — fades in when expanded ──
  sheetBg: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    ...Elevation.floating,
  },
  // ── Peek bar (48pt — always visible) ──
  peekBar: {
    height: PEEK_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.sm,
  },
  peekBarPressed: {
    opacity: 0.6,
  },
  peekLabel: {
    fontFamily: Typography.family.semibold,
    fontSize: Type.body.size,
  },
  // ── Expanded content ──
  content: {
    height: CONTENT_HEIGHT,
  },
  // ── Tab bar ──
  tabBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    height: 44,
  },
  tabBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Space.sm,
    height: 44,
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
    paddingVertical: Space.sm,
  },
  // ── Item card — flat, no card-on-card. Image + title + price. ──
  // 44pt touch target via the GestureDetector wrapper.
  itemCard: {
    width: 76,
    alignItems: 'center',
    gap: 2,
  },
  itemImage: {
    width: 72,
    height: 72,
    borderRadius: Radius.md,
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  itemImagePlaceholder: {
    width: 72,
    height: 72,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemTitle: {
    fontFamily: Typography.family.medium,
    fontSize: 10.5,
    marginTop: 2,
    textAlign: 'center',
  },
  itemPrice: {
    fontFamily: Typography.family.semibold,
    fontSize: 10.5,
  },
  // ── Floating drag preview ──
  dragPreview: {
    position: 'absolute',
    width: PREVIEW_SIZE,
    alignItems: 'center',
    gap: 2,
    zIndex: 1000,
  },
  previewImage: {
    width: PREVIEW_SIZE,
    height: PREVIEW_SIZE,
    borderRadius: Radius.md,
    backgroundColor: 'rgba(0,0,0,0.05)',
    ...Elevation.floating,
  },
  previewTitle: {
    fontFamily: Typography.family.medium,
    fontSize: 10.5,
    marginTop: 2,
    textAlign: 'center',
  },
  previewPrice: {
    fontFamily: Typography.family.semibold,
    fontSize: 10.5,
  },
});
