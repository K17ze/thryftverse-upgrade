import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StatusBar, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteProp, useIsFocused, useNavigation, useRoute, useScrollToTop } from '@react-navigation/native';

import { useAppTheme } from '../theme/ThemeContext';
import { SyncRetryBanner } from '../components/SyncRetryBanner';
import { OfflineBanner } from '../components/OfflineBanner';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useBackendData } from '../context/BackendDataContext';
import { useSaveToCollectionPicker } from '../hooks/useSaveToCollectionPicker';
import { SaveToCollectionModal } from '../components/closet/SaveToCollectionModal';
import { useDynamicAlgorithmSignals } from '../hooks/useDynamicAlgorithmSignals';
import {
  useBrowseGridDensity,
  useBrowseSortMenu,
  useBrowseBackendListings,
  useBrowseListings,
  useBrowseFilterStatus,
  useBrowseSavedSearch,
  useBrowseRefresh } from '../hooks/browse';
import {
  BrowseHeader,
  BrowseFilterBar,
  BrowseSignalRail,
  BrowseSortMenu,
  BrowseActiveFilterBadges,
  BrowseResults,
  createBrowseStyles } from '../components/browse';

const GRID_SPACING = 16;

type BrowseRoute = RouteProp<RootStackParamList, 'Browse'>;

export default function BrowseScreen() {
  const { colors, isDark } = useAppTheme();
  const { width: windowWidth } = useWindowDimensions();
  const itemWidth = (windowWidth - 40 - GRID_SPACING) / 2;
  const {
    signals: browseSignals,
    activeSignal: activeBrowseSignal,
    selectSignal: selectBrowseSignal,
  } = useDynamicAlgorithmSignals({ surface: 'browse' });

  const styles = useMemo(() => createBrowseStyles(colors, itemWidth), [colors, itemWidth]);

  const navigation = useNavigation<any>();
  const route = useRoute<BrowseRoute>();
  const { title, categoryId, subcategoryId, searchQuery } = route.params || { title: 'Browse All', categoryId: 'search' };
  const browseFilters = useStore((state) => state.browseFilters);
  const updateBrowseFilters = useStore((state) => state.updateBrowseFilters);
  const isSavedProduct = useStore((state) => state.isSavedProduct);
  // Two-tier save: tap = quick-save, long-press = file to a collection.
  // The hook also owns the one-shot "Add to a list" teaching toast.
  const { savePickerItemId, handleQuickSave, handleSaveLongPress, closeSavePicker } = useSaveToCollectionPicker();
  const { listings, isSyncing, lastError, refreshListings, hasMore, isLoadingMore, loadMoreListings } = useBackendData();

  // Grid density preference (AsyncStorage-backed)
  const { gridDensity, handleGridDensityChange } = useBrowseGridDensity();

  // Context-scoped filters: this surface owns the `browse:<category>` bucket.
  // Activation runs on focus — back-navigation from a pushed screen (or a
  // stacked sibling BrowseScreen) re-asserts the correct bucket before the
  // backend fetch below observes it.
  const isFocused = useIsFocused();
  const browseContextKey = `browse:${categoryId}${subcategoryId ? `:${subcategoryId}` : ''}`;
  useEffect(() => {
    if (isFocused) useStore.getState().activateBrowseContext(browseContextKey);
  }, [isFocused, browseContextKey]);

  // Sort dropdown + persisted sort preference
  const { sortMenuOpen, setSortMenuOpen, handleSortSelect } = useBrowseSortMenu(categoryId, searchQuery, browseContextKey);
  // Measured bottom edge of the signal rail — anchors the sort-menu overlay.
  const [sortMenuTop, setSortMenuTop] = useState(0);

  // Pull-to-refresh: shared scroll offset, scroll-to-top ref, refresh timer
  const { refreshing, scrollY, scrollRef, refreshTimerRef, handleRefresh } = useBrowseRefresh();

  useScrollToTop(scrollRef);

  // Route query ↔ browseFilters sync + backend-filtered fetch (effect order
  // preserved: query-sync runs before the fetch effect, as before).
  const { backendListings, backendLoading, backendError, backendHasMore, backendLoadingMore, loadMoreBackendListings } = useBrowseBackendListings({
    categoryId,
    subcategoryId,
    title,
    searchQuery,
    contextKey: browseContextKey,
    refreshTimerRef });

  // Derived filter status + clear-all
  const { hasActiveFilters, hasAnyFiltering, handleClearFilters } = useBrowseFilterStatus();

  // Save-search pill state + action
  const { saveSearchLabel, isCurrentSaved, handleSaveSearch } = useBrowseSavedSearch({
    searchQuery,
    title,
    categoryId });

  // Client-side filter → sort → signal pipeline + display list selection
  const { dataToRender, displayListings, displayCount } = useBrowseListings({
    listings,
    backendListings,
    browseFilters,
    categoryId,
    subcategoryId,
    title,
    activeSignal: activeBrowseSignal });

  const showBrowseLoadingSkeleton = isSyncing && dataToRender.length === 0 && !lastError;

  // Pagination follows the active data path: when backend-filtered results
  // are displayed, pages advance the filtered cursor; otherwise the shared
  // listings cursor paginates the client-filtered base list.
  const gridOnCursorPath = backendListings !== null;
  const gridHasMore = gridOnCursorPath ? backendHasMore : hasMore;
  const gridIsLoadingMore = gridOnCursorPath ? backendLoadingMore : isLoadingMore;
  const handleEndReached = gridOnCursorPath
    ? loadMoreBackendListings
    : () => void loadMoreListings();

  return (
    <SafeAreaView testID="browse-screen" style={styles.container} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />

      <BrowseHeader
        styles={styles}
        title={title}
        displayCount={displayCount}
        backendLoading={backendLoading}
        gridDensity={gridDensity}
        onToggleGridDensity={handleGridDensityChange}
      />

      <BrowseFilterBar
        styles={styles}
        colors={colors}
        categoryId={categoryId}
        subcategoryId={subcategoryId}
        title={title}
        browseFilters={browseFilters}
        hasActiveFilters={hasActiveFilters}
        sortMenuOpen={sortMenuOpen}
        onToggleSortMenu={() => setSortMenuOpen((v) => !v)}
        saveSearchLabel={saveSearchLabel}
        isCurrentSaved={isCurrentSaved}
        onSaveSearch={handleSaveSearch}
        updateBrowseFilters={updateBrowseFilters}
      />

      {/* Dynamic Algorithmic Signal Rail for Current Browse Context —
          measured so the sort-menu overlay can anchor directly below it
          without reflowing the grid. */}
      <View onLayout={(e) => setSortMenuTop(e.nativeEvent.layout.y + e.nativeEvent.layout.height)}>
        <BrowseSignalRail
          styles={styles}
          signals={browseSignals}
          activeSignal={activeBrowseSignal}
          onSelectSignal={selectBrowseSignal}
        />
      </View>

      {sortMenuOpen ? (
        <View
          style={[styles.sortMenuOverlay, { top: sortMenuTop }]}
          pointerEvents="box-none"
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setSortMenuOpen(false)}
            accessibilityRole="button"
            accessibilityLabel="Dismiss sort menu"
          />
          <BrowseSortMenu
            styles={styles}
            colors={colors}
            categoryId={categoryId}
            searchQuery={searchQuery}
            activeSort={browseFilters.sort}
            onSelect={handleSortSelect}
          />
        </View>
      ) : null}

      {hasActiveFilters || browseFilters.query.trim().length > 0 ? (
        <BrowseActiveFilterBadges
          styles={styles}
          colors={colors}
          browseFilters={browseFilters}
          updateBrowseFilters={updateBrowseFilters}
          onClearAll={handleClearFilters}
        />
      ) : null}

      {lastError ? (
        <SyncRetryBanner
          message="Live browse sync is unavailable. Showing cached listings."
          onRetry={() => void refreshListings()}
          isRetrying={isSyncing}
          telemetryContext="browse_sync"
          containerStyle={styles.syncRetryBanner}
        />
      ) : null}

      <OfflineBanner onRetry={() => void refreshListings()} />

      <BrowseResults
        styles={styles}
        colors={colors}
        scrollY={scrollY}
        refreshing={refreshing}
        onRefresh={() => void handleRefresh()}
        backendLoading={backendLoading}
        showSkeleton={showBrowseLoadingSkeleton}
        backendError={backendError}
        lastError={lastError}
        displayListings={displayListings}
        hasAnyFiltering={hasAnyFiltering}
        categoryId={categoryId}
        gridDensity={gridDensity}
        onClearFilters={handleClearFilters}
        onRetryListings={() => void refreshListings()}
        onItemSaveToggle={handleQuickSave}
        onItemSaveLongPress={handleSaveLongPress}
        isItemSaved={isSavedProduct}
        onEndReached={handleEndReached}
        isLoadingMore={gridIsLoadingMore}
        hasMore={gridHasMore}
      />

      {/* ── Save-to-collection picker — long-press a tile bookmark ── */}
      <SaveToCollectionModal
        visible={savePickerItemId !== null}
        itemId={savePickerItemId ?? ''}
        onClose={closeSavePicker}
      />
    </SafeAreaView>
  );
}
