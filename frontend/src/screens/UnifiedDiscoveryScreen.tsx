/**
 * UnifiedDiscoveryScreen — flagship discovery surface entered from the Home
 * search button.
 *
 * Combines into ONE personalised surface:
 *  - Search bar (transitions to text-search results on submit)
 *  - Personalised greeting + category pills
 *  - Hero editorial (from Galleria)
 *  - For You personalised listings masonry (useForYouFeed + discoveryFeedAssembly)
 *  - Curated collections rail (from Galleria)
 *  - Looks, moodboards, pulse integrated into the heterogeneous feed
 *  - Featured assets masonry (from Galleria)
 *
 * Design principles (AGENTS.md §4):
 *  - Media-as-color: real imagery is the primary visual anchor
 *  - Authored rhythm: heterogeneous modules interrupt the base grid
 *  - One masonry implementation (PinterestMasonryGrid / FlashList)
 *  - No decorative chrome, no card-on-card, no AI-slop
 *  - Full state coverage: loading, empty, error, offline, populated
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  ScrollView,
  useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { NativeStackScreenProps } from '@react-navigation/native-stack';

import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { useToast } from '../context/ToastContext';
import { useHaptic } from '../hooks/useHaptic';
import { useConnectivity } from '../hooks/useConnectivity';
import { useForYouFeed } from '../hooks/useForYouFeed';
import { useBackendData } from '../context/BackendDataContext';

import { Space, Radius, FontFamily, Control, AspectRatio } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { CachedImage } from '../components/CachedImage';
import { AppSearchBar } from '../components/ui/AppSearchBar';
import { EmptyState } from '../components/EmptyState';
import { OfflineBanner } from '../components/OfflineBanner';
import { MasonrySkeleton } from '../components/skeletons/MasonrySkeleton';
import { FlagshipHeader, FlagshipScreen } from '../components/flagship';
import { PinterestMasonryGrid } from '../components/discover/PinterestMasonryGrid';
import { HorizontalRail } from '../components/HorizontalRail';

import { assembleDiscoveryFeed } from '../utils/discoveryFeedAssembly';
import { fetchLooksFromApi, type LookApiItem } from '../services/looksApi';
import { fetchPosterStories, type PosterStory } from '../services/postersApi';
import { fetchPublicMoodboards, type Moodboard } from '../services/moodboardApi';
import {
  fetchGalleriaCollections,
  fetchGalleriaEditorials,
  fetchFeaturedAssets,
  type GalleriaCollection,
  type GalleriaEditorial,
  type GalleriaFeaturedAsset } from '../services/galleriaApi';
import { searchListingsFromApi } from '../services/feedApi';
import { searchUsers, type UserSearchResult } from '../services/profileApi';
import { buildListingFeedUnit, type DiscoveryFeedUnit } from '../contracts/discoveryFeedUnit';
import type { DiscoveryListingSummary } from '../contracts/DiscoveryListingSummary';
import { openProductDetail } from '../platform/product/openProductDetail';

type Props = NativeStackScreenProps<RootStackParamList, 'UnifiedDiscovery'>;

// ── Category pills ──
const CATEGORY_PILLS = ['All', 'New', 'Vintage', 'Streetwear', 'Designer', 'Home', 'Tech'] as const;
type CategoryPill = typeof CATEGORY_PILLS[number];

// ── Search debounce ──
const SEARCH_DEBOUNCE_MS = 180;

export default function UnifiedDiscoveryScreen({ navigation, route }: Props) {
  const { colors, isDark } = useAppTheme();
  const { width: windowWidth } = useWindowDimensions();
  const haptic = useHaptic();
  const { isOffline } = useConnectivity();
  const currentUser = useStore((state) => state.currentUser);
  const { listings: backendListings, refreshListings, isSyncing, lastError } = useBackendData();
  const forYouFeed = useForYouFeed();

  // ── Search state ──
  const [query, setQuery] = useState(route.params?.initialQuery ?? '');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const normalizedQuery = query.trim().toLowerCase();

  // ── Discovery feed state ──
  const [activeCategory, setActiveCategory] = useState<CategoryPill>('All');
  const [looks, setLooks] = useState<LookApiItem[]>([]);
  const [posters, setPosters] = useState<PosterStory[]>([]);
  const [moodboards, setMoodboards] = useState<Moodboard[]>([]);
  const [collections, setCollections] = useState<GalleriaCollection[]>([]);
  const [editorials, setEditorials] = useState<GalleriaEditorial[]>([]);
  const [featuredAssets, setFeaturedAssets] = useState<GalleriaFeaturedAsset[]>([]);
  const [isDiscoveryLoading, setIsDiscoveryLoading] = useState(true);

  // ── Search results state ──
  const [searchResults, setSearchResults] = useState<DiscoveryFeedUnit[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [peopleResults, setPeopleResults] = useState<UserSearchResult[]>([]);
  const [isSearchingPeople, setIsSearchingPeople] = useState(false);
  const [searchScope, setSearchScope] = useState<'items' | 'people'>('items');

  const scrollRef = useRef<any>(null);
  const styles = useMemo(() => createStyles(colors), [colors]);

  // ── Greeting based on time of day ──
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  }, []);

  const firstName = useMemo(() => {
    const name = currentUser?.displayName ?? currentUser?.username ?? '';
    return name.split(' ')[0] || name;
  }, [currentUser?.displayName, currentUser?.username]);

  // ── Load all discovery content ──
  const loadDiscoveryContent = useCallback(async () => {
    setIsDiscoveryLoading(true);
    const [looksRes, postersRes, moodboardsRes, colsRes, edsRes, assetsRes] = await Promise.allSettled([
      fetchLooksFromApi({ status: 'published', sort: 'foryou', limit: 6 }),
      fetchPosterStories({ active: true, limit: 4 }),
      fetchPublicMoodboards(),
      fetchGalleriaCollections(),
      fetchGalleriaEditorials(),
      fetchFeaturedAssets(),
    ]);

    if (looksRes.status === 'fulfilled') setLooks(looksRes.value.items ?? []);
    if (postersRes.status === 'fulfilled') setPosters(postersRes.value.items ?? []);
    if (moodboardsRes.status === 'fulfilled') {
      setMoodboards(moodboardsRes.value.filter((m) => !m.isDemo));
    }
    if (colsRes.status === 'fulfilled') setCollections(colsRes.value);
    if (edsRes.status === 'fulfilled') setEditorials(edsRes.value);
    if (assetsRes.status === 'fulfilled') setFeaturedAssets(assetsRes.value);
    setIsDiscoveryLoading(false);
  }, []);

  useEffect(() => {
    void loadDiscoveryContent();
  }, [loadDiscoveryContent]);

  // ── Search debounce ──
  useEffect(() => {
    if (!normalizedQuery || normalizedQuery.length < 2) {
      setSearchResults([]);
      setPeopleResults([]);
      setIsSearching(false);
      setIsSearchingPeople(false);
      return;
    }

    let cancelled = false;
    setIsSearching(true);
    setSearchScope('items');

    const timer = setTimeout(() => {
      searchListingsFromApi(normalizedQuery, 50)
        .then((result) => {
          if (cancelled) return;
          if (result.error) {
            setSearchResults([]);
          } else {
            // Map search results to feed units directly — each result becomes
            // a ListingFeedUnit with its real media URI.
            setSearchResults(result.items.map((item) => buildListingFeedUnit(
              {
                id: item.id,
                title: item.title || 'Untitled',
                brand: item.brand ?? null,
                size: item.size ?? null,
                condition: null,
                price: Number(item.priceGbp ?? 0),
                images: item.imageUrl ? [item.imageUrl] : [],
                likes: 0,
                sellerId: item.sellerId,
                category: item.category ?? '',
                createdAt: item.createdAt },
              item.imageUrl ?? '',
              // The Search API does not currently return media dimensions or
              // an aspect ratio. Most fashion marketplace imagery is portrait,
              // so 4:5 (marketplace standard) is the correct fallback rather
              // than 1:1 square, which would crop portrait items awkwardly.
              // When the API later exposes aspectRatio or mediaWidth/
              // mediaHeight, those real values are preferred here.
              item.aspectRatio ??
                (item.mediaWidth && item.mediaHeight
                  ? item.mediaWidth / item.mediaHeight
                  : AspectRatio.marketplace),
            )));
          }
        })
        .finally(() => { if (!cancelled) setIsSearching(false); });
    }, SEARCH_DEBOUNCE_MS);

    return () => { cancelled = true; clearTimeout(timer); };
  }, [normalizedQuery]);

  // ── People search ──
  useEffect(() => {
    if (!normalizedQuery || normalizedQuery.length < 2 || searchScope !== 'people') {
      setPeopleResults([]);
      setIsSearchingPeople(false);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      setIsSearchingPeople(true);
      searchUsers(normalizedQuery, 20)
        .then((results) => { if (!cancelled) setPeopleResults(results); })
        .catch(() => { if (!cancelled) setPeopleResults([]); })
        .finally(() => { if (!cancelled) setIsSearchingPeople(false); });
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [normalizedQuery, searchScope]);

  // ── Personalised listings: For You feed when available, else backend cursor ──
  const baseListings = useMemo(() => {
    if (forYouFeed.listings.length > 0) return forYouFeed.listings;
    return backendListings;
  }, [forYouFeed.listings, backendListings]);

  // ── Category filter — pills are functional, not decorative ──
  const personalisedListings = useMemo(() => {
    if (activeCategory === 'All') return baseListings;
    if (activeCategory === 'New') {
      // Sort by createdAt descending, take recent items
      return [...baseListings].sort((a, b) =>
        new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime(),
      );
    }
    const cat = activeCategory.toLowerCase();
    return baseListings.filter((listing) => {
      const lc = (listing.category ?? '').toLowerCase();
      const sub = (listing.subcategory ?? '').toLowerCase();
      const brand = (listing.brand ?? '').toLowerCase();
      return lc.includes(cat) || sub.includes(cat) || brand.includes(cat);
    });
  }, [baseListings, activeCategory]);

  // ── Assemble the heterogeneous discovery feed ──
  const feedUnits = useMemo(
    () => assembleDiscoveryFeed(
      personalisedListings,
      2,
      { looks, posters, moodboards },
    ),
    [personalisedListings, looks, posters, moodboards],
  );

  // ── Search results are already feed units (built in the effect) ──
  const searchFeedUnits = searchResults;

  const isSearchingMode = normalizedQuery.length >= 2;
  const activeUnits = isSearchingMode ? searchFeedUnits : feedUnits;

  // ── Hero editorial (first one) ──
  const heroEditorial = editorials[0];

  // ── Handlers ──
  const handleRefresh = useCallback(() => {
    haptic.selection();
    void loadDiscoveryContent();
    void forYouFeed.refresh();
    void refreshListings();
  }, [haptic, loadDiscoveryContent, forYouFeed, refreshListings]);

  const handleListingPress = useCallback((item: DiscoveryListingSummary) => {
    // DiscoveryListingSummary carries id + sellerId — route via canonical resolver.
    openProductDetail(navigation, {
      referenceKind: 'listing',
      canonicalId: item.id,
      sourceSurface: 'UnifiedDiscovery',
    });
  }, [navigation]);

  const handleLookPress = useCallback((lookId: string) => {
    navigation.navigate('MainTabs', {
      screen: 'Home',
      params: { screen: 'LookDetail', params: { lookId } } });
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

  const handleSubmitSearch = useCallback(() => {
    if (normalizedQuery.length >= 2) {
      haptic.light();
    }
  }, [normalizedQuery, haptic]);

  const hasAnyContent = personalisedListings.length > 0 || looks.length > 0 || posters.length > 0 || moodboards.length > 0 || featuredAssets.length > 0;
  const showLoadingSkeleton = !hasAnyContent && (isDiscoveryLoading || forYouFeed.isLoading || (isSyncing && !lastError));
  const showError = !hasAnyContent && Boolean(lastError) && !isSyncing && !isDiscoveryLoading && !forYouFeed.isLoading;
  const showEmpty = !hasAnyContent && !isSyncing && !lastError && !isDiscoveryLoading && !forYouFeed.isLoading;
  // Filtered-empty: a category pill is selected but returns 0 listings. This
  // is distinct from the generic empty state (no data at all) — here we have
  // data, just none matching the selected category. Takes precedence over
  // showEmpty so the user gets a contextual message + "Browse all" action.
  const showFilteredEmpty =
    activeCategory !== 'All' &&
    personalisedListings.length === 0 &&
    !showLoadingSkeleton &&
    !showError;

  // ── Search bar header — back button + search bar + camera, all in the
  //  header so the search bar sits right below the status bar with no
  //  extra content padding pushing it down. ──
  const header = (
    <View style={styles.headerWrap}>
      <FlagshipHeader
        title=""
        onBack={() => navigation.goBack()}
        rightAction={
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <AnimatedPressable
              style={styles.headerBtn}
              onPress={() => navigation.navigate('VisualSearch')}
              accessibilityLabel="Visual search"
              accessibilityRole="button"
            >
              <Ionicons name="camera-outline" size={21} color={colors.textPrimary} />
            </AnimatedPressable>
          </View>
        }
      />
      <View style={styles.headerSearchWrap}>
        <AppSearchBar
          placeholder="Search items, people, brands…"
          value={query}
          onChangeText={setQuery}
          onClear={() => { setQuery(''); setIsSearchFocused(false); }}
          containerStyle={styles.searchBar}
          inputProps={{
            autoCapitalize: 'none',
            autoCorrect: false,
            returnKeyType: 'search',
            onFocus: () => setIsSearchFocused(true),
            onBlur: () => setIsSearchFocused(false),
            onSubmitEditing: handleSubmitSearch }}
        />
      </View>
    </View>
  );

  return (
    <FlagshipScreen header={header} scrollEnabled={false} contentStyle={{ paddingTop: 0, paddingHorizontal: 0 }}>
      <View style={styles.container}>
        {/* Search mode: show scope tabs + results */}
        {isSearchingMode ? (
          <SearchResultsView
            units={activeUnits}
            isSearching={isSearching}
            isSearchingPeople={isSearchingPeople}
            peopleResults={peopleResults}
            searchScope={searchScope}
            onScopeChange={setSearchScope}
            onListingPress={handleListingPress}
            onLookPress={handleLookPress}
            onPosterPress={handlePosterPress}
            onMoodboardPress={handleMoodboardPress}
            colors={colors}
            styles={styles}
            navigation={navigation}
          />
        ) : (
          /* Discovery mode: unified personalised feed */
          <DiscoveryFeedView
            units={activeUnits}
            isLoading={showLoadingSkeleton}
            showError={showError}
            showEmpty={showEmpty}
            showFilteredEmpty={showFilteredEmpty}
            isOffline={isOffline}
            greeting={greeting}
            firstName={firstName}
            activeCategory={activeCategory}
            onCategoryChange={setActiveCategory}
            heroEditorial={heroEditorial}
            collections={collections}
            featuredAssets={featuredAssets}
            onListingPress={handleListingPress}
            onLookPress={handleLookPress}
            onPosterPress={handlePosterPress}
            onMoodboardPress={handleMoodboardPress}
            onCollectionPress={handleCollectionPress}
            onRefresh={handleRefresh}
            isRefreshing={forYouFeed.isRefreshing || isSyncing}
            scrollRef={scrollRef}
            colors={colors}
            styles={styles}
            windowWidth={windowWidth}
          />
        )}
      </View>
    </FlagshipScreen>
  );
}

// ============================================================================
// DISCOVERY FEED VIEW — the unified personalised surface
// ============================================================================

function DiscoveryFeedView({
  units,
  isLoading,
  showError,
  showEmpty,
  showFilteredEmpty,
  isOffline,
  greeting,
  firstName,
  activeCategory,
  onCategoryChange,
  heroEditorial,
  collections,
  featuredAssets,
  onListingPress,
  onLookPress,
  onPosterPress,
  onMoodboardPress,
  onCollectionPress,
  onRefresh,
  isRefreshing,
  scrollRef,
  colors,
  styles,
  windowWidth }: {
  units: DiscoveryFeedUnit[];
  isLoading: boolean;
  showError: boolean;
  showEmpty: boolean;
  showFilteredEmpty: boolean;
  isOffline: boolean;
  greeting: string;
  firstName: string;
  activeCategory: CategoryPill;
  onCategoryChange: (c: CategoryPill) => void;
  heroEditorial?: GalleriaEditorial;
  collections: GalleriaCollection[];
  featuredAssets: GalleriaFeaturedAsset[];
  onListingPress: (listing: DiscoveryListingSummary) => void;
  onLookPress: (id: string) => void;
  onPosterPress: (id: string) => void;
  onMoodboardPress: (id: string) => void;
  onCollectionPress: (id: string) => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  scrollRef: React.MutableRefObject<any>;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
  windowWidth: number;
}) {
  if (showError) {
    return (
      <View style={styles.stateWrap}>
        <EmptyState
          density="compact"
          icon="cloud-offline-outline"
          iconColor={colors.danger}
          title="Discovery unavailable"
          subtitle="We couldn't load discovery right now. Check your connection and try again."
          ctaLabel="Retry"
          onCtaPress={onRefresh}
        />
      </View>
    );
  }

  if (showFilteredEmpty) {
    return (
      <View style={styles.stateWrap}>
        <EmptyState
          density="compact"
          icon="bag-handle-outline"
          title={`No ${activeCategory.toLowerCase()} items yet`}
          subtitle="Try another category or check back soon."
          ctaLabel="Browse all"
          onCtaPress={() => onCategoryChange('All')}
        />
      </View>
    );
  }

  if (showEmpty) {
    return (
      <View style={styles.stateWrap}>
        <EmptyState
          density="compact"
          icon="search-outline"
          title="Nothing to explore yet"
          subtitle="New items are uploaded every day. Check back soon."
          ctaLabel="Refresh"
          onCtaPress={onRefresh}
        />
      </View>
    );
  }

  // Build the header component for the masonry grid:
  // greeting + category pills + hero editorial + collections rail
  const listHeader = (
    <>
      {isOffline && <OfflineBanner />}

      {/* Personalised greeting — one line, no decorative subtitle */}
      <View style={styles.greetingWrap}>
        <Text style={styles.greetingText}>
          {greeting}{firstName ? `, ${firstName}` : ''}
        </Text>
      </View>

      {/* Category pills — horizontal scroll, pill = filter not decoration.
          Wrapped in a ScrollView so 8+ pills scroll on narrow screens with a
          partial next pill visible at the edge (paddingRight: Space.md). */}
      <View style={styles.categoryBar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryBarContent}
        >
          {(CATEGORY_PILLS as readonly CategoryPill[]).map((pill) => (
            <Pressable
              key={pill}
              onPress={() => onCategoryChange(pill)}
              style={[
                styles.categoryPill,
                activeCategory === pill && styles.categoryPillActive,
              ]}
              accessibilityRole="button"
              accessibilityLabel={`Filter by ${pill}`}
              accessibilityState={{ selected: activeCategory === pill }}
            >
              <Text style={[
                styles.categoryPillText,
                activeCategory === pill && styles.categoryPillTextActive,
              ]}>
                {pill}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {/* Hero editorial — full-width media object, no decorative chrome */}
      {heroEditorial && heroEditorial.heroImage && (
        <View style={styles.heroWrap}>
          <CachedImage
            uri={heroEditorial.heroImage}
            style={styles.heroImage}
            contentFit="cover"
            priority="high"
          />
          <LinearGradient
            colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.65)']}
            style={styles.heroGradient}
          />
          <View style={styles.heroOverlay} pointerEvents="none">
            <Text style={styles.heroEyebrow}>EDITORIAL</Text>
            <Text style={styles.heroTitle} numberOfLines={3}>
              {heroEditorial.title}
            </Text>
            <Text style={styles.heroMeta} numberOfLines={1}>
              {heroEditorial.author} · {heroEditorial.readTime}
            </Text>
          </View>
        </View>
      )}

      {/* Curated collections rail — horizontal scroll of collection cards */}
      {collections.length > 0 && (
        <View style={styles.collectionsSection}>
          <Text style={styles.sectionTitle}>Curated collections</Text>
          <HorizontalRail
            contentContainerStyle={styles.railContent}
            showsHorizontalScrollIndicator={false}
          >
            {collections.map((collection) => (
              <CollectionRailCard
                key={collection.id}
                collection={collection}
                onPress={() => onCollectionPress(collection.id)}
              />
            ))}
          </HorizontalRail>
        </View>
      )}

      {/* For You section label — quiet, one line */}
      <View style={styles.feedLabelWrap}>
        <Text style={styles.feedLabel}>For you</Text>
      </View>
    </>
  );

  // Loading skeleton — use the shared MasonrySkeleton so the loading frame
  // matches the final FlashList masonry layout (no loading→final geometry
  // shift). AGENTS.md §4 / §14: skeletons should resemble the final layout.
  if (isLoading) {
    return (
      <View style={styles.skeletonWrap}>
        <MasonrySkeleton numColumns={2} itemCount={8} />
      </View>
    );
  }

  return (
    <PinterestMasonryGrid
      items={units}
      onItemPress={onListingPress}
      onLookPress={onLookPress}
      onPosterPress={onPosterPress}
      onMoodboardPress={onMoodboardPress}
      numColumns={2}
      isLoading={isLoading}
      hasMore={false}
      scrollRef={scrollRef}
      listHeaderComponent={listHeader}
    />
  );
}

// ============================================================================
// SEARCH RESULTS VIEW
// ============================================================================

function SearchResultsView({
  units,
  isSearching,
  isSearchingPeople,
  peopleResults,
  searchScope,
  onScopeChange,
  onListingPress,
  onLookPress,
  onPosterPress,
  onMoodboardPress,
  colors,
  styles,
  navigation }: {
  units: DiscoveryFeedUnit[];
  isSearching: boolean;
  isSearchingPeople: boolean;
  peopleResults: UserSearchResult[];
  searchScope: 'items' | 'people';
  onScopeChange: (s: 'items' | 'people') => void;
  onListingPress: (listing: DiscoveryListingSummary) => void;
  onLookPress: (id: string) => void;
  onPosterPress: (id: string) => void;
  onMoodboardPress: (id: string) => void;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
  navigation: any;
}) {
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
          <Text style={[styles.scopeTabText, searchScope === 'items' && styles.scopeTabTextActive]}>
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
          <Text style={[styles.scopeTabText, searchScope === 'people' && styles.scopeTabTextActive]}>
            People
          </Text>
          {searchScope === 'people' && <View style={styles.scopeIndicator} />}
        </Pressable>
      </View>

      {searchScope === 'items' ? (
        isSearching && units.length === 0 ? (
          <View style={styles.searchingWrap}>
            <ActivityIndicator size="large" color={colors.brand} />
          </View>
        ) : units.length === 0 ? (
          <View style={styles.stateWrap}>
            <EmptyState
              density="compact"
              icon="search-outline"
              title="No items found"
              subtitle="Try a different search term or browse discovery instead."
            />
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
          />
        )
      ) : (
        isSearchingPeople && peopleResults.length === 0 ? (
          <View style={styles.searchingWrap}>
            <ActivityIndicator size="large" color={colors.brand} />
          </View>
        ) : peopleResults.length === 0 ? (
          <View style={styles.stateWrap}>
            <EmptyState
              density="compact"
              icon="people-outline"
              title="No people found"
              subtitle="Try searching by username or display name."
            />
          </View>
        ) : (
          <View style={styles.peopleList}>
            {peopleResults.map((user) => (
              <PeopleResultRow
                key={user.id}
                user={user}
                onPress={() => navigation.navigate('UserProfile', { userId: user.id })}
                colors={colors}
                styles={styles}
              />
            ))}
          </View>
        )
      )}
    </View>
  );
}

// ============================================================================
// COLLECTION RAIL CARD — compact card for horizontal rail
// ============================================================================

function CollectionRailCard({
  collection,
  onPress }: {
  collection: GalleriaCollection;
  onPress: () => void;
}) {
  const { colors } = useAppTheme();
  return (
    <AnimatedPressable
      style={{ width: 180, marginRight: Space.sm }}
      onPress={onPress}
      activeOpacity={0.92}
      scaleValue={0.98}
      accessibilityRole="button"
      accessibilityLabel={`Collection: ${collection.title}`}
    >
      <View style={{ width: 180, height: 240, borderRadius: Radius.lg, overflow: 'hidden', backgroundColor: colors.surfaceAlt }}>
        <CachedImage
          uri={collection.coverImage}
          style={{ width: '100%', height: '100%' }}
          contentFit="cover"
        />
        <LinearGradient
          colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.6)']}
          style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '55%' }}
          pointerEvents="none"
        />
        <View style={{ position: 'absolute', left: Space.sm, right: Space.sm, bottom: Space.sm }} pointerEvents="none">
          <Text style={{ color: colors.scrimTextPrimary, fontFamily: FontFamily.semibold, fontSize: TypographyV2.meta.size, letterSpacing: 0.5 }} numberOfLines={1}>
            {collection.theme.toUpperCase()}
          </Text>
          <Text style={{ color: colors.scrimTextPrimary, fontFamily: FontFamily.bold, fontSize: TypographyV2.body.size, lineHeight: TypographyV2.body.lineHeight }} numberOfLines={2}>
            {collection.title}
          </Text>
          <Text style={{ color: colors.scrimTextSecondary, fontFamily: FontFamily.regular, fontSize: TypographyV2.meta.size }} numberOfLines={1}>
            {collection.curator}
          </Text>
        </View>
      </View>
    </AnimatedPressable>
  );
}

// ============================================================================
// PEOPLE RESULT ROW
// ============================================================================

function PeopleResultRow({
  user,
  onPress,
  colors,
  styles }: {
  user: UserSearchResult;
  onPress: () => void;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <AnimatedPressable
      style={styles.peopleRow}
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={`View profile: ${user.displayName || user.username}`}
    >
      {user.avatar ? (
        <CachedImage
          uri={user.avatar}
          style={styles.peopleAvatar}
          contentFit="cover"
          downscaleWidth={96}
        />
      ) : (
        <View style={[styles.peopleAvatarFallback, { backgroundColor: colors.surfaceAlt }]}>
          <Ionicons name="person" size={18} color={colors.textMuted} />
        </View>
      )}
      <View style={styles.peopleInfo}>
        <Text style={styles.peopleName} numberOfLines={1}>
          {user.displayName || `@${user.username}`}
        </Text>
        {user.displayName && (
          <Text style={styles.peopleUsername} numberOfLines={1}>
            @{user.username}
          </Text>
        )}
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </AnimatedPressable>
  );
}

// ============================================================================
// STYLES
// ============================================================================

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background },
    stateWrap: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: Space.lg },
    searchingWrap: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center' },
    headerBtn: {
      width: Control.hit,
      height: Control.hit,
      alignItems: 'center',
      justifyContent: 'center' },
    // Header search bar — sits right below the back/camera row
    headerWrap: {
      backgroundColor: colors.background },
    headerSearchWrap: {
      paddingHorizontal: Space.md,
      paddingBottom: Space.sm },
    searchBar: {
      flex: 1 },
    // Greeting
    greetingWrap: {
      paddingHorizontal: Space.md,
      paddingTop: Space.sm,
      paddingBottom: Space.xs },
    greetingText: {
      fontSize: TypographyV2.screenTitle.size,
      fontFamily: FontFamily.bold,
      color: colors.textPrimary,
      lineHeight: TypographyV2.screenTitle.lineHeight },
    // Category pills
    categoryBar: {
      paddingVertical: Space.xs },
    categoryBarContent: {
      flexDirection: 'row',
      paddingHorizontal: Space.md,
      paddingRight: Space.md,
      gap: Space.xs,
      alignItems: 'center' },
    categoryPill: {
      paddingHorizontal: Space.sm + 2,
      paddingVertical: Space.xs + 2,
      borderRadius: Radius.full,
      backgroundColor: colors.surfaceAlt },
    categoryPillActive: {
      backgroundColor: colors.textPrimary },
    categoryPillText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: FontFamily.medium,
      color: colors.textSecondary },
    categoryPillTextActive: {
      color: colors.textInverse },
    // Hero editorial
    heroWrap: {
      width: '100%',
      height: 280,
      marginVertical: Space.sm,
      position: 'relative' },
    heroImage: {
      width: '100%',
      height: '100%' },
    heroGradient: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      height: '60%' },
    heroOverlay: {
      position: 'absolute',
      left: Space.md,
      right: Space.md,
      bottom: Space.md },
    heroEyebrow: {
      color: colors.scrimTextPrimary,
      fontFamily: FontFamily.semibold,
      fontSize: TypographyV2.meta.size,
      letterSpacing: 1,
      marginBottom: Space.xs },
    heroTitle: {
      color: colors.scrimTextPrimary,
      fontFamily: FontFamily.bold,
      fontSize: TypographyV2.sectionTitle.size + 2,
      lineHeight: TypographyV2.sectionTitle.lineHeight + 4,
      marginBottom: Space.xs / 2 },
    heroMeta: {
      color: colors.scrimTextSecondary,
      fontFamily: FontFamily.regular,
      fontSize: TypographyV2.meta.size },
    // Collections rail
    collectionsSection: {
      paddingVertical: Space.sm },
    sectionTitle: {
      paddingHorizontal: Space.md,
      fontSize: TypographyV2.body.size + 2,
      fontFamily: FontFamily.bold,
      color: colors.textPrimary,
      marginBottom: Space.sm },
    railContent: {
      paddingHorizontal: Space.md },
    // Feed label
    feedLabelWrap: {
      paddingHorizontal: Space.md,
      paddingTop: Space.md,
      paddingBottom: Space.xs },
    feedLabel: {
      fontSize: TypographyV2.body.size + 2,
      fontFamily: FontFamily.bold,
      color: colors.textPrimary },
    // Skeleton
    skeletonWrap: {
      flex: 1,
      paddingHorizontal: Space.md,
      paddingTop: Space.sm },
    // Search results
    searchResultsWrap: {
      flex: 1 },
    scopeBar: {
      flexDirection: 'row',
      paddingHorizontal: Space.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border },
    scopeTab: {
      flex: 1,
      paddingVertical: Space.sm + 2,
      alignItems: 'center',
      position: 'relative' },
    scopeTabActive: {},
    scopeTabText: {
      fontSize: TypographyV2.body.size,
      fontFamily: FontFamily.medium,
      color: colors.textMuted },
    scopeTabTextActive: {
      color: colors.textPrimary,
      fontFamily: FontFamily.semibold },
    scopeIndicator: {
      position: 'absolute',
      bottom: 0,
      left: '25%',
      right: '25%',
      height: 2,
      backgroundColor: colors.textPrimary,
      borderRadius: 1 },
    // People results
    peopleList: {
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm },
    peopleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      paddingVertical: Space.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border },
    peopleAvatar: {
      width: 44,
      height: 44,
      borderRadius: Radius.full },
    peopleAvatarFallback: {
      width: 44,
      height: 44,
      borderRadius: Radius.full,
      alignItems: 'center',
      justifyContent: 'center' },
    peopleInfo: {
      flex: 1,
      gap: 2 },
    peopleName: {
      fontSize: TypographyV2.body.size,
      fontFamily: FontFamily.semibold,
      color: colors.textPrimary },
    peopleUsername: {
      fontSize: TypographyV2.meta.size,
      fontFamily: FontFamily.regular,
      color: colors.textMuted } });
}
