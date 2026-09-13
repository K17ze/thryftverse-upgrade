import React, { useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl, StatusBar } from 'react-native';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { haptics } from '../../utils/haptics';
import { EmptyState } from '../EmptyState';
import { AuctionMarketHeader, ResultRow, type AuctionHeaderAction } from '../auction';
import type { AuctionHomeItem } from '../../utils/auctionHomeLogic';
import type { FormatValueLockup } from '../../hooks/auctionhome';

/**
 * Empty market surface — no live, upcoming, watching or personal activity.
 * Still offers pull-to-refresh, a create CTA, and a compact results ledger
 * when recently closed auctions exist.
 */
export function EmptyMarketState({
  actions,
  refreshing,
  onRefresh,
  onCreateAuction,
  recentlyClosed,
  onPressItem,
  formatValueLockup,
  filterSheet }: {
  actions: AuctionHeaderAction[];
  refreshing: boolean;
  onRefresh: () => void;
  onCreateAuction: () => void;
  recentlyClosed: AuctionHomeItem[];
  onPressItem: (auctionId: string) => void;
  formatValueLockup: FormatValueLockup;
  filterSheet: React.ReactNode;
}) {
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle={!isDark ? 'dark-content' : 'light-content'} />
      <AuctionMarketHeader
        title="Auctions"
        actions={actions}
      />
      <ScrollView
        contentContainerStyle={styles.emptyMarketContainer}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.brand}
            colors={[colors.brand]}
            progressBackgroundColor={colors.surfaceAlt}
          />
        }
      >
        <EmptyState
          icon="bag-handle-outline"
          title="Nothing live right now"
          subtitle="New Auctions will appear here when they are scheduled."
          ctaLabel="Create Auction"
          onCtaPress={() => { haptics.tap(); onCreateAuction(); }}
        />
        {recentlyClosed.length > 0 && (
          <View style={styles.emptyMarketResultsWrap}>
            <Text style={styles.sectionTitle}>Results</Text>
            <View style={styles.resultsContainer}>
              {recentlyClosed.slice(0, 3).map((item) => (
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
      </ScrollView>
      {filterSheet}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background },
    emptyMarketContainer: {
      flexGrow: 1,
      paddingBottom: Space.xxl },
    emptyMarketResultsWrap: {
      marginTop: Space.xl,
      paddingHorizontal: Space.md },
    sectionTitle: {
      fontSize: TypographyV2.sectionTitle.size,
      lineHeight: TypographyV2.sectionTitle.lineHeight,
      letterSpacing: TypographyV2.sectionTitle.letterSpacing,
      color: colors.textPrimary,
      fontFamily: TypographyV2.sectionTitle.fontFamily,
      marginBottom: Space.md },
    resultsContainer: {
      gap: 0 } });
}
