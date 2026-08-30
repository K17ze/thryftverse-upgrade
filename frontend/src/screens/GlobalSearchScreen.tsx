import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  StatusBar,
  Pressable,
  useWindowDimensions } from 'react-native';
import Reanimated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../theme/ThemeContext';
import { Motion } from '../constants/motion';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { RootStackParamList } from '../navigation/types';
import { useScrollRestoration } from '../hooks/useScrollRestoration';
import { openProfile } from '../navigation/openProfile';
import { useStore } from '../store/useStore';
import { useBackendData } from '../context/BackendDataContext';
import { SyncStatusPill } from '../components/SyncStatusPill';
import { SkeletonLoader } from '../components/SkeletonLoader';
import { SyncRetryBanner } from '../components/SyncRetryBanner';
import { EmptyState } from '../components/EmptyState';
import { CommerceDetailOfflineBanner } from '../components/commerce/detail';
import { useConnectivity } from '../hooks/useConnectivity';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { getBackendSyncStatus } from '../utils/syncStatus';
import { CachedImage } from '../components/CachedImage';
import { SharedTransitionView } from '../components/SharedTransitionView';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { AppButton } from '../components/ui/AppButton';
import { AppSearchBar } from '../components/ui/AppSearchBar';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { type SearchAutocompleteSuggestion } from '../services/feedApi';
import { friendlyBackendError } from '../services/listingMapper';
import { loadRecentSearchStrings, recordRecentSearch, clearRecentSearches } from '../services/searchHistory';
import { ProductAnalytics } from '../platform/product/productAnalytics';
import { track } from '../analytics/track';
import { useFeatureFlag } from '../analytics';
import { useSavedSearchAlerts } from '../hooks/useSavedSearchAlerts';
import { BottomSheet } from '../components/BottomSheet';
import { PeopleResultRow, peopleRowStyles } from '../components/search/PeopleResultRow';
import { useGlobalSearch, type RankedListing } from '../hooks/useGlobalSearch';
import { buildAffinitySet, getRecencyBoost, getBroadenedSuggestions } from '../utils/searchRanking';

/* ΓöÇΓöÇ New Discover Components ΓöÇΓöÇ */
import { EditorialSection } from '../components/discover/EditorialSection';
import { FontFamily, Space, Control, Radius, Stroke } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { RadiusRoleValue } from '../theme/surfaceRadiusRules';
import { useTaxonomy } from '../context/TaxonomyContext';
import { resolveListingMediaHeightRatio } from '../utils/listingMediaGeometry';

type Props = NativeStackScreenProps<RootStackParamList, 'GlobalSearch'>;

// Masonry column width — matches the grid layout (paddingHorizontal: 20,
// gap: 8). Used to compute deterministic image heights from real aspect
// ratios so there is zero layout shift when media loads (audit §02:
// skeleton aspect parity; image errors preserve card geometry).

type SearchSortOption = 'Recommended' | 'Newest' | 'Price: Low to High' | 'Price: High to Low' | 'Most liked';

const DISCOVER_SORT_OPTIONS: SearchSortOption[] = [
  'Recommended',
  'Newest',
  'Price: Low to High',
  'Price: High to Low',
  'Most liked',
];

// Category shortcuts — derived from the app's canonical category tree so
// pills map to real browse destinations. Shown in both the focus and resting
// states (Depop/Vinted pattern) with clean Ionicons glyphs — not emojis.
// Emojis read as prototype-grade; flagship apps use consistent icon families.
const CATEGORY_ICON_MAP: Record<string, string> = {
  women: 'shirt-outline',
  men: 'shirt-outline',
  designer: 'bag-handle-outline',
  kids: 'happy-outline',
  home: 'home-outline',
  electronics: 'phone-portrait-outline',
  entertainment: 'book-outline',
  hobbies: 'color-palette-outline',
  sports: 'basketball-outline' };

// Editorial seed data has been removed. The discover landing now relies
// entirely on real backend listings, real recent/saved searches, and the
// canonical category tree. Server-driven editorial units can be added here
// when a backend editorial schema is available (see backlog: Search →
// server-driven editorial schema).

export default function GlobalSearchScreen({ navigation, route }: Props) {
  const {
    query,
    setQuery,
    isSearchFocused,
    setIsSearchFocused,
    normalizedQuery,
    queryTokens,
    backendSearchResults,
    isSearching,
    searchError,
    setSearchRetryVersion,
    autocompleteSuggestions,
    isAutocompleteLoading,
    autocompleteError,
    searchScope,
    setSearchScope,
    peopleResults,
    isSearchingPeople,
    peopleSearchError,
    setPeopleSearchRetryVersion } = useGlobalSearch(route.params?.initialQuery);
  const inputRef = useRef<any>(null);
  const currentUser = useStore((state) => state.currentUser);
  const browseFilters = useStore((state) => state.browseFilters);
  const updateBrowseFilters = useStore((state) => state.updateBrowseFilters);
  const resetBrowseFilters = useStore((state) => state.resetBrowseFilters);
  const wishlistIds = useStore((state) => state.wishlist);
  const savedSearches = useStore((state) => state.savedSearches);
  const addSavedSearch = useStore((state) => state.addSavedSearch);
  const removeSavedSearch = useStore((state) => state.removeSavedSearch);
  const toggleSavedSearchAlerts = useStore((state) => state.toggleSavedSearchAlerts);
  const { listings, source, isSyncing, lastError, refreshListings } = useBackendData();
  const { currencyCode, currencySymbol, formatFromFiat } = useFormattedPrice();
  const { colors, isDark } = useAppTheme();
  const { isOffline } = useConnectivity();
  const reducedMotion = useReducedMotion();
  const { width: windowWidth } = useWindowDimensions();
  const focusProgress = useSharedValue(0);
  const { categories } = useTaxonomy();

  const categoryShortcuts = useMemo(
    () =>
      categories
        .filter((cat) => cat.parentId === null)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .slice(0, 8)
        .map((cat) => ({
          label: cat.name,
          icon: CATEGORY_ICON_MAP[cat.id] ?? 'pricetag-outline',
          query: cat.id })),
    [categories],
  );

  const { scrollRef, onScroll, captureScroll, restoreScroll } = useScrollRestoration<ScrollView>({
    storageKey: 'global_search_results',
    persistToStorage: true });
  const discoverLenRef = useRef(0);

  // Apply initial query passed from Explore search to browse filters so
  // results render immediately on mount.
  useEffect(() => {
    if (route.params?.initialQuery) {
      updateBrowseFilters({ query: route.params.initialQuery });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Feature flag — gates the conversational AI search entry point. Additive
  // pill; absent when the flag is off (current behaviour). When enabled, an
  // "AI Search" pill appears on the search landing that opens the
  // conversational search surface.
  const conversationalSearchEnabled = useFeatureFlag('conversational_search');

  // Geometry follows the current viewport rather than a module-load snapshot,
  // so rotation and split-screen keep the masonry skeleton/final media aligned.
  const masonryColumnWidth = Math.max(120, (windowWidth - 20 * 2 - 8) / 2);

  // Evaluate saved search alerts against current listings
  useSavedSearchAlerts();

  const [isSortSheetVisible, setIsSortSheetVisible] = useState(false);

  const wishlistListings = useMemo(
    () => listings.filter((listing) => wishlistIds?.includes(listing.id) ?? false),
    [listings, wishlistIds],
  );

  const affinityProfile = useMemo(
    () => ({
      brandSet: buildAffinitySet(wishlistListings.map((listing) => listing.brand)),
      categorySet: buildAffinitySet(wishlistListings.map((listing) => listing.category)),
      subcategorySet: buildAffinitySet(
        wishlistListings
          .map((listing) => listing.subcategory)
          .filter((subcategory): subcategory is string => !!subcategory)
      ) }),
    [wishlistListings],
  );

  const rankedListings = useMemo<RankedListing[]>(() => {
    if (normalizedQuery && backendSearchResults.length > 0) {
      // Server owns the result order for "Recommended". The client does NOT
      // rerank with affinity/recency heuristics the server can't reproduce.
      // Score is derived purely from the server's position so downstream
      // "Recommended" sort stays a stable no-op (server order preserved).
      return backendSearchResults.map((listing, index) => ({
        ...listing,
        score: Math.max(0, 100 - index),
        reason: listing.reason || 'Search match' }));
    }
    return listings
      .filter((listing) => !(wishlistIds?.includes(listing.id) ?? false))
      .map((listing) => {
        const title = listing.title?.toLowerCase() ?? '';
        const brand = listing.brand?.toLowerCase() ?? '';
        const category = listing.category?.toLowerCase() ?? '';
        const subcategory = listing.subcategory?.toLowerCase() ?? '';

        let score = Math.min(listing.likes, 120) * 0.22;
        score += getRecencyBoost(listing.createdAt);
        const reasons: string[] = [];

        if (affinityProfile.brandSet.has(brand)) {
          score += 16;
          reasons.push('Brand you save');
        }
        if (affinityProfile.categorySet.has(category)) {
          score += 11;
          reasons.push('Your category');
        }
        if (affinityProfile.subcategorySet.has(subcategory)) {
          score += 8;
          reasons.push('Similar to saved items');
        }

        const matchedTokens = queryTokens.filter(
          (token) =>
            title?.includes(token)
            || brand?.includes(token)
            || category?.includes(token)
            || subcategory?.includes(token),
        );

        if (queryTokens.length > 0) {
          if (matchedTokens.length > 0) {
            score += 22 + matchedTokens.length * 7;
            reasons.unshift(`Search match`);
          } else {
            score -= 18;
          }
        }

        return {
          id: listing.id,
          title: listing.title,
          brand: listing.brand,
          size: listing.size,
          condition: listing.condition,
          image: listing.images?.[0] ?? '',
          price: listing.price,
          likes: listing.likes,
          sellerId: listing.sellerId,
          createdAt: listing.createdAt,
          score,
          reason: reasons[0] ?? 'Recommended',
          mediaHeightRatio: resolveListingMediaHeightRatio(listing) };
      })
      .filter((listing) => {
        if (!queryTokens.length) return true;
        return listing.score > 0;
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 20);
  }, [affinityProfile.brandSet, affinityProfile.categorySet, affinityProfile.subcategorySet, listings, queryTokens, wishlistIds, normalizedQuery, backendSearchResults]);

  const activeFilterCount =
    browseFilters.brands.length
    + browseFilters.sizes.length
    + (browseFilters.condition !== 'Any' ? 1 : 0)
    + (browseFilters.priceMin != null ? 1 : 0)
    + (browseFilters.priceMax != null ? 1 : 0);

  const hasActiveDiscoverFilters = activeFilterCount > 0;

  const discoverListings = useMemo(() => {
    const selectedBrands = new Set(browseFilters.brands.map((brand) => brand.toLowerCase()));
    const selectedSizes = new Set(browseFilters.sizes.map((size) => size.toLowerCase()));

    const sourceListings = normalizedQuery ? rankedListings : listings.map((listing) => ({
      id: listing.id,
      title: listing.title,
      brand: listing.brand,
      size: listing.size,
      condition: listing.condition,
      image: listing.images?.[0] ?? '',
      price: listing.price,
      likes: listing.likes,
      sellerId: listing.sellerId,
      createdAt: listing.createdAt,
      score: 0,
      reason: '',
      mediaHeightRatio: resolveListingMediaHeightRatio(listing) }));

    const filtered = sourceListings.filter((listing) => {
      // Null/unknown commerce facts must not match any active filter —
      // otherwise fabricated values would surface as false matches.
      if (selectedBrands.size > 0) {
        if (!listing.brand || !selectedBrands.has(listing.brand.toLowerCase())) return false;
      }
      if (selectedSizes.size > 0) {
        if (!listing.size || !selectedSizes.has(listing.size.toLowerCase())) return false;
      }
      if (browseFilters.condition !== 'Any') {
        if (!listing.condition || listing.condition !== browseFilters.condition) return false;
      }
      // Price range filter (GBP)
      if (browseFilters.priceMin != null && listing.price < browseFilters.priceMin) return false;
      if (browseFilters.priceMax != null && listing.price > browseFilters.priceMax) return false;
      return true;
    });

    const sorted = [...filtered];
    switch (browseFilters.sort) {
      case 'Price: Low to High':
        sorted.sort((a, b) => a.price - b.price);
        break;
      case 'Price: High to Low':
        sorted.sort((a, b) => b.price - a.price);
        break;
      case 'Newest':
        sorted.sort((a, b) => {
          const aDate = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const bDate = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return bDate - aDate;
        });
        break;
      case 'Most liked':
        sorted.sort((a, b) => b.likes - a.likes || b.score - a.score);
        break;
      case 'Recommended':
      default:
        // Server owns the order for "Recommended" when we have backend
        // search results — do not re-sort by the client-derived score.
        // The local-listings fallback (no backend results) still uses the
        // heuristic blended score since there is no server order to honor.
        if (!(normalizedQuery && backendSearchResults.length > 0)) {
          sorted.sort((a, b) => b.score - a.score || b.likes - a.likes);
        }
        break;
    }

    return sorted;
  }, [browseFilters.brands, browseFilters.condition, browseFilters.sizes, browseFilters.sort, browseFilters.priceMin, browseFilters.priceMax, rankedListings, listings, normalizedQuery, backendSearchResults]);

  discoverLenRef.current = discoverListings.length;

  // Layer 2: capture scroll offset on blur; Layer 3: restore on re-focus
  // when the list already has data.
  useFocusEffect(
    useCallback(() => {
      if (discoverLenRef.current > 0) {
        requestAnimationFrame(() => restoreScroll());
      }
      return () => captureScroll();
    }, [restoreScroll, captureScroll]),
  );

  // Layer 3: restore after data first arrives (covers cold load where the
  // list was empty at focus time).
  useEffect(() => {
    if (discoverListings.length > 0) {
      restoreScroll();
    }
  }, [discoverListings.length, restoreScroll]);

  useEffect(() => {
    focusProgress.value = withTiming(isSearchFocused ? 1 : 0, { duration: reducedMotion ? 0 : Motion.timing.focus });
  }, [focusProgress, isSearchFocused, reducedMotion]);

  const animatedSearchShellStyle = useAnimatedStyle(() => {
    // Subtle background shift on focus — matches Explore's clean field.
    // No border animation (Explore has no border); geometry stays constant
    // for a smooth transition from Explore to GlobalSearch.
    const backgroundColor = interpolateColor(
      focusProgress.value,
      [0, 1],
      [colors.surfaceAlt, colors.background],
    );
    return {
      backgroundColor,
      transform: [{ scale: 1 + focusProgress.value * 0.008 }] };
  });

  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [recentSearchesHydrated, setRecentSearchesHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setRecentSearches([]);
    setRecentSearchesHydrated(false);
    loadRecentSearchStrings(currentUser?.id)
      .then((loaded) => {
        if (cancelled) return;
        setRecentSearches(loaded.slice(0, 8));
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setRecentSearchesHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, [currentUser?.id]);

  const saveRecentSearch = (term: string) => {
    recordRecentSearch(term, currentUser?.id)
      .then((updated) => setRecentSearches(updated.map((e) => e.query)))
      .catch(() => undefined);
  };

  const handleClearRecentSearches = async () => {
    setRecentSearches([]);
    await clearRecentSearches(currentUser?.id);
  };

  // Live search suggestions ΓÇö derived from listing titles, brands, and categories
  // that partially match the current query. Shown as a dropdown while typing.
  // On-device matches are a truthful resilience layer, not the ranking
  // source. Production suggestions come from /search/autocomplete.
  const localSearchSuggestions = useMemo<SearchAutocompleteSuggestion[]>(() => {
    const partial = query.trim().toLowerCase();
    if (partial.length < 2 || !isSearchFocused) return [];

    const brandSet = new Set<string>();
    const categorySet = new Set<string>();
    const titleSet = new Set<string>();

    for (const listing of listings) {
      const brand = (listing.brand ?? '').trim();
      if (brand && brand.toLowerCase().includes(partial)) brandSet.add(brand);

      const category = (listing.category ?? '').trim();
      if (category && category.toLowerCase().includes(partial)) categorySet.add(category);

      const title = (listing.title ?? '').trim();
      if (title && title.toLowerCase().includes(partial)) titleSet.add(title);
    }

    const suggestions: SearchAutocompleteSuggestion[] = [];
    for (const brand of brandSet) suggestions.push({ text: brand, type: 'brand', score: 0 });
    for (const category of categorySet) suggestions.push({ text: category, type: 'category', score: 0 });
    for (const title of titleSet) suggestions.push({ text: title, type: 'item', score: 0 });

    // Also include matches from recent searches
    for (const recent of recentSearches) {
      if (recent.toLowerCase().includes(partial) && !suggestions.some((s) => s.text.toLowerCase() === recent.toLowerCase())) {
        suggestions.push({ text: recent, type: 'query', score: 0 });
      }
    }

    return suggestions.slice(0, 6);
  }, [query, isSearchFocused, listings, recentSearches]);

  const searchSuggestions = autocompleteSuggestions.length > 0
    ? autocompleteSuggestions
    : localSearchSuggestions;

  const visibleSearchSuggestions = searchSuggestions
    .filter((suggestion) => suggestion.text.trim().toLowerCase() !== normalizedQuery)
    .slice(0, 5);

  const handleSearchSubmit = () => {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) return;
    updateBrowseFilters({ query: trimmedQuery });
    saveRecentSearch(trimmedQuery);
    track('search_performed', { query: trimmedQuery, result_count: backendSearchResults.length });
    inputRef.current?.blur();
    setIsSearchFocused(false);
  };

  const handlePillPress = (tag: string) => {
    const normalizedTag = tag.trim();
    if (!normalizedTag) return;
    void saveRecentSearch(normalizedTag);
    setQuery(normalizedTag);
    updateBrowseFilters({ query: normalizedTag });
    inputRef.current?.blur();
    setIsSearchFocused(false);
  };

  // Category shortcut — navigates to Browse with the real categoryId so
  // BrowseScreen filters by listing.category (client-side) and passes the
  // category to the backend listings API. This is distinct from
  // handlePillPress (text search): category IDs like 'women' / 'men' are
  // structural filters, not free-text queries. Using handlePillPress here
  // was a front/back-end mismatch — it treated 'women' as a search term
  // instead of a category filter (AGENTS.md §11: truthful UI).
  const handleCategoryPress = (categoryId: string, label: string) => {
    const normalizedId = categoryId.trim();
    if (!normalizedId) return;
    // Clear any stale query so BrowseScreen does not mix text search with
    // category filtering.
    updateBrowseFilters({ query: '' });
    navigation.navigate('Browse', {
      categoryId: normalizedId,
      title: label });
  };

  const searchStatus = React.useMemo(
    () =>
      getBackendSyncStatus({
        isSyncing,
        source,
        hasError: Boolean(lastError || searchError),
        labels: {
          syncing: 'Refreshing index',
          live: 'Live index',
          error: 'Offline index',
          fallback: 'Cached index' } }),
    [isSyncing, lastError, searchError, source],
  );

  const showSearchLoadingSkeleton = isSyncing && listings.length === 0 && !lastError;

  const handleSelectSort = (sort: SearchSortOption) => {
    updateBrowseFilters({ sort, query: normalizedQuery });
    setIsSortSheetVisible(false);
  };

  const handleOpenFilter = () => {
    updateBrowseFilters({ query: normalizedQuery });
    navigation.navigate('Filter', {
      categoryId: 'search',
      title: 'Discover' });
  };

  const handleClearDiscoverFilters = () => {
    const preservedQuery = normalizedQuery;
    resetBrowseFilters();
    updateBrowseFilters({ query: preservedQuery });
  };

  const isCurrentQuerySaved = useMemo(() => {
    const normalized = normalizedQuery;
    return savedSearches.some((s) => s.query.trim().toLowerCase() === normalized);
  }, [savedSearches, normalizedQuery]);

  const handleSaveSearch = () => {
    const trimmed = query.trim();
    if (!trimmed) return;
    addSavedSearch({
      query: trimmed,
      filters: {
        brands: browseFilters.brands,
        sizes: browseFilters.sizes,
        condition: browseFilters.condition,
        sort: browseFilters.sort },
      alertsEnabled: true });
  };

  const handleRemoveSavedSearch = (id: string) => {
    removeSavedSearch(id);
  };

  const handleToggleAlerts = (id: string) => {
    toggleSavedSearchAlerts(id);
  };

  const handleSavedSearchPress = (searchQuery: string) => {
    setQuery(searchQuery);
    updateBrowseFilters({ query: searchQuery });
    void saveRecentSearch(searchQuery);
    inputRef.current?.blur();
    setIsSearchFocused(false);
  };

  const handleOpenRecommendation = (listingId: string) => {
    ProductAnalytics.itemView(listingId);
    navigation.push('ItemDetail', { itemId: listingId });
  };

  const handleOpenRecommendationSeller = (sellerId: string) => {
    openProfile(navigation, sellerId, currentUser?.id);
  };

  const handleMessageRecommendationSeller = (sellerId: string, listingId: string) => {
    navigation.navigate('Chat', {
      conversationId: `${sellerId}_${listingId}`,
      focusQuery: sellerId,
      partnerUserId: sellerId,
      itemId: listingId });
  };

  const renderSearchLoadingState = () => (
    <View style={styles.loadingStateWrap}>
      <View style={styles.loadingSection}>
        <SkeletonLoader width="32%" height={14} borderRadius={Radius.md} style={{ marginBottom: Space.smMd }} />
        <View style={styles.loadingTagsRow}>
          {Array.from({ length: 4 }).map((_, index) => (
            <SkeletonLoader key={`search_tag_loading_${index}`} width={96} height={36} borderRadius={Radius.xl} />
          ))}
        </View>
      </View>
      <View style={styles.loadingSection}>
        <SkeletonLoader width="44%" height={14} borderRadius={Radius.md} style={{ marginBottom: 14 }} />
        {Array.from({ length: 4 }).map((_, index) => (
          <View key={`search_recent_loading_${index}`} style={styles.loadingRecentRow}>
            <SkeletonLoader width={20} height={20} borderRadius={Radius.lg} />
            <SkeletonLoader width="62%" height={13} borderRadius={Radius.sm} style={{ marginLeft: Space.smMd }} />
          </View>
        ))}
      </View>
    </View>
  );

  // True masonry: assign each item to the shortest column by cumulative
  // height, matching the PinterestMasonryGrid strategy (audit §02 — one
  // masonry implementation). Uses the real mediaHeightRatio so column
  // balancing is deterministic and matches the final render.
  const { masonryColumn1, masonryColumn2 } = useMemo(() => {
    const col1: RankedListing[] = [];
    const col2: RankedListing[] = [];
    let h1 = 0;
    let h2 = 0;
    for (const listing of discoverListings) {
      const itemHeight = masonryColumnWidth * listing.mediaHeightRatio + 40; // 40 ≈ price overlay
      if (h1 <= h2) {
        col1.push(listing);
        h1 += itemHeight + 8; // 8 = gap
      } else {
        col2.push(listing);
        h2 += itemHeight + 8;
      }
    }
    return { masonryColumn1: col1, masonryColumn2: col2 };
  }, [discoverListings, masonryColumnWidth]);

  const isDiscoverLanding = !normalizedQuery;

  const t = StyleSheet.create({
    container: { backgroundColor: colors.background },
    inputContainer: { backgroundColor: colors.surfaceAlt },
    filterBarCount: { color: colors.textSecondary },
    filterIconBadge: { backgroundColor: colors.brand },
    filterIconBadgeText: { color: colors.textInverse },
    trendingFocusPill: { backgroundColor: colors.surface, borderColor: colors.border },
    trendingFocusText: { color: colors.textPrimary },
    savedSearchRow: { borderColor: colors.borderSubtle },
    savedSearchQuery: { color: colors.textPrimary },
    savedSearchMeta: { color: colors.textMuted },
    recoEmptyState: { borderColor: colors.border, backgroundColor: colors.surface },
    recoEmptyText: { color: colors.textSecondary },
    sortChip: { backgroundColor: colors.surfaceAlt },
    sortChipText: { color: colors.textPrimary },
    sortChipIcon: { color: colors.textSecondary },
    activeFilterChip: { backgroundColor: colors.surfaceAlt, borderColor: colors.border },
    activeFilterChipText: { color: colors.textPrimary },
    activeFilterChipIcon: { color: colors.textMuted },
    sortSheetTitle: { color: colors.textPrimary },
    sortSheetRow: { borderBottomColor: colors.border },
    resultOverlay: { backgroundColor: colors.overlay },
    resultPrice: { color: colors.surface } });

  return (
    <SafeAreaView style={[styles.container, t.container]} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />

      {/* Hero Search Header */}
      <View style={styles.header}>
        <AnimatedPressable style={styles.backBtn} onPress={() => navigation.goBack()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} accessibilityLabel="Go back" accessibilityRole="button">
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} aria-hidden={true} />
        </AnimatedPressable>

        <Reanimated.View style={[styles.inputContainer, t.inputContainer, animatedSearchShellStyle]}>
          <AppSearchBar
            ref={inputRef}
            placeholder="Search Thryftverse"
            value={query}
            onChangeText={setQuery}
            containerStyle={{ flex: 1, borderWidth: 0, backgroundColor: 'transparent' }}
            rightNode={
              <AnimatedPressable onPress={() => navigation.navigate('VisualSearch')} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} accessibilityLabel="Visual search" accessibilityRole="button">
                <Ionicons name="camera" size={24} color={colors.textMuted} aria-hidden={true} />
              </AnimatedPressable>
            }
            inputProps={{
              autoFocus: true,
              onSubmitEditing: handleSearchSubmit,
              onFocus: () => setIsSearchFocused(true),
              onBlur: () => setIsSearchFocused(false),
              returnKeyType: 'search',
              autoCapitalize: 'none',
              selectionColor: colors.brand }}
          />
        </Reanimated.View>
      </View>

      {query.length > 0 && (lastError || searchError) && (
        <View style={styles.statusPillWrap}>
          <SyncStatusPill {...searchStatus} />
        </View>
      )}

      <CommerceDetailOfflineBanner isOffline={isOffline} />

      <ScrollView
        ref={scrollRef}
        onScroll={onScroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 40 }}
      >
        {isSearchFocused && normalizedQuery.length >= 2 ? (
          <View style={styles.typeaheadSurface} accessibilityLiveRegion="polite">
            <AnimatedPressable
              style={[styles.typeaheadRow, styles.typeaheadSubmitRow, { borderBottomColor: colors.borderSubtle }]}
              onPress={handleSearchSubmit}
              accessibilityRole="button"
              accessibilityLabel={`View all results for ${query.trim()}`}
            >
              <Ionicons name="search" size={20} color={colors.textPrimary} aria-hidden={true} />
              <Text style={[styles.typeaheadSubmitText, { color: colors.textPrimary }]} numberOfLines={1}>
                Search for “{query.trim()}”
              </Text>
              <Ionicons name="arrow-forward" size={16} color={colors.textMuted} aria-hidden={true} />
            </AnimatedPressable>

            {isAutocompleteLoading && visibleSearchSuggestions.length === 0 ? (
              <View style={styles.typeaheadLoading} accessibilityLabel="Loading search suggestions">
                {Array.from({ length: 4 }).map((_, index) => (
                  <View key={`autocomplete_loading_${index}`} style={styles.typeaheadLoadingRow}>
                    <SkeletonLoader width={20} height={20} borderRadius={Radius.md} />
                    <SkeletonLoader width={`${62 - index * 6}%`} height={14} borderRadius={Radius.sm} />
                  </View>
                ))}
              </View>
            ) : (
              visibleSearchSuggestions.map((suggestion) => {
                const icon = suggestion.type === 'brand'
                  ? 'pricetag-outline'
                  : suggestion.type === 'category'
                    ? 'grid-outline'
                    : suggestion.type === 'item'
                      ? 'bag-handle-outline'
                      : 'search-outline';
                const kind = suggestion.type === 'brand'
                  ? 'Brand'
                  : suggestion.type === 'category'
                    ? 'Category'
                    : suggestion.type === 'item'
                      ? 'Item'
                      : 'Search';

                return (
                  <AnimatedPressable
                    key={`${suggestion.type}_${suggestion.text.toLowerCase()}`}
                    style={[styles.typeaheadRow, { borderBottomColor: colors.borderSubtle }]}
                    onPress={() => {
                      setQuery(suggestion.text);
                      inputRef.current?.blur();
                      const category = suggestion.type === 'category'
                        ? categoryShortcuts.find((candidate) =>
                            candidate.label.toLowerCase() === suggestion.text.toLowerCase()
                            || candidate.query.toLowerCase() === suggestion.text.toLowerCase())
                        : undefined;
                      if (category) {
                        handleCategoryPress(category.query, category.label);
                      } else {
                        handlePillPress(suggestion.text);
                      }
                    }}
                    accessibilityLabel={`${kind}: ${suggestion.text}`}
                    accessibilityHint="Searches the marketplace for this suggestion"
                    accessibilityRole="button"
                  >
                    <Ionicons name={icon} size={16} color={colors.textMuted} aria-hidden={true} />
                    <Text style={[styles.typeaheadText, { color: colors.textPrimary }]} numberOfLines={1}>
                      {suggestion.text}
                    </Text>
                    <Text style={[styles.typeaheadKind, { color: colors.textMuted }]}>{kind}</Text>
                  </AnimatedPressable>
                );
              })
            )}

            {!isAutocompleteLoading && visibleSearchSuggestions.length === 0 ? (
              <Text style={[styles.typeaheadStatus, { color: colors.textMuted }]}>
                {autocompleteError
                  ? 'Suggestions are unavailable. Press Search to continue.'
                  : 'No close suggestions. Press Search to see all matches.'}
              </Text>
            ) : autocompleteError && localSearchSuggestions.length > 0 ? (
              <Text style={[styles.typeaheadStatus, { color: colors.textMuted }]}>Showing matches available on this device</Text>
            ) : null}
          </View>
        ) : showSearchLoadingSkeleton ? (
          renderSearchLoadingState()
        ) : (
          <>
            {/* ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ DISCOVER LANDING (no query) ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ */}
            {isDiscoverLanding && (
              <>
                {/* ΓöÇΓöÇ FOCUS STATE: Clean recent + trending when search is focused ΓöÇΓöÇ */}
                {isSearchFocused ? (
                  <View style={styles.focusLanding}>
                    {!recentSearchesHydrated ? (
                      <View style={[styles.typeaheadLoading, styles.focusIntentList]} accessibilityLabel="Loading recent searches">
                        {Array.from({ length: 2 }).map((_, index) => (
                          <View key={`recent_loading_${index}`} style={styles.typeaheadLoadingRow}>
                            <SkeletonLoader width={20} height={20} borderRadius={Radius.md} />
                            <SkeletonLoader width={index === 0 ? '54%' : '42%'} height={14} borderRadius={Radius.sm} />
                          </View>
                        ))}
                      </View>
                    ) : null}
                    {/* Recent searches — tappable chips */}
                    {recentSearchesHydrated && recentSearches.length > 0 && (
                      <EditorialSection title="Recent">
                        <View style={styles.focusIntentList}>
                            {recentSearches.slice(0, 5).map((term) => (
                              <AnimatedPressable
                                key={term}
                                style={[styles.focusIntentRow, { borderBottomColor: colors.borderSubtle }]}
                                onPress={() => handlePillPress(term)}
                                accessibilityLabel={`Search again for ${term}`}
                                accessibilityRole="button"
                              >
                                <Ionicons name="time-outline" size={16} color={colors.textMuted} aria-hidden={true} />
                                <Text style={[styles.focusIntentText, { color: colors.textPrimary }]} numberOfLines={1}>{term}</Text>
                                <Ionicons name="arrow-forward" size={16} color={colors.textMuted} aria-hidden={true} />
                              </AnimatedPressable>
                            ))}
                          <AnimatedPressable
                            style={styles.focusClearRow}
                            onPress={handleClearRecentSearches}
                            accessibilityLabel="Clear recent searches"
                            accessibilityRole="button"
                          >
                            <Text style={[styles.clearRecentText, { color: colors.textMuted }]}>Clear all</Text>
                          </AnimatedPressable>
                        </View>
                      </EditorialSection>
                    )}

                    {/* Empty search prompt — when focused with no query and no recent searches */}
                    {/* Saved searches with alerts */}
                    {savedSearches.length > 0 && (
                      <EditorialSection
                        title="Saved searches"
                        onSearchPress={() => navigation.navigate('SavedSearches')}
                      >
                        <View style={styles.savedSearchListWrap}>
                          {savedSearches.slice(0, 3).map((search) => (
                            <View key={search.id} style={[styles.savedSearchRow, t.savedSearchRow]}>
                              <AnimatedPressable
                                style={styles.savedSearchMain}
                                onPress={() => handleSavedSearchPress(search.query)}
                                accessibilityLabel={`Search for ${search.query}`}
                                accessibilityRole="button"
                              >
                                <Ionicons
                                  name={search.alertsEnabled ? 'notifications' : 'bookmark-outline'}
                                  size={18}
                                  color={search.alertsEnabled ? colors.brand : colors.textMuted}
                                  aria-hidden={true}
                                />
                                <View style={styles.savedSearchTextWrap}>
                                  <Text style={[styles.savedSearchQuery, t.savedSearchQuery]} numberOfLines={1}>{search.query}</Text>
                                  {search.alertsEnabled ? (
                                    <Text style={[styles.savedSearchMeta, t.savedSearchMeta]}>Alerts on</Text>
                                  ) : null}
                                </View>
                              </AnimatedPressable>
                            </View>
                          ))}
                        </View>
                      </EditorialSection>
                    )}

                    {/* Trending categories — 2-column visual grid with icons */}
                    <EditorialSection title="Browse categories">
                      <View style={styles.categoryGridWrap}>
                        {categoryShortcuts.slice(0, 6).map((cat) => (
                          <AnimatedPressable
                            key={cat.query}
                            style={[styles.categoryGridCard, { borderBottomColor: colors.borderSubtle }]}
                            onPress={() => handleCategoryPress(cat.query, cat.label)}
                            accessibilityLabel={`Browse ${cat.label} category`}
                            accessibilityRole="button"
                          >
                            <Ionicons name={cat.icon as keyof typeof Ionicons.glyphMap} size={18} color={colors.textMuted} aria-hidden={true} />
                            <Text style={[styles.categoryGridLabel, { color: colors.textPrimary }]} numberOfLines={1}>{cat.label}</Text>
                          </AnimatedPressable>
                        ))}
                      </View>
                    </EditorialSection>
                  </View>
                ) : (
                <>
                {/* Conversational AI Search pill — gated by the
                    conversational_search feature flag. Additive entry
                    point; absent when the flag is off (current behaviour).
                    Opens the natural-language search surface. */}
                {conversationalSearchEnabled ? (
                  <View style={styles.aiSearchPillWrap}>
                    <AnimatedPressable
                      style={[styles.aiSearchPill, { borderColor: colors.brandBorder, backgroundColor: colors.brandSubtle }]}
                      onPress={() => navigation.navigate('ConversationalSearch')}
                      accessibilityRole="button"
                      accessibilityLabel="AI Search — search in natural language"
                      accessibilityHint="Opens conversational AI search"
                    >
                      <Ionicons name="chatbubble-ellipses-outline" size={16} color={colors.brand} aria-hidden={true} />
                      <Text style={[styles.aiSearchPillText, { color: colors.brand }]}>Ask AI Search</Text>
                      <Ionicons name="arrow-forward" size={14} color={colors.brand} aria-hidden={true} />
                    </AnimatedPressable>
                  </View>
                ) : null}

                {/* Discover masonry grid — media first, scaffolds secondary */}
                <EditorialSection
                  title="Discover"
                  onSearchPress={handleSearchSubmit}
                >
                  {discoverListings.length > 0 ? (
                    <View style={styles.masonryGrid}>
                      <View style={styles.masonryColumn}>
                        {masonryColumn1.map((listing) => (
                          <AnimatedPressable
                            key={listing.id}
                            style={styles.masonryItemWrap}
                            onPress={() => handleOpenRecommendation(listing.id)}
                            accessibilityLabel={`${listing.title}, ${formatFromFiat(listing.price, currencyCode, { displayMode: 'fiat' })}`}
                            accessibilityRole="button"
                          >
                            <SharedTransitionView sharedTransitionTag={`image-${listing.id}-0`}>
                              <CachedImage
                                uri={listing.image}
                                style={[styles.masonryImg, { height: Math.round(masonryColumnWidth * listing.mediaHeightRatio) }]}
                                contentFit="cover"
                              />
                            </SharedTransitionView>
                            <View style={[styles.resultOverlay, t.resultOverlay]}>
                              <Text style={[styles.resultPrice, t.resultPrice]}>{formatFromFiat(listing.price, currencyCode, { displayMode: 'fiat' })}</Text>
                            </View>
                          </AnimatedPressable>
                        ))}
                      </View>
                      <View style={styles.masonryColumn}>
                        {masonryColumn2.map((listing) => (
                          <AnimatedPressable
                            key={listing.id}
                            style={styles.masonryItemWrap}
                            onPress={() => handleOpenRecommendation(listing.id)}
                            accessibilityLabel={`${listing.title}, ${formatFromFiat(listing.price, currencyCode, { displayMode: 'fiat' })}`}
                            accessibilityRole="button"
                          >
                            <SharedTransitionView sharedTransitionTag={`image-${listing.id}-0`}>
                              <CachedImage
                                uri={listing.image}
                                style={[styles.masonryImg, { height: Math.round(masonryColumnWidth * listing.mediaHeightRatio) }]}
                                contentFit="cover"
                              />
                            </SharedTransitionView>
                            <View style={[styles.resultOverlay, t.resultOverlay]}>
                              <Text style={[styles.resultPrice, t.resultPrice]}>{formatFromFiat(listing.price, currencyCode, { displayMode: 'fiat' })}</Text>
                            </View>
                          </AnimatedPressable>
                        ))}
                      </View>
                    </View>
                  ) : (
                    <View style={[styles.recoEmptyState, t.recoEmptyState]}>
                      <Ionicons name="images-outline" size={18} color={colors.textMuted} aria-hidden={true} />
                      <Text style={[styles.recoEmptyText, t.recoEmptyText]}>
                        {hasActiveDiscoverFilters
                          ? 'No picks match your current filters. Adjust or clear them.'
                          : 'No ranked results yet. Try a shorter keyword.'}
                      </Text>
                    </View>
                  )}
                </EditorialSection>

                {/* Recent searches — compact rows */}
                {recentSearches.length > 0 && (
                  <EditorialSection title="Recent searches">
                    <View style={styles.recentRowsWrap}>
                      {recentSearches.map((term, idx) => (
                        <AnimatedPressable
                          key={idx}
                          style={styles.recentRow}
                          onPress={() => handlePillPress(term)}
                          accessibilityLabel={`Search for ${term}`}
                          accessibilityRole="button"
                        >
                          <Ionicons name="time-outline" size={16} color={colors.textMuted} aria-hidden={true} />
                          <Text style={styles.recentRowText} numberOfLines={1}>{term}</Text>
                          <Ionicons name="arrow-forward" size={14} color={colors.textMuted} aria-hidden={true} />
                        </AnimatedPressable>
                      ))}
                      <AnimatedPressable
                        style={[styles.recentRow, { justifyContent: 'center' }]}
                        onPress={handleClearRecentSearches}
                        accessibilityLabel="Clear recent searches"
                        accessibilityRole="button"
                      >
                        <Text style={[styles.recentRowText, { color: colors.textMuted, fontFamily: FontFamily.medium }]}>Clear all</Text>
                      </AnimatedPressable>
                    </View>
                  </EditorialSection>
                )}

                {/* Saved searches with alerts */}
                {savedSearches.length > 0 && (
                  <EditorialSection
                    title="Saved searches"
                    onSearchPress={() => navigation.navigate('SavedSearches')}
                  >
                    <View style={styles.savedSearchListWrap}>
                      {savedSearches.map((search) => (
                        <View key={search.id} style={[styles.savedSearchRow, t.savedSearchRow]}>
                          <AnimatedPressable
                            style={styles.savedSearchMain}
                            onPress={() => handleSavedSearchPress(search.query)}
                            accessibilityLabel={`Search for ${search.query}`}
                            accessibilityRole="button"
                          >
                            <Ionicons
                              name={search.alertsEnabled ? 'notifications' : 'bookmark-outline'}
                              size={18}
                              color={search.alertsEnabled ? colors.brand : colors.textMuted}
                              aria-hidden={true}
                            />
                            <View style={styles.savedSearchTextWrap}>
                              <Text style={[styles.savedSearchQuery, t.savedSearchQuery]} numberOfLines={1}>{search.query}</Text>
                              <Text style={[styles.savedSearchMeta, t.savedSearchMeta]}>
                                {search.alertsEnabled ? 'Alerts on' : 'Alerts off'}
                                {search.lastMatchCount != null && search.lastMatchCount > 0
                                  ? ` ┬╖ ${search.lastMatchCount} new`
                                  : ''}
                              </Text>
                            </View>
                          </AnimatedPressable>
                          <AnimatedPressable
                            style={styles.savedSearchToggle}
                            onPress={() => handleToggleAlerts(search.id)}
                            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                            accessibilityLabel={search.alertsEnabled ? 'Disable alerts' : 'Enable alerts'}
                            accessibilityRole="button"
                          >
                            <Ionicons
                              name={search.alertsEnabled ? 'notifications' : 'notifications-off-outline'}
                              size={18}
                              color={search.alertsEnabled ? colors.brand : colors.textMuted}
                              aria-hidden={true}
                            />
                          </AnimatedPressable>
                          <AnimatedPressable
                            style={styles.savedSearchRemove}
                            onPress={() => handleRemoveSavedSearch(search.id)}
                            accessibilityLabel="Remove saved search"
                            accessibilityRole="button"
                          >
                            <Ionicons name="close" size={16} color={colors.textMuted} aria-hidden={true} />
                          </AnimatedPressable>
                        </View>
                      ))}
                    </View>
                  </EditorialSection>
                )}

                {/* Suggested categories — canonical category tree, no editorial seed */}
                <EditorialSection title="Categories">
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.trendingFocusScroll}>
                    {categoryShortcuts.map((cat, idx) => (
                      <AnimatedPressable
                        key={idx}
                        style={[styles.trendingFocusPill, t.trendingFocusPill]}
                        onPress={() => handleCategoryPress(cat.query, cat.label)}
                        accessibilityLabel={`Browse ${cat.label} category`}
                        accessibilityRole="button"
                      >
                        <Ionicons name={cat.icon as keyof typeof Ionicons.glyphMap} size={16} color={colors.brand} aria-hidden={true} />
                        <Text style={[styles.trendingFocusText, t.trendingFocusText]}>{cat.label}</Text>
                      </AnimatedPressable>
                    ))}
                  </ScrollView>
                </EditorialSection>
                </>
                )}
              </>
            )}

            {/* ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ SEARCH RESULTS (query entered) ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ */}
            {!isDiscoverLanding && (
              <>
                {(lastError || searchError) ? (
                  <SyncRetryBanner
                    message={searchError ? friendlyBackendError(searchError) : 'Search index is delayed. Showing cached results.'}
                    onRetry={() => {
                      if (searchError) {
                        setSearchRetryVersion((version) => version + 1);
                      } else {
                        void refreshListings();
                      }
                    }}
                    isRetrying={isSyncing || isSearching}
                    telemetryContext="global_search_sync"
                    containerStyle={{ marginHorizontal: 20, marginBottom: Space.smMd }}
                  />
                ) : null}

                {isSearching && searchScope === 'items' && (
                  <View style={{ paddingHorizontal: 20, marginBottom: Space.sm }}>
                    <SkeletonLoader width="40%" height={14} borderRadius={Radius.md} />
                  </View>
                )}

                {/* Scope tabs — Items | People with result counts */}
                <View style={[styles.scopeTabBar, { borderBottomColor: colors.borderSubtle }]} accessibilityRole="tablist">
                  {(['items', 'people'] as const).map((scope) => {
                    const isActive = searchScope === scope;
                    const label = scope === 'items' ? 'Items' : 'People';
                    const count = scope === 'items'
                      ? discoverListings.length
                      : peopleResults.length;
                    const isLoading = scope === 'items'
                      ? isSearching
                      : isSearchingPeople;
                    return (
                      <AnimatedPressable
                        key={scope}
                        style={styles.scopeTab}
                        onPress={() => setSearchScope(scope)}
                        accessibilityLabel={`${label} tab${count > 0 ? `, ${count} results` : ''}`}
                        accessibilityRole="tab"
                        accessibilityState={{ selected: isActive }}
                      >
                        <View style={styles.scopeTabLabelRow}>
                          <Text style={[
                            styles.scopeTabText,
                            { color: isActive ? colors.textPrimary : colors.textMuted },
                            isActive && { fontFamily: FontFamily.semibold },
                          ]}>
                            {label}
                          </Text>
                          {count > 0 && !isLoading && (
                            <Text style={[styles.scopeTabCount, { color: colors.textMuted }]}>
                              {count}
                            </Text>
                          )}
                        </View>
                        {isActive && (
                          <View style={[styles.scopeTabIndicator, { backgroundColor: colors.textPrimary }]} />
                        )}
                      </AnimatedPressable>
                    );
                  })}
                </View>

                {/* People results */}
                {searchScope === 'people' && (
                  <View style={styles.sectionWrap}>
                    {isSearchingPeople ? (
                      <View style={styles.peopleResultsList}>
                        {[0, 1, 2].map((i) => (
                          <View key={`people-skel-${i}`} style={[peopleRowStyles.row, { borderBottomColor: colors.border }]}>
                            <SkeletonLoader width={44} height={44} borderRadius={Radius.xxl} />
                            <View style={{ flex: 1, gap: Space.xs }}>
                              <SkeletonLoader width="50%" height={14} borderRadius={Radius.md} />
                              <SkeletonLoader width="30%" height={12} borderRadius={Radius.sm} />
                            </View>
                          </View>
                        ))}
                      </View>
                    ) : peopleSearchError ? (
                      <EmptyState
                        density="compact"
                        icon="cloud-offline-outline"
                        iconColor={colors.danger}
                        title="People search unavailable"
                        subtitle={peopleSearchError}
                        ctaLabel="Retry"
                        onCtaPress={() => setPeopleSearchRetryVersion((version) => version + 1)}
                      />
                    ) : peopleResults.length > 0 ? (
                      <View style={styles.peopleResultsList}>
                        {peopleResults.map((user) => (
                          <PeopleResultRow
                            key={user.id}
                            user={user}
                            onPress={() => openProfile(navigation, user.id, currentUser?.id)}
                            colors={colors}
                          />
                        ))}
                      </View>
                    ) : (
                      <View style={[styles.noResultsState, { borderColor: colors.border }]}>
                        <Ionicons name="people-outline" size={22} color={colors.textMuted} aria-hidden={true} />
                        <Text style={[styles.noResultsTitle, { color: colors.textPrimary }]}>
                          No people found for "{query.trim()}"
                        </Text>
                        <Text style={[styles.noResultsSubtitle, { color: colors.textSecondary }]}>
                          Try a different name or username.
                        </Text>
                      </View>
                    )}
                  </View>
                )}

                {/* Sort + Filter bar — only for Items scope */}
                {searchScope === 'items' && (
                <>
                {/* Sort chip + Filter — recognition over recall: current sort is always visible */}
                <View style={styles.filterBar}>
                  <Text style={[styles.filterBarCount, t.filterBarCount]} numberOfLines={1}>
                    {discoverListings.length} {discoverListings.length === 1 ? 'result' : 'results'}
                  </Text>
                  <View style={styles.filterBarActions}>
                    <AnimatedPressable
                      style={[styles.sortChip, t.sortChip]}
                      onPress={() => setIsSortSheetVisible(true)}
                      accessibilityLabel={`Sort by ${browseFilters.sort}. Tap to change sort order.`}
                      accessibilityRole="button"
                    >
                      <Ionicons name="swap-vertical" size={14} color={colors.textSecondary} aria-hidden={true} />
                      <Text style={[styles.sortChipText, t.sortChipText]} numberOfLines={1}>
                        {browseFilters.sort}
                      </Text>
                    </AnimatedPressable>
                    <AnimatedPressable
                      style={styles.filterIconBtn}
                      onPress={handleOpenFilter}
                      accessibilityLabel={activeFilterCount > 0 ? `Open filters, ${activeFilterCount} active` : 'Open filters'}
                      accessibilityRole="button"
                    >
                      <Ionicons name="options-outline" size={20} color={colors.textPrimary} aria-hidden={true} />
                      {activeFilterCount > 0 && (
                        <View style={[styles.filterIconBadge, t.filterIconBadge]}>
                          <Text style={[styles.filterIconBadgeText, t.filterIconBadgeText]}>{activeFilterCount}</Text>
                        </View>
                      )}
                    </AnimatedPressable>
                    {normalizedQuery && (
                      <AnimatedPressable
                        style={[
                          styles.filterIconBtn,
                          isCurrentQuerySaved && { backgroundColor: colors.surfaceAlt },
                        ]}
                        onPress={isCurrentQuerySaved ? undefined : handleSaveSearch}
                        accessibilityLabel={isCurrentQuerySaved ? 'Search saved with alerts' : 'Save this search with alerts'}
                        accessibilityRole="button"
                      >
                        <Ionicons
                          name={isCurrentQuerySaved ? 'notifications' : 'notifications-outline'}
                          size={20}
                          color={isCurrentQuerySaved ? colors.brand : colors.textPrimary}
                          aria-hidden={true}
                        />
                      </AnimatedPressable>
                    )}
                  </View>
                </View>

                {/* Active filter chips — removable, no need to reopen FilterScreen */}
                {activeFilterCount > 0 && (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.activeFilterChipsRow}
                  >
                    {browseFilters.brands.map((brand) => (
                      <AnimatedPressable
                        key={`brand-${brand}`}
                        style={[styles.activeFilterChip, t.activeFilterChip]}
                        onPress={() => updateBrowseFilters({ brands: browseFilters.brands.filter((b) => b !== brand) })}
                        accessibilityLabel={`Remove brand filter: ${brand}`}
                        accessibilityRole="button"
                      >
                        <Text style={[styles.activeFilterChipText, t.activeFilterChipText]} numberOfLines={1}>{brand}</Text>
                        <Ionicons name="close-circle" size={14} color={colors.textMuted} aria-hidden={true} />
                      </AnimatedPressable>
                    ))}
                    {browseFilters.sizes.map((size) => (
                      <AnimatedPressable
                        key={`size-${size}`}
                        style={[styles.activeFilterChip, t.activeFilterChip]}
                        onPress={() => updateBrowseFilters({ sizes: browseFilters.sizes.filter((s) => s !== size) })}
                        accessibilityLabel={`Remove size filter: ${size}`}
                        accessibilityRole="button"
                      >
                        <Text style={[styles.activeFilterChipText, t.activeFilterChipText]} numberOfLines={1}>Size: {size}</Text>
                        <Ionicons name="close-circle" size={14} color={colors.textMuted} aria-hidden={true} />
                      </AnimatedPressable>
                    ))}
                    {browseFilters.condition !== 'Any' && (
                      <AnimatedPressable
                        style={[styles.activeFilterChip, t.activeFilterChip]}
                        onPress={() => updateBrowseFilters({ condition: 'Any' })}
                        accessibilityLabel={`Remove condition filter: ${browseFilters.condition}`}
                        accessibilityRole="button"
                      >
                        <Text style={[styles.activeFilterChipText, t.activeFilterChipText]} numberOfLines={1}>{browseFilters.condition}</Text>
                        <Ionicons name="close-circle" size={14} color={colors.textMuted} aria-hidden={true} />
                      </AnimatedPressable>
                    )}
                    {browseFilters.priceMin != null && (
                      <AnimatedPressable
                        style={[styles.activeFilterChip, t.activeFilterChip]}
                        onPress={() => updateBrowseFilters({ priceMin: null })}
                        accessibilityLabel="Remove minimum price filter"
                        accessibilityRole="button"
                      >
                        <Text style={[styles.activeFilterChipText, t.activeFilterChipText]} numberOfLines={1}>Min {currencySymbol}{browseFilters.priceMin}</Text>
                        <Ionicons name="close-circle" size={14} color={colors.textMuted} aria-hidden={true} />
                      </AnimatedPressable>
                    )}
                    {browseFilters.priceMax != null && (
                      <AnimatedPressable
                        style={[styles.activeFilterChip, t.activeFilterChip]}
                        onPress={() => updateBrowseFilters({ priceMax: null })}
                        accessibilityLabel="Remove maximum price filter"
                        accessibilityRole="button"
                      >
                        <Text style={[styles.activeFilterChipText, t.activeFilterChipText]} numberOfLines={1}>Max {currencySymbol}{browseFilters.priceMax}</Text>
                        <Ionicons name="close-circle" size={14} color={colors.textMuted} aria-hidden={true} />
                      </AnimatedPressable>
                    )}
                  </ScrollView>
                )}

                {/* Masonry grid */}
                <View style={styles.sectionWrap}>
                  {discoverListings.length > 0 ? (
                    <View style={styles.masonryGrid}>
                      <View style={styles.masonryColumn}>
                        {masonryColumn1.map((listing) => (
                          <AnimatedPressable
                            key={listing.id}
                            style={styles.masonryItemWrap}
                            onPress={() => handleOpenRecommendation(listing.id)}
                            accessibilityLabel={`${listing.title}, ${formatFromFiat(listing.price, currencyCode, { displayMode: 'fiat' })}`}
                            accessibilityRole="button"
                          >
                            <SharedTransitionView sharedTransitionTag={`image-${listing.id}-0`}>
                              <CachedImage
                                uri={listing.image}
                                style={[styles.masonryImg, { height: Math.round(masonryColumnWidth * listing.mediaHeightRatio) }]}
                                contentFit="cover"
                              />
                            </SharedTransitionView>
                            <View style={[styles.resultOverlay, t.resultOverlay]}>
                              <Text style={[styles.resultPrice, t.resultPrice]}>{formatFromFiat(listing.price, currencyCode, { displayMode: 'fiat' })}</Text>
                            </View>
                          </AnimatedPressable>
                        ))}
                      </View>
                      <View style={styles.masonryColumn}>
                        {masonryColumn2.map((listing) => (
                          <AnimatedPressable
                            key={listing.id}
                            style={styles.masonryItemWrap}
                            onPress={() => handleOpenRecommendation(listing.id)}
                            accessibilityLabel={`${listing.title}, ${formatFromFiat(listing.price, currencyCode, { displayMode: 'fiat' })}`}
                            accessibilityRole="button"
                          >
                            <SharedTransitionView sharedTransitionTag={`image-${listing.id}-0`}>
                              <CachedImage
                                uri={listing.image}
                                style={[styles.masonryImg, { height: Math.round(masonryColumnWidth * listing.mediaHeightRatio) }]}
                                contentFit="cover"
                              />
                            </SharedTransitionView>
                            <View style={[styles.resultOverlay, t.resultOverlay]}>
                              <Text style={[styles.resultPrice, t.resultPrice]}>{formatFromFiat(listing.price, currencyCode, { displayMode: 'fiat' })}</Text>
                            </View>
                          </AnimatedPressable>
                        ))}
                      </View>
                    </View>
                  ) : isSearching ? (
                    <View style={styles.masonryGrid} accessibilityLabel="Searching items">
                      {[0, 1].map((column) => (
                        <View key={`search_result_column_${column}`} style={styles.masonryColumn}>
                          {[196, 244, 216].map((height, index) => (
                            <SkeletonLoader
                              key={`search_result_${column}_${index}`}
                              width="100%"
                              height={height + (column === 1 && index === 0 ? 28 : 0)}
                              borderRadius={Radius.md}
                              style={{ marginBottom: Space.xs }}
                            />
                          ))}
                        </View>
                      ))}
                    </View>
                  ) : searchError ? (
                    <EmptyState
                      density="compact"
                      icon="cloud-offline-outline"
                      iconColor={colors.danger}
                      title="Search unavailable"
                      subtitle={friendlyBackendError(searchError)}
                      ctaLabel="Retry search"
                      onCtaPress={() => {
                        setSearchRetryVersion((version) => version + 1);
                      }}
                    />
                  ) : (
                    <View style={[styles.noResultsState, { borderColor: colors.border }]}>
                      <Ionicons name="search-outline" size={22} color={colors.textMuted} aria-hidden={true} />
                      <Text style={[styles.noResultsTitle, { color: colors.textPrimary }]}>
                        {hasActiveDiscoverFilters
                          ? `No matches for "${query.trim()}" with these filters`
                          : `No matches for "${query.trim()}"`}
                      </Text>
                      <Text style={[styles.noResultsSubtitle, { color: colors.textSecondary }]}>
                        {isSearching
                          ? 'Searching the indexΓÇª'
                          : hasActiveDiscoverFilters
                            ? 'Try clearing your filters or broadening your search.'
                            : (() => {
                                const suggestions = getBroadenedSuggestions(query, categoryShortcuts.map((c) => c.query));
                                return `Try ${suggestions.map((s) => `"${s}"`).join(' or ')} ΓÇö or browse all categories.`;
                              })()}
                      </Text>
                      <View style={styles.noResultsActions}>
                        {hasActiveDiscoverFilters && !isSearching && (
                          <AnimatedPressable
                            style={[styles.noResultsPrimaryCta, { backgroundColor: colors.textPrimary }]}
                            onPress={handleClearDiscoverFilters}
                            accessibilityRole="button"
                            accessibilityLabel="Clear all filters"
                          >
                            <Text style={[styles.noResultsPrimaryCtaText, { color: colors.textInverse }]}>Clear filters</Text>
                          </AnimatedPressable>
                        )}
                        {!isSearching && (
                          <AnimatedPressable
                            style={[styles.noResultsSecondaryCta, { borderColor: colors.border }]}
                            onPress={() => {
                              setQuery('');
                              navigation.navigate('Browse', { categoryId: 'all', title: 'Browse all' });
                            }}
                            accessibilityRole="button"
                            accessibilityLabel="Browse all categories"
                          >
                            <Text style={[styles.noResultsSecondaryCtaText, { color: colors.textPrimary }]}>Browse all</Text>
                          </AnimatedPressable>
                        )}
                      </View>
                      {/* Suggested categories — tappable chips for recovery */}
                      {!isSearching && !hasActiveDiscoverFilters && (
                        <View style={styles.noResultsCategories}>
                          <Text style={[styles.noResultsCategoriesLabel, { color: colors.textMuted }]}>
                            Browse by category
                          </Text>
                          <View style={styles.noResultsCategoryChips}>
                            {categoryShortcuts.slice(0, 4).map((cat, idx) => (
                              <AnimatedPressable
                                key={idx}
                                style={[styles.recentChip, { backgroundColor: colors.surfaceAlt }]}
                                onPress={() => {
                                  setQuery('');
                                  handleCategoryPress(cat.query, cat.label);
                                }}
                                accessibilityLabel={`Browse ${cat.label} category`}
                                accessibilityRole="button"
                              >
                                <Ionicons name={cat.icon as keyof typeof Ionicons.glyphMap} size={12} color={colors.brand} aria-hidden={true} />
                                <Text style={styles.recentChipText} numberOfLines={1}>{cat.label}</Text>
                              </AnimatedPressable>
                            ))}
                          </View>
                        </View>
                      )}
                    </View>
                  )}
                </View>
                </>
                )}
              </>
            )}
          </>
        )}
      </ScrollView>

      {/* Sort sheet — labeled options, recognition over recall */}
      <BottomSheet
        visible={isSortSheetVisible}
        onDismiss={() => setIsSortSheetVisible(false)}
        snapPoint={0.4}
      >
        <View style={styles.sortSheetContent}>
          <Text style={[styles.sortSheetTitle, t.sortSheetTitle]}>Sort by</Text>
          {DISCOVER_SORT_OPTIONS.map((option) => {
            const isActive = browseFilters.sort === option;
            return (
              <Pressable
                key={option}
                style={({ pressed }) => [
                  styles.sortSheetRow,
                  t.sortSheetRow,
                  isActive && { backgroundColor: colors.brandSubtle },
                  pressed && { opacity: 0.6 },
                ]}
                onPress={() => handleSelectSort(option)}
                accessibilityRole="button"
                accessibilityLabel={`Sort by ${option}`}
                accessibilityState={{ selected: isActive }}
              >
                <Text
                  style={[
                    styles.sortSheetRowText,
                    { color: isActive ? colors.brand : colors.textPrimary },
                    isActive && { fontFamily: FontFamily.semibold },
                  ]}
                >
                  {option}
                </Text>
                {isActive ? (
                  <Ionicons name="checkmark" size={18} color={colors.brand} aria-hidden={true} />
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </BottomSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1 },

  // Conversational AI Search pill — additive entry point gated by the
  // conversational_search feature flag. A hairline-bordered pill with a
  // chatbubble icon so it reads as a conversational search mode, not magic decoration.
  // Brand-tinted colours are applied inline (static styles can't see theme).
  aiSearchPillWrap: {
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    paddingBottom: Space.xs },
  aiSearchPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    height: Control.hit,
    paddingHorizontal: Space.md,
    borderRadius: Radius.xl,
    borderWidth: Stroke.hairline },
  aiSearchPillText: {
    flex: 1,
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: FontFamily.semibold },

  // Header — geometry matches Explore's search field for smooth transition.
  // Explore uses: surfaceAlt background, Radius.lg, Control.hit minHeight,
  // search icon inside, no border. GlobalSearch mirrors this and adds the
  // back button + visual search icon inside the field.
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    paddingBottom: Space.smMd,
    gap: Space.smMd },
  backBtn: {
    width: Control.hit,
    height: Control.hit,
    alignItems: 'center',
    justifyContent: 'center' },
  inputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.lg,
    borderWidth: 0,
    borderColor: 'transparent',
    paddingHorizontal: Space.md,
    paddingVertical: 0,
    minHeight: 48 },
  statusPillWrap: {
    paddingHorizontal: 20,
    marginBottom: Space.sm },

  // Focused typeahead is part of the page, not a floating card. The flat
  // rows keep the search field as the only persistent contained surface.
  typeaheadSurface: {
    paddingHorizontal: Space.md },
  typeaheadRow: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.smMd,
    borderBottomWidth: StyleSheet.hairlineWidth },
  typeaheadSubmitRow: {
    minHeight: 58 },
  typeaheadSubmitText: {
    flex: 1,
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: FontFamily.semibold },
  typeaheadText: {
    flex: 1,
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: FontFamily.regular },
  typeaheadKind: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.medium },
  typeaheadLoading: {
    paddingTop: Space.xs },
  typeaheadLoadingRow: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.smMd },
  typeaheadStatus: {
    paddingTop: Space.md,
    fontSize: TypographyV2.meta.size,
    lineHeight: 19,
    fontFamily: FontFamily.regular },

  // Loading
  loadingStateWrap: {
    paddingTop: Space.md,
    paddingHorizontal: 20 },
  loadingSection: {
    marginBottom: 28 },
  loadingTagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10 },
  loadingRecentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Space.smMd },

  // Sections
  sectionWrap: {
    paddingHorizontal: 20,
    marginBottom: 28 },

  // Recent searches — tappable chips (focus state)
  focusLanding: {
    paddingTop: Space.xs },
  focusIntentList: {
    paddingHorizontal: Space.md },
  focusIntentRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.smMd,
    borderBottomWidth: StyleSheet.hairlineWidth },
  focusIntentText: {
    flex: 1,
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: FontFamily.regular },
  focusClearRow: {
    minHeight: Control.hit,
    justifyContent: 'center',
    alignSelf: 'flex-start' },
  recentChipsWrap: {
    paddingHorizontal: Space.md,
    gap: Space.sm },
  recentChipsScroll: {
    gap: Space.xs + 2 },
  recentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    paddingHorizontal: Space.sm + 2,
    paddingVertical: Space.xs + 2,
    borderRadius: Radius.full,
    minHeight: Control.chrome },
  recentChipText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.medium },
  clearRecentBtn: {
    alignSelf: 'flex-start',
    paddingVertical: Space.xs },
  clearRecentText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.medium },

  // Recent searches — compact rows (resting state)
  recentRowsWrap: {
    paddingHorizontal: Space.md,
    gap: 0 },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.sm + 2,
    borderBottomWidth: StyleSheet.hairlineWidth },
  recentRowText: {
    flex: 1,
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: FontFamily.regular },

  // Empty search prompt
  emptySearchPrompt: {
    alignItems: 'center',
    paddingVertical: Space.xxl,
    gap: Space.sm + 2 },
  emptySearchPromptText: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: FontFamily.regular,
    textAlign: 'center' },

  // Category visual grid — 2-column
  categoryGridWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: Space.md,
    columnGap: Space.md },
  categoryGridCard: {
    width: '46%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    minHeight: 48,
    borderBottomWidth: StyleSheet.hairlineWidth },
  categoryGridLabel: {
    flex: 1,
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: FontFamily.medium },

  // Focus state — trending pills (horizontal scroll with category icons)
  trendingFocusScroll: {
    paddingHorizontal: Space.md,
    gap: 10 },
  trendingFocusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: RadiusRoleValue.compactControl,
    borderWidth: Stroke.standard },
  trendingFocusText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.medium },

  // Filter bar — single icons, not a wall of chips
  filterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    paddingBottom: Space.smMd },
  filterBarCount: {
    flex: 1,
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.medium,
    fontVariant: ['tabular-nums'] },
  filterBarActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs },
  filterIconBtn: {
    width: Control.hit,
    height: Control.hit,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative' },
  filterIconBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    minWidth: 16,
    height: 16,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Space.xs },
  filterIconBadgeText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.bold,
    lineHeight: TypographyV2.meta.lineHeight },

  // Sort chip — labeled, always shows current sort
  sortChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs,
    borderRadius: Radius.lg },
  sortChipText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.medium },

  // Active filter chips — removable
  activeFilterChipsRow: {
    paddingHorizontal: Space.md,
    paddingBottom: Space.sm,
    gap: Space.xs },
  activeFilterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs + 1,
    borderRadius: Radius.full,
    borderWidth: StyleSheet.hairlineWidth },
  activeFilterChipText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.medium },

  // Sort sheet
  sortSheetContent: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm },
  sortSheetTitle: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: FontFamily.bold,
    marginBottom: Space.sm },
  sortSheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Space.md,
    borderBottomWidth: StyleSheet.hairlineWidth },
  sortSheetRowText: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: FontFamily.regular },
  savedSearchListWrap: {
    paddingHorizontal: 20 },
  savedSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    minHeight: 52,
    borderBottomWidth: StyleSheet.hairlineWidth },
  savedSearchMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10 },
  savedSearchTextWrap: {
    flex: 1,
    gap: Space.xxs },
  savedSearchQuery: {
    fontSize: TypographyV2.body.size,
    fontFamily: FontFamily.semibold },
  savedSearchMeta: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.regular },
  savedSearchToggle: {
    width: Control.chrome,
    height: Control.chrome,
    borderRadius: RadiusRoleValue.pillAvatar,
    alignItems: 'center',
    justifyContent: 'center' },
  savedSearchRemove: {
    width: Control.hit,
    height: Control.hit,
    alignItems: 'center',
    justifyContent: 'center' },
  masonryGrid: {
    flexDirection: 'row',
    gap: Space.sm,
    paddingHorizontal: 20 },
  masonryColumn: {
    flex: 1,
    gap: Space.sm },
  masonryItemWrap: {
    borderRadius: RadiusRoleValue.standalonePanel,
    overflow: 'hidden',
    position: 'relative' },
  masonryImg: {
    width: '100%',
    borderRadius: RadiusRoleValue.standalonePanel },
  resultOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 10,
    paddingVertical: Space.sm,
    borderBottomLeftRadius: Radius.xl,
    borderBottomRightRadius: Radius.xl },
  resultPrice: {
    fontFamily: FontFamily.bold,
    fontSize: TypographyV2.body.size,
    fontVariant: ['tabular-nums'] },
  recoEmptyState: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: RadiusRoleValue.standalonePanel,
    paddingVertical: 14,
    paddingHorizontal: Space.smMd,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    marginHorizontal: 20,
    flexWrap: 'wrap' },
  recoEmptyText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.medium,
    flex: 1 },
  recoEmptyCta: {
    borderWidth: Stroke.standard,
    borderRadius: RadiusRoleValue.mediaThumbnail,
    paddingVertical: 6,
    paddingHorizontal: Space.smMd,
    marginTop: Space.xs },
  recoEmptyCtaText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.semibold },

  // Contextual no-results state (search results surface)
  noResultsState: {
    alignItems: 'center',
    paddingVertical: 28,
    paddingHorizontal: 20,
    marginHorizontal: 20,
    borderRadius: RadiusRoleValue.standalonePanel,
    borderWidth: StyleSheet.hairlineWidth,
    gap: Space.sm },
  noResultsTitle: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: FontFamily.semibold,
    textAlign: 'center',
    letterSpacing: -0.2 },
  noResultsSubtitle: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.regular,
    textAlign: 'center',
    lineHeight: TypographyV2.meta.lineHeight },
  noResultsActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: Space.sm },
  noResultsPrimaryCta: {
    borderRadius: RadiusRoleValue.pillAvatar,
    paddingVertical: 10,
    paddingHorizontal: 18 },
  noResultsPrimaryCtaText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.semibold },
  noResultsSecondaryCta: {
    borderRadius: RadiusRoleValue.pillAvatar,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderWidth: Stroke.standard },
  noResultsSecondaryCtaText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.semibold },

  // Suggested categories in no-results state
  noResultsCategories: {
    marginTop: Space.md + 2,
    alignItems: 'center',
    gap: Space.sm },
  noResultsCategoriesLabel: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.semibold,
    letterSpacing: 0.5,
    textTransform: 'uppercase' },
  noResultsCategoryChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: Space.xs + 2 },

  // Scope tabs (Items | People)
  scopeTabBar: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: Space.xs,
    gap: Space.lg,
    borderBottomWidth: StyleSheet.hairlineWidth },
  scopeTab: {
    paddingVertical: 10,
    alignItems: 'center',
    position: 'relative' },
  scopeTabLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6 },
  scopeTabText: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: FontFamily.medium },
  scopeTabCount: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.regular,
    fontVariant: ['tabular-nums'] },
  scopeTabIndicator: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    borderRadius: Radius.full },

  // People results
  peopleResultsList: {
    gap: 0 } });
