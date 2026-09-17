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
import React, { useState, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ScrollView,
  FlatList,
  useWindowDimensions,
  type TextStyle,
  type ViewStyle } from 'react-native';
import { FlashList, type ListRenderItem } from '@shopify/flash-list';
import {
  Space,
  Radius,
  FontFamily,
  Control } from '../../../theme/designTokens';
import { TypographyV2 } from '../../../theme/typography.v2';
import { useAppTheme, type ThemeColors } from '../../../theme/ThemeContext';
import { SheetContainer, PressScale } from '../../shared/CreatorAnimations';
import { useHaptic } from '../../../hooks/useHaptic';
import { useReducedMotion } from '../../../hooks/useReducedMotion';
import { AppIcon } from '../../../components/common/AppIcon';
import { IconSize } from '../../../theme/iconTokens';
import {
  STICKER_CATEGORIES,
  AUTO_STICKER_CATEGORY,
  type StickerDef,
  type StickerCategory } from './StickerCategories';
import { AutoStickerRail, type AutoStickerInput } from './AutoStickerRail';

// ── Props ────────────────────────────────────────────────────────────

export interface StickerBrowserSheetProps {
  visible: boolean;
  onClose: () => void;
  onStickerSelect: (sticker: StickerDef) => void;
  /** Override the category list. Defaults to STICKER_CATEGORIES. */
  categories?: StickerCategory[];
  /** Input for auto-suggested stickers (media palette + document). */
  autoStickerInput?: AutoStickerInput;
}

// ── Geometry ─────────────────────────────────────────────────────────

const GRID_COLUMNS = 4;
const STICKER_GLYPH_SIZE = 32;
const CELL_TOUCH = 72;
const STICKER_VISIBLE = 48;
// ── Sheet ────────────────────────────────────────────────────────────

export function StickerBrowserSheet({
  visible,
  onClose,
  onStickerSelect,
  categories = STICKER_CATEGORIES,
  autoStickerInput }: StickerBrowserSheetProps) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const reduceMotion = useReducedMotion();
  const { width: screenWidth } = useWindowDimensions();
  const styles = useMemo(() => createStyles(colors, screenWidth), [colors, screenWidth]);

  const [activeCategoryId, setActiveCategoryId] = useState<string>(
    categories[0]?.id ?? 'auto',
  );
  const [query, setQuery] = useState('');
  const searchRef = useRef<TextInput>(null);

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
      onStickerSelect(sticker);
      onClose();
    },
    [haptic, onStickerSelect, onClose],
  );

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
        styles={styles}
        reduceMotion={reduceMotion}
      />
    ),
    [handleSelect, styles, reduceMotion],
  );

  const keyExtractor = useCallback((item: StickerDef) => item.id, []);

  return (
    <>
    <SheetContainer visible={visible} onClose={handleClose} compact>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <PressScale
            accessibilityLabel="Close stickers"
            accessibilityHint="Closes the sticker browser"
            accessibilityRole="button"
            onPress={handleClose}
            style={styles.closeButton}
          >
            <AppIcon name="close" size={IconSize.lg} color="textSecondary" opticalCenter={true} accessible={false} />
          </PressScale>
          <Text style={styles.title} numberOfLines={1}>
            Stickers
          </Text>
          <View style={styles.headerActions}>
            <PressScale
              accessibilityLabel="Done"
              accessibilityHint="Closes the sticker browser"
              accessibilityRole="button"
              onPress={handleClose}
              style={styles.doneBtn}
            >
              <Text style={[styles.doneBtnText, { color: colors.brand }]}>Done</Text>
            </PressScale>
          </View>
        </View>

        {/* Search */}
        <View style={styles.searchRow}>
          <AppIcon
            name="search-outline"
            size={IconSize.sm}
            color="textMuted"
            opticalCenter={true}
            accessible={false}
          />
          <TextInput
            ref={searchRef}
            style={styles.searchInput}
            placeholder="Search"
            placeholderTextColor={colors.textMuted}
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
            underlineColorAndroid="transparent"
            accessibilityLabel="Search stickers"
            accessibilityHint="Type to search stickers"
          />
          {query.trim().length > 0 ? (
            <PressScale
              accessibilityLabel="Clear search"
              accessibilityHint="Clears the search text"
              accessibilityRole="button"
              onPress={() => setQuery('')}
              style={styles.clearButton}
            >
              <AppIcon
                name="closeCircle"
                size={IconSize.sm}
                color="textMuted"
                opticalCenter={true}
                accessible={false}
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
            {categories.map((cat) => {
              const active = cat.id === activeCategoryId;
              return (
                <PressScale
                  key={cat.id}
                  accessibilityLabel={`${cat.name} category`}
                  accessibilityHint="Shows stickers in this category"
                  accessibilityRole="button"
                  onPress={() => handleCategoryTap(cat.id)}
                  style={[
                    styles.categoryPill,
                    active ? styles.categoryPillActive : styles.categoryPillInactive,
                  ]}
                >
                  <Text
                    style={[
                      styles.categoryPillLabel,
                      active ? styles.categoryPillLabelActive : styles.categoryPillLabelInactive,
                    ]}
                    numberOfLines={1}
                  >
                    {cat.name}
                  </Text>
                </PressScale>
              );
            })}
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
                No stickers
              </Text>
            </View>
          ) : (
            <FlashList
              data={gridData}
              renderItem={renderItem}
              keyExtractor={keyExtractor}
              numColumns={GRID_COLUMNS}
              contentContainerStyle={styles.gridContent}
              showsVerticalScrollIndicator={false}
            />
          )}
        </View>
      </View>
    </SheetContainer>
    </>
  );
}

// ── StickerCell ──────────────────────────────────────────────────────

interface StickerCellProps {
  sticker: StickerDef;
  onPress: (sticker: StickerDef) => void;
  styles: ReturnType<typeof createStyles>;
  reduceMotion: boolean;
}

const StickerCell = React.memo(function StickerCell({
  sticker,
  onPress,
  styles }: StickerCellProps) {
  const isInteractive = sticker.interactive === true;
  const label = sticker.description ?? sticker.name;

  return (
    <PressScale
      accessibilityLabel={`${sticker.name}${sticker.description ? `, ${sticker.description}` : ''}`}
      accessibilityHint="Adds this sticker to the canvas"
      accessibilityRole="button"
      onPress={() => onPress(sticker)}
      style={styles.cell}
    >
      <View style={styles.cellInner}>
        {sticker.emoji ? (
          <Text style={styles.emoji}>{sticker.emoji}</Text>
        ) : sticker.iconRef ? (
          <AppIcon
            name={sticker.iconRef}
            size={IconSize.hero}
            color={isInteractive ? 'brand' : 'textPrimary'}
            opticalCenter={true}
            accessible={false}
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
    (screenWidth - Space.md * 2 - Space.xs * (GRID_COLUMNS - 1)) / GRID_COLUMNS,
  );
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
    title: {
      flex: 1,
      textAlign: 'center',
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
    doneBtn: {
      height: Control.hit,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: Space.xs } as ViewStyle,
    doneBtnText: {
      fontFamily: FontFamily.semibold,
      fontSize: TypographyV2.bodyStrong.size } as TextStyle,
    searchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surfaceAlt,
      borderRadius: Radius.sm,
      paddingHorizontal: Space.sm,
      height: 36 } as ViewStyle,
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
      gap: Space.xs } as ViewStyle,
    categoryPill: {
      height: 36,
      paddingHorizontal: Space.md,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: Radius.full } as ViewStyle,
    categoryPillActive: {
      backgroundColor: colors.brand } as ViewStyle,
    categoryPillInactive: {
      backgroundColor: colors.surfaceAlt } as ViewStyle,
    categoryPillLabel: {
      fontFamily: FontFamily.medium,
      fontSize: TypographyV2.captionElevated.size,
      lineHeight: TypographyV2.captionElevated.lineHeight } as TextStyle,
    categoryPillLabelActive: {
      color: colors.textInverse } as TextStyle,
    categoryPillLabelInactive: {
      color: colors.textSecondary } as TextStyle,
    gridWrap: {
      flex: 1 } as ViewStyle,
    autoRailWrap: {
      flex: 1,
      paddingVertical: Space.sm } as ViewStyle,
    gridContent: {
      paddingVertical: Space.sm,
      gap: Space.sm } as ViewStyle,
    rowSeparator: {
      height: Space.xs } as ViewStyle,
    cell: {
      width: CELL_SIZE,
      height: CELL_TOUCH,
      alignItems: 'center',
      justifyContent: 'center' } as ViewStyle,
    cellInner: {
      width: STICKER_VISIBLE,
      height: STICKER_VISIBLE,
      alignItems: 'center',
      justifyContent: 'center' } as ViewStyle,
    emoji: {
      fontSize: STICKER_GLYPH_SIZE,
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
      fontSize: TypographyV2.bodyStrong.size,
      lineHeight: TypographyV2.bodyStrong.lineHeight,
      color: colors.textMuted,
      textAlign: 'center' } as TextStyle });
}

// FlatList fallback export for environments without FlashList.
// Kept for API compatibility — not used by the sheet itself.
export const StickerGridFallback = FlatList;
