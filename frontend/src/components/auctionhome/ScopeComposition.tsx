import React, { useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, RefreshControl } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { EmptyState } from '../EmptyState';
import { LoadMoreFooter } from './LoadMoreFooter';
import {
  AuctionSkeletons,
  UpcomingRow,
  ResultRow } from '../auction';
import { AuctionGridItem } from './AuctionGridItem';
import { LiveComposition } from './LiveComposition';
import type { AuctionScope } from '../../services/marketApi';
import type { AuctionHomeItem } from '../../utils/auctionHomeLogic';
import type { BrowseResult } from '../../hooks/auction';
import type { AuctionHomeLayout, FormatValueLockup } from '../../hooks/auctionhome';

/**
 * Selected market composition — a single composition per scope, no
 * duplicate rails. When filters are active, renders the API-fetched
 * browse results in-place instead of the curated home sections.
 */
export function ScopeComposition({
  isBrowsing,
  browseResult,
  scope,
  scopeItems,
  secondClock,
  formatValueLockup,
  onPressItem,
  layout,
  refreshing,
  onRefresh,
  onEndReached,
  onRetryBrowse,
  onClearFilters,
  isLoadingMore = false,
  paginationError = null }: {
  isBrowsing: boolean;
  browseResult: BrowseResult;
  scope: AuctionScope;
  scopeItems: AuctionHomeItem[];
  secondClock: number;
  formatValueLockup: FormatValueLockup;
  onPressItem: (auctionId: string) => void;
  layout: AuctionHomeLayout;
  refreshing: boolean;
  onRefresh: () => void;
  onEndReached: () => void;
  onRetryBrowse: () => void;
  onClearFilters: () => void;
  isLoadingMore?: boolean;
  paginationError?: string | null;
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const renderBrowseItem = useCallback(({ item }: { item: AuctionHomeItem }) => (
    <AuctionGridItem
      item={item}
      secondClock={secondClock}
      formatValueLockup={formatValueLockup}
      onPress={onPressItem}
    />
  ), [secondClock, formatValueLockup, onPressItem]);

  if (isBrowsing) {
    // When filters are active, show API-fetched browse results in-place
    if (browseResult.status === 'loading') return <AuctionSkeletons />;
    if (browseResult.status === 'error') {
      return (
        <EmptyState
          icon="cloud-offline-outline"
          title="Filter failed"
          subtitle="Try again"
          ctaLabel="Retry"
          onCtaPress={onRetryBrowse}
        />
      );
    }
    if (browseResult.status === 'empty') {
      return (
        <EmptyState
          icon="filter-outline"
          title="No matches"
          subtitle="Try adjusting your filters"
          ctaLabel="Clear filters"
          onCtaPress={onClearFilters}
        />
      );
    }
    return (
      <FlashList
        data={browseResult.items}
        keyExtractor={(item) => item.id}
        renderItem={renderBrowseItem}
        numColumns={2}
        contentContainerStyle={styles.contentContainer}
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
        onEndReached={onEndReached}
        onEndReachedThreshold={0.25}
        ListFooterComponent={
          <LoadMoreFooter isLoadingMore={isLoadingMore} error={paginationError} onRetry={onEndReached} />
        }
      />
    );
  }

  if (scopeItems.length === 0) {
    return (
      <View style={styles.compositionEmpty}>
        <Text style={styles.compositionEmptyText}>No auctions in this view</Text>
      </View>
    );
  }

  switch (scope) {
    case 'live':
      return (
        <LiveComposition
          items={scopeItems}
          secondClock={secondClock}
          formatValueLockup={formatValueLockup}
          onPressItem={onPressItem}
          layout={layout}
        />
      );

    case 'upcoming':
      // Scheduled programme rows — no duplicate rail
      return (
        <View style={styles.compositionWrap}>
          <View style={styles.upcomingContainer}>
            {scopeItems.map((item) => (
              <UpcomingRow
                key={item.id}
                item={item}
                onPress={() => onPressItem(item.id)}
                formatValueLockup={formatValueLockup}
              />
            ))}
          </View>
        </View>
      );

    case 'results':
      // Results ledger — compact rows with outcome, price, bid count
      return (
        <View style={styles.compositionWrap}>
          <View style={styles.resultsContainer}>
            {scopeItems.map((item) => (
              <ResultRow
                key={item.id}
                item={item}
                onPress={() => onPressItem(item.id)}
                formatValueLockup={formatValueLockup}
              />
            ))}
          </View>
        </View>
      );

    case 'watching':
      // Compact continuity grid — no duplicate rail
      return (
        <View style={styles.compositionWrap}>
          <View style={styles.continuationGrid}>
            {scopeItems.map((item) => (
              <AuctionGridItem
                key={item.id}
                item={item}
                secondClock={secondClock}
                formatValueLockup={formatValueLockup}
                onPress={onPressItem}
                cardWidth={layout.gridCardWidth}
              />
            ))}
          </View>
        </View>
      );

    default:
      return null;
  }
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    contentContainer: {
      paddingBottom: Space.xxl + 24 },
    compositionWrap: {
      paddingHorizontal: Space.md,
      marginTop: Space.xl },
    compositionEmpty: {
      paddingHorizontal: Space.md,
      paddingVertical: Space.xl,
      alignItems: 'center' },
    compositionEmptyText: {
      fontSize: TypographyV2.body.size,
      color: colors.textMuted,
      fontFamily: TypographyV2.body.fontFamily },
    upcomingContainer: {
      gap: 0 },
    resultsContainer: {
      gap: 0 },
    continuationGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: Space.sm,
      marginTop: Space.sm } });
}
