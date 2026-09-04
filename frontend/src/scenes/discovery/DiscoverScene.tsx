import React, { useRef, useMemo, useCallback, useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  RefreshControl,
  NativeSyntheticEvent,
  NativeScrollEvent,
  ScrollView,
  Pressable,
  Text } from 'react-native';
import {
  useSharedValue } from 'react-native-reanimated';
import { useNavigation, useScrollToTop } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { useTaxonomy } from '../../context/TaxonomyContext';
import { Space, Radius, FontFamily } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { RefreshIndicator } from '../../components/RefreshIndicator';
import { EmptyState } from '../../components/EmptyState';
import { OfflineBanner } from '../../components/OfflineBanner';
import { PinterestMasonryGrid } from '../../components/discover/PinterestMasonryGrid';
import { useConnectivity } from '../../hooks/useConnectivity';
import { useForYouFeed } from '../../hooks/useForYouFeed';
import { assembleDiscoveryFeed } from '../../utils/discoveryFeedAssembly';
import type { Listing } from '../../domain';
import type { DiscoveryListingSummary } from '../../contracts/DiscoveryListingSummary';
import { fetchLooksFromApi, type LookApiItem } from '../../services/looksApi';
import { fetchPosterStories, type PosterStory } from '../../services/postersApi';
import { fetchPublicMoodboards, type Moodboard } from '../../services/moodboardApi';
import type { RootStackParamList } from '../../navigation/types';
import { useReadiness } from '../../performance/visuallyComplete';
import { useDynamicAlgorithmSignals } from '../../hooks/useDynamicAlgorithmSignals';
import { matchesSignal } from '../../services/algorithmicSignalsService';
import { useA11yAudit } from '../../hooks/useA11yAudit';
import { useReducedMotion } from '../../hooks/useReducedMotion';

const DISCOVER_NUM_COLUMNS = 2;
type DiscoverNavigation = NativeStackNavigationProp<RootStackParamList>;

// ============================================================================
// CATEGORY BAR — horizontal scrollable pill bar (filters the feed)
// ============================================================================

interface DiscoverCategoryOption {
  id: string;
  name: string;
  isPersonalized?: boolean;
}

interface DiscoverCategoryBarProps {
  activeCategory: string;
  categories: DiscoverCategoryOption[];
  onSelect: (category: string) => void;
}

/**
 * DiscoverCategoryBar — a horizontal scrollable row of category pills that
 * scrolls with the feed (mounted as the FlashList's ListHeaderComponent, not
 * sticky-fixed). Active pill uses `surfaceAlt` with bold text; inactive pills
 * are transparent with muted text. A hairline bottom border separates the bar
 * from the masonry grid.
 *
 * Selecting a pill filters the feed client-side (see getFilterFn in
 * DiscoverScene). "All" is the default and shows every listing. The pills
 * are Pressables with accessibility labels and roles.
 */
function DiscoverCategoryBar({ activeCategory, categories, onSelect }: DiscoverCategoryBarProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createCategoryBarStyles(colors), [colors]);

  return (
    <View style={styles.bar}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        accessibilityRole="tablist"
        accessibilityLabel="Discovery categories"
      >
        {categories.map((category, idx) => {
          const isActive = category.id === activeCategory;
          return (
            <Pressable
              key={`cat-${idx}-${category.id}`}
              style={[
                styles.pill,
                isActive && styles.pillActive,
                category.isPersonalized && !isActive && styles.pillPersonalized,
              ]}
              onPress={() => onSelect(category.id)}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={`${category.name} category${category.isPersonalized ? ', personalized' : ''}`}
            >
              {category.isPersonalized && category.id !== 'All' ? (
                <View style={styles.pillDot} />
              ) : null}
              <Text style={[styles.pillText, isActive && styles.pillTextActive]}>
                {category.name}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function createCategoryBarStyles(colors: ThemeColors) {
  return StyleSheet.create({
    bar: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderSubtle },
    scrollContent: {
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
      gap: Space.xs,
      alignItems: 'center',
      // Ensure the touch target around the ScrollView row is at least 44pt
      // (Design.md: 44pt interaction band with 32–36pt visible chrome).
      minHeight: 44 },
    pill: {
      // 36pt visible chrome inside a 44pt interaction band (Design.md).
      // paddingVertical: Space.sm (8pt) + text line-height yields ~36pt.
      minHeight: 36,
      paddingVertical: Space.sm,
      paddingHorizontal: Space.smMd,
      borderRadius: Radius.md,
      backgroundColor: 'transparent',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5 },
    pillPersonalized: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderSubtle },
    pillActive: {
      backgroundColor: colors.surfaceAlt },
    pillDot: {
      width: 5,
      height: 5,
      borderRadius: 2.5,
      backgroundColor: colors.brand },
    pillText: {
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      fontFamily: FontFamily.regular,
      color: colors.textMuted,
      letterSpacing: TypographyV2.meta.letterSpacing },
    pillTextActive: {
      fontFamily: FontFamily.bold,
      color: colors.textPrimary } });
}

export interface DiscoverSceneProps {
  listings: Listing[];
  isSyncing: boolean;
  lastError: string | null;
  isLoadingMore: boolean;
  hasMore: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  onLoadMore: () => void;
  /** Fired when a listing tile is tapped. Receives the production
   *  DiscoveryListingSummary carried by the listing feed unit. */
  onPressItem: (listing: DiscoveryListingSummary) => void;
  onPressSeller?: (listing: DiscoveryListingSummary) => void;
  onMessageSeller?: (listing: DiscoveryListingSummary) => void;
  onBrowseCategories: () => void;
  /** Fired when the bookmark button on a listing tile is tapped. */
  onToggleSave?: (listing: DiscoveryListingSummary) => void;
  /** Returns whether a listing is currently saved. */
  isSavedListing?: (listingId: string) => boolean;
}

/**
 * DiscoverScene owns the Discover feed's scroll surface.
 *
 * The FlashList (inside PinterestMasonryGrid) owns scrolling — this scene
 * must NOT wrap it in a ScrollView (that would break virtualization and
 * contradict the grid's own invariant). Refresh, pagination, scroll-to-top
 * and the custom RefreshIndicator are all driven from the FlashList's scroll
 * via an animated handler + forwarded ref.
 *
 * The feed is a heterogeneous `DiscoveryFeedUnit[]` canvas (listings +
 * full-width context breaks + hero listings), assembled from the raw
 * `Listing[]` by `assembleDiscoveryFeed`. Listings are one feed-unit type
 * among several — not the only renderable unit.
 */
export function DiscoverScene({
  listings,
  isSyncing,
  lastError,
  isLoadingMore,
  hasMore,
  refreshing,
  onRefresh,
  onLoadMore,
  onPressItem,
  onBrowseCategories,
  onToggleSave,
  isSavedListing }: DiscoverSceneProps) {
  const { colors } = useAppTheme();
  const { isOffline } = useConnectivity();
  const { categories: taxonomyCategories } = useTaxonomy();
  const navigation = useNavigation<DiscoverNavigation>();
  const reducedMotion = useReducedMotion();
  const scrollY = useSharedValue(0);
  const staticScrollY = useSharedValue(0);
  const scrollRef = useRef<any>(null);
  const a11yRef = useRef<any>(null);
  useA11yAudit(a11yRef, 'DiscoverScene');
  const reportReady = useReadiness('Discover');

  // Active category for the pill bar. Drives client-side filtering of the
  // feed via getFilterFn. "All" is the default and shows every listing.
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [looks, setLooks] = useState<LookApiItem[]>([]);
  const [posters, setPosters] = useState<PosterStory[]>([]);
  const [moodboards, setMoodboards] = useState<Moodboard[]>([]);
  const [isSupplementalLoading, setIsSupplementalLoading] = useState(true);
  const [supplementalError, setSupplementalError] = useState(false);

  // Personalised For You feed — when the backend returns recommendations,
  // they take priority over the unfiltered /listings cursor so the Discover
  // tab reads as a personalised surface, not a flat catalogue. Falls back
  // to the parent-provided listings when the endpoint is unavailable or
  // returns nothing (cold-start, offline, guest).
  const forYouFeed = useForYouFeed();

  useScrollToTop(scrollRef);

  const loadSupplementalContent = useCallback(async () => {
    setIsSupplementalLoading(true);
    setSupplementalError(false);
    const [looksResult, postersResult, moodboardsResult] = await Promise.allSettled([
      fetchLooksFromApi({ status: 'published', sort: 'foryou', limit: 6 }),
      fetchPosterStories({ active: true, limit: 4 }),
      fetchPublicMoodboards(),
    ]);

    if (looksResult.status === 'fulfilled') {
      setLooks(looksResult.value.items ?? []);
    }
    if (postersResult.status === 'fulfilled') {
      setPosters(postersResult.value.items ?? []);
    }
    if (moodboardsResult.status === 'fulfilled') {
      // moodboardApi has an explicitly marked development fallback. Discovery
      // accepts backend rows only and never promotes demo boards as a
      // personalised recommendation.
      setMoodboards(moodboardsResult.value.filter((moodboard) => !moodboard.isDemo));
    }
    setSupplementalError(
      looksResult.status === 'rejected'
      && postersResult.status === 'rejected'
      && moodboardsResult.status === 'rejected',
    );
    setIsSupplementalLoading(false);
    reportReady('data-ready');
  }, [reportReady]);

  useEffect(() => {
    void loadSupplementalContent();
  }, [loadSupplementalContent]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.background },
        stateWrap: { flex: 1 } }),
    [colors],
  );

  // Category bar options dynamically driven by user algorithm topics & recommendation vectors.
  // "All" is always first; subsequent categories are prioritized according to user affinity.
  const { signals: algorithmSignals, selectSignal } = useDynamicAlgorithmSignals({ surface: 'discover' });

  const discoverCategories = useMemo<DiscoverCategoryOption[]>(() => {
    return algorithmSignals.map((signal) => ({
      id: signal.filterKey === 'all' ? 'All' : signal.id,
      name: signal.label,
      isPersonalized: signal.isPersonalized,
    }));
  }, [algorithmSignals]);

  const handleSelectCategory = useCallback(
    (categoryId: string) => {
      setActiveCategory(categoryId);
      const targetSignal = algorithmSignals.find(
        (s) => (categoryId === 'All' ? s.filterKey === 'all' : s.id === categoryId || s.filterKey === categoryId.toLowerCase())
      );
      if (targetSignal) {
        selectSignal(targetSignal);
      }
    },
    [algorithmSignals, selectSignal],
  );

  // Map each root/ancestor category ID to the set of all descendant IDs, so
  // the filter can match listings whose `category` is the selected root or
  // any node beneath it in the taxonomy parent chain.
  const descendantMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const cat of taxonomyCategories) {
      let parentId = cat.parentId;
      while (parentId) {
        if (!map.has(parentId)) map.set(parentId, new Set());
        map.get(parentId)!.add(cat.id);
        const parent = taxonomyCategories.find((c) => c.id === parentId);
        parentId = parent?.parentId ?? null;
      }
    }
    return map;
  }, [taxonomyCategories]);

  // Build a filter predicate from a category ID or algorithmic signal.
  const getFilterFn = useCallback(
    (categoryId: string): ((listing: Listing) => boolean) | null => {
      if (categoryId === 'All') return null;
      const targetSignal = algorithmSignals.find((s) => s.id === categoryId || s.filterKey === categoryId.toLowerCase());
      const descendants = descendantMap.get(categoryId);
      const descendantList = descendants ? [...descendants] : [];
      return (l: Listing) => {
        if (l.category === categoryId) return true;
        if (descendants && descendants.has(l.category)) return true;
        if (l.subcategory && descendantList.some((d) => l.subcategory!.includes(d))) return true;
        if (targetSignal && matchesSignal(l, targetSignal)) return true;
        return false;
      };
    },
    [descendantMap, algorithmSignals],
  );

  // Personalised listings: use the For You feed when it has results and the
  // user is on "All" (the personalised canvas). Category pills fall back to
  // the full backend cursor because For You recommendations don't carry
  // category metadata for client-side filtering.
  const personalisedListings = useMemo(() => {
    if (activeCategory !== 'All') return listings;
    if (forYouFeed.listings.length > 0) return forYouFeed.listings;
    return listings;
  }, [listings, activeCategory, forYouFeed.listings]);

  // Filter listings by the active category pill. "All" passes everything
  // through; any other pill applies the predicate built from the taxonomy
  // via getFilterFn. The filtered set is then assembled into heterogeneous
  // feed units so the grid stays a pure function of DiscoveryFeedUnit[].
  const filteredListings = useMemo(() => {
    if (activeCategory === 'All') return personalisedListings;
    const filterFn = getFilterFn(activeCategory);
    return filterFn ? personalisedListings.filter(filterFn) : personalisedListings;
  }, [personalisedListings, activeCategory, getFilterFn]);

  // Assemble the heterogeneous feed units from the filtered listings. This is the
  // single place where Discover's feed rhythm + span decisions are made, so
  // the grid stays a pure function of DiscoveryFeedUnit[]. Supplemental
  // chapters are present only on the unfiltered canvas; category tabs remain
  // literal listing filters instead of pretending creator media has category
  // metadata the backend does not provide.
  const units = useMemo(
    () => assembleDiscoveryFeed(
      filteredListings,
      DISCOVER_NUM_COLUMNS,
      activeCategory === 'All' ? { looks, posters, moodboards } : {},
    ),
    [activeCategory, filteredListings, looks, moodboards, posters],
  );

  useEffect(() => {
    if (units.length > 0 && !isSupplementalLoading) {
      reportReady('interaction-ready');
    }
  }, [units.length, isSupplementalLoading, reportReady]);

  // Plain JS scroll handler drives the RefreshIndicator's shared scrollY
  // value from the FlashList's own scrolling — no enclosing ScrollView.
  //
  // Reanimated 4.x known issue: `useAnimatedScrollHandler` does NOT fire
  // scroll events from FlashList (the 3.12 fix was never backported to 4.x).
  // The proven workaround is a plain JS onScroll that sets the SharedValue's
  // `.value` directly. `RefreshIndicator` reads `scrollY.value` inside a
  // `useAnimatedStyle` worklet, which still runs on the UI thread — only the
  // event capture is JS-thread, which is the standard RN scroll path anyway.
  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      scrollY.value = e.nativeEvent.contentOffset.y;
    },
    [scrollY],
  );

  const handleRefresh = useCallback(() => {
    onRefresh();
    void loadSupplementalContent();
    void forYouFeed.refresh();
  }, [loadSupplementalContent, onRefresh, forYouFeed]);

  const refreshControl = useMemo(
    () => (
      <RefreshControl
        refreshing={refreshing}
        onRefresh={handleRefresh}
        tintColor="transparent"
        colors={['transparent']}
        progressBackgroundColor="transparent"
      />
    ),
    [handleRefresh, refreshing],
  );

  // ── Stable navigation callbacks ──
  // These are passed to PinterestMasonryGrid which includes them in its
  // renderItem useCallback deps. Inline arrows would create new identities
  // every render, invalidating the memoized renderItem and destabilizing
  // FlashList cell recycling.
  const handleLookPress = useCallback(
    (lookId: string) => navigation.navigate('MainTabs', {
      screen: 'Home',
      params: { screen: 'LookDetail', params: { lookId } } }),
    [navigation],
  );
  const handlePosterPress = useCallback(
    (storyId: string) => navigation.navigate('PosterViewer', { storyId }),
    [navigation],
  );
  const handleMoodboardPress = useCallback(
    (moodboardId: string) => navigation.navigate('MoodboardEditor', { moodboardId }),
    [navigation],
  );

  const hasSupplementalContent = looks.length > 0 || posters.length > 0 || moodboards.length > 0;
  const hasAnyListings = listings.length > 0 || forYouFeed.listings.length > 0;

  const showLoadingSkeleton =
    !hasAnyListings
    && !hasSupplementalContent
    && ((isSyncing && !lastError) || isSupplementalLoading || forYouFeed.isLoading);
  const showError =
    (Boolean(lastError) || supplementalError)
    && !hasAnyListings
    && !hasSupplementalContent
    && !isSyncing
    && !isSupplementalLoading
    && !forYouFeed.isLoading;
  const showEmpty =
    !hasAnyListings
    && !hasSupplementalContent
    && !isSyncing
    && !lastError
    && !supplementalError
    && !isSupplementalLoading
    && !forYouFeed.isLoading;
  // The active category filter excluded every listing. Distinct from showEmpty
  // (no data at all) — here we have data, just none matching the selected pill.
  const showFilteredEmpty =
    listings.length > 0 && filteredListings.length === 0 && !isSyncing;

  // Category pill bar — scrolls with the feed (ListHeaderComponent, not
  // sticky-fixed). Keep this memo above every state return so hook ordering
  // remains stable as loading/error/empty states change.
  // The OfflineBanner sits below the category bar and above the masonry grid;
  // it renders null when online so the header is unchanged in the happy path.
  const categoryBar = useMemo(
    () => (
      <>
        <DiscoverCategoryBar
          activeCategory={activeCategory}
          categories={discoverCategories}
          onSelect={handleSelectCategory}
        />
        {isOffline && <OfflineBanner />}
      </>
    ),
    [activeCategory, discoverCategories, isOffline],
  );

  // Error and empty states are authored here (with recovery CTAs) and render
  // as non-scrollable surfaces. The loading skeleton + populated feed are
  // owned by the grid (FlashList owns scrolling for those).
  if (showError) {
    return (
      <View style={[styles.container, styles.stateWrap]}>
        <EmptyState
          density="compact"
          icon="cloud-offline-outline"
          iconColor={colors.danger}
          title="Explore unavailable"
          subtitle="We couldn't load discovery right now. Check your connection and try again."
          ctaLabel="Retry"
          onCtaPress={handleRefresh}
        />
      </View>
    );
  }

  if (showEmpty) {
    return (
      <View style={[styles.container, styles.stateWrap]}>
        <EmptyState
          density="compact"
          icon="search-outline"
          title="Nothing to explore yet"
          subtitle="New items are uploaded every day. Check back soon or browse categories."
          ctaLabel="Browse Categories"
          onCtaPress={onBrowseCategories}
        />
      </View>
    );
  }

  if (showFilteredEmpty) {
    const activeCategoryName =
      discoverCategories.find((c) => c.id === activeCategory)?.name ?? activeCategory;
    return (
      <View style={[styles.container, styles.stateWrap]}>
        <DiscoverCategoryBar
          activeCategory={activeCategory}
          categories={discoverCategories}
          onSelect={setActiveCategory}
        />
        <EmptyState
          density="compact"
          icon="bag-handle-outline"
          title={`No ${activeCategoryName.toLowerCase()} items yet`}
          subtitle="Try another category or check back soon."
          ctaLabel="Show all"
          onCtaPress={() => setActiveCategory('All')}
        />
      </View>
    );
  }

  // Populated (or loading-skeleton) state: the FlashList owns scrolling.
  // The RefreshIndicator is positioned absolutely over the grid and reads
  // the shared scrollY driven by the animated scroll handler above.
  return (
    <View ref={a11yRef} style={styles.container}>
      <RefreshIndicator scrollY={reducedMotion ? staticScrollY : scrollY} isRefreshing={refreshing} topInset={20} />
      <PinterestMasonryGrid
        items={units}
        onItemPress={onPressItem}
        onItemSaveToggle={onToggleSave}
        isItemSaved={isSavedListing}
        onLookPress={handleLookPress}
        onPosterPress={handlePosterPress}
        onMoodboardPress={handleMoodboardPress}
        onEndReached={onLoadMore}
        isLoading={showLoadingSkeleton}
        isLoadingMore={isLoadingMore}
        hasMore={hasMore}
        numColumns={DISCOVER_NUM_COLUMNS}
        refreshControl={refreshControl}
        onScroll={handleScroll}
        scrollRef={scrollRef}
        listHeaderComponent={categoryBar}
        enableImagePrefetch
      />
    </View>
  );
}
