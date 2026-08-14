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
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { Motion } from '../constants/motion';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { openProfile } from '../navigation/openProfile';
import { useStore } from '../store/useStore';
import { useBackendData } from '../context/BackendDataContext';
import { SyncStatusPill } from '../components/SyncStatusPill';
import { SkeletonLoader } from '../components/SkeletonLoader';
import { SyncRetryBanner } from '../components/SyncRetryBanner';
import { EmptyState } from '../components/EmptyState';
import { CommerceDetailOfflineBanner } from '../components/commerce/detail';
import { useConnectivity } from '../hooks/useConnectivity';
import { getBackendSyncStatus } from '../utils/syncStatus';
import { CachedImage } from '../components/CachedImage';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SharedTransitionView } from '../components/SharedTransitionView';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { AppButton } from '../components/ui/AppButton';
import { AppSearchBar } from '../components/ui/AppSearchBar';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { searchListingsFromApi } from '../services/feedApi';
import { friendlyBackendError } from '../services/listingMapper';
import type { ListingCondition } from '../services/listingsApi';
import { searchUsers, type UserSearchResult, followUser, unfollowUser } from '../services/profileApi';
import { ProductAnalytics } from '../platform/product/productAnalytics';
import { useSavedSearchAlerts } from '../hooks/useSavedSearchAlerts';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useHaptic } from '../hooks/useHaptic';

/* ΓöÇΓöÇ New Discover Components ΓöÇΓöÇ */
import { EditorialSection } from '../components/discover/EditorialSection';
import { FontFamily, Space, Control, Radius } from '../theme/designTokens';
import { RadiusRoleValue } from '../theme/surfaceRadiusRules';
import { CATEGORIES } from '../constants/categories';
import { resolveListingMediaHeightRatio } from '../utils/listingMediaGeometry';

type Props = NativeStackScreenProps<RootStackParamList, 'GlobalSearch'>;

const RECENT_SEARCHES_KEY = '@thryftverse_recent_searches';
const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Masonry column width — matches the grid layout (paddingHorizontal: 20,
// gap: 8). Used to compute deterministic image heights from real aspect
// ratios so there is zero layout shift when media loads (audit §02:
// skeleton aspect parity; image errors preserve card geometry).
const MASONRY_COL_WIDTH = (SCREEN_WIDTH - 20 * 2 - 8) / 2;

interface RankedListing {
  id: string;
  title: string;
  brand: string | null;
  size: string | null;
  condition: ListingCondition | null;
  image: string;
  price: number;
  likes: number;
  sellerId: string;
  createdAt?: string;
  score: number;
  reason: string;
  /** Media height/width ratio — reserved before image load to prevent reflow. */
  mediaHeightRatio: number;
}

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
// states (Depop/Vinted pattern) with category emoji icons. These are the
// canonical categories, not "trending" — the label is honest. No hardcoded
// editorial "Top Searches" cards — the discover landing only renders real
// backend data, real recent/saved searches, and the canonical category tree
// (audit: Global P0 — remove production sample editorial constants and
// empty-URI rendering).
const CATEGORY_SHORTCUTS: { label: string; icon: string; query: string }[] = CATEGORIES.slice(0, 8).map((cat) => ({
  label: cat.name,
  icon: cat.emoji,
  query: cat.id,
}));

// Editorial seed data has been removed. The discover landing now relies
// entirely on real backend listings, real recent/saved searches, and the
// canonical category tree. Server-driven editorial units can be added here
// when a backend editorial schema is available (see backlog: Search →
// server-driven editorial schema).

// Canonical listing conditions. Backend search rows may carry a free-form
// condition string; only accept it when it matches a known condition so we
// never fabricate a commerce fact (audit P0.4).
const KNOWN_CONDITIONS: readonly ListingCondition[] = [
  'New with tags',
  'Very good',
  'Good',
  'Satisfactory',
];

function normalizeSearchCondition(value: string | null | undefined): ListingCondition | null {
  if (typeof value !== 'string' || value.length === 0) return null;
  const match = KNOWN_CONDITIONS.find(
    (c) => c.toLowerCase() === value.toLowerCase(),
  );
  return match ?? null;
}

function buildAffinitySet(values: Array<string | null | undefined>) {
  const counts = new Map<string, number>();
  values.forEach((value) => {
    if (value == null) return;
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

/**
 * Derives broadened search suggestions from a multi-word query.
 * For "vintage denim jacket" → ["denim", "vintage"].
 * For a single word, falls back to trending category labels so the user
 * always has a meaningful next step.
 */
function getBroadenedSuggestions(rawQuery: string): string[] {
  const tokens = rawQuery.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length > 1) {
    // Offer the individual tokens (shorter / broader) as suggestions
    return tokens.slice(0, 2);
  }
  // Single token ΓÇö surface a couple of trending categories as alternatives
  return ['women', 'men'];
}

/**
 * Compact people result row with follow button.
 * Manages follow state locally since UserSearchResult doesn't carry
 * isFollowing — the button starts as "Follow" and toggles optimistically.
 */
const PeopleResultRow = React.memo(function PeopleResultRow({
  user,
  onPress,
  colors,
}: {
  user: UserSearchResult;
  onPress: () => void;
  colors: ThemeColors;
}) {
  const [isFollowing, setIsFollowing] = React.useState(false);
  const [isToggling, setIsToggling] = React.useState(false);
  const haptic = useHaptic();

  const handleFollow = React.useCallback(async () => {
    if (isToggling) return;
    setIsToggling(true);
    const nextState = !isFollowing;
    setIsFollowing(nextState); // optimistic
    haptic.light();
    try {
      if (nextState) {
        await followUser(user.id);
      } else {
        await unfollowUser(user.id);
      }
    } catch {
      setIsFollowing(!nextState); // revert on error
    } finally {
      setIsToggling(false);
    }
  }, [isFollowing, isToggling, user.id, haptic]);

  return (
    <View style={peopleRowStyles.row}>
      <AnimatedPressable
        style={peopleRowStyles.main}
        onPress={onPress}
        accessibilityLabel={`View profile: ${user.displayName || user.username}`}
        accessibilityRole="button"
      >
        {user.avatar ? (
          <CachedImage
            uri={user.avatar}
            style={peopleRowStyles.avatar}
            contentFit="cover"
            downscaleWidth={96}
          />
        ) : (
          <View style={[peopleRowStyles.avatarFallback, { backgroundColor: colors.surfaceAlt }]}>
            <Ionicons name="person" size={18} color={colors.textMuted} />
          </View>
        )}
        <View style={peopleRowStyles.info}>
          <Text style={[peopleRowStyles.name, { color: colors.textPrimary }]} numberOfLines={1}>
            {user.displayName || `@${user.username}`}
          </Text>
          {user.displayName && (
            <Text style={[peopleRowStyles.username, { color: colors.textMuted }]} numberOfLines={1}>
              @{user.username}
            </Text>
          )}
        </View>
      </AnimatedPressable>
      <AnimatedPressable
        style={[
          peopleRowStyles.followBtn,
          { backgroundColor: isFollowing ? colors.surfaceAlt : colors.textPrimary },
        ]}
        onPress={handleFollow}
        disabled={isToggling}
        accessibilityLabel={isFollowing ? `Unfollow ${user.username}` : `Follow ${user.username}`}
        accessibilityRole="button"
        accessibilityState={{ selected: isFollowing }}
      >
        <Text style={[
          peopleRowStyles.followText,
          { color: isFollowing ? colors.textSecondary : colors.textInverse },
        ]}>
          {isFollowing ? 'Following' : 'Follow'}
        </Text>
      </AnimatedPressable>
    </View>
  );
});

const peopleRowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.sm + 2,
    paddingHorizontal: Space.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  main: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  avatarFallback: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: {
    flex: 1,
    gap: 2,
  },
  name: {
    fontSize: 15,
    fontFamily: FontFamily.semibold,
  },
  username: {
    fontSize: 13,
    fontFamily: FontFamily.regular,
  },
  followBtn: {
    paddingHorizontal: Space.sm + 2,
    paddingVertical: Space.xs + 2,
    borderRadius: Radius.lg,
    minHeight: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  followText: {
    fontSize: 13,
    fontFamily: FontFamily.semibold,
  },
});

export default function GlobalSearchScreen({ navigation }: Props) {
  const [query, setQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
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
  const { formatFromFiat } = useFormattedPrice();
  const { colors, isDark } = useAppTheme();
  const { isOffline } = useConnectivity();
  const reducedMotionEnabled = useReducedMotion();
  const focusProgress = useSharedValue(0);

  // Evaluate saved search alerts against current listings
  useSavedSearchAlerts();

  const normalizedQuery = query.trim().toLowerCase();
  const queryTokens = useMemo(
    () => normalizedQuery.split(/\s+/).filter(Boolean),
    [normalizedQuery],
  );

  const [backendSearchResults, setBackendSearchResults] = useState<RankedListing[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Scope tabs: Items | People — per spec 11, search results should offer
  // scope切换 after query entry so users can find sellers, not just items.
  const [searchScope, setSearchScope] = useState<'items' | 'people'>('items');
  const [peopleResults, setPeopleResults] = useState<UserSearchResult[]>([]);
  const [isSearchingPeople, setIsSearchingPeople] = useState(false);

  // Reset scope to Items whenever the query changes
  useEffect(() => {
    setSearchScope('items');
  }, [normalizedQuery]);

  useEffect(() => {
    if (!normalizedQuery || normalizedQuery.length < 2) {
      setBackendSearchResults([]);
      setSearchError(null);
      return;
    }

    let cancelled = false;
    setIsSearching(true);
    setSearchError(null);

    searchListingsFromApi(normalizedQuery, 50)
      .then((result) => {
        if (cancelled) return;
        if (result.error) {
          setSearchError(result.error);
          setBackendSearchResults([]);
        } else {
          setBackendSearchResults(
            result.items.map((item) => ({
              id: item.id,
              title: item.title || 'Untitled listing',
              // Render only known facts. A missing brand is not the first
              // two words of a title; an unknown size is not "One size";
              // an unknown condition is not "Very good". Backend search
              // rows carry nullable commerce facts and the UI omits
              // absent values rather than inventing them (audit P0.4).
              brand: item.brand ?? null,
              size: item.size ?? null,
              condition: normalizeSearchCondition(item.condition),
              image: item.imageUrl ?? '',
              price: Number(item.priceGbp ?? 0),
              likes: 0,
              sellerId: item.sellerId,
              createdAt: item.createdAt,
              score: item.rank,
              reason: result.fallback ? 'Fuzzy match' : 'Search match',
              // Backend results don't carry media dimensions — use the
              // canonical 3:4 portrait fallback (listingMediaGeometry default).
              mediaHeightRatio: 4 / 3,
            })),
          );
        }
      })
      .finally(() => {
        if (!cancelled) setIsSearching(false);
      });

    return () => {
      cancelled = true;
    };
  }, [normalizedQuery]);

  // People search — fetches matching users when scope is 'people' and a
  // query is active. Debounced 300ms to avoid hammering the user-search
  // endpoint on every keystroke (user search is more expensive than
  // listing search and benefits from explicit debouncing).
  useEffect(() => {
    if (!normalizedQuery || normalizedQuery.length < 2) {
      setPeopleResults([]);
      setIsSearchingPeople(false);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      setIsSearchingPeople(true);

      searchUsers(normalizedQuery, 20)
        .then((results) => {
          if (cancelled) return;
          setPeopleResults(results);
        })
        .catch(() => {
          if (cancelled) return;
          setPeopleResults([]);
        })
        .finally(() => {
          if (!cancelled) setIsSearchingPeople(false);
        });
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [normalizedQuery]);

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
      ),
    }),
    [wishlistListings],
  );

  const rankedListings = useMemo<RankedListing[]>(() => {
    if (normalizedQuery && backendSearchResults.length > 0) {
      return backendSearchResults;
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
          mediaHeightRatio: resolveListingMediaHeightRatio(listing),
        };
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
      mediaHeightRatio: resolveListingMediaHeightRatio(listing),
    }));

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
        sorted.sort((a, b) => b.score - a.score || b.likes - a.likes);
        break;
    }

    return normalizedQuery ? sorted.slice(0, 16) : sorted;
  }, [browseFilters.brands, browseFilters.condition, browseFilters.sizes, browseFilters.sort, browseFilters.priceMin, browseFilters.priceMax, rankedListings, listings, normalizedQuery]);

  useEffect(() => {
    focusProgress.value = withTiming(isSearchFocused ? 1 : 0, { duration: Motion.timing.focus });
  }, [focusProgress, isSearchFocused]);

  const animatedSearchShellStyle = useAnimatedStyle(() => {
    // Subtle background shift on focus — matches Explore's clean field.
    // No border animation (Explore has no border); geometry stays constant
    // for a smooth transition from Explore to GlobalSearch.
    const backgroundColor = interpolateColor(
      focusProgress.value,
      [0, 1],
      [colors.surfaceAlt, colors.surfaceAlt],
    );
    return {
      backgroundColor,
      transform: [{ scale: 1 + focusProgress.value * 0.008 }],
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
    const updated = [term, ...recentSearches.filter((s) => s !== term)].slice(0, 8);
    setRecentSearches(updated);
    await AsyncStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
  };

  const clearRecentSearches = async () => {
    setRecentSearches([]);
    await AsyncStorage.removeItem(RECENT_SEARCHES_KEY);
  };

  // Live search suggestions ΓÇö derived from listing titles, brands, and categories
  // that partially match the current query. Shown as a dropdown while typing.
  const searchSuggestions = useMemo(() => {
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

    const suggestions: Array<{ text: string; type: 'brand' | 'category' | 'item' }> = [];
    for (const brand of brandSet) suggestions.push({ text: brand, type: 'brand' });
    for (const category of categorySet) suggestions.push({ text: category, type: 'category' });
    for (const title of titleSet) suggestions.push({ text: title, type: 'item' });

    // Also include matches from recent searches
    for (const recent of recentSearches) {
      if (recent.toLowerCase().includes(partial) && !suggestions.some((s) => s.text.toLowerCase() === recent.toLowerCase())) {
        suggestions.push({ text: recent, type: 'item' });
      }
    }

    return suggestions.slice(0, 6);
  }, [query, isSearchFocused, listings, recentSearches]);

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
      title: label,
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
    const activeSortIndex = DISCOVER_SORT_OPTIONS.indexOf(browseFilters.sort as SearchSortOption);
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
        sort: browseFilters.sort,
      },
      alertsEnabled: true,
    });
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
    navigation.navigate('Browse', {
      categoryId: 'search',
      title: `Search: "${searchQuery}"`,
      searchQuery,
    });
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
      itemId: listingId,
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
      const itemHeight = MASONRY_COL_WIDTH * listing.mediaHeightRatio + 40; // 40 ≈ price overlay
      if (h1 <= h2) {
        col1.push(listing);
        h1 += itemHeight + 8; // 8 = gap
      } else {
        col2.push(listing);
        h2 += itemHeight + 8;
      }
    }
    return { masonryColumn1: col1, masonryColumn2: col2 };
  }, [discoverListings]);

  const isDiscoverLanding = !normalizedQuery;

  const t = StyleSheet.create({
    container: { backgroundColor: colors.background },
    inputContainer: { backgroundColor: colors.surfaceAlt },
    filterBarCount: { color: colors.textSecondary },
    filterIconBadge: { backgroundColor: colors.brand },
    filterIconBadgeText: { color: colors.textInverse },
    suggestionsWrap: { backgroundColor: colors.surface, borderColor: colors.border },
    suggestionsHeader: { color: colors.textMuted },
    suggestionRow: { borderTopColor: colors.border },
    suggestionText: { color: colors.textPrimary },
    trendingFocusPill: { backgroundColor: colors.surface, borderColor: colors.border },
    trendingFocusText: { color: colors.textPrimary },
    savedSearchRow: { backgroundColor: colors.surface, borderColor: colors.border },
    savedSearchQuery: { color: colors.textPrimary },
    savedSearchMeta: { color: colors.textMuted },
    recoEmptyState: { borderColor: colors.border, backgroundColor: colors.surface },
    recoEmptyText: { color: colors.textSecondary },
  });

  return (
    <SafeAreaView style={[styles.container, t.container]} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />

      {/* Hero Search Header */}
      <View style={styles.header}>
        <AnimatedPressable style={styles.backBtn} onPress={() => navigation.goBack()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} accessibilityLabel="Go back" accessibilityRole="button">
          <Ionicons name="arrow-back" size={26} color={colors.textPrimary} />
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
                <Ionicons name="camera" size={24} color={colors.textMuted} />
              </AnimatedPressable>
            }
            inputProps={{
              autoFocus: true,
              onSubmitEditing: handleSearchSubmit,
              onFocus: () => setIsSearchFocused(true),
              onBlur: () => setIsSearchFocused(false),
              returnKeyType: 'search',
              autoCapitalize: 'none',
              selectionColor: colors.brand,
            }}
          />
        </Reanimated.View>
      </View>

      {query.length > 0 && (lastError || searchError) && (
        <View style={styles.statusPillWrap}>
          <SyncStatusPill {...searchStatus} />
        </View>
      )}

      <CommerceDetailOfflineBanner isOffline={isOffline} />

      {/* Live search suggestions dropdown */}
      {searchSuggestions.length > 0 && (
        <Reanimated.View
          entering={reducedMotionEnabled ? undefined : FadeInDown.duration(150)}
          style={[styles.suggestionsWrap, t.suggestionsWrap]}
        >
          <Text style={[styles.suggestionsHeader, t.suggestionsHeader]}>Suggestions</Text>
          {searchSuggestions.map((suggestion, idx) => (
            <AnimatedPressable
              key={`${suggestion.type}_${idx}`}
              style={[styles.suggestionRow, t.suggestionRow]}
              onPress={() => {
                setQuery(suggestion.text);
                inputRef.current?.blur();
                handlePillPress(suggestion.text);
              }}
              accessibilityLabel={`Search for ${suggestion.text}`}
              accessibilityRole="button"
            >
              <Ionicons
                name={
                  suggestion.type === 'brand'
                    ? 'pricetag-outline'
                    : suggestion.type === 'category'
                    ? 'grid-outline'
                    : 'search-outline'
                }
                size={16}
                color={colors.textMuted}
              />
              <Text style={[styles.suggestionText, t.suggestionText]} numberOfLines={1}>
                {suggestion.text}
              </Text>
              <Ionicons name="arrow-forward" size={14} color={colors.textMuted} />
            </AnimatedPressable>
          ))}
        </Reanimated.View>
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
            {/* ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ DISCOVER LANDING (no query) ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ */}
            {isDiscoverLanding && (
              <>
                {/* ΓöÇΓöÇ FOCUS STATE: Clean recent + trending when search is focused ΓöÇΓöÇ */}
                {isSearchFocused ? (
                  <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(220)}>
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
                              <Ionicons name="time-outline" size={16} color={colors.textMuted} />
                              <Text style={styles.recentRowText} numberOfLines={1}>{term}</Text>
                              <Ionicons name="arrow-forward" size={14} color={colors.textMuted} />
                            </AnimatedPressable>
                          ))}
                          <AnimatedPressable
                            style={[styles.recentRow, { justifyContent: 'center' }]}
                            onPress={clearRecentSearches}
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

                    {/* Trending categories — real category data with icons */}
                    <EditorialSection title="Categories">
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.trendingFocusScroll}
                      >
                        {CATEGORY_SHORTCUTS.map((cat, idx) => (
                          <AnimatedPressable
                            key={idx}
                            style={[styles.trendingFocusPill, t.trendingFocusPill]}
                            onPress={() => handleCategoryPress(cat.query, cat.label)}
                            accessibilityLabel={`Browse ${cat.label} category`}
                            accessibilityRole="button"
                          >
                            <Text style={styles.trendingFocusIcon}>{cat.icon}</Text>
                            <Text style={[styles.trendingFocusText, t.trendingFocusText]}>{cat.label}</Text>
                          </AnimatedPressable>
                        ))}
                      </ScrollView>
                    </EditorialSection>
                  </Reanimated.View>
                ) : (
                <>
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
                          <Ionicons name="time-outline" size={16} color={colors.textMuted} />
                          <Text style={styles.recentRowText} numberOfLines={1}>{term}</Text>
                          <Ionicons name="arrow-forward" size={14} color={colors.textMuted} />
                        </AnimatedPressable>
                      ))}
                      <AnimatedPressable
                        style={[styles.recentRow, { justifyContent: 'center' }]}
                        onPress={clearRecentSearches}
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
                            />
                          </AnimatedPressable>
                          <AnimatedPressable
                            style={styles.savedSearchRemove}
                            onPress={() => handleRemoveSavedSearch(search.id)}
                            accessibilityLabel="Remove saved search"
                            accessibilityRole="button"
                          >
                            <Ionicons name="close" size={16} color={colors.textMuted} />
                          </AnimatedPressable>
                        </View>
                      ))}
                    </View>
                  </EditorialSection>
                )}

                {/* Suggested categories — canonical category tree, no editorial seed */}
                <EditorialSection title="Categories">
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.trendingFocusScroll}>
                    {CATEGORY_SHORTCUTS.map((cat, idx) => (
                      <AnimatedPressable
                        key={idx}
                        style={[styles.trendingFocusPill, t.trendingFocusPill]}
                        onPress={() => handleCategoryPress(cat.query, cat.label)}
                        accessibilityLabel={`Browse ${cat.label} category`}
                        accessibilityRole="button"
                      >
                        <Text style={styles.trendingFocusIcon}>{cat.icon}</Text>
                        <Text style={[styles.trendingFocusText, t.trendingFocusText]}>{cat.label}</Text>
                      </AnimatedPressable>
                    ))}
                  </ScrollView>
                </EditorialSection>

                {/* Discover masonry grid at bottom of landing */}
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
                            accessibilityLabel={`${listing.title}, ${formatFromFiat(listing.price, 'GBP', { displayMode: 'fiat' })}`}
                            accessibilityRole="button"
                          >
                            <SharedTransitionView sharedTransitionTag={`image-${listing.id}-0`}>
                              <CachedImage
                                uri={listing.image}
                                style={[styles.masonryImg, { height: Math.round(MASONRY_COL_WIDTH * listing.mediaHeightRatio) }]}
                                contentFit="cover"
                              />
                            </SharedTransitionView>
                            <View style={styles.resultOverlay}>
                              <Text style={styles.resultPrice}>{formatFromFiat(listing.price, 'GBP', { displayMode: 'fiat' })}</Text>
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
                            accessibilityLabel={`${listing.title}, ${formatFromFiat(listing.price, 'GBP', { displayMode: 'fiat' })}`}
                            accessibilityRole="button"
                          >
                            <SharedTransitionView sharedTransitionTag={`image-${listing.id}-0`}>
                              <CachedImage
                                uri={listing.image}
                                style={[styles.masonryImg, { height: Math.round(MASONRY_COL_WIDTH * listing.mediaHeightRatio) }]}
                                contentFit="cover"
                              />
                            </SharedTransitionView>
                            <View style={styles.resultOverlay}>
                              <Text style={styles.resultPrice}>{formatFromFiat(listing.price, 'GBP', { displayMode: 'fiat' })}</Text>
                            </View>
                          </AnimatedPressable>
                        ))}
                      </View>
                    </View>
                  ) : (
                    <View style={[styles.recoEmptyState, t.recoEmptyState]}>
                      <Ionicons name="images-outline" size={18} color={colors.textMuted} />
                      <Text style={[styles.recoEmptyText, t.recoEmptyText]}>
                        {hasActiveDiscoverFilters
                          ? 'No picks match your current filters. Adjust or clear them.'
                          : 'No ranked results yet. Try a shorter keyword.'}
                      </Text>
                    </View>
                  )}
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
                    onRetry={() => void refreshListings()}
                    isRetrying={isSyncing || isSearching}
                    telemetryContext="global_search_sync"
                    containerStyle={{ marginHorizontal: 20, marginBottom: 12 }}
                  />
                ) : null}

                {isSearching && searchScope === 'items' && (
                  <View style={{ paddingHorizontal: 20, marginBottom: 8 }}>
                    <SkeletonLoader width="40%" height={14} borderRadius={7} />
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
                            <SkeletonLoader width={44} height={44} borderRadius={22} />
                            <View style={{ flex: 1, gap: 4 }}>
                              <SkeletonLoader width="50%" height={14} borderRadius={7} />
                              <SkeletonLoader width="30%" height={12} borderRadius={6} />
                            </View>
                          </View>
                        ))}
                      </View>
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
                        <Ionicons name="people-outline" size={22} color={colors.textMuted} />
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
                {/* Sort + Filter — single icons, not a wall of chips */}
                <View style={styles.filterBar}>
                  <Text style={[styles.filterBarCount, t.filterBarCount]} numberOfLines={1}>
                    {discoverListings.length} {discoverListings.length === 1 ? 'result' : 'results'}
                  </Text>
                  <View style={styles.filterBarActions}>
                    <AnimatedPressable
                      style={styles.filterIconBtn}
                      onPress={handleCycleSort}
                      accessibilityLabel={`Sort by ${browseFilters.sort}`}
                      accessibilityRole="button"
                    >
                      <Ionicons name="swap-vertical" size={20} color={colors.textPrimary} />
                    </AnimatedPressable>
                    <AnimatedPressable
                      style={styles.filterIconBtn}
                      onPress={handleOpenFilter}
                      accessibilityLabel={activeFilterCount > 0 ? `Open filters, ${activeFilterCount} active` : 'Open filters'}
                      accessibilityRole="button"
                    >
                      <Ionicons name="options-outline" size={20} color={colors.textPrimary} />
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
                        />
                      </AnimatedPressable>
                    )}
                  </View>
                </View>

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
                            accessibilityLabel={`${listing.title}, ${formatFromFiat(listing.price, 'GBP', { displayMode: 'fiat' })}`}
                            accessibilityRole="button"
                          >
                            <SharedTransitionView sharedTransitionTag={`image-${listing.id}-0`}>
                              <CachedImage
                                uri={listing.image}
                                style={[styles.masonryImg, { height: Math.round(MASONRY_COL_WIDTH * listing.mediaHeightRatio) }]}
                                contentFit="cover"
                              />
                            </SharedTransitionView>
                            <View style={styles.resultOverlay}>
                              <Text style={styles.resultPrice}>{formatFromFiat(listing.price, 'GBP', { displayMode: 'fiat' })}</Text>
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
                            accessibilityLabel={`${listing.title}, ${formatFromFiat(listing.price, 'GBP', { displayMode: 'fiat' })}`}
                            accessibilityRole="button"
                          >
                            <SharedTransitionView sharedTransitionTag={`image-${listing.id}-0`}>
                              <CachedImage
                                uri={listing.image}
                                style={[styles.masonryImg, { height: Math.round(MASONRY_COL_WIDTH * listing.mediaHeightRatio) }]}
                                contentFit="cover"
                              />
                            </SharedTransitionView>
                            <View style={styles.resultOverlay}>
                              <Text style={styles.resultPrice}>{formatFromFiat(listing.price, 'GBP', { displayMode: 'fiat' })}</Text>
                            </View>
                          </AnimatedPressable>
                        ))}
                      </View>
                    </View>
                  ) : searchError && !isSearching ? (
                    <EmptyState
                      density="compact"
                      icon="cloud-offline-outline"
                      iconColor={colors.danger}
                      title="Search unavailable"
                      subtitle={friendlyBackendError(searchError)}
                      ctaLabel="Retry search"
                      onCtaPress={() => {
                        setSearchError(null);
                        void refreshListings();
                      }}
                    />
                  ) : (
                    <View style={[styles.noResultsState, { borderColor: colors.border }]}>
                      <Ionicons name="search-outline" size={22} color={colors.textMuted} />
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
                                const suggestions = getBroadenedSuggestions(query);
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

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
    gap: Space.smMd,
  },
  backBtn: {
    width: Control.hit,
    height: Control.hit,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.lg,
    borderWidth: 0,
    borderColor: 'transparent',
    paddingHorizontal: Space.md,
    paddingVertical: 0,
    minHeight: Control.hit,
  },
  statusPillWrap: {
    paddingHorizontal: 20,
    marginBottom: 8,
  },

  // Live search suggestions
  suggestionsWrap: {
    marginHorizontal: 12,
    marginBottom: 8,
    borderRadius: RadiusRoleValue.standalonePanel,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 6,
  },
  suggestionsHeader: {
    fontSize: 11,
    fontFamily: FontFamily.semibold,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  suggestionText: {
    flex: 1,
    fontSize: 15,
    fontFamily: FontFamily.regular,
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

  // Recent searches — compact rows
  recentRowsWrap: {
    paddingHorizontal: Space.md,
    gap: 0,
  },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.sm + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  recentRowText: {
    flex: 1,
    fontSize: 15,
    fontFamily: FontFamily.regular,
  },

  // Focus state — trending pills (horizontal scroll with category icons)
  trendingFocusScroll: {
    paddingHorizontal: 16,
    gap: 10,
  },
  trendingFocusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: RadiusRoleValue.compactControl,
    borderWidth: 1,
  },
  trendingFocusIcon: {
    fontSize: 15,
    marginRight: 6,
  },
  trendingFocusText: {
    fontSize: 13,
    fontFamily: FontFamily.medium,
  },

  // Filter bar — single icons, not a wall of chips
  filterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    paddingBottom: Space.smMd,
  },
  filterBarCount: {
    flex: 1,
    fontSize: 13,
    fontFamily: FontFamily.medium,
    fontVariant: ['tabular-nums'],
  },
  filterBarActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  filterIconBtn: {
    width: Control.hit,
    height: Control.hit,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  filterIconBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  filterIconBadgeText: {
    fontSize: 10,
    fontFamily: FontFamily.bold,
    lineHeight: 12,
  },
  savedSearchListWrap: {
    paddingHorizontal: 20,
    gap: 8,
  },
  savedSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: RadiusRoleValue.standalonePanel,
    borderWidth: StyleSheet.hairlineWidth,
  },
  savedSearchMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  savedSearchTextWrap: {
    flex: 1,
    gap: 2,
  },
  savedSearchQuery: {
    fontSize: 14,
    fontFamily: FontFamily.semibold,
  },
  savedSearchMeta: {
    fontSize: 11,
    fontFamily: FontFamily.regular,
  },
  savedSearchToggle: {
    width: 36,
    height: 36,
    borderRadius: RadiusRoleValue.pillAvatar,
    alignItems: 'center',
    justifyContent: 'center',
  },
  savedSearchRemove: {
    width: 44,
    height: 44,
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
    borderRadius: RadiusRoleValue.standalonePanel,
    overflow: 'hidden',
    position: 'relative',
  },
  masonryImg: {
    width: '100%',
    borderRadius: RadiusRoleValue.standalonePanel,
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
    fontFamily: FontFamily.bold,
    fontSize: 14,
    color: '#fff',
    fontVariant: ['tabular-nums'],
  },
  recoEmptyState: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: RadiusRoleValue.standalonePanel,
    paddingVertical: 14,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 20,
    flexWrap: 'wrap',
  },
  recoEmptyText: {
    fontSize: 12,
    fontFamily: FontFamily.medium,
    flex: 1,
  },
  recoEmptyCta: {
    borderWidth: 1,
    borderRadius: RadiusRoleValue.mediaThumbnail,
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginTop: 4,
  },
  recoEmptyCtaText: {
    fontSize: 12,
    fontFamily: FontFamily.semibold,
  },

  // Contextual no-results state (search results surface)
  noResultsState: {
    alignItems: 'center',
    paddingVertical: 28,
    paddingHorizontal: 20,
    marginHorizontal: 20,
    borderRadius: RadiusRoleValue.standalonePanel,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  noResultsTitle: {
    fontSize: 16,
    fontFamily: FontFamily.semibold,
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  noResultsSubtitle: {
    fontSize: 13,
    fontFamily: FontFamily.regular,
    textAlign: 'center',
    lineHeight: 18,
  },
  noResultsActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
  },
  noResultsPrimaryCta: {
    borderRadius: RadiusRoleValue.pillAvatar,
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  noResultsPrimaryCtaText: {
    fontSize: 13,
    fontFamily: FontFamily.semibold,
  },
  noResultsSecondaryCta: {
    borderRadius: RadiusRoleValue.pillAvatar,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderWidth: 1,
  },
  noResultsSecondaryCtaText: {
    fontSize: 13,
    fontFamily: FontFamily.semibold,
  },

  // Scope tabs (Items | People)
  scopeTabBar: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 4,
    gap: 24,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  scopeTab: {
    paddingVertical: 10,
    alignItems: 'center',
    position: 'relative',
  },
  scopeTabLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  scopeTabText: {
    fontSize: 15,
    fontFamily: FontFamily.medium,
  },
  scopeTabCount: {
    fontSize: 13,
    fontFamily: FontFamily.regular,
    fontVariant: ['tabular-nums'],
  },
  scopeTabIndicator: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    borderRadius: 1,
  },

  // People results
  peopleResultsList: {
    gap: 0,
  },
});
