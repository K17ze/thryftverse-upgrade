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

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { TypographyV2, MAX_FONT_SCALE } from '../theme/typography.v2';
import { FeedExplanationSheet } from '../components/algorithm/FeedExplanationSheet';
import {
  markItemNotInterested,
  showFewerLikeThis,
  undoItemNotInterested,
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

// Feed-control notice — a single bottom-anchored strip (hairline top edge,
// meta-size copy, text actions). Same grammar as the page-failure strip in
// DiscoverySearchResultsView; no new chrome (S20-05).
const noticeStyles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm + 2,
    borderTopWidth: StyleSheet.hairlineWidth },
  text: {
    flex: 1,
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.regular },
  action: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.semibold } });

/**
 * Feedback notice states (S20-05):
 *  - 'queued': the hide is applied locally; the durable write fires when the
 *    undo window lapses — Undo in this window is a true reversal because
 *    nothing has been persisted yet.
 *  - 'saving': the write is in flight; Undo still works — a compensating
 *    `usual` mutation lifts the exclusion if the write lands.
 *  - 'saved': persisted — no fake undo (the logged interaction can't be
 *    retracted), the notice is a brief confirmation.
 *  - 'session': guest — nothing can persist; the hide is session-local and
 *    the copy says so.
 *  - 'failed': the write didn't persist — retry re-issues the same writes.
 */
type FeedbackNotice = {
  listing: DiscoveryListingSummary;
  attribution: FeedbackAttribution;
  action: 'not_interested' | 'show_fewer';
  status: 'queued' | 'saving' | 'saved' | 'session' | 'failed';
};

// Grace window during which "Undo" cancels the pending durable write.
const UNDO_WINDOW_MS = 4000;
// Dwell for confirmation states; a failed notice stays longer so the retry
// remains reachable.
const NOTICE_DISMISS_MS = 3200;
const NOTICE_FAILED_DISMISS_MS = 8000;

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

  // ── Feedback persistence notice (S20-05) ──
  // The hide applies locally at once; the durable write fires after the undo
  // window so Undo is a genuine reversal. The notice states are honest:
  // queued → saving → saved / session (guest) / failed (retryable).
  const [feedbackNotice, setFeedbackNotice] = useState<FeedbackNotice | null>(null);
  // Queued hides awaiting the end of their undo window, keyed by listing id.
  // The notice rides along so an unmount flush (or a superseded visible
  // notice) can still persist an explicit user choice.
  const pendingHidesRef = useRef(
    new Map<string, { notice: FeedbackNotice; timer: ReturnType<typeof setTimeout> }>(),
  );
  // Listings whose hide was undone while a write was in flight — when that
  // write lands, a compensating `usual` mutation lifts the exclusion.
  const undoneHideIdsRef = useRef(new Set<string>());
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const clearNoticeTimer = useCallback(() => {
    if (noticeTimerRef.current) {
      clearTimeout(noticeTimerRef.current);
      noticeTimerRef.current = null;
    }
  }, []);

  // Auto-dismiss transient notices; 'failed' lingers longer so the retry
  // stays reachable, then clears rather than staling forever.
  const scheduleNoticeDismiss = useCallback((listingId: string, delayMs: number) => {
    clearNoticeTimer();
    noticeTimerRef.current = setTimeout(() => {
      noticeTimerRef.current = null;
      setFeedbackNotice((prev) =>
        prev && prev.listing.id === listingId ? null : prev);
    }, delayMs);
  }, [clearNoticeTimer]);

  // Apply a settled write result to the notice for this listing — a stale
  // resolution can never overwrite a newer notice.
  const settleFeedbackNotice = useCallback(
    (notice: FeedbackNotice, persisted: boolean, failure?: 'anonymous' | 'unavailable') => {
      if (!mountedRef.current) return;
      if (persisted) {
        setFeedbackNotice((prev) =>
          prev && prev.listing.id === notice.listing.id && prev.action === notice.action
            ? { ...prev, status: 'saved' }
            : prev);
        scheduleNoticeDismiss(notice.listing.id, NOTICE_DISMISS_MS);
        return;
      }
      const status = failure === 'anonymous' ? 'session' : 'failed';
      setFeedbackNotice((prev) =>
        prev && prev.listing.id === notice.listing.id && prev.action === notice.action
          ? { ...prev, status }
          : prev);
      scheduleNoticeDismiss(
        notice.listing.id,
        status === 'failed' ? NOTICE_FAILED_DISMISS_MS : NOTICE_DISMISS_MS,
      );
    },
    [scheduleNoticeDismiss],
  );

  const persistNotInterested = useCallback(
    (notice: FeedbackNotice) => {
      const listingId = notice.listing.id;
      setFeedbackNotice((prev) =>
        prev && prev.listing.id === listingId && prev.status === 'queued'
          ? { ...prev, status: 'saving' }
          : prev);
      void markItemNotInterested(notice.listing, notice.attribution).then((result) => {
        if (undoneHideIdsRef.current.has(listingId)) {
          // Undo raced the in-flight write — lift the exclusion if it landed.
          if (result.persisted) void undoItemNotInterested(notice.listing);
          return;
        }
        settleFeedbackNotice(notice, result.persisted, result.failure);
      });
    },
    [settleFeedbackNotice],
  );

  const unhideListing = useCallback((listingId: string) => {
    setHiddenListingIds((prev) => {
      if (!prev.has(listingId)) return prev;
      const next = new Set(prev);
      next.delete(listingId);
      return next;
    });
  }, []);

  const handleUndoHide = useCallback(() => {
    const notice = feedbackNotice;
    if (!notice || notice.action !== 'not_interested') return;
    haptic.light();
    const listingId = notice.listing.id;
    const pending = pendingHidesRef.current.get(listingId);
    if (pending) {
      // Still inside the undo window — the write never fires, so nothing
      // was persisted and the reversal is exact.
      clearTimeout(pending.timer);
      pendingHidesRef.current.delete(listingId);
    }
    undoneHideIdsRef.current.add(listingId);
    unhideListing(listingId);
    clearNoticeTimer();
    setFeedbackNotice(null);
    // The dismissed tile was filtered from the served page — refetch so it
    // returns now rather than on the next cold load.
    void feed.forYouFeed.refresh();
  }, [feedbackNotice, haptic, unhideListing, clearNoticeTimer, feed.forYouFeed]);

  const handleRetryNotice = useCallback(() => {
    const notice = feedbackNotice;
    if (!notice || notice.status !== 'failed') return;
    haptic.light();
    const retrying: FeedbackNotice = { ...notice, status: 'saving' };
    setFeedbackNotice(retrying);
    clearNoticeTimer();
    const write = notice.action === 'not_interested'
      ? markItemNotInterested(notice.listing, notice.attribution)
      : showFewerLikeThis(notice.listing, notice.attribution);
    void write.then((result) => {
      if (notice.action === 'not_interested' && undoneHideIdsRef.current.has(notice.listing.id)) {
        if (result.persisted) void undoItemNotInterested(notice.listing);
        return;
      }
      if (result.persisted && notice.action === 'show_fewer') {
        void feed.forYouFeed.refresh();
      }
      settleFeedbackNotice(notice, result.persisted, result.failure);
    });
  }, [feedbackNotice, haptic, clearNoticeTimer, settleFeedbackNotice, feed.forYouFeed]);

  // Flush queued hides on unmount — an explicit user choice should still
  // reach the backend when the surface closes inside the undo window.
  useEffect(() => {
    mountedRef.current = true;
    const pendingHides = pendingHidesRef.current;
    const undoneIds = undoneHideIdsRef.current;
    return () => {
      mountedRef.current = false;
      clearNoticeTimer();
      for (const [listingId, pending] of pendingHides) {
        clearTimeout(pending.timer);
        if (!undoneIds.has(listingId)) {
          void markItemNotInterested(pending.notice.listing, pending.notice.attribution);
        }
      }
      pendingHides.clear();
    };
  }, [clearNoticeTimer]);

  const handleNotInterested = useCallback(() => {
    const target = feedbackItem;
    if (!target) return;
    haptic.medium();
    setFeedbackItem(null);
    hideListing(target.id);
    undoneHideIdsRef.current.delete(target.id);
    clearNoticeTimer();
    const notice: FeedbackNotice = {
      listing: target,
      attribution: feedbackAttribution(target),
      action: 'not_interested',
      status: 'queued' };
    pendingHidesRef.current.set(target.id, {
      notice,
      timer: setTimeout(() => {
        pendingHidesRef.current.delete(target.id);
        persistNotInterested(notice);
      }, UNDO_WINDOW_MS) });
    setFeedbackNotice(notice);
  }, [feedbackItem, haptic, hideListing, feedbackAttribution, persistNotInterested, clearNoticeTimer]);

  const handleShowLess = useCallback(() => {
    const target = feedbackItem;
    if (!target) return;
    haptic.light();
    setFeedbackItem(null);
    const notice: FeedbackNotice = {
      listing: target,
      attribution: feedbackAttribution(target),
      action: 'show_fewer',
      status: 'saving' };
    void showFewerLikeThis(target, notice.attribution).then((result) => {
      if (result.persisted) {
        // The mutation bumps the intent epoch; refetch so the down-ranking
        // is visible rather than only applying on the next cold load.
        void feed.forYouFeed.refresh();
        return;
      }
      // A failed preference write must not be silent — surface a retry.
      clearNoticeTimer();
      setFeedbackNotice({ ...notice, status: result.failure === 'anonymous' ? 'session' : 'failed' });
      scheduleNoticeDismiss(
        target.id,
        result.failure === 'anonymous' ? NOTICE_DISMISS_MS : NOTICE_FAILED_DISMISS_MS,
      );
    });
  }, [feedbackItem, haptic, feedbackAttribution, feed.forYouFeed, clearNoticeTimer, scheduleNoticeDismiss]);

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
    // S20-05: "Not interested" is a recommendation preference — it filters
    // the personalised feed only. An explicit text search is direct user
    // intent and must still surface a hidden item if it matches.
    if (search.isSearchingMode) return searchFeedUnits;
    if (hiddenListingIds.size === 0) return feed.feedUnits;
    return feed.feedUnits.filter(
      (unit) => unit.type !== 'listing' || !hiddenListingIds.has(unit.listing.id),
    );
  }, [search.isSearchingMode, searchFeedUnits, feed.feedUnits, hiddenListingIds]);

  // ── Hero editorial → the Galleria surface that owns it (FRESH-08). The
  //  GalleriaEditorial model carries no per-item deep link, so the honest
  //  destination is the editorial's home surface, where the same piece is
  //  presented in full. ──
  const handleEditorialPress = useCallback(() => {
    haptic.selection();
    navigation.navigate('Galleria');
  }, [haptic, navigation]);

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
            pageError={search.searchPageError}
            onRetryPage={search.retrySearchPage}
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
            listingsError={feed.lastError}
            onEditorialPress={handleEditorialPress}
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

        {/* Feed-control notice — honest persistence state for "Not
            interested" / "Show less": queued (undoable), saved, session-only
            (guest), or failed with retry. One quiet strip, no modal. */}
        {feedbackNotice && (
          <View
            style={[noticeStyles.bar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}
            accessibilityLiveRegion="polite"
          >
            <Text
              style={[noticeStyles.text, { color: colors.textSecondary }]}
              numberOfLines={1}
              maxFontSizeMultiplier={MAX_FONT_SCALE.utility}
            >
              {feedbackNotice.action === 'not_interested'
                ? feedbackNotice.status === 'saved'
                  ? "Hidden — won't be recommended again"
                  : feedbackNotice.status === 'session'
                    ? 'Hidden for this session'
                    : feedbackNotice.status === 'failed'
                      ? "Couldn't save this preference"
                      : 'Hidden from your feed'
                : feedbackNotice.status === 'session'
                  ? 'Sign in to keep feed preferences'
                  : "Couldn't save this preference"}
            </Text>
            {feedbackNotice.status === 'failed' && (
              <Pressable
                onPress={handleRetryNotice}
                accessibilityRole="button"
                accessibilityLabel="Retry saving preference"
                hitSlop={8}
                style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
              >
                <Text style={[noticeStyles.action, { color: colors.brand }]} maxFontSizeMultiplier={MAX_FONT_SCALE.utility}>
                  Retry
                </Text>
              </Pressable>
            )}
            {feedbackNotice.action === 'not_interested' &&
              (feedbackNotice.status === 'queued' ||
                feedbackNotice.status === 'saving' ||
                feedbackNotice.status === 'failed') && (
              <Pressable
                onPress={handleUndoHide}
                accessibilityRole="button"
                accessibilityLabel={`Undo hiding ${feedbackNotice.listing.title}`}
                hitSlop={8}
                style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
              >
                <Text style={[noticeStyles.action, { color: colors.textPrimary }]} maxFontSizeMultiplier={MAX_FONT_SCALE.utility}>
                  Undo
                </Text>
              </Pressable>
            )}
          </View>
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
                  accessibilityHint="Hides this item from your recommendations and tries to save the preference; you can undo or retry"
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
