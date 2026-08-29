/**
 * StickerBrowserSheet — bottom sheet for sticker selection.
 *
 * Extracted from CreatorAssetPicker's monolithic StickerTray (spec
 * 07_MEDIA_TOOLCHAIN). Provides a categorized, searchable sticker picker
 * rendered inside the shared SheetContainer.
 *
 * Features:
 *   - Category tabs at top (horizontal scroll, all STICKER_CATEGORIES)
 *   - Search bar that filters stickers by name (across all categories)
 *   - 4-column grid of square cells
 *   - Emoji stickers rendered as 32pt text glyphs
 *   - Icon-based stickers rendered as 28pt Ionicons
 *   - Interactive stickers (poll/quiz/question/mention/location/hashtag/link)
 *     show a description below the icon
 *   - Tap to select → onStickerSelect + close
 *   - Selected category highlighted with brand color
 *   - 44pt touch targets
 *   - Light haptic on select
 *   - Reduced-motion aware
 *
 * Visual design:
 *   - SheetContainer provides the slide-up sheet + backdrop + grabber
 *   - Header: title + close button
 *   - Search field below header
 *   - Horizontal category tab strip
 *   - Grid fills remaining space (FlashList virtualized)
 */
import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ScrollView,
  Pressable,
  FlatList,
  useWindowDimensions,
  Animated,
  type TextStyle,
  type ViewStyle } from 'react-native';
import { FlashList, type ListRenderItem } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import {
  Space,
  Radius,
  FontFamily,
  Control,
  Stroke,
  IconGrammar } from '../../../theme/designTokens';
import { TypographyV2 } from '../../../theme/typography.v2';
import { useAppTheme, type ThemeColors } from '../../../theme/ThemeContext';
import { SheetContainer, PressScale } from '../../CreatorAnimations';
import { useHaptic } from '../../../hooks/useHaptic';
import { useReducedMotion } from '../../../hooks/useReducedMotion';
import { Motion } from '../../../theme/motionTokens';
import {
  STICKER_CATEGORIES,
  AUTO_STICKER_CATEGORY,
  type StickerDef,
  type StickerCategory } from './StickerCategories';
import { AutoStickerRail, type AutoStickerInput } from './AutoStickerRail';
import { StickerPinOverlay } from './StickerPinOverlay';
import type { StickerPin } from './StickerPinTracker';

// ── Props ────────────────────────────────────────────────────────────

export interface StickerBrowserSheetProps {
  visible: boolean;
  onClose: () => void;
  onStickerSelect: (sticker: StickerDef) => void;
  /** Override the category list. Defaults to STICKER_CATEGORIES. */
  categories?: StickerCategory[];
  /** Input for auto-suggested stickers (media palette + document). */
  autoStickerInput?: AutoStickerInput;
  // ── Pin mode integration (Meta Edits August 2026) ──────────────────
  // When provided, a "Pin Sticker" toggle appears in the header. Activating
  // pin mode changes selection behaviour: tapping a sticker calls
  // `onPinSticker` instead of `onStickerSelect` + close, so the parent can
  // bind the sticker to a media-layer anchor via StickerPinTracker. The
  // StickerPinOverlay is rendered over the canvas while pin mode is active
  // so the user can drag the anchor point.
  /** Called when the user selects a sticker while pin mode is active. */
  onPinSticker?: (sticker: StickerDef) => void;
  /** The current pin (anchor on a media layer). Required to render the overlay. */
  pin?: StickerPin | null;
  /** Sticker center in pixels relative to the overlay container. */
  pinStickerCenterPx?: { x: number; y: number };
  /** Media layer box in pixels relative to the overlay container. */
  pinMediaLayerBoxPx?: { x: number; y: number; width: number; height: number };
  /** Called as the user drags the anchor (normalized 0..1). */
  onPinAnchorChange?: (anchor: { x: number; y: number }) => void;
  /** Called when the anchor drag ends and should be committed. */
  onPinAnchorCommit?: (anchor: { x: number; y: number }) => void;
}

// ── Geometry ─────────────────────────────────────────────────────────

const GRID_COLUMNS = 4;
// ── Sheet ────────────────────────────────────────────────────────────

export function StickerBrowserSheet({
  visible,
  onClose,
  onStickerSelect,
  categories = STICKER_CATEGORIES,
  autoStickerInput,
  onPinSticker,
  pin,
  pinStickerCenterPx,
  pinMediaLayerBoxPx,
  onPinAnchorChange,
  onPinAnchorCommit }: StickerBrowserSheetProps) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const reduceMotion = useReducedMotion();
  const { width: screenWidth } = useWindowDimensions();
  const styles = useMemo(() => createStyles(colors, screenWidth), [colors, screenWidth]);

  // Pin mode is only available when the parent provides onPinSticker.
  const pinModeSupported = !!onPinSticker;
  const [pinMode, setPinMode] = useState(false);

  const [activeCategoryId, setActiveCategoryId] = useState<string>(
    categories[0]?.id ?? 'auto',
  );
  const [query, setQuery] = useState('');
  const searchRef = useRef<TextInput>(null);

  // ── Tab underline animation ─────────────────────────────────────────
  const tabLayouts = useRef<Array<{ x: number; width: number }>>([]);
  const underlineLeft = useRef(new Animated.Value(0)).current;
  const underlineWidth = useRef(new Animated.Value(0)).current;

  const animateUnderlineTo = useCallback(
    (index: number) => {
      const layout = tabLayouts.current[index];
      if (!layout) return;
      Animated.parallel([
        Animated.spring(underlineLeft, {
          toValue: layout.x,
          useNativeDriver: false,
          stiffness: Motion.spring.indicator.stiffness,
          damping: Motion.spring.indicator.damping }),
        Animated.spring(underlineWidth, {
          toValue: layout.width,
          useNativeDriver: false,
          stiffness: Motion.spring.indicator.stiffness,
          damping: Motion.spring.indicator.damping }),
      ]).start();
    },
    [underlineLeft, underlineWidth],
  );

  useEffect(() => {
    const idx = categories.findIndex((c) => c.id === activeCategoryId);
    if (idx >= 0) animateUnderlineTo(idx);
  }, [activeCategoryId, categories, animateUnderlineTo]);

  // ── Search results (cross-category) ────────────────────────────────
  const searchResults = useMemo<StickerDef[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return categories.flatMap((c) =>
      c.stickers.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          (s.description?.toLowerCase().includes(q) ?? false),
      ),
    );
  }, [categories, query]);

  const isSearching = query.trim().length > 0;

  // ── Active category stickers ───────────────────────────────────────
  const activeCategory = useMemo<StickerCategory | undefined>(
    () => categories.find((c) => c.id === activeCategoryId),
    [categories, activeCategoryId],
  );

  const gridData = useMemo<StickerDef[]>(
    () => (isSearching ? searchResults : activeCategory?.stickers ?? []),
    [isSearching, searchResults, activeCategory],
  );

  // ── Handlers ───────────────────────────────────────────────────────
  const handleSelect = useCallback(
    (sticker: StickerDef) => {
      haptic.light();
      if (pinMode && onPinSticker) {
        // Pin mode: hand the sticker to the parent so it can bind the
        // sticker to a media-layer anchor via StickerPinTracker. The sheet
        // stays open so the user can drag the anchor (StickerPinOverlay).
        onPinSticker(sticker);
        return;
      }
      onStickerSelect(sticker);
      onClose();
    },
    [haptic, pinMode, onPinSticker, onStickerSelect, onClose],
  );

  const handleTogglePinMode = useCallback(() => {
    haptic.selection();
    setPinMode((v) => !v);
  }, [haptic]);

  const handleCategoryTap = useCallback(
    (id: string) => {
      haptic.selection();
      setActiveCategoryId(id);
      // Exit search mode when a category is explicitly tapped.
      if (query.trim().length > 0) {
        setQuery('');
        searchRef.current?.blur();
      }
    },
    [haptic, query],
  );

  const handleClose = useCallback(() => {
    setQuery('');
    onClose();
  }, [onClose]);

  // ── Grid item renderer ─────────────────────────────────────────────
  const renderItem = useCallback<ListRenderItem<StickerDef>>(
    ({ item }) => (
      <StickerCell
        sticker={item}
        onPress={handleSelect}
        colors={colors}
        styles={styles}
        reduceMotion={reduceMotion}
      />
    ),
    [handleSelect, colors, styles, reduceMotion],
  );

  const keyExtractor = useCallback((item: StickerDef) => item.id, []);

  return (
    <SheetContainer visible={visible} onClose={handleClose} compact>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title} numberOfLines={1}>
            Stickers
          </Text>
          <View style={styles.headerActions}>
            {/* Pin Sticker toggle — activates pin mode (Meta Edits August 2026).
                Only shown when the parent supports pin binding. 44pt target. */}
            {pinModeSupported && (
              <PressScale
                accessibilityLabel={pinMode ? 'Cancel pin mode' : 'Pin sticker to media'}
                accessibilityHint="Toggles pin mode so the next sticker you tap binds to a point on the media layer"
                accessibilityRole="button"
                accessibilityState={{ selected: pinMode }}
                onPress={handleTogglePinMode}
                style={[
                  styles.pinBtn,
                  pinMode ? styles.pinBtnActive : styles.pinBtnInactive,
                ]}
              >
                <Ionicons
                  name="pin-outline"
                  size={Control.iconCompact}
                  color={pinMode ? colors.textInverse : colors.textSecondary}
                />
                <Text
                  style={[
                    styles.pinBtnLabel,
                    pinMode ? styles.pinBtnLabelActive : styles.pinBtnLabelInactive,
                  ]}
                  numberOfLines={1}
                >
                  Pin
                </Text>
              </PressScale>
            )}
            <PressScale
              accessibilityLabel="Close stickers"
              accessibilityRole="button"
              onPress={handleClose}
              style={styles.closeButton}
            >
              <Ionicons name="close" size={Control.icon} color={colors.textPrimary} />
            </PressScale>
          </View>
        </View>

        {/* Search */}
        <View style={styles.searchRow}>
          <Ionicons
            name="search-outline"
            size={Control.iconCompact}
            color={colors.textMuted}
            style={styles.searchIcon}
          />
          <TextInput
            ref={searchRef}
            style={styles.searchInput}
            placeholder="Search stickers"
            placeholderTextColor={colors.textMuted}
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
            underlineColorAndroid="transparent"
            accessibilityLabel="Search stickers"
          />
          {query.trim().length > 0 ? (
            <PressScale
              accessibilityLabel="Clear search"
              accessibilityRole="button"
              onPress={() => setQuery('')}
              style={styles.clearButton}
            >
              <Ionicons
                name="close-circle"
                size={Control.iconCompact}
                color={colors.textMuted}
              />
            </PressScale>
          ) : null}
        </View>

        {/* Category tabs (hidden while searching) */}
        {isSearching ? null : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabsContent}
            style={styles.tabs}
          >
            {categories.map((cat, i) => {
              const active = cat.id === activeCategoryId;
              return (
                <View
                  key={cat.id}
                  onLayout={(e) => {
                    tabLayouts.current[i] = {
                      x: e.nativeEvent.layout.x,
                      width: e.nativeEvent.layout.width };
                    if (active) animateUnderlineTo(i);
                  }}
                >
                  <PressScale
                    accessibilityLabel={`${cat.name} category`}
                    accessibilityRole="button"
                    onPress={() => handleCategoryTap(cat.id)}
                    style={styles.tab}
                  >
                    <Ionicons
                      name={cat.icon}
                      size={Control.iconCompact}
                      color={active ? colors.brand : colors.textSecondary}
                      style={styles.tabIcon}
                    />
                    <Text
                      style={[styles.tabLabel, active && styles.tabLabelActive]}
                      numberOfLines={1}
                    >
                      {cat.name}
                    </Text>
                  </PressScale>
                </View>
              );
            })}
            <Animated.View
              style={[
                styles.tabUnderline,
                { left: underlineLeft, width: underlineWidth },
              ]}
            />
          </ScrollView>
        )}

        {/* Grid — or AutoStickerRail when the Auto category is active */}
        <View style={styles.gridWrap}>
          {!isSearching && activeCategoryId === AUTO_STICKER_CATEGORY.id ? (
            <View style={styles.autoRailWrap}>
              <AutoStickerRail
                input={autoStickerInput ?? { palette: [] }}
                onStickerSelect={handleSelect}
              />
            </View>
          ) : gridData.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>
                {isSearching ? 'No stickers match your search' : 'No stickers here'}
              </Text>
            </View>
          ) : (
            <FlashList
              data={gridData}
              renderItem={renderItem}
              keyExtractor={keyExtractor}
              numColumns={GRID_COLUMNS}
              contentContainerStyle={styles.gridContent}
              ItemSeparatorComponent={() => <View style={styles.rowSeparator} />}
              showsVerticalScrollIndicator={false}
            />
          )}
        </View>

        {/* StickerPinOverlay — shown while pin mode is active so the user
            can drag the anchor point on the media layer. The overlay is
            driven by Reanimated shared values and only intercepts touches
            on the 44pt drag handle (pointerEvents="box-none"). */}
        {pinMode && pin && pinStickerCenterPx && pinMediaLayerBoxPx && onPinAnchorChange && onPinAnchorCommit && (
          <StickerPinOverlay
            visible={pinMode}
            pin={pin}
            stickerCenterPx={pinStickerCenterPx}
            mediaLayerBoxPx={pinMediaLayerBoxPx}
            onAnchorChange={onPinAnchorChange}
            onAnchorCommit={onPinAnchorCommit}
          />
        )}
      </View>
    </SheetContainer>
  );
}

// ── StickerCell ──────────────────────────────────────────────────────

interface StickerCellProps {
  sticker: StickerDef;
  onPress: (sticker: StickerDef) => void;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
  reduceMotion: boolean;
}

const StickerCell = React.memo(function StickerCell({
  sticker,
  onPress,
  colors,
  styles }: StickerCellProps) {
  const isInteractive = sticker.interactive === true;
  const label = sticker.description ?? sticker.name;

  return (
    <PressScale
      accessibilityLabel={`${sticker.name}${sticker.description ? `, ${sticker.description}` : ''}`}
      accessibilityRole="button"
      onPress={() => onPress(sticker)}
      style={styles.cell}
    >
      <View style={styles.cellInner}>
        {sticker.emoji ? (
          <Text style={styles.emoji}>{sticker.emoji}</Text>
        ) : sticker.iconRef ? (
          <Ionicons
            name={sticker.iconRef}
            size={IconGrammar.hero}
            color={isInteractive ? colors.brand : colors.textPrimary}
          />
        ) : null}
        {isInteractive ? (
          <Text style={styles.cellDescription} numberOfLines={1}>
            {label}
          </Text>
        ) : null}
      </View>
    </PressScale>
  );
});

// ── Styles ───────────────────────────────────────────────────────────

function createStyles(colors: ThemeColors, screenWidth: number) {
  /** Square cell side: screen width minus sheet padding and inter-cell gaps. */
  const CELL_SIZE = Math.floor(
    (screenWidth - Space.md * 2 - Space.sm * (GRID_COLUMNS - 1)) / GRID_COLUMNS,
  );
  /** 44pt minimum touch target, but never smaller than the visible cell. */
  const CELL_TOUCH = Math.max(CELL_SIZE, Control.hit);
  return StyleSheet.create({
    container: {
      flex: 1,
      paddingHorizontal: Space.md },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: Space.sm } as ViewStyle,
    headerActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs } as ViewStyle,
    pinBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      height: Control.hit,
      paddingHorizontal: Space.smMd,
      borderRadius: Radius.full,
      borderWidth: Stroke.hairline,
      gap: Space.xs } as ViewStyle,
    pinBtnActive: {
      backgroundColor: colors.brand,
      borderColor: colors.brand } as ViewStyle,
    pinBtnInactive: {
      backgroundColor: colors.surfaceAlt,
      borderColor: colors.borderSubtle } as ViewStyle,
    pinBtnLabel: {
      fontFamily: FontFamily.medium,
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      letterSpacing: TypographyV2.meta.letterSpacing } as TextStyle,
    pinBtnLabelActive: {
      color: colors.textInverse } as TextStyle,
    pinBtnLabelInactive: {
      color: colors.textSecondary } as TextStyle,
    title: {
      fontFamily: FontFamily.semibold,
      fontSize: TypographyV2.sectionTitle.size,
      lineHeight: TypographyV2.sectionTitle.lineHeight,
      letterSpacing: TypographyV2.sectionTitle.letterSpacing,
      color: colors.textPrimary } as TextStyle,
    closeButton: {
      width: Control.hit,
      height: Control.hit,
      alignItems: 'center',
      justifyContent: 'center' } as ViewStyle,
    searchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.input,
      borderRadius: Radius.md,
      paddingHorizontal: Space.sm,
      height: 40,
      borderWidth: Stroke.hairline,
      borderColor: colors.borderSubtle } as ViewStyle,
    searchIcon: {
      marginRight: Space.xs } as TextStyle,
    searchInput: {
      flex: 1,
      fontFamily: FontFamily.regular,
      fontSize: TypographyV2.body.size,
      lineHeight: TypographyV2.body.lineHeight,
      color: colors.inputText,
      padding: 0 } as TextStyle,
    clearButton: {
      width: Control.hit,
      height: Control.hit,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: -Space.xs } as ViewStyle,
    tabs: {
      flexGrow: 0,
      marginVertical: Space.sm } as ViewStyle,
    tabsContent: {
      paddingRight: Space.md,
      gap: Space.sm } as ViewStyle,
    tab: {
      flexDirection: 'row',
      alignItems: 'center',
      height: Control.hit,
      paddingHorizontal: Space.smMd } as ViewStyle,
    tabIcon: {
      marginRight: Space.xs } as TextStyle,
    tabLabel: {
      fontFamily: FontFamily.medium,
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      letterSpacing: TypographyV2.meta.letterSpacing,
      color: colors.textSecondary } as TextStyle,
    tabLabelActive: {
      color: colors.brand } as TextStyle,
    tabUnderline: {
      position: 'absolute',
      bottom: 0,
      height: Stroke.emphasis,
      backgroundColor: colors.brand,
      borderRadius: Stroke.emphasis } as ViewStyle,
    gridWrap: {
      flex: 1 } as ViewStyle,
    autoRailWrap: {
      flex: 1,
      paddingVertical: Space.sm } as ViewStyle,
    gridContent: {
      paddingVertical: Space.sm } as ViewStyle,
    rowSeparator: {
      height: Space.sm } as ViewStyle,
    cell: {
      width: CELL_SIZE,
      height: CELL_TOUCH,
      alignItems: 'center',
      justifyContent: 'center' } as ViewStyle,
    cellInner: {
      alignItems: 'center',
      justifyContent: 'center',
      flex: 1 } as ViewStyle,
    emoji: {
      fontSize: 32,
      lineHeight: 38,
      color: colors.textPrimary } as TextStyle,
    cellDescription: {
      marginTop: Space.xxs,
      fontFamily: FontFamily.regular,
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      letterSpacing: TypographyV2.meta.letterSpacing,
      color: colors.textSecondary,
      textAlign: 'center' } as TextStyle,
    emptyState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: Space.xl } as ViewStyle,
    emptyText: {
      fontFamily: FontFamily.regular,
      fontSize: TypographyV2.body.size,
      lineHeight: TypographyV2.body.lineHeight,
      color: colors.textSecondary,
      textAlign: 'center' } as TextStyle });
}

// FlatList fallback export for environments without FlashList.
// Kept for API compatibility — not used by the sheet itself.
export const StickerGridFallback = FlatList;
