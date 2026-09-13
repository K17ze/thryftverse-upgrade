import React, { useMemo, useRef } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';

import { useAppTheme } from '../../theme/ThemeContext';
import { FlagshipState } from '../flagship';
import { AppIcon } from '../common/AppIcon';
import { IconSize } from '../../theme/iconTokens';
import { PinterestMasonryGrid } from '../discover/PinterestMasonryGrid';
import { DiscoveryPeopleResultRow } from './DiscoveryPeopleResultRow';
import { createUnifiedDiscoveryStyles } from './unifiedDiscoveryStyles';
import type { DiscoveryFeedUnit } from '../../contracts/discoveryFeedUnit';
import type { DiscoveryListingSummary } from '../../contracts/DiscoveryListingSummary';
import type { UserSearchResult } from '../../services/profileApi';

// ============================================================================
// SEARCH RESULTS VIEW
// ============================================================================

export function DiscoverySearchResultsView({
  units,
  isSearching,
  isSearchingPeople,
  peopleResults,
  searchScope,
  searchError,
  onRetry,
  onScopeChange,
  activeFilterCount,
  onOpenFilters,
  onClearFilters,
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
  searchScope: 'items' | 'people';
  searchError: string | null;
  onRetry: () => void;
  onScopeChange: (s: 'items' | 'people') => void;
  activeFilterCount: number;
  onOpenFilters: () => void;
  onClearFilters: () => void;
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
  const scrollRef = useRef<any>(null);

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
          <Text style={[styles.scopeTabText, searchScope === 'items' && styles.scopeTabTextActive]} maxFontSizeMultiplier={2}>
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
          <Text style={[styles.scopeTabText, searchScope === 'people' && styles.scopeTabTextActive]} maxFontSizeMultiplier={2}>
            People
          </Text>
          {searchScope === 'people' && <View style={styles.scopeIndicator} />}
        </Pressable>

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
          <View style={styles.searchingWrap}>
            <ActivityIndicator size="large" color={colors.brand} />
          </View>
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
            numColumns={2}
            scrollRef={scrollRef}
            showSaveButton
            onItemSaveToggle={onItemSaveToggle}
            onItemSaveLongPress={onItemSaveLongPress}
            isItemSaved={isItemSaved}
          />
        )
      ) : (
        isSearchingPeople && peopleResults.length === 0 ? (
          <View style={styles.searchingWrap}>
            <ActivityIndicator size="large" color={colors.brand} />
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
