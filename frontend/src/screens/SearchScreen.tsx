import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import {
  AnimatedPressable
} from '../components/AnimatedPressable';
import {
  View,
  StyleSheet,
  StatusBar,
  TextInput,
  Pressable,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../theme/ThemeContext';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { openProfile } from '../navigation/openProfile';
import { useStore } from '../store/useStore';
import { SyncRetryBanner } from '../components/SyncRetryBanner';
import { useBackendData } from '../context/BackendDataContext';
import { Type, Typography, Space, Radius, Control, LetterSpacing, Stroke } from '../theme/designTokens';
import { OfflineBanner } from '../components/OfflineBanner';
import { useHaptic } from '../hooks/useHaptic';
import { DiscoveryModeNav, type DiscoveryMode } from '../components/discovery/DiscoveryModeNav';
import { DiscoverScene, PulseScene, LooksScene } from '../scenes/discovery';
import { SearchAutocomplete } from '../components/search/SearchAutocomplete';
import { loadRecentSearchStrings, recordRecentSearch, clearRecentSearches } from '../services/searchHistory';
import type { DiscoveryListingSummary } from '../contracts/DiscoveryListingSummary';
import { useTaxonomy } from '../context/TaxonomyContext';

type NavT = NativeStackNavigationProp<RootStackParamList>;

type ExploreTab = DiscoveryMode;

// Main screen
export default function SearchScreen() {
  const navigation = useNavigation<NavT>();
  const { listings, isSyncing, lastError, refreshListings, loadMoreListings, isLoadingMore, hasMore } = useBackendData();
  const currentUser = useStore((state) => state.currentUser);
  const toggleSavedProduct = useStore((state) => state.toggleSavedProduct);
  const isSavedProduct = useStore((state) => state.isSavedProduct);
  const haptic = useHaptic();
  const { categories } = useTaxonomy();

  const trendingSearches = useMemo(
    () =>
      categories
        .filter((cat) => cat.parentId === null)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .slice(0, 5)
        .map((cat) => cat.name),
    [categories],
  );

  const [refreshing, setRefreshing] = useState(false);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [activeTab, setActiveTab] = useState<ExploreTab>('discover');
  // Tabs that have been visited at least once. A scene mounts the first
  // time its tab is activated and stays mounted (hidden) afterwards so
  // its scroll position is preserved across tab switches.
  const [loadedTabs, setLoadedTabs] = useState<Set<ExploreTab>>(new Set(['discover']));

  // Inline search state — real TextInput with autocomplete dropdown.
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const searchInputRef = useRef<TextInput>(null);

  useEffect(() => {
    loadRecentSearchStrings(currentUser?.id)
      .then(setRecentSearches)
      .catch(() => undefined);
  }, [currentUser?.id]);

  const submitSearch = useCallback((query: string) => {
    const trimmed = query.trim();
    if (!trimmed) return;
    Keyboard.dismiss();
    setIsSearchFocused(false);
    // Persist to recent searches.
    recordRecentSearch(trimmed, currentUser?.id)
      .then((updated) => setRecentSearches(updated.map((e) => e.query)))
      .catch(() => undefined);
    navigation.navigate('GlobalSearch', { initialQuery: trimmed });
  }, [navigation, currentUser?.id]);

  const handleRefresh = async () => {
    haptic.patterns.refresh();
    setRefreshing(true);
    await refreshListings();
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(() => {
      refreshTimerRef.current = null;
      setRefreshing(false);
    }, 400);
  };

  useEffect(() => {
    return () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
    };
  }, []);

  const { colors, isDark } = useAppTheme();

  const styles = useMemo(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

  // Search
  searchRow: {
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    paddingBottom: Space.smMd,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.smMd,
  },
  searchBar: {
    flex: 1,
    minHeight: Control.hit,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.smMd,
    backgroundColor: colors.surfaceAlt,
    borderRadius: Radius.lg,
    borderWidth: Stroke.hairline,
    borderColor: colors.borderSubtle,
    paddingHorizontal: Space.md,
  },
  searchBarFocused: {
    backgroundColor: colors.surface,
    borderColor: colors.brand,
  },
  searchInput: {
    flex: 1,
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
    color: colors.textPrimary,
    fontFamily: Typography.family.regular,
    letterSpacing: LetterSpacing.wide,
    padding: 0,
  },
  searchPlaceholder: {
    flex: 1,
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
    color: colors.textMuted,
    fontFamily: Typography.family.regular,
    letterSpacing: LetterSpacing.wide,
  },
  autocompleteOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: colors.background,
    zIndex: 10,
  },
  autocompleteDropdown: {
    flex: 1,
    paddingHorizontal: Space.md,
  },
  visualSearchButton: {
    width: Control.hit,
    height: Control.hit,
    borderRadius: Radius.lg,
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },

  syncRetryBanner: {
    marginHorizontal: Space.md,
    marginBottom: Space.smMd,
  },

  // Scene container — each scene owns its own scroll surface.
  sceneHost: { flex: 1 },
  }), [colors]);

  const handleTabChange = (next: ExploreTab) => {
    setActiveTab(next);
    setLoadedTabs((prev) => {
      if (prev.has(next)) return prev;
      const updated = new Set(prev);
      updated.add(next);
      return updated;
    });
  };

  const discoverProps = {
    listings,
    isSyncing,
    lastError,
    isLoadingMore,
    hasMore,
    refreshing,
    onRefresh: () => void handleRefresh(),
    onLoadMore: () => void loadMoreListings(),
    // DiscoverScene now receives heterogeneous DiscoveryFeedUnit[]; listing
    // tiles carry the production DiscoveryListingSummary, so the navigation
    // callbacks are typed against that contract (it exposes id + sellerId,
    // which is all navigation needs here).
    onPressItem: (item: DiscoveryListingSummary) => navigation.navigate('ItemDetail', { itemId: item.id }),
    onPressSeller: (item: DiscoveryListingSummary) => openProfile(navigation, item.sellerId, currentUser?.id),
    onMessageSeller: (item: DiscoveryListingSummary) => navigation.navigate('Chat', {
      conversationId: `${item.sellerId}_${item.id}`,
      focusQuery: '',
      partnerUserId: item.sellerId,
      itemId: item.id,
    }),
    onBrowseCategories: () => navigation.navigate('Browse', { categoryId: 'all', title: 'Browse' }),
    // Quick-save: bookmark button on each discovery tile (Pinterest/Depop
    // pattern). The store owns the saved state; the tile reflects it.
    onToggleSave: (item: DiscoveryListingSummary) => {
      haptic.light();
      toggleSavedProduct(item.id);
    },
    isSavedListing: (listingId: string) => isSavedProduct(listingId),
  };

  const renderScene = (tab: ExploreTab) => {
    switch (tab) {
      case 'discover':
        return <DiscoverScene {...discoverProps} />;
      case 'pulse':
        return <PulseScene />;
      case 'looks':
        return <LooksScene />;
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />

      {/* -- Search Bar (real inline input with autocomplete) -- */}
      <View style={styles.searchRow}>
        <Pressable
          style={[styles.searchBar, isSearchFocused && styles.searchBarFocused]}
          onPress={() => searchInputRef.current?.focus()}
          accessibilityRole="button"
          accessibilityLabel="Search"
        >
          <Ionicons name="search" size={19} color={colors.textMuted} />
          <TextInput
            ref={searchInputRef}
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search items, brands and people"
            placeholderTextColor={colors.textMuted}
            onFocus={() => setIsSearchFocused(true)}
            onSubmitEditing={() => submitSearch(searchQuery)}
            returnKeyType="search"
            accessibilityRole="search"
            accessibilityLabel="Search"
          />
          {searchQuery.length > 0 && (
            <Pressable
              hitSlop={8}
              onPress={() => { setSearchQuery(''); searchInputRef.current?.focus(); }}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
            >
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </Pressable>
          )}
        </Pressable>
        <AnimatedPressable
          style={styles.visualSearchButton}
          onPress={() => navigation.navigate('VisualSearch')}
          accessibilityLabel="Visual search"
          accessibilityRole="button"
        >
          <Ionicons name="camera-outline" size={20} color={colors.textPrimary} />
        </AnimatedPressable>
      </View>

      {/* Autocomplete overlay — covers scene content while the search is focused. */}
      {isSearchFocused && (
        <View style={styles.autocompleteOverlay}>
          <View style={styles.autocompleteDropdown}>
            <SearchAutocomplete
              query={searchQuery}
              visible={isSearchFocused}
              trending={trendingSearches}
              recent={recentSearches}
              userId={currentUser?.id}
              onSelect={(suggestion) => {
                const query: string = 'query' in suggestion && suggestion.query
                  ? String(suggestion.query)
                  : ('label' in suggestion ? String(suggestion.label) : '');
                submitSearch(query);
              }}
              onClearRecent={() => {
                clearRecentSearches(currentUser?.id)
                  .then(() => setRecentSearches([]))
                  .catch(() => undefined);
              }}
            />
          </View>
          <Pressable
            style={{ height: Space.xl }}
            onPress={() => { setIsSearchFocused(false); searchInputRef.current?.blur(); Keyboard.dismiss(); }}
            accessibilityRole="button"
            accessibilityLabel="Dismiss search"
          />
        </View>
      )}

      {/* -- Offline banner (global concern, fixed at top) -- */}
      <OfflineBanner onRetry={() => void handleRefresh()} />

      {/* -- Sync Error Banner (global listings-sync concern) -- */}
      {lastError ? (
        <SyncRetryBanner
          message="Sync is unavailable. Showing cached items."
          onRetry={() => void handleRefresh()}
          isRetrying={isSyncing || refreshing}
          telemetryContext="explore_sync"
          containerStyle={styles.syncRetryBanner}
        />
      ) : null}

      {/* -- Discovery mode navigation (sticky) -- */}
      <DiscoveryModeNav
        activeMode={activeTab}
        onModeChange={handleTabChange}
        onRepeatTap={() => void handleRefresh()}
      />

      {/* -- Active scene — each tab owns its own scroll surface.
            Scenes stay mounted once visited so scroll position is
            preserved across tab switches; inactive scenes are hidden. -- */}
      <View style={styles.sceneHost}>
        {(['discover', 'pulse', 'looks'] as ExploreTab[]).map((tab) => {
          if (!loadedTabs.has(tab)) return null;
          const isActive = tab === activeTab;
          return (
            <View
              key={tab}
              style={[styles.sceneHost, { display: isActive ? 'flex' : 'none' }]}
              pointerEvents={isActive ? 'auto' : 'none'}
            >
              {renderScene(tab)}
            </View>
          );
        })}
      </View>
    </SafeAreaView>
  );
}
