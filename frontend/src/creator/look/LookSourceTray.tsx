import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming } from 'react-native-reanimated';
import { useFormattedPrice } from '../../hooks/useFormattedPrice';
import { useHaptic } from '../../hooks/useHaptic';
import { useMotionConfig } from '../../hooks/useMotionConfig';
import { useStore } from '../../store/useStore';
import { useBackendData } from '../../context/BackendDataContext';
import { searchListingsFromApi, type Listing, type ListingSearchResult } from '../../services/listingsApi';
import { ConfirmationSheet } from '../../components/ConfirmationSheet';
import { useAppTheme } from '../../theme/ThemeContext';
import {
  PEEK_HEIGHT,
  EXPANDED_HEIGHT,
  PREVIEW_SIZE,
  type TabKey,
  type TrayItem } from './lookSourceTray/lookSourceTrayShared';
import { styles } from './lookSourceTray/lookSourceTrayStyles';
import { TrayExpandedContent } from './lookSourceTray/TrayExpandedContent';
import { DragPreview } from './lookSourceTray/DragPreview';

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
  /** Set of listing IDs already on the canvas. Items in this set show
   *  a subtle "On canvas" indicator and tapping them offers "Add again"
   *  instead of silently duplicating (§8.3: dedup — same source item
   *  offers "use another photo" instead of silent duplication). */
  onCanvasListingIds?: Set<string>;
}

// ───────────────────────────────────────────────────────────────────────────
// LookSourceTray — main component
// ───────────────────────────────────────────────────────────────────────────

export function LookSourceTray({
  onAddItem,
  expanded,
  onToggle,
  onDropProduct,
  onCanvasListingIds }: LookSourceTrayProps) {
  const { colors } = useAppTheme();
  const { currencySymbol } = useFormattedPrice();
  const haptic = useHaptic();
  const motionConfig = useMotionConfig();
  const currentUser = useStore((state) => state.currentUser);
  const savedProductIds = useStore((state) => state.savedProducts);
  const { listings, lastError, isSyncing } = useBackendData();

  const [activeTab, setActiveTab] = useState<TabKey>('foryou');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ListingSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [draggingItem, setDraggingItem] = useState<TrayItem | null>(null);
  const [confirmSheet, setConfirmSheet] = useState<{
    visible: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    variant?: 'default' | 'danger';
    onConfirm: () => void;
  }>({ visible: false, title: '', message: '', onConfirm: () => {} });

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
        brand: l.brand }));
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
        brand: l.brand }));
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
        brand: l.brand }));
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
      brand: r.brand }));
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
  // Per §8.3: dedup — if the item is already on the canvas, offer
  // "Add again" instead of silently duplicating.
  const handleItemPress = useCallback((item: TrayItem) => {
    const isDuplicate = onCanvasListingIds?.has(item.id) ?? false;
    if (isDuplicate) {
      haptic.light();
      setConfirmSheet({
        visible: true,
        title: 'Already on canvas',
        message: `"${item.title}" is already in your look. Add it again?`,
        confirmLabel: 'Add Again',
        variant: 'default',
        onConfirm: () => {
          haptic.selection();
          onAddItem({
            listingId: item.id,
            snapshotTitle: item.title,
            snapshotImageUrl: item.imageUrl ?? undefined,
            snapshotPriceGbp: item.priceGbp });
          if (expandedRef.current) onToggle();
        } });
      return;
    }
    haptic.selection();
    onAddItem({
      listingId: item.id,
      snapshotTitle: item.title,
      snapshotImageUrl: item.imageUrl ?? undefined,
      snapshotPriceGbp: item.priceGbp });
    // Auto-collapse after adding so the canvas remains dominant
    if (expandedRef.current) {
      onToggle();
    }
  }, [haptic, onAddItem, onToggle, onCanvasListingIds]);

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
        snapshotPriceGbp: item.priceGbp };
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
    { key: 'foryou', label: 'Discover', icon: 'search-outline' },
    { key: 'closet', label: 'Closet', icon: 'heart-outline' },
    { key: 'listings', label: 'Listings', icon: 'bag-handle-outline' },
    { key: 'search', label: 'Search', icon: 'search-outline' },
  ];

  // ── Animated styles ──
  const containerAnimStyle = useAnimatedStyle(() => ({
    height: heightSV.value }));

  const contentAnimStyle = useAnimatedStyle(() => ({
    opacity: contentOpacitySV.value,
    transform: [{ translateY: (1 - contentOpacitySV.value) * 16 }] }));

  const chevronAnimStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${chevronSV.value * 180}deg` }] }));

  const sheetBgAnimStyle = useAnimatedStyle(() => ({
    opacity: sheetBgSV.value }));

  const previewAnimStyle = useAnimatedStyle(() => ({
    opacity: previewVisible.value,
    transform: [
      { translateX: previewX.value - trayXSV.value - PREVIEW_SIZE / 2 },
      { translateY: previewY.value - trayYSV.value - PREVIEW_SIZE / 2 },
    ] }));

  return (
    <View onLayout={measureTray} ref={trayRef} style={styles.wrapper}>
      <Reanimated.View style={[styles.container, containerAnimStyle]}>
        {/* ── Subtle scrim — always visible so the peek bar is readable ── */}
        <View
          style={[
            StyleSheet.absoluteFill,
            styles.scrim,
            {
              backgroundColor: colors.surface },
          ]}
          pointerEvents="none"
        />

        {/* ── Sheet background — fades in when expanded ── */}
        <Reanimated.View
          style={[
            StyleSheet.absoluteFill,
            styles.sheetBg,
            {
              backgroundColor: colors.surface },
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
          <Ionicons name="bag-outline" size={24} color={colors.textSecondary} />
          <Text style={[styles.peekLabel, { color: colors.textPrimary }]}>
            Items
          </Text>
          <Reanimated.View style={chevronAnimStyle}>
            <Ionicons name="chevron-up" size={24} color={colors.textSecondary} />
          </Reanimated.View>
        </Pressable>

        <TrayExpandedContent
          colors={colors}
          expanded={expanded}
          contentAnimStyle={contentAnimStyle}
          tabs={tabs}
          activeTab={activeTab}
          onTabChange={handleTabChange}
          searchQuery={searchQuery}
          onSearchQueryChange={setSearchQuery}
          isSearching={isSearching}
          isSyncing={isSyncing}
          lastError={lastError}
          isEmpty={isEmpty}
          currentItems={currentItems}
          onItemPress={handleItemPress}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          previewX={previewX}
          previewY={previewY}
          previewVisible={previewVisible}
          trayYSV={trayYSV}
          onCanvasListingIds={onCanvasListingIds}
        />
      </Reanimated.View>

      <DragPreview
        draggingItem={draggingItem}
        previewAnimStyle={previewAnimStyle}
        colors={colors}
        currencySymbol={currencySymbol}
      />
      <ConfirmationSheet
        visible={confirmSheet.visible}
        onDismiss={() => setConfirmSheet((s) => ({ ...s, visible: false }))}
        title={confirmSheet.title}
        message={confirmSheet.message}
        confirmLabel={confirmSheet.confirmLabel ?? 'Confirm'}
        variant={confirmSheet.variant ?? 'default'}
        onConfirm={() => { confirmSheet.onConfirm(); setConfirmSheet((s) => ({ ...s, visible: false })); }}
      />
    </View>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// SourceTrayPeek — a thin strip of item thumbnails that sits above the
// tool rail, making the source tray always visible as "creative supply."
// Tapping the strip opens the full items surface.
//
// Per §8.3: "source tray peeking from bottom" — the peek shows real
// item media, not a generic label. The canvas remains dominant; the
// peek is a 36pt strip that hints at available supply.
// ───────────────────────────────────────────────────────────────────────────

export interface SourceTrayPeekProps {
  /** Thumbnail URIs to show in the peek strip (max 5). */
  thumbnailUris: string[];
  /** Called when the user taps the peek strip. */
  onPress: () => void;
}

export function SourceTrayPeek({ thumbnailUris, onPress }: SourceTrayPeekProps) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const uris = thumbnailUris.slice(0, 5);
  const remaining = Math.max(0, thumbnailUris.length - 5);

  return (
    <Pressable
      onPress={() => { haptic.light(); onPress(); }}
      style={({ pressed }) => [styles.peekStrip, pressed && { opacity: 0.6 }]}
      accessibilityLabel="Browse items"
      accessibilityHint="Opens the source tray to browse closet, listings, and search"
      accessibilityRole="button"
    >
      {uris.map((uri, i) => (
        <Image
          key={`${uri}-${i}`}
          source={{ uri }}
          style={styles.peekThumb}
          resizeMode="cover"
        />
      ))}
      {remaining > 0 && (
        <Text style={[styles.peekMore, { color: colors.textSecondary }]}>
          +{remaining}
        </Text>
      )}
    </Pressable>
  );
}
