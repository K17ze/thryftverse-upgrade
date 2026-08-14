import React, { useState, useRef, useMemo, useEffect } from 'react';
import {
  AnimatedPressable
} from '../components/AnimatedPressable';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  RefreshControl,
} from 'react-native';
import Reanimated, { useSharedValue, useAnimatedScrollHandler, FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../theme/ThemeContext';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useNavigation, useScrollToTop } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { openProfile } from '../navigation/openProfile';
import { useStore } from '../store/useStore';
import { RefreshIndicator } from '../components/RefreshIndicator';
import { EmptyState } from '../components/EmptyState';
import { SyncRetryBanner } from '../components/SyncRetryBanner';
import { useBackendData } from '../context/BackendDataContext';
import { Type, Typography, Space, Radius, Control, LetterSpacing } from '../theme/designTokens';
import { PinterestMasonryGrid } from '../components/discover/PinterestMasonryGrid';
import { MasonrySkeleton } from '../components/skeletons/MasonrySkeleton';
import PulseTab from '../components/explore/PulseTab';
import LooksTab from '../components/explore/LooksTab';
import { OfflineBanner } from '../components/OfflineBanner';
import { AppSegmentControl, type AppSegmentOption } from '../components/ui/AppSegmentControl';

type NavT = NativeStackNavigationProp<RootStackParamList>;

const EXPLORE_TABS = [
  { value: 'discover', label: 'Discover' },
  { value: 'pulse', label: 'Pulse' },
  { value: 'looks', label: 'Looks' },
];

// Main screen
export default function SearchScreen() {
  const navigation = useNavigation<NavT>();
  const { listings, isSyncing, lastError, refreshListings } = useBackendData();
  const currentUser = useStore((state) => state.currentUser);

  const [refreshing, setRefreshing] = useState(false);
  const scrollY = useSharedValue(0);
  const scrollRef = useRef<Reanimated.ScrollView>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useScrollToTop(scrollRef);

  const [activeTab, setActiveTab] = useState<'discover' | 'pulse' | 'looks'>('discover');

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.value = e.contentOffset.y;
    },
  });

  const handleRefresh = async () => {
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
  const reducedMotionEnabled = useReducedMotion();

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

  exploreTabsContainer: {
    marginBottom: Space.smMd,
    paddingHorizontal: Space.md,
  },

  syncRetryBanner: {
    marginHorizontal: Space.md,
    marginBottom: Space.smMd,
  },

  // Lists
  listContent: { paddingHorizontal: Space.md, paddingBottom: Space.xxl * 2 + Space.lg },
  gridContent: { paddingBottom: Space.xxl * 2 + Space.lg },

  emptyFooter: {
    alignItems: 'center',
    paddingVertical: Space.lg,
  },
  }), [colors]);

  const renderTabContent = () => {
    switch (activeTab) {
      case 'discover':
        return (
          <PinterestMasonryGrid
            items={listings}
            onPressItem={(item) => navigation.navigate('ItemDetail', { itemId: item.id })}
            onPressSeller={(item) => openProfile(navigation, item.sellerId, currentUser?.id)}
            onMessageSeller={(item) => navigation.navigate('Chat', {
              conversationId: `${item.sellerId}_${item.id}`,
              focusQuery: '',
              partnerUserId: item.sellerId,
              itemId: item.id,
            })}
            enableEntranceAnimation
          />
        );
      case 'pulse':
        return <PulseTab />;
      case 'looks':
        return <LooksTab />;
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

      {/* -- Sync Error Banner -- */}
      {lastError ? (
        <SyncRetryBanner
          message="Sync is unavailable. Showing cached items."
          onRetry={() => void handleRefresh()}
          isRetrying={isSyncing || refreshing}
          telemetryContext="explore_sync"
          containerStyle={styles.syncRetryBanner}
        />
      ) : null}

      {/* -- Content -- */}
      <View style={{ flex: 1 }}>
        <RefreshIndicator scrollY={scrollY} isRefreshing={refreshing} topInset={20} />

        <Reanimated.ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.gridContent}
          showsVerticalScrollIndicator={false}
          onScroll={scrollHandler}
          scrollEventThrottle={16}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor="transparent"
              colors={['transparent']}
              progressBackgroundColor="transparent"
            />
          }
        >
          <OfflineBanner onRetry={() => void handleRefresh()} />

          <View style={styles.exploreTabsContainer}>
            <AppSegmentControl
              options={EXPLORE_TABS as AppSegmentOption<'discover' | 'pulse' | 'looks'>[]}
              value={activeTab}
              onChange={(next) => setActiveTab(next)}
              fullWidth
            />
          </View>

          {/* Loading skeleton during initial sync (no cached listings yet) */}
          {isSyncing && listings.length === 0 && !lastError ? (
            <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300)}>
              {activeTab === 'discover' ? (
                <MasonrySkeleton itemCount={6} />
              ) : (
                <View style={styles.listContent}>
                  <MasonrySkeleton itemCount={4} horizontalPadding={0} />
                </View>
              )}
            </Reanimated.View>
          ) : lastError && listings.length === 0 && !isSyncing ? (
            <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(400)}>
              <EmptyState
                density="compact"
                icon="cloud-offline-outline"
                iconColor={colors.danger}
                title="Explore unavailable"
                subtitle="We couldn't load listings. Check your connection and try again."
                ctaLabel="Retry"
                onCtaPress={() => void handleRefresh()}
              />
            </Reanimated.View>
          ) : listings.length === 0 && !isSyncing && !lastError ? (
            <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(400)}>
              {activeTab === 'pulse' ? (
                <EmptyState
                  density="compact"
                  icon="pulse-outline"
                  title="No activity yet"
                  subtitle="Live auctions and fresh drops will appear here. Check back later."
                  ctaLabel="Browse Listings"
                  onCtaPress={() => navigation.navigate('Browse', { categoryId: 'all', title: 'Browse' })}
                />
              ) : activeTab === 'looks' ? (
                <EmptyState
                  density="compact"
                  icon="shirt-outline"
                  title="No looks yet"
                  subtitle="Creators are styling their first looks. Be the first to share a look."
                  ctaLabel="Create a Look"
                  onCtaPress={() => navigation.navigate('CreateLook')}
                />
              ) : (
                <EmptyState
                  density="compact"
                  icon="compass-outline"
                  title="Nothing to explore yet"
                  subtitle="New items are uploaded every day. Check back soon or browse categories."
                  ctaLabel="Browse Categories"
                  onCtaPress={() => navigation.navigate('Browse', { categoryId: 'all', title: 'Browse' })}
                />
              )}
            </Reanimated.View>
          ) : (
            <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(350).delay(100)}>
              {renderTabContent()}
            </Reanimated.View>
          )}

          <View style={styles.emptyFooter} />
        </Reanimated.ScrollView>
      </View>
    </SafeAreaView>
  );
}
