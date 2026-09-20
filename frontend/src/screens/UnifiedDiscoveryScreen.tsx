/**
 * UnifiedDiscoveryScreen — flagship discovery surface entered from the Home
 * search button.
 *
 * Combines into ONE personalised surface:
 *  - Search bar (transitions to text-search results on submit)
 *  - Category pills driven by the user's real intent signals
 *  - Hero editorial (from Galleria)
 *  - For You personalised listings masonry (useForYouFeed + discoveryFeedAssembly)
 *  - Curated collections rail (from Galleria)
 *  - Looks, moodboards, pulse integrated into the heterogeneous feed
 *
 * Design principles (AGENTS.md §4):
 *  - Media-as-color: real imagery is the primary visual anchor
 *  - Authored rhythm: heterogeneous modules interrupt the base grid
 *  - One masonry implementation (PinterestMasonryGrid / FlashList)
 *  - No decorative chrome, no card-on-card, no AI-slop
 *  - Full state coverage: loading, empty, error, offline, populated
 *
 * Orchestrator only — data/state lives in hooks/discovery/*, presentation in
 * components/discovery/*. Masonry geometry, aspect ratios and media sizing
 * are owned by PinterestMasonryGrid and are not touched here.
 */

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';

import { RootStackParamList } from '../navigation/types';
import { useAppTheme } from '../theme/ThemeContext';
import { useHaptic } from '../hooks/useHaptic';
import { useConnectivity } from '../hooks/useConnectivity';
import { useSaveToCollectionPicker } from '../hooks/useSaveToCollectionPicker';
import { useStore } from '../store/useStore';
import { SaveToCollectionModal } from '../components/closet/SaveToCollectionModal';
import {
  useDiscoveryCategories,
  useDiscoveryContent,
  useDiscoveryFeed,
  useDiscoverySearch } from '../hooks/discovery';
import { FlagshipScreen } from '../components/flagship';
import {
  DiscoveryFeedView,
  DiscoverySearchHeader,
  DiscoverySearchResultsView,
  createUnifiedDiscoveryStyles } from '../components/discovery';
import type { DiscoveryFeedUnit } from '../contracts/discoveryFeedUnit';
import type { DiscoveryListingSummary } from '../contracts/DiscoveryListingSummary';
import { openProductDetail } from '../platform/product/openProductDetail';
import { AppIcon } from '../components/common/AppIcon';
import { IconSize } from '../theme/iconTokens';
import { Control, FontFamily, Radius, Space } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { FeedExplanationSheet } from '../components/algorithm/FeedExplanationSheet';
import {
  markItemNotInterested,
  showFewerLikeThis,
  type FeedbackAttribution } from '../services/recommendationFeedbackApi';

type Props = NativeStackScreenProps<RootStackParamList, 'UnifiedDiscovery'>;

// Feed-control sheet — flat canvas, hairline-free rows, same idiom as the
// DiscoverScene feed-control sheet and the YourAlgorithm topic sheet.
const feedbackStyles = StyleSheet.create({
  sheetScrim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    paddingHorizontal: Space.md,
    paddingTop: Space.lg,
    paddingBottom: Space.xl },
  sheetTitle: {
    fontSize: TypographyV2.bodyStrong.size,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
    fontFamily: FontFamily.semibold,
    marginBottom: Space.sm },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    minHeight: Control.hit,
    borderRadius: Radius.md,
    paddingHorizontal: Space.sm },
  sheetRowText: {
    fontSize: TypographyV2.body.size,
    fontFamily: FontFamily.medium } });

export default function UnifiedDiscoveryScreen({ navigation, route }: Props) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const { isOffline } = useConnectivity();
  const styles = useMemo(() => createUnifiedDiscoveryStyles(colors), [colors]);
  const scrollRef = useRef<any>(null);

  // ── Two-tier save — tap = quick-save to Saved, long-press = file to a
  //  collection (same contract as SearchScreen/DiscoverScene). The hook
  //  also owns the one-shot "Add to a list" teaching toast. ──
  const isSavedProduct = useStore((state) => state.isSavedProduct);
  const { savePickerItemId, handleQuickSave, handleSaveLongPress, closeSavePicker } = useSaveToCollectionPicker();

  const content = useDiscoveryContent();
  const categories = useDiscoveryCategories();
  const search = useDiscoverySearch(route.params?.initialQuery);

  // ── Save-search: persist the live query + applied filters with match
  //  alerts enabled. Dedup mirrors addSavedSearch's normalized-query key. ──
  const savedSearches = useStore((s) => s.savedSearches);
  const addSavedSearch = useStore((s) => s.addSavedSearch);
  const isSearchSaved = savedSearches.some(
    (s) => s.query.trim().toLowerCase() === search.query.trim().toLowerCase(),
  );
  const handleSaveSearch = useCallback(() => {
    if (search.query.trim().length < 2 || isSearchSaved) return;
    haptic.light();
    // The discovery context is active while this screen is focused — its
    // bucket holds the filters the user applied via the Filter sheet.
    const filters = useStore.getState().browseFilters;
    addSavedSearch({
      query: search.query.trim(),
      filters: {
        brands: filters.brands,
        sizes: filters.sizes,
        condition: filters.condition,
        sort: filters.sort,
        minPrice: filters.priceMin ?? undefined,
        maxPrice: filters.priceMax ?? undefined },
      alertsEnabled: true });
  }, [search.query, isSearchSaved, addSavedSearch, haptic]);
  const feed = useDiscoveryFeed({
    activeCategory: categories.activeCategory,
    activeSignalChip: categories.activeSignalChip,
    looks: content.looks,
    posters: content.posters,
    moodboards: content.moodboards,
    isDiscoveryLoading: content.isDiscoveryLoading,
    discoveryError: content.discoveryError,
  });

  // ── Feed controls — long-press a listing tile for "Not interested" /
  //  "Show less like this" / "Why am I seeing this?". Same intent-profile
  //  contract as DiscoverScene: suppressions write to the backend intent
  //  epoch and locally hide immediately regardless of which feed source
  //  served the tile. ──
  const [feedbackItem, setFeedbackItem] = useState<DiscoveryListingSummary | null>(null);
  const [explanationItemId, setExplanationItemId] = useState<string | null>(null);
  const [hiddenListingIds, setHiddenListingIds] = useState<Set<string>>(new Set());

  const feedbackAttribution = useCallback(
    (listing: DiscoveryListingSummary): FeedbackAttribution => {
      const served = feed.forYouFeed.items.find((vm) => vm.listing.id === listing.id);
      return {
        surface: 'discover',
        // Only attach serve attribution when the item came from the
        // personalised serve — the backend 422s an interaction whose
        // requestId has no matching impression row for this listing.
        requestId: served ? feed.forYouFeed.requestId : undefined,
        position: served?.position,
        model: served?.model,
        policyVersion: served ? feed.forYouFeed.policyVersion : undefined,
      };
    },
    [feed.forYouFeed.items, feed.forYouFeed.requestId, feed.forYouFeed.policyVersion],
  );

  const hideListing = useCallback(
    (listingId: string) => {
      setHiddenListingIds((prev) => {
        if (prev.has(listingId)) return prev;
        const next = new Set(prev);
        next.add(listingId);
        return next;
      });
      feed.forYouFeed.dismissListing(listingId);
    },
    [feed.forYouFeed],
  );

  const handleListingLongPress = useCallback(
    (listing: DiscoveryListingSummary) => {
      haptic.selection();
      setFeedbackItem(listing);
    },
    [haptic],
  );

  const handleNotInterested = useCallback(() => {
    const target = feedbackItem;
    if (!target) return;
    haptic.medium();
    setFeedbackItem(null);
    hideListing(target.id);
    void markItemNotInterested(target, feedbackAttribution(target));
  }, [feedbackItem, haptic, hideListing, feedbackAttribution]);

  const handleShowLess = useCallback(() => {
    const target = feedbackItem;
    if (!target) return;
    haptic.light();
    setFeedbackItem(null);
    void showFewerLikeThis(target, feedbackAttribution(target)).then((result) => {
      // The mutation bumps the intent epoch; refetch so the down-ranking is
      // visible rather than only applying on the next cold load.
      if (result.persisted) void feed.forYouFeed.refresh();
    });
  }, [feedbackItem, haptic, feedbackAttribution, feed.forYouFeed]);

  const handleWhySeeing = useCallback(() => {
    const target = feedbackItem;
    if (!target) return;
    haptic.selection();
    setFeedbackItem(null);
    setExplanationItemId(target.id);
  }, [feedbackItem, haptic]);

  const handleExplanationChanged = useCallback(() => {
    void feed.forYouFeed.refresh();
  }, [feed.forYouFeed]);

  // Real serve attribution for the explanation sheet — reason codes and
  // component scores are the authoritative "why" for personalised serves.
  const explanationServedContext = useMemo(() => {
    if (!explanationItemId) return null;
    const vm = feed.forYouFeed.items.find((item) => item.listing.id === explanationItemId);
    if (!vm) return null;
    return {
      reasonCodes: vm.reasonCodes,
      componentScores: vm.componentScores,
      score: vm.score,
      itemTitle: vm.listing.title,
      itemThumbnail: vm.listing.images?.[0] ?? '',
    };
  }, [explanationItemId, feed.forYouFeed.items]);

  // ── Search results are already feed units (built in the effect) ──
  const searchFeedUnits = search.searchResults;
  const activeUnits = useMemo<DiscoveryFeedUnit[]>(() => {
    const units = search.isSearchingMode ? searchFeedUnits : feed.feedUnits;
    if (hiddenListingIds.size === 0) return units;
    return units.filter(
      (unit) => unit.type !== 'listing' || !hiddenListingIds.has(unit.listing.id),
    );
  }, [search.isSearchingMode, searchFeedUnits, feed.feedUnits, hiddenListingIds]);

  // ── Hero editorial (first one) ──
  const heroEditorial = content.editorials[0];

  // ── Handlers ──
  // Pull-to-refresh drives a real spinner: the RefreshControl stays active
  // until every feed source settles, so the gesture never lies about a
  // refresh that is still in flight.
  const [isRefreshing, setIsRefreshing] = useState(false);
  const handleRefresh = useCallback(() => {
    if (isRefreshing) return;
    haptic.selection();
    setIsRefreshing(true);
    void Promise.allSettled([
      Promise.resolve(content.loadDiscoveryContent()),
      Promise.resolve(feed.forYouFeed.refresh()),
      Promise.resolve(feed.refreshListings()),
    ]).finally(() => setIsRefreshing(false));
  }, [isRefreshing, haptic, content.loadDiscoveryContent, feed.forYouFeed, feed.refreshListings]);

  const handleListingPress = useCallback((item: DiscoveryListingSummary) => {
    // DiscoveryListingSummary carries id + sellerId — route via canonical resolver.
    openProductDetail(navigation, {
      referenceKind: 'listing',
      canonicalId: item.id,
      sourceSurface: 'UnifiedDiscovery',
    });
  }, [navigation]);

  const handleLookPress = useCallback((lookId: string) => {
    navigation.navigate('LookDetail', { lookId });
  }, [navigation]);

  const handlePosterPress = useCallback((storyId: string) => {
    navigation.navigate('PosterViewer', { storyId });
  }, [navigation]);

  const handleMoodboardPress = useCallback((moodboardId: string) => {
    navigation.navigate('MoodboardEditor', { moodboardId });
  }, [navigation]);

  const handleCollectionPress = useCallback((collectionId: string) => {
    navigation.navigate('GalleriaCollectionDetail', { collectionId });
  }, [navigation]);

  const handleUserPress = useCallback((userId: string) => {
    navigation.navigate('UserProfile', { userId });
  }, [navigation]);



  // ── Search bar header — back button + search bar + camera, all in the
  //  header so the search bar sits right below the status bar with no
  //  extra content padding pushing it down. ──
  const header = (
    <DiscoverySearchHeader
      query={search.query}
      onQueryChange={search.setQuery}
      onSearchFocusChange={search.setIsSearchFocused}
      onSubmitSearch={search.handleSubmitSearch}
      onBack={() => navigation.goBack()}
      onVisualSearch={() => navigation.navigate('VisualSearch')}
    />
  );

  return (
    <FlagshipScreen header={header} scrollEnabled={false} contentStyle={{ paddingTop: 0, paddingHorizontal: 0 }}>
      <View style={styles.container}>
        {/* Search mode: show scope tabs + results */}
        {search.isSearchingMode ? (
          <DiscoverySearchResultsView
            units={activeUnits}
            isSearching={search.isSearching}
            isSearchingPeople={search.isSearchingPeople}
            peopleResults={search.peopleResults}
            peopleError={search.peopleError}
            onRetryPeople={search.retryPeopleSearch}
            searchScope={search.searchScope}
            searchError={search.searchError}
            onRetry={search.retrySearch}
            onScopeChange={search.setSearchScope}
            activeFilterCount={search.activeSearchFilterCount}
            onOpenFilters={() => navigation.navigate('Filter', { categoryId: 'search', title: 'Search' })}
            onClearFilters={search.clearSearchFilters}
            usedFallback={search.searchUsedFallback}
            resultCount={search.searchResults.length}
            hasMore={search.searchHasMore}
            isLoadingMore={search.isSearchingMore}
            onEndReached={search.loadMoreSearch}
            onClearSearch={() => search.setQuery('')}
            onSaveSearch={handleSaveSearch}
            isSearchSaved={isSearchSaved}
            onListingPress={handleListingPress}
            onLookPress={handleLookPress}
            onPosterPress={handlePosterPress}
            onMoodboardPress={handleMoodboardPress}
            onUserPress={handleUserPress}
            onItemSaveToggle={handleQuickSave}
            onItemSaveLongPress={handleSaveLongPress}
            isItemSaved={isSavedProduct}
          />
        ) : (
          /* Discovery mode: unified personalised feed */
          <DiscoveryFeedView
            units={activeUnits}
            isLoading={feed.showLoadingSkeleton}
            showError={feed.showError}
            showEmpty={feed.showEmpty}
            showFilteredEmpty={feed.showFilteredEmpty}
            isOffline={isOffline}
            activeCategory={categories.activeCategory}
            onCategoryChange={categories.handleCategoryChange}
            categoryPills={categories.categoryPills}
            heroEditorial={heroEditorial}
            collections={content.collections}
            onListingPress={handleListingPress}
            onLookPress={handleLookPress}
            onPosterPress={handlePosterPress}
            onMoodboardPress={handleMoodboardPress}
            onCollectionPress={handleCollectionPress}
            onRefresh={handleRefresh}
            staleModules={content.staleModules}
            isRefreshing={isRefreshing}
            hasMore={feed.feedHasMore}
            isLoadingMore={feed.feedIsLoadingMore}
            onEndReached={feed.loadMore}
            scrollRef={scrollRef}
            onItemSaveToggle={handleQuickSave}
            onItemSaveLongPress={handleSaveLongPress}
            onListingLongPress={handleListingLongPress}
            isItemSaved={isSavedProduct}
          />
        )}
      </View>

      {/* ── Feed control sheet — long-press a listing tile. Three honest
          actions: suppress the item, down-rank the topic, or inspect why it
          was served. ── */}
      <Modal
        visible={feedbackItem !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setFeedbackItem(null)}
      >
        <Pressable
          style={feedbackStyles.sheetScrim}
          onPress={() => setFeedbackItem(null)}
          accessibilityRole="button"
          accessibilityLabel="Dismiss feed controls"
        >
          <View
            style={[feedbackStyles.sheet, { backgroundColor: colors.surface }]}
            onStartShouldSetResponder={() => true}
          >
            {feedbackItem && (
              <>
                <Text style={[feedbackStyles.sheetTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                  {feedbackItem.title}
                </Text>

                <Pressable
                  style={feedbackStyles.sheetRow}
                  onPress={handleNotInterested}
                  accessibilityRole="button"
                  accessibilityLabel={`Not interested in ${feedbackItem.title}`}
                  accessibilityHint="Hides this item and stops recommending it"
                >
                  <AppIcon name="eye-off-outline" size={IconSize.md} color="textPrimary" accessible={false} />
                  <Text style={[feedbackStyles.sheetRowText, { color: colors.textPrimary }]}>
                    Not interested
                  </Text>
                </Pressable>

                <Pressable
                  style={feedbackStyles.sheetRow}
                  onPress={handleShowLess}
                  accessibilityRole="button"
                  accessibilityLabel={`Show less like ${feedbackItem.title}`}
                  accessibilityHint="Lowers similar items in your feed without hiding them"
                >
                  <AppIcon name="remove-circle-outline" size={IconSize.md} color="textPrimary" accessible={false} />
                  <Text style={[feedbackStyles.sheetRowText, { color: colors.textPrimary }]}>
                    Show less like this
                  </Text>
                </Pressable>

                <Pressable
                  style={feedbackStyles.sheetRow}
                  onPress={handleWhySeeing}
                  accessibilityRole="button"
                  accessibilityLabel={`Why am I seeing ${feedbackItem.title}`}
                  accessibilityHint="Shows the signals that placed this item in your feed"
                >
                  <AppIcon name="information-circle-outline" size={IconSize.md} color="textMuted" accessible={false} />
                  <Text style={[feedbackStyles.sheetRowText, { color: colors.textSecondary }]}>
                    Why am I seeing this?
                  </Text>
                </Pressable>
              </>
            )}
          </View>
        </Pressable>
      </Modal>

      {/* ── "Why am I seeing this?" explanation sheet — reasons carry real
          topic controls wired to the intent profile. ── */}
      <FeedExplanationSheet
        visible={explanationItemId !== null}
        itemId={explanationItemId}
        servedContext={explanationServedContext}
        onDismiss={() => setExplanationItemId(null)}
        onSeeMoreLikeThis={handleExplanationChanged}
        onShowLessLikeThis={handleExplanationChanged}
        onTopicRemoved={handleExplanationChanged}
      />
      <SaveToCollectionModal
        visible={savePickerItemId != null}
        itemId={savePickerItemId ?? ''}
        onClose={closeSavePicker}
      />
    </FlagshipScreen>
  );
}
