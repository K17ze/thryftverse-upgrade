import React, { useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  StyleSheet,
  RefreshControl } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius, LetterSpacing } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { haptics } from '../../utils/haptics';
import { AnimatedPressable } from '../AnimatedPressable';
import { EmptyState } from '../EmptyState';
import { AuctionSkeletons } from '../auction';
import { AuctionGridItem } from './AuctionGridItem';
import { LoadMoreFooter } from './LoadMoreFooter';
import type { AuctionScope, CategoryWorld } from '../../services/marketApi';
import type {
  AuctionHomeItem,
  AuctionSearchState } from '../../utils/auctionHomeLogic';
import type { FormatValueLockup } from '../../hooks/auctionhome';

/**
 * Full-screen search surface — preserves the active scope as context.
 * Searching shows a 2-column results grid; idle shows recent searches
 * and category shortcuts.
 */
export function SearchOverlay({
  scope,
  query,
  onChangeQuery,
  onClose,
  onClearQuery,
  isSearching,
  searchState,
  secondClock,
  formatValueLockup,
  onPressItem,
  refreshing,
  onRefresh,
  onEndReached,
  recentSearches,
  onClearRecentSearches,
  onSelectCategory,
  categoryWorlds,
  isLoadingMore = false,
  paginationError = null }: {
  scope: AuctionScope;
  query: string;
  onChangeQuery: (text: string) => void;
  onClose: () => void;
  onClearQuery: () => void;
  isSearching: boolean;
  searchState: AuctionSearchState;
  secondClock: number;
  formatValueLockup: FormatValueLockup;
  onPressItem: (auctionId: string) => void;
  refreshing: boolean;
  onRefresh: () => void;
  onEndReached: () => void;
  recentSearches: string[];
  onClearRecentSearches: () => void;
  onSelectCategory: (displayName: string) => void;
  categoryWorlds: CategoryWorld[];
  isLoadingMore?: boolean;
  paginationError?: string | null;
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const scopeLabel = scope === 'live' ? 'Live'
    : scope === 'upcoming' ? 'Upcoming'
    : scope === 'results' ? 'Results'
    : 'Watching';

  const renderSearchItem = useCallback(({ item }: { item: AuctionHomeItem }) => (
    <AuctionGridItem
      item={item}
      secondClock={secondClock}
      formatValueLockup={formatValueLockup}
      onPress={onPressItem}
    />
  ), [secondClock, formatValueLockup, onPressItem]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.searchOverlayHeader}>
        <AnimatedPressable
          onPress={() => { haptics.tap(); onClose(); }}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Close search"
          scaleValue={0.95}
        >
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </AnimatedPressable>
        <TextInput
          value={query}
          onChangeText={onChangeQuery}
          placeholder={`Search ${scopeLabel.toLowerCase()} auctions…`}
          autoFocus
          returnKeyType="search"
          placeholderTextColor={colors.textMuted}
          style={styles.searchOverlayInput}
        />
        {query.length > 0 && (
          <AnimatedPressable
            onPress={onClearQuery}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Clear search"
            scaleValue={0.95}
          >
            <Ionicons name="close-circle" size={20} color={colors.textMuted} />
          </AnimatedPressable>
        )}
      </View>

      {/* Scope context indicator */}
      <View style={styles.searchScopeContext}>
        <Text style={styles.searchScopeText}>Searching in {scopeLabel}</Text>
      </View>

      {isSearching ? (
        <FlashList
          data={searchState.items}
          keyExtractor={(item) => item.id}
          renderItem={renderSearchItem}
          numColumns={2}
          ListEmptyComponent={
            searchState.status === 'loading' ? <AuctionSkeletons /> : (
              searchState.status === 'error' ? (
                <EmptyState icon="cloud-offline-outline" title="Search failed" subtitle="Try again" ctaLabel="Retry" onCtaPress={onRefresh} />
              ) : (
                <EmptyState icon="search-outline" title="No results" subtitle="Try a different search term" />
              )
            )
          }
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
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
      ) : (
        <ScrollView
          style={styles.searchIdleScroll}
          contentContainerStyle={styles.searchIdleContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Recent searches */}
          {recentSearches.length > 0 && (
            <View style={styles.searchIdleSection}>
              <View style={styles.searchIdleSectionHeader}>
                <Text style={styles.searchIdleSectionTitle}>Recent searches</Text>
                <AnimatedPressable
                  onPress={() => { haptics.tap(); onClearRecentSearches(); }}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Clear recent searches"
                  scaleValue={0.95}
                >
                  <Text style={styles.searchIdleClearBtn}>Clear</Text>
                </AnimatedPressable>
              </View>
              <View style={styles.searchIdleChips}>
                {recentSearches.map((term, idx) => (
                  <AnimatedPressable
                    key={idx}
                    style={styles.searchIdleChip}
                    onPress={() => { haptics.tap(); onChangeQuery(term); }}
                    accessibilityRole="button"
                    accessibilityLabel={`Search for ${term}`}
                    scaleValue={0.97}
                    hapticFeedback="light"
                  >
                    <Ionicons name="time-outline" size={13} color={colors.textMuted} />
                    <Text style={styles.searchIdleChipText} numberOfLines={1}>{term}</Text>
                  </AnimatedPressable>
                ))}
              </View>
            </View>
          )}

          {/* Watched categories */}
          {categoryWorlds.length > 0 && (
            <View style={styles.searchIdleSection}>
              <Text style={styles.searchIdleSectionTitle}>Browse by category</Text>
              <View style={styles.searchIdleChips}>
                {categoryWorlds.slice(0, 6).map((world) => (
                  <AnimatedPressable
                    key={world.categoryKey}
                    style={styles.searchIdleChip}
                    onPress={() => { haptics.tap(); onSelectCategory(world.displayName); }}
                    accessibilityRole="button"
                    accessibilityLabel={`Search ${world.displayName} auctions`}
                    scaleValue={0.97}
                    hapticFeedback="light"
                  >
                    <Ionicons name="bag-handle-outline" size={13} color={colors.textMuted} />
                    <Text style={styles.searchIdleChipText} numberOfLines={1}>{world.displayName}</Text>
                  </AnimatedPressable>
                ))}
              </View>
            </View>
          )}

          {/* Fallback hint when no recent searches and no categories */}
          {recentSearches.length === 0 && categoryWorlds.length === 0 && (
            <View style={styles.searchIdleFallback}>
              <Text style={styles.searchIdleHint}>Search by title, brand, or category</Text>
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background },
    contentContainer: {
      paddingBottom: Space.xxl + 24 },
    searchOverlayHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border },
    searchOverlayInput: {
      flex: 1,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      borderRadius: Radius.md,
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm + 2,
      fontSize: TypographyV2.bodyStrong.size,
      color: colors.textPrimary,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      backgroundColor: colors.surfaceAlt },
    searchScopeContext: {
      paddingHorizontal: Space.md,
      paddingVertical: Space.xs,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border },
    searchScopeText: {
      fontSize: TypographyV2.meta.size,
      color: colors.textSecondary,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: 0 },
    searchIdleScroll: {
      flex: 1 },
    searchIdleContent: {
      paddingHorizontal: Space.md,
      paddingVertical: Space.lg,
      gap: Space.xl },
    searchIdleFallback: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: Space.xxl },
    searchIdleHint: {
      fontSize: TypographyV2.body.size,
      color: colors.textMuted,
      fontFamily: TypographyV2.body.fontFamily,
      textAlign: 'center' },
    searchIdleSection: {
      gap: Space.sm },
    searchIdleSectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between' },
    searchIdleSectionTitle: {
      fontSize: TypographyV2.meta.size,
      letterSpacing: LetterSpacing.wide + 0.08,
      color: colors.textSecondary,
      fontFamily: TypographyV2.meta.fontFamily },
    searchIdleClearBtn: {
      fontSize: TypographyV2.meta.size,
      color: colors.brand,
      fontFamily: TypographyV2.meta.fontFamily },
    searchIdleChips: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: Space.xs },
    searchIdleChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingHorizontal: Space.sm + 2,
      paddingVertical: Space.xs + 2,
      borderRadius: Radius.full,
      backgroundColor: colors.surfaceAlt },
    searchIdleChipText: {
      fontSize: TypographyV2.meta.size,
      color: colors.textPrimary,
      fontFamily: TypographyV2.meta.fontFamily,
      maxWidth: 140 } });
}
