import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  StatusBar,
  Dimensions,
} from 'react-native';
import Reanimated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  FadeInDown,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import { useAppTheme } from '../theme/ThemeContext';
import { Motion } from '../constants/motion';
import { StackScreenProps } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useBackendData } from '../context/BackendDataContext';
import { SyncStatusPill } from '../components/SyncStatusPill';
import { SkeletonLoader } from '../components/SkeletonLoader';
import { SyncRetryBanner } from '../components/SyncRetryBanner';
import { getBackendSyncStatus } from '../utils/syncStatus';
import { CachedImage } from '../components/CachedImage';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SharedTransitionView } from '../components/SharedTransitionView';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { AppButton } from '../components/ui/AppButton';
import { AppSearchBar } from '../components/ui/AppSearchBar';
import { AnimatedPressable } from '../components/AnimatedPressable';

/* ── New Discover Components ── */
import { HeroCarousel, HeroItem } from '../components/discover/HeroCarousel';
import { EditorialSection } from '../components/discover/EditorialSection';
import { FeaturedBoardCard, FeaturedBoard } from '../components/discover/FeaturedBoardCard';
import { EditorialImageRow, EditorialImage } from '../components/discover/EditorialImageRow';
import { Typography } from '../theme/designTokens';

type Props = StackScreenProps<RootStackParamList, 'GlobalSearch'>;

const RECENT_SEARCHES_KEY = '@thryftverse_recent_searches';
const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface RankedListing {
  id: string;
  title: string;
  brand: string;
  size: string;
  condition: 'New with tags' | 'Very good' | 'Good' | 'Satisfactory';
  image: string;
  price: number;
  likes: number;
  sellerId: string;
  createdAt?: string;
  score: number;
  reason: string;
}

type BrowseSortOption = 'Recommended' | 'Newest' | 'Price: Low to High' | 'Price: High to Low';

const DISCOVER_SORT_OPTIONS: BrowseSortOption[] = [
  'Recommended',
  'Newest',
  'Price: Low to High',
  'Price: High to Low',
];

// Colorful backgrounds for "Top Searches" cards
const TOP_SEARCH_CARDS = [
  { label: 'Summer Fits', color: '#E8D5C4', textColor: '#5C3D2E', image: '' },
  { label: 'Y2K Style', color: '#D4E6F1', textColor: '#2E4A62', image: '' },
  { label: 'Streetwear', color: '#D5DBDB', textColor: '#2C3E50', image: '' },
  { label: 'Vintage', color: '#FADBD8', textColor: '#6E2C3D', image: '' },
  { label: 'Techwear', color: '#D6EAF8', textColor: '#1B4F72', image: '' },
  { label: 'Minimal', color: '#E8DAEF', textColor: '#4A235A', image: '' },
];

/* ── Editorial seed data ── */
const HERO_ITEMS: HeroItem[] = [
  {
    id: 'hero1',
    type: 'video',
    uri: 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    posterUri: '',
    sponsor: 'H&M',
    title: 'H&M Summer 2026',
    ctaLabel: 'Visit',
  },
  {
    id: 'hero2',
    type: 'image',
    uri: '',
    title: 'Escape to Indian Hills',
    ctaLabel: 'Explore',
  },
  {
    id: 'hero3',
    type: 'image',
    uri: '',
    sponsor: 'Nike',
    title: 'Streetwear Essentials',
    ctaLabel: 'Shop',
  },
];

const FEATURED_BOARDS: FeaturedBoard[] = [
  {
    id: 'board1',
    title: 'Escape to Indian hills',
    subtitle: 'Pinterest India',
    meta: '41 Pins \u2022 11mo',
    isVerified: true,
    images: [
      '',
      '',
      '',
    ],
  },
  {
    id: 'board2',
    title: 'Gaming room inspo',
    subtitle: 'Pinterest Man',
    meta: '65 Pins \u2022 5mo',
    isVerified: true,
    images: [
      '',
      '',
      '',
    ],
  },
  {
    id: 'board3',
    title: 'Streetwear essentials',
    subtitle: 'Editors Pick',
    meta: '28 Pins \u2022 Hot',
    isVerified: false,
    images: [
      '',
      '',
      '',
    ],
  },
];

const EDITORIAL_SECTIONS: { id: string; kicker: string; title: string; images: EditorialImage[] }[] = [
  {
    id: 'sec1',
    kicker: 'Ideas for you',
    title: 'Shirt dress outfit',
    images: [
      { id: 'e1-1', uri: '', aspectRatio: 1.4 },
      { id: 'e1-2', uri: '', aspectRatio: 1.2 },
      { id: 'e1-3', uri: '', aspectRatio: 1.5 },
      { id: 'e1-4', uri: '', aspectRatio: 1.1 },
    ],
  },
  {
    id: 'sec2',
    kicker: 'Ideas for you',
    title: 'YSL runway',
    images: [
      { id: 'e2-1', uri: '', aspectRatio: 1.3 },
      { id: 'e2-2', uri: '', aspectRatio: 1.1 },
      { id: 'e2-3', uri: '', aspectRatio: 1.4 },
      { id: 'e2-4', uri: '', aspectRatio: 1.2 },
    ],
  },
  {
    id: 'sec3',
    kicker: 'Ideas for you',
    title: "Men's formal style",
    images: [
      { id: 'e3-1', uri: '', aspectRatio: 1.35 },
      { id: 'e3-2', uri: '', aspectRatio: 1.15 },
      { id: 'e3-3', uri: '', aspectRatio: 1.25 },
      { id: 'e3-4', uri: '', aspectRatio: 1.45 },
    ],
  },
  {
    id: 'sec4',
    kicker: 'Ideas for you',
    title: 'Tom ford suit',
    images: [
      { id: 'e4-1', uri: '', aspectRatio: 1.2 },
      { id: 'e4-2', uri: '', aspectRatio: 1.4 },
      { id: 'e4-3', uri: '', aspectRatio: 1.1 },
      { id: 'e4-4', uri: '', aspectRatio: 1.3 },
    ],
  },
];

function buildAffinitySet(values: string[]) {
  const counts = new Map<string, number>();
  values.forEach((value) => {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return;
    counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
  });
  return new Set(
    [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([value]) => value),
  );
}

function getRecencyBoost(createdAt?: string) {
  if (!createdAt) return 0;
  const createdTs = Date.parse(createdAt);
  if (Number.isNaN(createdTs)) return 0;
  const ageHours = (Date.now() - createdTs) / (1000 * 60 * 60);
  return Math.max(0, 16 - ageHours / 8);
}

export default function GlobalSearchScreen({ navigation }: Props) {
  const [query, setQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const inputRef = useRef<any>(null);
  const browseFilters = useStore((state) => state.browseFilters);
  const updateBrowseFilters = useStore((state) => state.updateBrowseFilters);
  const resetBrowseFilters = useStore((state) => state.resetBrowseFilters);
  const wishlistIds = useStore((state) => state.wishlist);
  const { listings, source, isSyncing, lastError, refreshListings } = useBackendData();
  const { formatFromFiat } = useFormattedPrice();
  const focusProgress = useSharedValue(0);

  const normalizedQuery = query.trim().toLowerCase();
  const queryTokens = useMemo(
    () => normalizedQuery.split(/\s+/).filter(Boolean),
    [normalizedQuery],
  );

  const wishlistListings = useMemo(
    () => listings.filter((listing) => wishlistIds?.includes(listing.id) ?? false),
    [listings, wishlistIds],
  );

  const affinityProfile = useMemo(
    () => ({
      brandSet: buildAffinitySet(wishlistListings.map((listing) => listing.brand)),
      categorySet: buildAffinitySet(wishlistListings.map((listing) => listing.category)),
      subcategorySet: buildAffinitySet(wishlistListings.map((listing) => listing.subcategory)),
    }),
    [wishlistListings],
  );

  const rankedListings = useMemo<RankedListing[]>(() => {
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
          reasons.push('Matches brands you save often');
        }
        if (affinityProfile.categorySet.has(category)) {
          score += 11;
          reasons.push('Aligned with your closet categories');
        }
        if (affinityProfile.subcategorySet.has(subcategory)) {
          score += 8;
          reasons.push('Close to items in your wishlist');
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
            reasons.unshift(`Matches your search for "${matchedTokens[0]}"`);
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
          reason: reasons[0] ?? 'Recommended from current market momentum',
        };
      })
      .filter((listing) => {
        if (!queryTokens.length) return true;
        return listing.score > 0;
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 20);
  }, [affinityProfile.brandSet, affinityProfile.categorySet, affinityProfile.subcategorySet, listings, queryTokens, wishlistIds]);

  const trendingTags = useMemo(() => {
    const affinityBrands = [...affinityProfile.brandSet];
    const queryBoost = normalizedQuery ? [normalizedQuery] : [];
    const suggestedCategories = ['women', 'men', 'shoes', 'accessories', 'vintage', 'streetwear'];
    return [...new Set([...queryBoost, ...affinityBrands, ...suggestedCategories])].slice(0, 8);
  }, [affinityProfile.brandSet, normalizedQuery]);

  const activeFilterCount =
    browseFilters.brands.length
    + browseFilters.sizes.length
    + (browseFilters.condition !== 'Any' ? 1 : 0);

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
    }));

    const filtered = sourceListings.filter((listing) => {
      if (selectedBrands.size > 0 && !selectedBrands.has(listing.brand.toLowerCase())) return false;
      if (selectedSizes.size > 0 && !selectedSizes.has(listing.size.toLowerCase())) return false;
      if (browseFilters.condition !== 'Any' && listing.condition !== browseFilters.condition) return false;
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
      case 'Recommended':
      default:
        sorted.sort((a, b) => b.score - a.score || b.likes - a.likes);
        break;
    }

    return normalizedQuery ? sorted.slice(0, 16) : sorted;
  }, [browseFilters.brands, browseFilters.condition, browseFilters.sizes, browseFilters.sort, rankedListings, listings, normalizedQuery]);

  useEffect(() => {
    focusProgress.value = withTiming(isSearchFocused ? 1 : 0, { duration: Motion.timing.focus });
  }, [focusProgress, isSearchFocused]);

  const animatedSearchShellStyle = useAnimatedStyle(() => {
    const borderColor = interpolateColor(focusProgress.value, [0, 1], [Colors.border, Colors.brand]);
    const backgroundColor = interpolateColor(focusProgress.value, [0, 1], [Colors.surface, Colors.background]);
    return {
      borderColor,
      backgroundColor,
      transform: [{ scale: 1 + focusProgress.value * 0.012 }],
    };
  });

  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  useEffect(() => {
    AsyncStorage.getItem(RECENT_SEARCHES_KEY).then((raw) => {
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) setRecentSearches(parsed);
        } catch { /* noop */ }
      }
    });
  }, []);

  const saveRecentSearch = async (term: string) => {
    const updated = [term, ...recentSearches.filter((s) => s !== term)].slice(0, 10);
    setRecentSearches(updated);
    await AsyncStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
  };

  const clearRecentSearches = async () => {
    setRecentSearches([]);
    await AsyncStorage.removeItem(RECENT_SEARCHES_KEY);
  };

  const handleSearchSubmit = () => {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) return;
    updateBrowseFilters({ query: trimmedQuery });
    saveRecentSearch(trimmedQuery);
    navigation.navigate('Browse', {
      categoryId: 'search',
      title: `Search: "${trimmedQuery}"`,
      searchQuery: trimmedQuery,
    });
  };

  const handlePillPress = (tag: string) => {
    const normalizedTag = tag.trim();
    if (!normalizedTag) return;
    updateBrowseFilters({ query: normalizedTag });
    navigation.navigate('Browse', {
      categoryId: 'search',
      title: `Search: "${normalizedTag}"`,
      searchQuery: normalizedTag,
    });
  };

  const searchStatus = React.useMemo(
    () =>
      getBackendSyncStatus({
        isSyncing,
        source,
        hasError: Boolean(lastError),
        labels: {
          syncing: 'Refreshing index',
          live: 'Live index',
          error: 'Offline index',
          fallback: 'Cached index',
        },
      }),
    [isSyncing, lastError, source],
  );

  const showSearchLoadingSkeleton = isSyncing && listings.length === 0 && !lastError;

  const handleCycleSort = () => {
    const activeSortIndex = DISCOVER_SORT_OPTIONS.indexOf(browseFilters.sort);
    const nextSort = DISCOVER_SORT_OPTIONS[(activeSortIndex + 1) % DISCOVER_SORT_OPTIONS.length];
    updateBrowseFilters({ sort: nextSort, query: normalizedQuery });
  };

  const handleOpenFilter = () => {
    updateBrowseFilters({ query: normalizedQuery });
    navigation.navigate('Filter', {
      categoryId: 'search',
      title: 'Discover',
    });
  };

  const handleClearDiscoverFilters = () => {
    const preservedQuery = normalizedQuery;
    resetBrowseFilters();
    updateBrowseFilters({ query: preservedQuery });
  };

  const handleOpenRecommendation = (listingId: string) => {
    navigation.push('ItemDetail', { itemId: listingId });
  };

  const handleOpenRecommendationSeller = (sellerId: string) => {
    navigation.navigate('UserProfile', { userId: sellerId });
  };

  const handleMessageRecommendationSeller = (sellerId: string, listingId: string) => {
    navigation.navigate('Chat', {
      conversationId: `${sellerId}_${listingId}`,
      focusQuery: sellerId,
      partnerUserId: sellerId,
    });
  };

  const renderSearchLoadingState = () => (
    <View style={styles.loadingStateWrap}>
      <View style={styles.loadingSection}>
        <SkeletonLoader width="32%" height={14} borderRadius={7} style={{ marginBottom: 12 }} />
        <View style={styles.loadingTagsRow}>
          {Array.from({ length: 4 }).map((_, index) => (
            <SkeletonLoader key={`search_tag_loading_${index}`} width={96} height={36} borderRadius={18} />
          ))}
        </View>
      </View>
      <View style={styles.loadingSection}>
        <SkeletonLoader width="44%" height={14} borderRadius={7} style={{ marginBottom: 14 }} />
        {Array.from({ length: 4 }).map((_, index) => (
          <View key={`search_recent_loading_${index}`} style={styles.loadingRecentRow}>
            <SkeletonLoader width={20} height={20} borderRadius={10} />
            <SkeletonLoader width="62%" height={13} borderRadius={6} style={{ marginLeft: 12 }} />
          </View>
        ))}
      </View>
    </View>
  );

  const masonryColumn1 = discoverListings.filter((_, i) => i % 2 === 0);
  const masonryColumn2 = discoverListings.filter((_, i) => i % 2 === 1);

  /* ── Editorial helpers ── */
  const handleEditorialImagePress = (id: string) => {
    navigation.push('ItemDetail', { itemId: id });
  };

  const handleBoardPress = (boardId: string) => {
    const board = FEATURED_BOARDS.find((b) => b.id === boardId);
    if (board) {
      setQuery(board.title.split(' ')[0]);
      handleSearchSubmit();
    }
  };

  const { isDark } = useAppTheme();
  const isDiscoverLanding = !normalizedQuery;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={Colors.background} />

      {/* Hero Search Header */}
      <View style={styles.header}>
        <AnimatedPressable style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={26} color={Colors.textPrimary} />
        </AnimatedPressable>

        <Reanimated.View style={[styles.inputContainer, animatedSearchShellStyle]}>
          <AppSearchBar
            ref={inputRef}
            placeholder="Search Thryftverse"
            value={query}
            onChangeText={setQuery}
            containerStyle={{ flex: 1, borderWidth: 0, backgroundColor: 'transparent' }}
            rightNode={
              <AnimatedPressable onPress={() => navigation.navigate('VisualSearch')} activeOpacity={0.85} accessibilityLabel="Visual search" accessibilityRole="button">
                <Ionicons name="camera" size={24} color={Colors.textMuted} />
              </AnimatedPressable>
            }
            inputProps={{
              onSubmitEditing: handleSearchSubmit,
              onFocus: () => setIsSearchFocused(true),
              onBlur: () => setIsSearchFocused(false),
              returnKeyType: 'search',
              autoCapitalize: 'none',
              selectionColor: Colors.brand,
            }}
          />
        </Reanimated.View>
      </View>

      {query.length > 0 && (
        <View style={styles.statusPillWrap}>
          <SyncStatusPill {...searchStatus} />
        </View>
      )}

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 40 }}
      >
        {showSearchLoadingSkeleton ? (
          renderSearchLoadingState()
        ) : (
          <>
            {/* ═══════ DISCOVER LANDING (no query) ═══════ */}
            {isDiscoverLanding && (
              <>
                {/* Hero Carousel — only when real imagery exists */}
                {HERO_ITEMS.some((h) => h.uri.trim().length > 0) && (
                  <HeroCarousel items={HERO_ITEMS.filter((h) => h.uri.trim().length > 0)} autoPlayInterval={6000} />
                )}

                {/* Explore featured boards — only when real imagery exists */}
                {FEATURED_BOARDS.some((b) => b.images.some((img) => img.trim().length > 0)) && (
                  <EditorialSection
                    kicker="Explore featured boards"
                    title="Ideas you might like"
                    style={{ marginTop: 12 }}
                  >
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.boardsScroll}
                    >
                      {FEATURED_BOARDS.filter((b) => b.images.some((img) => img.trim().length > 0)).map((board) => (
                        <FeaturedBoardCard
                          key={board.id}
                          board={{
                            ...board,
                            onPress: () => handleBoardPress(board.id),
                          }}
                        />
                      ))}
                    </ScrollView>
                  </EditorialSection>
                )}

                {/* Recent searches */}
                {recentSearches.length > 0 && (
                  <EditorialSection kicker="Your history" title="Recent searches">
                    <View style={styles.recentPillsWrap}>
                      {recentSearches.map((term, idx) => (
                        <AnimatedPressable
                          key={idx}
                          style={styles.recentPill}
                          activeOpacity={0.8}
                          onPress={() => handlePillPress(term)}
                        >
                          <Text style={styles.recentPillText}>{term}</Text>
                        </AnimatedPressable>
                      ))}
                      <AnimatedPressable style={[styles.recentPill, styles.clearRecentPill]} activeOpacity={0.8} onPress={clearRecentSearches}>
                        <Ionicons name="close-circle" size={14} color={Colors.textMuted} />
                        <Text style={[styles.recentPillText, { color: Colors.textMuted }]}>Clear</Text>
                      </AnimatedPressable>
                    </View>
                  </EditorialSection>
                )}

                {/* Suggested categories */}
                <EditorialSection title="Suggested categories">
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.topSearchesScroll}>
                    {TOP_SEARCH_CARDS.map((card, idx) => (
                      <AnimatedPressable
                        key={idx}
                        style={[styles.topSearchCard, { backgroundColor: card.color }]}
                        activeOpacity={0.85}
                        onPress={() => handlePillPress(card.label)}
                      >
                        <CachedImage uri={card.image} style={styles.topSearchCardImage} contentFit="cover" />
                        <View style={styles.topSearchCardOverlay}>
                          <Text style={[styles.topSearchCardText, { color: card.textColor }]}>{card.label}</Text>
                        </View>
                      </AnimatedPressable>
                    ))}
                  </ScrollView>
                </EditorialSection>

                {/* Explore categories */}
                <EditorialSection title="Explore categories">
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.trendingScroll}>
                    {trendingTags.map((tag, idx) => (
                      <AnimatedPressable key={idx} style={styles.trendingPill} activeOpacity={0.8} onPress={() => handlePillPress(tag)}>
                        <Text style={styles.trendingPillText}>{tag}</Text>
                      </AnimatedPressable>
                    ))}
                  </ScrollView>
                </EditorialSection>

                {/* Editorial image rows — only when real imagery exists */}
                {EDITORIAL_SECTIONS.filter((s) => s.images.some((img) => img.uri.trim().length > 0)).map((section) => (
                  <EditorialSection
                    key={section.id}
                    kicker={section.kicker}
                    title={section.title}
                    onSearchPress={() => {
                      setQuery(section.title);
                      handleSearchSubmit();
                    }}
                  >
                    <EditorialImageRow
                      images={section.images.filter((img) => img.uri.trim().length > 0)}
                      onPressImage={handleEditorialImagePress}
                      sharedTransitionPrefix={`editorial-${section.id}`}
                    />
                  </EditorialSection>
                ))}

                {/* Discover masonry grid at bottom of landing */}
                <EditorialSection
                  kicker="Ideas for you"
                  title="Discover"
                  onSearchPress={handleSearchSubmit}
                >
                  {discoverListings.length > 0 ? (
                    <View style={styles.masonryGrid}>
                      <View style={styles.masonryColumn}>
                        {masonryColumn1.map((listing, i) => (
                          <AnimatedPressable
                            key={listing.id}
                            style={styles.masonryItemWrap}
                            activeOpacity={0.9}
                            onPress={() => handleOpenRecommendation(listing.id)}
                          >
                            <SharedTransitionView sharedTransitionTag={`image-${listing.id}-0`}>
                              <CachedImage
                                uri={listing.image}
                                style={[styles.masonryImg, { height: [260, 340, 200, 300][i % 4] }]}
                                contentFit="cover"
                              />
                            </SharedTransitionView>
                          </AnimatedPressable>
                        ))}
                      </View>
                      <View style={styles.masonryColumn}>
                        {masonryColumn2.map((listing, i) => (
                          <AnimatedPressable
                            key={listing.id}
                            style={styles.masonryItemWrap}
                            activeOpacity={0.9}
                            onPress={() => handleOpenRecommendation(listing.id)}
                          >
                            <SharedTransitionView sharedTransitionTag={`image-${listing.id}-0`}>
                              <CachedImage
                                uri={listing.image}
                                style={[styles.masonryImg, { height: [340, 200, 280, 240][i % 4] }]}
                                contentFit="cover"
                              />
                            </SharedTransitionView>
                          </AnimatedPressable>
                        ))}
                      </View>
                    </View>
                  ) : (
                    <View style={styles.recoEmptyState}>
                      <Ionicons name="sparkles-outline" size={18} color={Colors.textMuted} />
                      <Text style={styles.recoEmptyText}>
                        {hasActiveDiscoverFilters
                          ? 'No picks match your current filters. Adjust or clear them.'
                          : 'No ranked results yet. Try a shorter keyword.'}
                      </Text>
                    </View>
                  )}
                </EditorialSection>
              </>
            )}

            {/* ═══════ SEARCH RESULTS (query entered) ═══════ */}
            {!isDiscoverLanding && (
              <>
                {lastError ? (
                  <SyncRetryBanner
                    message="Search index is delayed. Showing cached results."
                    onRetry={() => void refreshListings()}
                    isRetrying={isSyncing}
                    telemetryContext="global_search_sync"
                    containerStyle={{ marginHorizontal: 20, marginBottom: 12 }}
                  />
                ) : null}

                {/* Sort + Filter bar */}
                <View style={styles.filterBar}>
                  <AnimatedPressable style={styles.sortChip} onPress={handleCycleSort} activeOpacity={0.8}>
                    <Ionicons name="swap-vertical" size={16} color={Colors.textSecondary} />
                    <Text style={styles.sortChipText}>{browseFilters.sort}</Text>
                  </AnimatedPressable>

                  <AnimatedPressable style={styles.filterChip} onPress={handleOpenFilter} activeOpacity={0.8}>
                    <Ionicons name="options-outline" size={16} color={Colors.textSecondary} />
                    <Text style={styles.filterChipText}>Filter</Text>
                    {activeFilterCount > 0 && (
                      <View style={styles.filterBadge}>
                        <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
                      </View>
                    )}
                  </AnimatedPressable>

                  {hasActiveDiscoverFilters && (
                    <AnimatedPressable style={styles.clearChip} onPress={handleClearDiscoverFilters} activeOpacity={0.8}>
                      <Ionicons name="close-circle" size={16} color={Colors.danger} />
                      <Text style={styles.clearChipText}>Clear</Text>
                    </AnimatedPressable>
                  )}
                </View>

                {/* Recommendation text */}
                <Reanimated.View entering={FadeInDown.delay(100).duration(400)} style={styles.sectionWrap}>
                  <Text style={styles.sectionSupertitle}>Results</Text>
                  <View style={styles.recoHeaderRow}>
                    <Text style={styles.recoHeaderTitle}>
                      {normalizedQuery ? `Search: ${normalizedQuery}` : 'Discover'}
                    </Text>
                    {!normalizedQuery && (
                      <AnimatedPressable style={styles.topicSearchBtn} activeOpacity={0.8} onPress={handleSearchSubmit}>
                        <Ionicons name="search" size={18} color={Colors.textPrimary} />
                      </AnimatedPressable>
                    )}
                  </View>
                </Reanimated.View>

                {/* Masonry grid */}
                <Reanimated.View entering={FadeInDown.delay(200).duration(400)} style={styles.sectionWrap}>
                  {discoverListings.length > 0 ? (
                    <View style={styles.masonryGrid}>
                      <View style={styles.masonryColumn}>
                        {masonryColumn1.map((listing, i) => (
                          <AnimatedPressable
                            key={listing.id}
                            style={styles.masonryItemWrap}
                            activeOpacity={0.9}
                            onPress={() => handleOpenRecommendation(listing.id)}
                          >
                            <SharedTransitionView sharedTransitionTag={`image-${listing.id}-0`}>
                              <CachedImage
                                uri={listing.image}
                                style={[styles.masonryImg, { height: [260, 340, 200, 300][i % 4] }]}
                                contentFit="cover"
                              />
                            </SharedTransitionView>
                            <View style={styles.resultOverlay}>
                              <Text style={styles.resultPrice}>{formatFromFiat(listing.price, 'GBP', { displayMode: 'fiat' })}</Text>
                              <Text style={styles.resultReason} numberOfLines={1}>{listing.reason}</Text>
                            </View>
                          </AnimatedPressable>
                        ))}
                      </View>
                      <View style={styles.masonryColumn}>
                        {masonryColumn2.map((listing, i) => (
                          <AnimatedPressable
                            key={listing.id}
                            style={styles.masonryItemWrap}
                            activeOpacity={0.9}
                            onPress={() => handleOpenRecommendation(listing.id)}
                          >
                            <SharedTransitionView sharedTransitionTag={`image-${listing.id}-0`}>
                              <CachedImage
                                uri={listing.image}
                                style={[styles.masonryImg, { height: [340, 200, 280, 240][i % 4] }]}
                                contentFit="cover"
                              />
                            </SharedTransitionView>
                            <View style={styles.resultOverlay}>
                              <Text style={styles.resultPrice}>{formatFromFiat(listing.price, 'GBP', { displayMode: 'fiat' })}</Text>
                              <Text style={styles.resultReason} numberOfLines={1}>{listing.reason}</Text>
                            </View>
                          </AnimatedPressable>
                        ))}
                      </View>
                    </View>
                  ) : (
                    <View style={styles.recoEmptyState}>
                      <Ionicons name="sparkles-outline" size={18} color={Colors.textMuted} />
                      <Text style={styles.recoEmptyText}>
                        {hasActiveDiscoverFilters
                          ? 'No picks match your current filters. Adjust or clear them.'
                          : 'No ranked results yet. Try a shorter keyword.'}
                      </Text>
                    </View>
                  )}
                </Reanimated.View>
              </>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    gap: 10,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 30,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
  },
  statusPillWrap: {
    paddingHorizontal: 20,
    marginBottom: 8,
  },

  // Loading
  loadingStateWrap: {
    paddingTop: 16,
    paddingHorizontal: 20,
  },
  loadingSection: {
    marginBottom: 28,
  },
  loadingTagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  loadingRecentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },

  // Sections
  sectionWrap: {
    paddingHorizontal: 20,
    marginBottom: 28,
  },
  sectionSupertitle: {
    color: Colors.textMuted,
    fontSize: 13,
    fontFamily: Typography.family.medium,
    marginBottom: 4,
  },

  // Recent searches pills
  recentPillsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    gap: 10,
  },
  recentPill: {
    backgroundColor: Colors.surface,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 22,
  },
  clearRecentPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  recentPillText: {
    fontSize: 14,
    fontFamily: Typography.family.medium,
    color: Colors.textPrimary,
  },

  // Top searches cards
  topSearchesScroll: {
    paddingHorizontal: 16,
    gap: 12,
  },
  topSearchCard: {
    width: 140,
    height: 170,
    borderRadius: 20,
    overflow: 'hidden',
    position: 'relative',
  },
  topSearchCardImage: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.35,
  },
  topSearchCardOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    padding: 14,
  },
  topSearchCardText: {
    fontSize: 15,
    fontFamily: Typography.family.bold,
    letterSpacing: -0.3,
  },

  // Trending
  trendingScroll: {
    paddingHorizontal: 16,
    gap: 10,
  },
  trendingPill: {
    backgroundColor: Colors.surface,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  trendingPillText: {
    fontSize: 15,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
  },

  // Featured boards
  boardsScroll: {
    paddingHorizontal: 16,
    gap: 14,
  },

  // Filter bar
  filterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
  },
  sortChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.surface,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sortChipText: {
    fontFamily: Typography.family.medium,
    fontSize: 13,
    color: Colors.textPrimary,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.surface,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    position: 'relative',
  },
  filterChipText: {
    fontFamily: Typography.family.medium,
    fontSize: 13,
    color: Colors.textPrimary,
  },
  filterBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBadgeText: {
    fontFamily: Typography.family.bold,
    fontSize: 10,
    color: Colors.textInverse,
  },
  clearChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.surface,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: Colors.danger,
  },
  clearChipText: {
    fontFamily: Typography.family.medium,
    fontSize: 13,
    color: Colors.danger,
  },

  // Masonry
  recoHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    gap: 8,
  },
  recoHeaderTitle: {
    fontSize: 22,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
    letterSpacing: -0.5,
  },
  topicSearchBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  masonryGrid: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 20,
  },
  masonryColumn: {
    flex: 1,
    gap: 8,
  },
  masonryItemWrap: {
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
  },
  masonryImg: {
    width: '100%',
    borderRadius: 16,
  },
  resultOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },
  resultPrice: {
    fontFamily: Typography.family.bold,
    fontSize: 14,
    color: '#fff',
  },
  resultReason: {
    fontFamily: Typography.family.medium,
    fontSize: 11,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 2,
  },
  recoEmptyState: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 12,
    backgroundColor: Colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 20,
  },
  recoEmptyText: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontFamily: Typography.family.medium,
  },
});