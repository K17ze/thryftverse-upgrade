import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  AnimatedPressable
} from '../components/AnimatedPressable';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
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
import { ActiveTheme, Colors } from '../constants/colors';
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
import { SharedTransitionView } from '../components/SharedTransitionView';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { AppButton } from '../components/ui/AppButton';
import { MOCK_USERS } from '../data/mockData';

type Props = StackScreenProps<RootStackParamList, 'GlobalSearch'>;

const RECENT_SEARCHES = ['stussy hoodie', 'arcteryx alpha sv', 'carhartt detroit', 'vintage levis 501'];
const TRENDING_TAGS = ['#y2k', '#gorpcore', 'archive', 'japanese denim', 'techwear', '#streetwear'];
const { width: SCREEN_WIDTH } = Dimensions.get('window');

const IS_LIGHT = ActiveTheme === 'light';

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
  { label: 'Summer Fits', color: '#E8D5C4', textColor: '#5C3D2E', image: 'https://images.unsplash.com/photo-1523381210434-271e8be1f52b?w=300&q=80' },
  { label: 'Y2K Style', color: '#D4E6F1', textColor: '#2E4A62', image: 'https://images.unsplash.com/photo-1552374196-cb6190d5120e?w=300&q=80' },
  { label: 'Streetwear', color: '#D5DBDB', textColor: '#2C3E50', image: 'https://images.unsplash.com/photo-1556906781-9a412961c28c?w=300&q=80' },
  { label: 'Vintage', color: '#FADBD8', textColor: '#6E2C3D', image: 'https://images.unsplash.com/photo-1483985988355-763728e1935b?w=300&q=80' },
  { label: 'Techwear', color: '#D6EAF8', textColor: '#1B4F72', image: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=300&q=80' },
  { label: 'Minimal', color: '#E8DAEF', textColor: '#4A235A', image: 'https://images.unsplash.com/photo-1434389677669-e08b4a3a7a5e?w=300&q=80' },
];

function buildAffinitySet(values: string[]) {
  const counts = new Map<string, number>();

  values.forEach((value) => {
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
      return;
    }

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
  if (!createdAt) {
    return 0;
  }

  const createdTs = Date.parse(createdAt);
  if (Number.isNaN(createdTs)) {
    return 0;
  }

  const ageHours = (Date.now() - createdTs) / (1000 * 60 * 60);
  return Math.max(0, 16 - ageHours / 8);
}

export default function GlobalSearchScreen({ navigation }: Props) {
  const [query, setQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const inputRef = useRef<TextInput>(null);
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
          image: listing.images[0] ?? `https://picsum.photos/seed/${listing.id}/500/600`,
          price: listing.price,
          likes: listing.likes,
          sellerId: listing.sellerId,
          createdAt: listing.createdAt,
          score,
          reason: reasons[0] ?? 'Recommended from current market momentum',
        };
      })
      .filter((listing) => {
        if (!queryTokens.length) {
          return true;
        }

        return listing.score > 0;
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 20);
  }, [affinityProfile.brandSet, affinityProfile.categorySet, affinityProfile.subcategorySet, listings, queryTokens, wishlistIds]);

  const trendingTags = useMemo(() => {
    const affinityBrands = [...affinityProfile.brandSet];
    const queryBoost = normalizedQuery ? [normalizedQuery] : [];
    return [...new Set([...queryBoost, ...affinityBrands, ...TRENDING_TAGS])].slice(0, 8);
  }, [affinityProfile.brandSet, normalizedQuery]);

  const activeFilterCount =
    browseFilters.brands.length
    + browseFilters.sizes.length
    + (browseFilters.condition !== 'Any' ? 1 : 0);

  const hasActiveDiscoverFilters = activeFilterCount > 0;

  const discoverListings = useMemo(() => {
    const selectedBrands = new Set(browseFilters.brands.map((brand) => brand.toLowerCase()));
    const selectedSizes = new Set(browseFilters.sizes.map((size) => size.toLowerCase()));

    // When no query, show ALL listings (not just ranked subset) so every user product appears
    const sourceListings = normalizedQuery ? rankedListings : listings.map((listing) => ({
      id: listing.id,
      title: listing.title,
      brand: listing.brand,
      size: listing.size,
      condition: listing.condition,
      image: listing.images[0] ?? `https://picsum.photos/seed/${listing.id}/500/600`,
      price: listing.price,
      likes: listing.likes,
      sellerId: listing.sellerId,
      createdAt: listing.createdAt,
      score: 0,
      reason: '',
    }));

    const filtered = sourceListings.filter((listing) => {
      if (selectedBrands.size > 0 && !selectedBrands.has(listing.brand.toLowerCase())) {
        return false;
      }

      if (selectedSizes.size > 0 && !selectedSizes.has(listing.size.toLowerCase())) {
        return false;
      }

      if (browseFilters.condition !== 'Any' && listing.condition !== browseFilters.condition) {
        return false;
      }

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

    // Only cap results when a query is active; otherwise show everything
    return normalizedQuery ? sorted.slice(0, 16) : sorted;
  }, [browseFilters.brands, browseFilters.condition, browseFilters.sizes, browseFilters.sort, rankedListings, listings, normalizedQuery]);

  // Auto-focus the search bar when the screen mounts
  useEffect(() => {
    const timeout = setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
    return () => clearTimeout(timeout);
  }, []);

  useEffect(() => {
    focusProgress.value = withTiming(isSearchFocused ? 1 : 0, { duration: Motion.timing.focus });
  }, [focusProgress, isSearchFocused]);

  const animatedSearchShellStyle = useAnimatedStyle(() => {
    const borderColor = interpolateColor(
      focusProgress.value,
      [0, 1],
      [Colors.border, Colors.brand],
    );

    const backgroundColor = interpolateColor(
      focusProgress.value,
      [0, 1],
      [Colors.surface, Colors.background],
    );

    return {
      borderColor,
      backgroundColor,
      transform: [{ scale: 1 + focusProgress.value * 0.012 }],
    };
  });

  const handleSearchSubmit = () => {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) return;

    updateBrowseFilters({
      query: trimmedQuery,
    });

    navigation.navigate('Browse', {
      categoryId: 'search',
      title: `Search: "${trimmedQuery}"`,
      searchQuery: trimmedQuery,
    });
  };

  const handlePillPress = (tag: string) => {
    const normalizedTag = tag.trim();
    if (!normalizedTag) return;

    updateBrowseFilters({
      query: normalizedTag,
    });

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

  const showSearchLoadingSkeleton = isSyncing && source === 'mock' && listings.length === 0 && !lastError;

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
    const sellerHandle = MOCK_USERS.find((entry) => entry.id === sellerId)?.username ?? sellerId;
    navigation.navigate('Chat', {
      conversationId: `${sellerId}_${listingId}`,
      focusQuery: sellerHandle,
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

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle={IS_LIGHT ? 'dark-content' : 'light-content'} backgroundColor={Colors.background} />

      {/* Hero Search Header */}
      <View style={styles.header}>
        <AnimatedPressable style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={26} color={Colors.textPrimary} />
        </AnimatedPressable>

        <Reanimated.View style={[styles.inputContainer, animatedSearchShellStyle]}>
          <Ionicons name="search" size={20} color={Colors.textMuted} style={{ marginRight: 8 }} />
          <TextInput
            ref={inputRef}
            style={styles.searchInput}
            placeholder="Search Thryftverse"
            placeholderTextColor={Colors.textMuted}
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={handleSearchSubmit}
            onFocus={() => setIsSearchFocused(true)}
            onBlur={() => setIsSearchFocused(false)}
            returnKeyType="search"
            autoCapitalize="none"
            selectionColor={Colors.brand}
          />
          {query.length > 0 ? (
            <AnimatedPressable style={styles.clearBtn} onPress={() => setQuery('')}>
              <Ionicons name="close-circle" size={20} color={Colors.textSecondary} />
            </AnimatedPressable>
          ) : (
            <Ionicons name="camera" size={24} color={Colors.textMuted} style={{ marginLeft: 8 }} />
          )}
        </Reanimated.View>
      </View>

      {query.length > 0 && (
        <View style={styles.statusRow}>
          <Text style={styles.statusMeta}>{listings.length} listings indexed</Text>
          <SyncStatusPill tone={searchStatus.tone} label={searchStatus.label} compact />
        </View>
      )}

      {lastError ? (
        <SyncRetryBanner
          message="Search indexing is delayed. Results may be stale."
          onRetry={() => void refreshListings()}
          isRetrying={isSyncing}
          telemetryContext="global_search_sync"
          containerStyle={styles.syncRetryBanner}
        />
      ) : null}

      {query.length > 0 && (
        <View style={styles.controlRail}>
          <AppButton
            title={`Sort: ${browseFilters.sort}`}
            icon={<Ionicons name="swap-vertical-outline" size={14} color={Colors.textPrimary} />}
            variant="secondary"
            size="sm"
            style={styles.controlBtn}
            iconContainerStyle={styles.controlBtnIconWrap}
            titleStyle={styles.controlBtnText}
            onPress={handleCycleSort}
          />
          <AppButton
            title={hasActiveDiscoverFilters ? `Filter (${activeFilterCount})` : 'Filter'}
            icon={<Ionicons name="options-outline" size={14} color={Colors.textPrimary} />}
            variant="secondary"
            size="sm"
            style={styles.controlBtn}
            iconContainerStyle={styles.controlBtnIconWrap}
            titleStyle={styles.controlBtnText}
            onPress={handleOpenFilter}
          />
        </View>
      )}

      {hasActiveDiscoverFilters && query.length > 0 ? (
        <View style={styles.controlMetaRow}>
          <Text style={styles.controlMetaText}>Active filters: {activeFilterCount}</Text>
          <AppButton
            title="Clear"
            variant="secondary"
            size="sm"
            style={styles.controlClearBtn}
            titleStyle={styles.controlClearText}
            onPress={handleClearDiscoverFilters}
          />
        </View>
      ) : null}

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {showSearchLoadingSkeleton ? (
          renderSearchLoadingState()
        ) : (
          <>
            {/* Recent Searches - Pill Style */}
            {!normalizedQuery && (
              <Reanimated.View entering={FadeInDown.delay(100).duration(400)} style={styles.sectionWrap}>
                <Text style={styles.sectionTitle}>Recent searches</Text>
                <View style={styles.recentPillsWrap}>
                  {RECENT_SEARCHES.map((term, idx) => (
                    <AnimatedPressable key={idx} style={styles.recentPill} activeOpacity={0.8} onPress={() => handlePillPress(term)}>
                      <Text style={styles.recentPillText}>{term}</Text>
                    </AnimatedPressable>
                  ))}
                </View>
              </Reanimated.View>
            )}

            {/* Top Searches - Colorful Cards */}
            {!normalizedQuery && (
              <Reanimated.View entering={FadeInDown.delay(150).duration(400)} style={styles.sectionWrap}>
                <Text style={styles.sectionTitle}>Top searches</Text>
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
              </Reanimated.View>
            )}

            {/* Trending Tags */}
            {!normalizedQuery && (
              <Reanimated.View entering={FadeInDown.delay(200).duration(400)} style={styles.sectionWrap}>
                <Text style={styles.sectionTitle}>Trending</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.trendingScroll}>
                  {trendingTags.map((tag, idx) => (
                    <AnimatedPressable key={idx} style={styles.trendingPill} activeOpacity={0.8} onPress={() => handlePillPress(tag)}>
                      <Text style={styles.trendingPillText}>{tag}</Text>
                    </AnimatedPressable>
                  ))}
                </ScrollView>
              </Reanimated.View>
            )}

            {/* Explore Featured Boards */}
            {!normalizedQuery && (
              <Reanimated.View entering={FadeInDown.delay(250).duration(400)} style={[styles.sectionWrap, { marginBottom: 32 }]}>
                <Text style={styles.sectionTitle}>Ideas you might like</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.boardsScroll}>
                  {[
                    { title: 'Escape to Indian hills', subtitle: 'Curated Picks', meta: '41 Items \u2022 Trending' },
                    { title: 'Gaming room inspo', subtitle: 'Community', meta: '65 Items \u2022 New' },
                    { title: 'Streetwear essentials', subtitle: 'Editors Pick', meta: '28 Items \u2022 Hot' }
                  ].map((board, idx) => {
                    const startIdx = idx * 3;
                    const imgs = [
                      discoverListings[startIdx % discoverListings.length]?.image || `https://picsum.photos/seed/${idx}1/400/500`,
                      discoverListings[(startIdx + 1) % discoverListings.length]?.image || `https://picsum.photos/seed/${idx}2/400/500`,
                      discoverListings[(startIdx + 2) % discoverListings.length]?.image || `https://picsum.photos/seed/${idx}3/400/500`,
                    ];
                    
                    return (
                      <AnimatedPressable key={idx} style={styles.boardCard} activeOpacity={0.9} onPress={() => setQuery(board.title.split(' ')[0])}>
                        <View style={styles.boardImageGrid}>
                          <CachedImage uri={imgs[0]} style={styles.boardImageMain} contentFit="cover" />
                          <View style={styles.boardImageSide}>
                            <CachedImage uri={imgs[1]} style={styles.boardImageSmall} contentFit="cover" />
                            <CachedImage uri={imgs[2]} style={styles.boardImageSmall} contentFit="cover" />
                          </View>
                        </View>
                        <Text style={styles.boardTitle}>{board.title}</Text>
                        <View style={styles.boardMetaRow}>
                          <Text style={styles.boardSubtitle}>{board.subtitle}</Text>
                          {idx < 2 && <Ionicons name="checkmark-circle" size={14} color={Colors.brand} style={{ marginLeft: 4 }} />}
                        </View>
                        <Text style={styles.boardMeta}>{board.meta}</Text>
                      </AnimatedPressable>
                    );
                  })}
                </ScrollView>
              </Reanimated.View>
            )}

            {/* Discover / Masonry Grid */}
            <Reanimated.View entering={FadeInDown.delay(300).duration(400)} style={styles.sectionWrap}>
              {!normalizedQuery && <Text style={styles.sectionSupertitle}>Ideas for you</Text>}
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
            </Reanimated.View>
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

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
    gap: 12,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
  },
  inputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 28,
    paddingHorizontal: 18,
    height: 52,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  searchInput: {
    flex: 1,
    fontSize: 17,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.textPrimary,
    marginLeft: 8,
  },
  clearBtn: {
    padding: 4,
    marginLeft: 8,
  },

  content: {
    paddingTop: 8,
    paddingBottom: 40,
  },
  statusRow: {
    paddingHorizontal: 20,
    marginTop: -4,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  statusMeta: {
    color: Colors.textMuted,
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
  },
  syncRetryBanner: {
    marginHorizontal: 20,
    marginBottom: 14,
  },
  controlRail: {
    paddingHorizontal: 20,
    flexDirection: 'row',
    gap: 10,
    marginBottom: 8,
  },
  controlBtn: {
    flex: 1,
    minHeight: 38,
    borderRadius: 14,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  controlBtnIconWrap: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'transparent',
  },
  controlBtnText: {
    fontSize: 11,
    fontFamily: 'Inter_700Bold',
    color: Colors.textPrimary,
    letterSpacing: 0.2,
  },
  controlMetaRow: {
    marginHorizontal: 20,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  controlMetaText: {
    color: Colors.textMuted,
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
  },
  controlClearBtn: {
    minHeight: 30,
    borderRadius: 14,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    paddingHorizontal: 10,
  },
  controlClearText: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontFamily: 'Inter_700Bold',
  },
  loadingStateWrap: {
    paddingHorizontal: 20,
    gap: 26,
  },
  loadingSection: {
    gap: 8,
  },
  loadingTagsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  loadingRecentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingBottom: 12,
    marginBottom: 2,
  },

  sectionWrap: {
    marginBottom: 28,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
    color: Colors.textPrimary,
    letterSpacing: -0.3,
    paddingHorizontal: 20,
    marginBottom: 14,
  },
  sectionSupertitle: {
    color: Colors.textMuted,
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
    paddingHorizontal: 20,
    marginBottom: 4,
  },

  // Recent searches pills
  recentPillsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 20,
    gap: 10,
  },
  recentPill: {
    backgroundColor: Colors.surface,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 22,
  },
  recentPillText: {
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
    color: Colors.textPrimary,
  },

  // Top searches cards
  topSearchesScroll: {
    paddingHorizontal: 20,
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
    fontFamily: 'Inter_700Bold',
    letterSpacing: -0.3,
  },

  // Trending
  trendingScroll: {
    paddingHorizontal: 20,
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
    fontFamily: 'Inter_600SemiBold',
    color: Colors.textPrimary,
  },

  // Boards / Ideas you might like
  boardsScroll: {
    paddingHorizontal: 20,
    gap: 14,
  },
  boardCard: {
    width: 260,
  },
  boardImageGrid: {
    flexDirection: 'row',
    height: 150,
    borderRadius: 20,
    overflow: 'hidden',
    gap: 3,
    marginBottom: 12,
  },
  boardImageMain: {
    flex: 3,
    height: '100%',
    borderRadius: 20,
  },
  boardImageSide: {
    flex: 2,
    gap: 3,
  },
  boardImageSmall: {
    flex: 1,
    width: '100%',
    borderRadius: 12,
  },
  boardTitle: {
    color: Colors.textPrimary,
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
    marginBottom: 2,
  },
  boardMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  boardSubtitle: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
  },
  boardMeta: {
    color: Colors.textMuted,
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
  },

  // Masonry / Discover
  recoHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingHorizontal: 20,
    gap: 8,
  },
  recoHeaderTitle: {
    fontSize: 22,
    fontFamily: 'Inter_700Bold',
    color: Colors.textPrimary,
    letterSpacing: -0.5,
  },
  topicSearchBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
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
    fontFamily: 'Inter_500Medium',
  },
});
