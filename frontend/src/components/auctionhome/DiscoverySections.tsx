import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { HorizontalRail } from '../HorizontalRail';
import { CategoryRailTile, ResultRow } from '../auction';
import { AuctionGridItem } from './AuctionGridItem';
import type { AuctionScope, CategoryWorld } from '../../services/marketApi';
import type { AuctionHomeItem } from '../../utils/auctionHomeLogic';
import type { FormatValueLockup } from '../../hooks/auctionhome';

/**
 * Below-fold discovery zones — category rail, compact results ledger and
 * the continuous "More to explore" feed. All three are suppressed while
 * browse filters are active so they never compete with filter results.
 */
export function DiscoverySections({
  categoryWorlds,
  categoryCardWidth,
  onCategoryPress,
  recentlyClosed,
  exploreFeedItems,
  secondClock,
  gridCardWidth,
  formatValueLockup,
  onPressItem,
  isBrowsing,
  scope }: {
  categoryWorlds: CategoryWorld[];
  categoryCardWidth: number;
  onCategoryPress: (categoryKey: string) => void;
  recentlyClosed: AuctionHomeItem[];
  exploreFeedItems: AuctionHomeItem[];
  secondClock: number;
  gridCardWidth: number;
  formatValueLockup: FormatValueLockup;
  onPressItem: (auctionId: string) => void;
  isBrowsing: boolean;
  scope: AuctionScope;
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <>
      {/* Category discovery */}
      {categoryWorlds.length > 0 && !isBrowsing && (
        <View style={styles.zoneWrap}>
          <Text style={styles.sectionTitle}>Categories</Text>
          <HorizontalRail
            contentContainerStyle={styles.categoryRailContent}
          >
            {categoryWorlds.map((world) => (
              <CategoryRailTile
                key={world.categoryKey}
                world={world}
                cardWidth={categoryCardWidth}
                onPress={() => onCategoryPress(world.categoryKey)}
              />
            ))}
          </HorizontalRail>
        </View>
      )}

      {/* Results — compact, near lower page (only when not browsing and not in results scope) */}
      {recentlyClosed.length > 0 && !isBrowsing && scope !== 'results' && (
        <View style={styles.zoneWrap}>
          <Text style={styles.sectionTitle}>Results</Text>
          <View style={styles.resultsContainer}>
            {recentlyClosed.map((item) => (
              <ResultRow
                key={item.id}
                item={item}
                onPress={() => onPressItem(item.id)}
                formatValueLockup={formatValueLockup}
              />
            ))}
          </View>
        </View>
      )}

      {/* ── More to explore — continuous feed ── */}
      {exploreFeedItems.length > 0 && !isBrowsing && (
        <View style={styles.zoneWrap}>
          <Text style={styles.sectionTitle}>More to explore</Text>
          <View style={styles.continuationGrid}>
            {exploreFeedItems.map((item) => (
              <AuctionGridItem
                key={item.id}
                item={item}
                secondClock={secondClock}
                formatValueLockup={formatValueLockup}
                onPress={onPressItem}
                cardWidth={gridCardWidth}
              />
            ))}
          </View>
        </View>
      )}
    </>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    zoneWrap: {
      paddingHorizontal: Space.md,
      marginTop: Space.xl },
    sectionTitle: {
      fontSize: TypographyV2.sectionTitle.size,
      lineHeight: TypographyV2.sectionTitle.lineHeight,
      letterSpacing: TypographyV2.sectionTitle.letterSpacing,
      color: colors.textPrimary,
      fontFamily: TypographyV2.sectionTitle.fontFamily,
      marginBottom: Space.md },
    categoryRailContent: {
      gap: Space.sm },
    resultsContainer: {
      gap: 0 },
    continuationGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: Space.sm,
      marginTop: Space.sm } });
}
