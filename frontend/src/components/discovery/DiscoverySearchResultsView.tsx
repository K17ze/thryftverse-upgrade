import React, { useMemo, useRef } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';

import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { FlagshipState } from '../flagship';
import { AppIcon } from '../common/AppIcon';
import { IconSize } from '../../theme/iconTokens';
import { PinterestMasonryGrid } from '../discover/PinterestMasonryGrid';
import { MasonrySkeleton } from '../skeletons/MasonrySkeleton';
import { DiscoveryPeopleResultRow } from './DiscoveryPeopleResultRow';
import { createUnifiedDiscoveryStyles } from './unifiedDiscoveryStyles';
import { FontFamily, Space } from '../../theme/designTokens';
import { TypographyV2, MAX_FONT_SCALE } from '../../theme/typography.v2';
import type { DiscoveryFeedUnit } from '../../contracts/discoveryFeedUnit';
import type { DiscoveryListingSummary } from '../../contracts/DiscoveryListingSummary';
import type { UserSearchResult } from '../../services/profileApi';

// ============================================================================
// SEARCH RESULTS VIEW
// ============================================================================

// Failed-page retry strip — same grammar as the stale-note/active-filters
// rows (hairline edge, meta-size copy, brand text action). Anchored at the
// bottom of the results area so a failed page on a populated list is
// visible without replacing the loaded results (FRESH-03).
const createPageFailureStyles = (colors: ThemeColors) => StyleSheet.create({
  pageErrorBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.background },
  pageErrorText: {
    flex: 1,
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.regular,
    color: colors.textSecondary },
  pageErrorRetry: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.semibold,
    color: colors.brand } });

export function DiscoverySearchResultsView({
  units,
  isSearching,
  isSearchingPeople,
  peopleResults,
  peopleError,
  onRetryPeople,
  searchScope,
  searchError,
  pageError,
  onRetryPage,
  onRetry,
  onScopeChange,
  activeFilterCount,
  onOpenFilters,
  onClearFilters,
  usedFallback,
  resultCount,
  hasMore,
  isLoadingMore,
  onEndReached,
  onClearSearch,
  onSaveSearch,
  isSearchSaved,
  onListingPress,
  onLookPress,
  onPosterPress,
  onMoodboardPress,
  onUserPress,
  onItemSaveToggle,
  onItemSaveLongPress,
  isItemSaved }: {
  units: DiscoveryFeedUnit[];
  isSearching: boolean;
  isSearchingPeople: boolean;
  peopleResults: UserSearchResult[];
  /** People-scope request failure — rendered as an error+retry state, never
   *  disguised as "No people found". */
  peopleError?: string | null;
  onRetryPeople?: () => void;
  searchScope: 'items' | 'people';
  /** Initial-load failure — renders the full error state when no results
   *  are on screen. */
  searchError: string | null;
  /** Append-page failure on a populated list — renders the failed-page
   *  retry strip at the bottom of the results (FRESH-03). */
  pageError?: string | null;
  /** Re-issues the exact page that failed (page state only advances on a
   *  successful append, so the retried request is identical). */
  onRetryPage?: () => void;
  onRetry: () => void;
  onScopeChange: (s: 'items' | 'people') => void;
  activeFilterCount: number;
  onOpenFilters: () => void;
  onClearFilters: () => void;
  /** True when the backend reported a retrieval fallback (typo-tolerant /
   *  substring path) — surfaces the honest "similar items" note. */
  usedFallback?: boolean;
  /** Loaded result count — displayed with a trailing "+" while more pages
   *  may exist (the search API is page-based and reports no total). */
  resultCount?: number;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onEndReached?: () => void;
  /** Recovery action for a bare no-results state — returns to discovery. */
  onClearSearch?: () => void;
  /** Save the current query + filters as a saved search (match alerts). */
  onSaveSearch?: () => void;
  isSearchSaved?: boolean;
  onListingPress: (listing: DiscoveryListingSummary) => void;
  onLookPress: (id: string) => void;
  onPosterPress: (id: string) => void;
  onMoodboardPress: (id: string) => void;
  onUserPress: (userId: string) => void;
  onItemSaveToggle?: (listing: DiscoveryListingSummary) => void;
  onItemSaveLongPress?: (listing: DiscoveryListingSummary) => void;
  isItemSaved?: (listingId: string) => boolean;
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createUnifiedDiscoveryStyles(colors), [colors]);
  const pageFailureStyles = useMemo(() => createPageFailureStyles(colors), [colors]);
  const scrollRef = useRef<any>(null);

  // Quiet results meta — count (partial-labelled while more pages may exist)
  // plus the retrieval-fallback note when the backend widened the match.
  const resultsHeader =
    (resultCount ?? 0) > 0 || usedFallback ? (
      <View style={styles.resultsMetaWrap}>
        {usedFallback ? (
          <Text style={styles.resultsMetaText} numberOfLines={2}>
            No exact matches — showing similar items
          </Text>
        ) : null}
        {(resultCount ?? 0) > 0 ? (
          <Text style={styles.resultsMetaText} numberOfLines={1}>
            {resultCount}
            {hasMore ? '+' : ''} {resultCount === 1 ? 'result' : 'results'}
          </Text>
        ) : null}
      </View>
    ) : undefined;

  return (
    <View style={styles.searchResultsWrap}>
      {/* Scope tabs — Items | People */}
      <View style={styles.scopeBar}>
        <Pressable
          onPress={() => onScopeChange('items')}
          style={[styles.scopeTab, searchScope === 'items' && styles.scopeTabActive]}
          accessibilityRole="button"
          accessibilityState={{ selected: searchScope === 'items' }}
        >
          <Text style={[styles.scopeTabText, searchScope === 'items' && styles.scopeTabTextActive]} maxFontSizeMultiplier={MAX_FONT_SCALE.utility}>
            Items
          </Text>
          {searchScope === 'items' && <View style={styles.scopeIndicator} />}
        </Pressable>
        <Pressable
          onPress={() => onScopeChange('people')}
          style={[styles.scopeTab, searchScope === 'people' && styles.scopeTabActive]}
          accessibilityRole="button"
          accessibilityState={{ selected: searchScope === 'people' }}
        >
          <Text style={[styles.scopeTabText, searchScope === 'people' && styles.scopeTabTextActive]} maxFontSizeMultiplier={MAX_FONT_SCALE.utility}>
            People
          </Text>
          {searchScope === 'people' && <View style={styles.scopeIndicator} />}
        </Pressable>

        {/* Save-search — persist the current query + filters with match
            alerts. Quiet glyph button; filled when already saved. */}
        {searchScope === 'items' && onSaveSearch ? (
          <Pressable
            onPress={onSaveSearch}
            style={styles.scopeAction}
            accessibilityRole="button"
            accessibilityLabel={isSearchSaved ? 'Search saved' : 'Save this search'}
            accessibilityHint="Saves the current search and notifies you of new matches"
            accessibilityState={{ selected: isSearchSaved === true }}
            hitSlop={8}
          >
            <AppIcon
              name={isSearchSaved ? 'bookmark' : 'bookmark-outline'}
              size={IconSize.sm}
              color={isSearchSaved ? 'brand' : 'textSecondary'}
              accessible={false}
            />
          </Pressable>
        ) : null}

        {/* Filter entry point — only meaningful for item results. */}
        {searchScope === 'items' && (
          <Pressable
            onPress={onOpenFilters}
            style={styles.filterTrigger}
            accessibilityRole="button"
            accessibilityLabel={activeFilterCount > 0 ? `Filters, ${activeFilterCount} active` : 'Filters'}
            accessibilityHint="Opens the filter sheet"
            hitSlop={8}
          >
            <AppIcon name="options-outline" size={IconSize.sm} color={activeFilterCount > 0 ? 'brand' : 'textSecondary'} accessible={false} />
            <Text style={[styles.filterTriggerText, activeFilterCount > 0 && styles.filterTriggerTextActive]}>
              {activeFilterCount > 0 ? `Filters · ${activeFilterCount}` : 'Filters'}
            </Text>
          </Pressable>
        )}
      </View>

      {/* Active-filter summary + clear — only when filters are applied so
          the user can see and reset the narrowed result set. */}
      {searchScope === 'items' && activeFilterCount > 0 && (
        <View style={styles.activeFiltersRow}>
          <Text style={styles.activeFiltersText} numberOfLines={1}>
            {activeFilterCount} filter{activeFilterCount === 1 ? '' : 's'} applied
          </Text>
          <Pressable
            onPress={onClearFilters}
            accessibilityRole="button"
            accessibilityLabel="Clear all filters"
            hitSlop={8}
          >
            <Text style={styles.clearFiltersText}>Clear</Text>
          </Pressable>
        </View>
      )}

      {searchScope === 'items' ? (
        isSearching && units.length === 0 ? (
          // Skeleton, not a spinner — the loading frame matches the final
          // masonry geometry so results land without a layout shift.
          <MasonrySkeleton numColumns={3} itemCount={9} />
        ) : searchError && units.length === 0 ? (
          <View style={styles.stateWrap}>
            <FlagshipState
              variant="error"
              icon="cloud-offline-outline"
              title="Search unavailable"
              subtitle={searchError}
              actionLabel="Retry"
              onAction={onRetry}
            />
          </View>
        ) : units.length === 0 ? (
          <View style={styles.stateWrap}>
            {activeFilterCount > 0 ? (
              <FlagshipState
                variant="empty"
                icon="funnel-outline"
                title="No items match your filters"
                subtitle="Try widening the price range or removing a filter."
                actionLabel="Clear filters"
                onAction={onClearFilters}
              />
            ) : (
              <FlagshipState
                variant="empty"
                icon="search-outline"
                title="No items found"
                subtitle="Try a different search term or browse discovery instead."
                actionLabel={onClearSearch ? 'Back to discovery' : undefined}
                onAction={onClearSearch}
              />
            )}
          </View>
        ) : (
          <PinterestMasonryGrid
            items={units}
            onItemPress={onListingPress}
            onLookPress={onLookPress}
            onPosterPress={onPosterPress}
            onMoodboardPress={onMoodboardPress}
            numColumns={3}
            scrollRef={scrollRef}
            onItemSaveToggle={onItemSaveToggle}
            onItemSaveLongPress={onItemSaveLongPress}
            isItemSaved={isItemSaved}
            onEndReached={onEndReached}
            isLoadingMore={isLoadingMore}
            hasMore={hasMore ?? false}
            listHeaderComponent={resultsHeader}
          />
        )
      ) : null}

      {/* Failed-page retry — a page fetch that failed on a populated list is
          surfaced as a bottom strip with an inline retry, never silently
          dropped and never disguised as the end of results (FRESH-03). */}
      {searchScope === 'items' && units.length > 0 && pageError ? (
        <View
          style={pageFailureStyles.pageErrorBar}
          accessibilityLiveRegion="polite"
        >
          <Text style={pageFailureStyles.pageErrorText} numberOfLines={1} maxFontSizeMultiplier={MAX_FONT_SCALE.utility}>
            {pageError}
          </Text>
          <Pressable
            onPress={onRetryPage}
            accessibilityRole="button"
            accessibilityLabel="Retry loading more results"
            hitSlop={8}
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
          >
            <Text style={pageFailureStyles.pageErrorRetry} maxFontSizeMultiplier={MAX_FONT_SCALE.utility}>
              Retry
            </Text>
          </Pressable>
        </View>
      ) : null}

      {searchScope === 'items' ? null : (
        isSearchingPeople && peopleResults.length === 0 ? (
          <MasonrySkeleton numColumns={2} itemCount={6} />
        ) : peopleError && peopleResults.length === 0 ? (
          <View style={styles.stateWrap}>
            <FlagshipState
              variant="error"
              icon="cloud-offline-outline"
              title="People search unavailable"
              subtitle={peopleError}
              actionLabel="Retry"
              onAction={onRetryPeople}
            />
          </View>
        ) : peopleResults.length === 0 ? (
          <View style={styles.stateWrap}>
            <FlagshipState
              variant="empty"
              icon="people-outline"
              title="No people found"
              subtitle="Try searching by username or display name."
            />
          </View>
        ) : (
          <View style={styles.peopleList}>
            {peopleResults.map((user) => (
              <DiscoveryPeopleResultRow
                key={user.id}
                user={user}
                onPress={() => onUserPress(user.id)}
              />
            ))}
          </View>
        )
      )}
    </View>
  );
}
