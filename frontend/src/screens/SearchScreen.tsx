import React, { useState, useRef, useMemo, useEffect } from 'react';
import {
  AnimatedPressable
} from '../components/AnimatedPressable';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
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
import { Type, Typography, Space, Radius, Control, LetterSpacing } from '../theme/designTokens';
import { OfflineBanner } from '../components/OfflineBanner';
import { useHaptic } from '../hooks/useHaptic';
import { DiscoveryModeNav, type DiscoveryMode } from '../components/discovery/DiscoveryModeNav';
import { DiscoverScene, PulseScene, LooksScene } from '../scenes/discovery';
import type { DiscoveryListingSummary } from '../contracts/DiscoveryListingSummary';

type NavT = NativeStackNavigationProp<RootStackParamList>;

type ExploreTab = DiscoveryMode;

// Main screen
export default function SearchScreen() {
  const navigation = useNavigation<NavT>();
  const { listings, isSyncing, lastError, refreshListings, loadMoreListings, isLoadingMore, hasMore } = useBackendData();
  const currentUser = useStore((state) => state.currentUser);
  const haptic = useHaptic();

  const [refreshing, setRefreshing] = useState(false);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [activeTab, setActiveTab] = useState<ExploreTab>('discover');
  // Tabs that have been visited at least once. A scene mounts the first
  // time its tab is activated and stays mounted (hidden) afterwards so
  // its scroll position is preserved across tab switches.
  const [loadedTabs, setLoadedTabs] = useState<Set<ExploreTab>>(new Set(['discover']));

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
    borderWidth: 0,
    borderColor: 'transparent',
    paddingHorizontal: Space.md,
  },
  searchPlaceholder: {
    flex: 1,
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
    color: colors.textMuted,
    fontFamily: Typography.family.regular,
    letterSpacing: LetterSpacing.wide,
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

      {/* -- Search Bar (tab navigation supplies the "Explore" context) -- */}
      <View style={styles.searchRow}>
        <AnimatedPressable
          style={styles.searchBar}
          onPress={() => navigation.navigate('GlobalSearch')}
          accessibilityRole="search"
          accessibilityLabel="Search"
        >
          <Ionicons name="search" size={19} color={colors.textMuted} />
          <Text style={styles.searchPlaceholder} numberOfLines={1}>Search items, brands and people</Text>
        </AnimatedPressable>
        <AnimatedPressable
          style={styles.visualSearchButton}
          onPress={() => navigation.navigate('VisualSearch')}
          accessibilityLabel="Visual search"
          accessibilityRole="button"
        >
          <Ionicons name="camera-outline" size={20} color={colors.textPrimary} />
        </AnimatedPressable>
      </View>

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
