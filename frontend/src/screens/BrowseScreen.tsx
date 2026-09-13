import React, { useMemo } from 'react';
import { StatusBar, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteProp, useNavigation, useRoute, useScrollToTop } from '@react-navigation/native';

import { useAppTheme } from '../theme/ThemeContext';
import { SyncRetryBanner } from '../components/SyncRetryBanner';
import { OfflineBanner } from '../components/OfflineBanner';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useBackendData } from '../context/BackendDataContext';
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
  const { listings, isSyncing, lastError, refreshListings } = useBackendData();

  // Grid density preference (AsyncStorage-backed)
  const { gridDensity, handleGridDensityChange } = useBrowseGridDensity();

  // Sort dropdown + persisted sort preference
  const { sortMenuOpen, setSortMenuOpen, handleSortSelect } = useBrowseSortMenu(categoryId, searchQuery);

  // Pull-to-refresh: shared scroll offset, scroll-to-top ref, refresh timer
  const { refreshing, scrollY, scrollRef, refreshTimerRef, handleRefresh } = useBrowseRefresh();

  useScrollToTop(scrollRef);

  // Route query ↔ browseFilters sync + backend-filtered fetch (effect order
  // preserved: query-sync runs before the fetch effect, as before).
  const { backendListings, backendLoading, backendError } = useBrowseBackendListings({
    categoryId,
    searchQuery,
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

      {/* Dynamic Algorithmic Signal Rail for Current Browse Context */}
      <BrowseSignalRail
        styles={styles}
        signals={browseSignals}
        activeSignal={activeBrowseSignal}
        onSelectSignal={selectBrowseSignal}
      />

      {sortMenuOpen ? (
        <BrowseSortMenu
          styles={styles}
          colors={colors}
          categoryId={categoryId}
          searchQuery={searchQuery}
          activeSort={browseFilters.sort}
          onSelect={handleSortSelect}
        />
      ) : null}

      {hasActiveFilters ? (
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
        gridDensity={gridDensity}
        onClearFilters={handleClearFilters}
        onRetryListings={() => void refreshListings()}
      />
    </SafeAreaView>
  );
}
