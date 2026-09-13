import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  StyleSheet,
  RefreshControl,
  StatusBar,
  ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { RootStackParamList } from '../navigation/types';
import { hasActiveFilters } from '../utils/auctionHomeLogic';
import { EmptyState } from '../components/EmptyState';
import { OfflineBanner } from '../components/OfflineBanner';
import { useConnectivity } from '../hooks/useConnectivity';
import { haptics } from '../utils/haptics';
import { Space } from '../theme/designTokens';
import {
  AuctionMarketHeader,
  AuctionAttentionStrip,
  AuctionSkeletons,
  AuctionSegmentRail,
  SegmentContentTransition,
  FilterSheet,
  type AuctionHeaderAction } from '../components/auction';
import {
  SearchOverlay,
  EmptyMarketState,
  ScopeComposition,
  FilterChipsBar,
  DiscoverySections } from '../components/auctionhome';
import {
  useAuctionHomeData,
  useAuctionSearch,
  useAuctionBrowse } from '../hooks/auction';
import {
  useAuctionHomeFilters,
  useAuctionHomeLayout,
  useAuctionHomeRefresh,
  useAuctionHomeViewModel,
  useAuctionValueLockup } from '../hooks/auctionhome';
import { type AuctionScope } from '../services/marketApi';

type NavT = NativeStackNavigationProp<RootStackParamList>;

// ── Main screen ──
export default function AuctionHomeScreen() {
  const navigation = useNavigation<NavT>();
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { isOffline } = useConnectivity();
  const { formatValueLockup, currencySymbol } = useAuctionValueLockup();
  const layout = useAuctionHomeLayout();

  // ── Canonical browse state + filter sheet lifecycle (extracted) ──
  const {
    browseState,
    setBrowseState,
    filterSheetVisible,
    setFilterSheetVisible,
    draftBrowse,
    setDraftBrowse,
    openFilterSheet,
    applyDraftFilters,
    resetDraftFilters,
    clearAllFilters,
    setScope,
    removeFilterChip } = useAuctionHomeFilters();

  // ── Pagination error (shared by search + browse) ──
  const [paginationError, setPaginationError] = useState<string | null>(null);

  // ── Home data, facets, server clock (extracted) ──
  const {
    homeData,
    loading,
    refreshing,
    setRefreshing,
    error,
    facets,
    facetsLoading,
    browseRefreshTick,
    setBrowseRefreshTick,
    fetchHome,
    secondClock,
    minuteClock } = useAuctionHomeData({ filterSheetVisible, draftBrowse });

  // ── Search (extracted) ──
  const {
    searchOverlayVisible,
    setSearchOverlayVisible,
    searchState,
    setSearchState,
    searchQuery,
    debouncedQuery,
    searchReqIdRef,
    recentSearches,
    clearRecentSearches,
    handleSearchChange,
    handleClearSearch,
    isLoadingMoreSearch,
    loadMoreSearch } = useAuctionSearch({ browseState, setPaginationError });

  // ── Browse results (extracted) ──
  const {
    browseResult,
    isLoadingMoreBrowse,
    loadMoreBrowse } = useAuctionBrowse({ browseState, browseRefreshTick, setPaginationError });

  const isBrowsing = hasActiveFilters(browseState);
  const isSearching = searchState.status !== 'idle';

  // ── Pull-to-refresh orchestration (extracted) ──
  const handleRefresh = useAuctionHomeRefresh({
    isSearching,
    isBrowsing,
    debouncedQuery,
    browseState,
    setRefreshing,
    setPaginationError,
    searchReqIdRef,
    setSearchState,
    setBrowseRefreshTick,
    fetchHome });

  const navigateToDetail = useCallback((auctionId: string) => {
    navigation.navigate('AuctionDetail', { auctionId });
  }, [navigation]);

  const handleBack = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate('MainTabs');
    }
  }, [navigation]);

  const handleActivity = useCallback(() => {
    navigation.navigate('MyBids');
  }, [navigation]);

  const handleCategoryPress = useCallback((categoryKey: string) => {
    haptics.tap();
    setBrowseState((prev) => ({ ...prev, categories: [categoryKey] }));
  }, [setBrowseState]);

  // ── Derived view-model: facets, chips, segments, attention, scope items, feed ──
  const {
    categoryOptions,
    categoryLabels,
    categoryCounts,
    filterResultCount,
    activeFilterChips,
    hasActiveMarket,
    hasAnyContent,
    scopeSegments,
    headerContext,
    compactHeaderContext,
    attentionProps,
    scopeItems,
    exploreFeedItems } = useAuctionHomeViewModel({
    homeData,
    facets,
    loading,
    browseState,
    draftBrowse,
    secondClock,
    minuteClock,
    currencySymbol,
    setBrowseState,
    onOpenAuction: navigateToDetail,
    onOpenActivity: handleActivity });

  // ── Header actions — reduced to title + search + filter only ──
  // Per P4-09 spec: first viewport allows title/search/filter, lifecycle
  // scope, attention if real, live content. Create, Seller Centre, and
  // Activity are accessible elsewhere (tab bar, attention strip) and
  // were crowding the header with 5 actions. The attention strip
  // already surfaces real attention needs — the badge icon was redundant.
  const headerActions: AuctionHeaderAction[] = useMemo(() => [
    { key: 'search', icon: 'search-outline', label: 'Search auctions', onPress: () => { haptics.tap(); setSearchOverlayVisible(true); }, priority: 'primary' },
    { key: 'filter', icon: 'options-outline', label: 'Filter auctions', onPress: () => { haptics.tap(); openFilterSheet(); }, priority: 'secondary' },
  ], [openFilterSheet]);

  const filterSheet = (
    <FilterSheet
      visible={filterSheetVisible}
      onDismiss={() => setFilterSheetVisible(false)}
      categoryOptions={categoryOptions}
      categoryLabels={categoryLabels}
      categoryCounts={categoryCounts}
      draftBrowse={draftBrowse}
      setDraftBrowse={setDraftBrowse}
      onReset={resetDraftFilters}
      onApply={applyDraftFilters}
      resultCount={filterResultCount}
      facetsLoading={facetsLoading}
    />
  );

  // ════════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════════

  // ── Search overlay (preserves scope) ──
  if (searchOverlayVisible) {
    return (
      <SearchOverlay
        scope={browseState.scope}
        query={searchQuery}
        onChangeQuery={handleSearchChange}
        onClose={() => { setSearchOverlayVisible(false); handleClearSearch(); }}
        onClearQuery={handleClearSearch}
        isSearching={isSearching}
        searchState={searchState}
        secondClock={secondClock}
        formatValueLockup={formatValueLockup}
        onPressItem={navigateToDetail}
        refreshing={refreshing}
        onRefresh={handleRefresh}
        onEndReached={loadMoreSearch}
        isLoadingMore={isLoadingMoreSearch}
        paginationError={paginationError}
        recentSearches={recentSearches}
        onClearRecentSearches={clearRecentSearches}
        onSelectCategory={handleSearchChange}
        categoryWorlds={homeData.categoryWorlds}
      />
    );
  }

  // ── Loading state ──
  if (loading && !homeData.attentionItem) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <AuctionMarketHeader
          title="Auctions"
          actions={headerActions}
        />
        <AuctionSkeletons />
      </View>
    );
  }

  // ── Error state ──
  if (error && !homeData.attentionItem) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <AuctionMarketHeader
          title="Auctions"
          actions={headerActions}
        />
        <EmptyState
          icon="cloud-offline-outline"
          title={isOffline ? 'You are offline' : 'Unable to load'}
          subtitle={isOffline ? 'Check your connection and try again.' : 'Pull to refresh'}
          ctaLabel="Retry"
          onCtaPress={() => void fetchHome()}
        />
      </SafeAreaView>
    );
  }

  // ── Empty market state ──
  if (!hasActiveMarket && !hasAnyContent) {
    return (
      <EmptyMarketState
        actions={headerActions}
        refreshing={refreshing}
        onRefresh={handleRefresh}
        onCreateAuction={() => navigation.navigate('CreateAuction')}
        recentlyClosed={homeData.recentlyClosed}
        onPressItem={navigateToDetail}
        formatValueLockup={formatValueLockup}
        filterSheet={filterSheet}
      />
    );
  }

  // ── Default: restructured Auction Home ──
  return (
    <View testID="auction-screen" style={styles.container}>
      <StatusBar barStyle={!isDark ? 'dark-content' : 'light-content'} />
      <AuctionMarketHeader
        title="Auctions"
        context={headerContext}
        compactContext={compactHeaderContext}
        actions={headerActions}
      />
      {/* Single scope rail: Live | Upcoming | Results | Watching */}
      <AuctionSegmentRail
        segments={scopeSegments}
        activeKey={browseState.scope}
        onSelect={(key) => setScope(key as AuctionScope)}
      />
      <ScrollView
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.brand}
            colors={[colors.brand]}
            progressBackgroundColor={colors.surfaceAlt}
          />
        }
      >
        {/* Personal attention strip */}
        {attentionProps && (
          <View style={styles.attentionZone}>
            <AuctionAttentionStrip {...attentionProps} />
          </View>
        )}

        {/* Active filter chips — individually removable, with result count */}
        <FilterChipsBar
          chips={activeFilterChips}
          resultCount={browseResult.status === 'ready' ? browseResult.items.length : undefined}
          onRemoveChip={removeFilterChip}
          onClearAll={clearAllFilters}
        />

        {/* Offline banner — cached auctions are still visible but cannot refresh */}
        {isOffline && hasAnyContent ? (
          <OfflineBanner onRetry={() => void handleRefresh()} />
        ) : null}

        {/* Selected scope composition */}
        <SegmentContentTransition segmentKey={browseState.scope}>
          <ScopeComposition
            isBrowsing={isBrowsing}
            browseResult={browseResult}
            scope={browseState.scope}
            scopeItems={scopeItems}
            secondClock={secondClock}
            formatValueLockup={formatValueLockup}
            onPressItem={navigateToDetail}
            layout={layout}
            refreshing={refreshing}
            onRefresh={handleRefresh}
            onEndReached={loadMoreBrowse}
            isLoadingMore={isLoadingMoreBrowse}
            paginationError={paginationError}
            onRetryBrowse={() => setBrowseRefreshTick((t) => t + 1)}
            onClearFilters={clearAllFilters}
          />
        </SegmentContentTransition>

        {/* Category rail + results ledger + explore feed (suppressed while browsing) */}
        <DiscoverySections
          categoryWorlds={homeData.categoryWorlds}
          categoryCardWidth={layout.categoryCardWidth}
          onCategoryPress={handleCategoryPress}
          recentlyClosed={homeData.recentlyClosed}
          exploreFeedItems={exploreFeedItems}
          secondClock={secondClock}
          gridCardWidth={layout.gridCardWidth}
          formatValueLockup={formatValueLockup}
          onPressItem={navigateToDetail}
          isBrowsing={isBrowsing}
          scope={browseState.scope}
        />
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
    contentContainer: {
      paddingBottom: Space.xxl + 24 },
    attentionZone: {
      paddingHorizontal: Space.md,
      marginTop: Space.sm,
      marginBottom: Space.xs } });
}
