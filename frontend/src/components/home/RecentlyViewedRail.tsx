import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { AnimatedPressable } from '../AnimatedPressable';
import { HorizontalRail } from '../HorizontalRail';
import { HomeRailTile, type HomeRailTileData } from './HomeRailTile';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { useHaptic } from '../../hooks/useHaptic';
import { useIsGuest } from '../../store/useStore';
import { useRecentlyViewedListings } from '../../hooks/useRecentlyViewed';

/**
 * RecentlyViewedRail — "Recently viewed" module at the head of the home
 * feed, mounted after the story rail. Persisted PDP views resolve back to
 * tiles; guests and empty histories render nothing — absence is the
 * honest state, never a skeleton.
 */
export function RecentlyViewedRail() {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const haptic = useHaptic();
  const isGuest = useIsGuest();
  const { entries, isLoading, clear } = useRecentlyViewedListings();

  if (isGuest || isLoading || entries.length === 0) return null;

  const tiles: HomeRailTileData[] = entries.map((entry) => ({
    id: entry.id,
    title: entry.title,
    price: entry.priceGbp,
    image: entry.imageUrl }));

  return (
    <View style={styles.section}>
      <View style={styles.headerRow}>
        <Text style={styles.headerLabel} maxFontSizeMultiplier={1.4}>
          Recently viewed
        </Text>
        <AnimatedPressable
          style={styles.clearButton}
          onPress={() => {
            haptic.light();
            clear();
          }}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Clear recently viewed"
        >
          <Text style={styles.clearLabel} maxFontSizeMultiplier={1.4}>
            Clear
          </Text>
        </AnimatedPressable>
      </View>
      <HorizontalRail contentContainerStyle={styles.railContent}>
        {tiles.map((tile) => (
          <HomeRailTile key={tile.id} item={tile} />
        ))}
      </HorizontalRail>
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    section: {
      paddingBottom: Space.sm },
    headerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: Space.md,
      marginBottom: Space.xs },
    headerLabel: {
      fontFamily: TypographyV2.meta.fontFamily,
      fontSize: TypographyV2.meta.size,
      color: colors.textPrimary },
    clearButton: {
      minHeight: 32,
      justifyContent: 'center' },
    clearLabel: {
      fontFamily: TypographyV2.meta.fontFamily,
      fontSize: TypographyV2.meta.size,
      color: colors.textMuted },
    railContent: {
      paddingHorizontal: Space.md,
      paddingBottom: 2,
      gap: Space.sm },
  });
