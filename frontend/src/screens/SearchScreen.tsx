import React, { useState, useRef, useMemo, useEffect } from 'react';
import {
  AnimatedPressable
} from '../components/AnimatedPressable';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  Dimensions,
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
import { RefreshIndicator } from '../components/RefreshIndicator';
import { EmptyState } from '../components/EmptyState';
import { SyncRetryBanner } from '../components/SyncRetryBanner';
import { useBackendData } from '../context/BackendDataContext';
import { Type, Typography, Space, Radius, Stroke, Control, LetterSpacing } from '../theme/designTokens';
import { PinterestMasonryGrid } from '../components/discover/PinterestMasonryGrid';
import { MasonrySkeleton } from '../components/skeletons/MasonrySkeleton';
import PulseTab from '../components/explore/PulseTab';
import LooksTab from '../components/explore/LooksTab';
import EditTab from '../components/explore/EditTab';
import { OfflineBanner } from '../components/OfflineBanner';

type NavT = NativeStackNavigationProp<RootStackParamList>;
const { width: SCREEN_WIDTH } = Dimensions.get('window');

const EXPLORE_TABS = [
  { value: 'discover', label: 'Discover' },
  { value: 'pulse', label: 'Pulse' },
  { value: 'looks', label: 'Looks' },
  { value: 'edit', label: 'Trending' },
];

// Main screen
export default function SearchScreen() {
  const navigation = useNavigation<NavT>();
  const { listings, isSyncing, lastError, refreshListings } = useBackendData();

  const [refreshing, setRefreshing] = useState(false);
  const scrollY = useSharedValue(0);
  const scrollRef = useRef<Reanimated.ScrollView>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useScrollToTop(scrollRef);

  const [activeTab, setActiveTab] = useState<'discover' | 'pulse' | 'looks' | 'edit'>('discover');

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

  // Header
  headerRow: {
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    paddingBottom: Space.sm + Space.xs,
  },
  hugeTitle: {
    fontSize: Type.title.size,
    fontFamily: Typography.family.bold,
    color: colors.textPrimary,
    letterSpacing: LetterSpacing.tight,
  },
  itemCount: {
    fontSize: Type.captionElevated.size,
    fontFamily: Typography.family.medium,
    letterSpacing: LetterSpacing.wide,
    color: colors.textSecondary,
  },
  headerStatusWrap: {
    marginTop: Space.xs + 3,
  },
  discoverBtn: {
    marginTop: Space.sm,
    minHeight: Control.chromeCompact,
    borderRadius: Radius.xl,
    borderWidth: 0,
    backgroundColor: colors.surfaceAlt,
    alignSelf: 'flex-end',
    paddingHorizontal: Space.sm + Space.xs,
  },
  discoverBtnIconWrap: {
    width: Control.iconCompact,
    height: Control.iconCompact,
    borderRadius: Radius.full,
    backgroundColor: 'transparent',
  },
  discoverBtnText: {
    color: colors.textInverse,
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: LetterSpacing.wide,
  },

  // Search
  searchRow: {
    paddingHorizontal: Space.md,
    paddingBottom: Space.sm + 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm + 2,
  },
  searchBar: {
    flex: 1,
    minHeight: Control.hit + 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm + 2,
    backgroundColor: colors.background,
    borderRadius: Radius.md,
    borderWidth: Stroke.hairline,
    borderColor: colors.border,
    paddingHorizontal: Space.sm + 6,
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
    width: Control.hit + 2,
    height: Control.hit + 2,
    borderRadius: Radius.md,
    backgroundColor: 'transparent',
    borderWidth: Stroke.hairline,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },

  exploreTabs: {
    minHeight: Space.xxl,
    marginBottom: Space.sm + 2,
    paddingHorizontal: Space.sm,
    flexDirection: 'row',
    alignItems: 'stretch',
    borderBottomWidth: Stroke.hairline,
    borderBottomColor: colors.border,
  },
  exploreTab: {
    flex: 1,
    minWidth: 0,
    minHeight: Space.xxl,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    paddingHorizontal: Space.sm,
  },
  exploreTabText: {
    fontSize: Type.captionElevated.size,
    lineHeight: Type.captionElevated.lineHeight,
    fontFamily: Typography.family.medium,
    color: colors.textMuted,
  },
  exploreTabTextActive: {
    fontFamily: Typography.family.semibold,
    color: colors.textPrimary,
  },
  exploreTabIndicator: {
    position: 'absolute',
    bottom: -Stroke.hairline,
    width: Space.xl,
    height: Space.xs / 2,
    borderRadius: Radius.sm,
    backgroundColor: colors.textPrimary,
  },

  // Tabs
  tabsContainer: { paddingHorizontal: Space.md, paddingBottom: Space.sm + Space.xs },
  tabsWrapper: { flexDirection: 'row', backgroundColor: 'transparent', gap: Space.sm + 2 },
  tab: {
    flex: 1,
    borderRadius: Radius.xxl,
    minHeight: Space.xl + Space.sm,
    borderWidth: 0,
    backgroundColor: colors.surface,
    paddingHorizontal: Space.sm + Space.xs,
  },
  activeTab: { backgroundColor: colors.textPrimary },
  tabIconWrap: {
    width: Space.md,
    height: Space.md,
    borderRadius: Radius.md,
    backgroundColor: 'transparent',
  },
  tabText: { fontSize: Type.captionElevated.size, fontFamily: Typography.family.semibold, color: colors.textMuted, letterSpacing: LetterSpacing.wide },
  activeTabText: { color: colors.textPrimary },
  tabCountWrap: {
    width: 'auto',
    height: 'auto',
    borderRadius: Radius.none,
    backgroundColor: 'transparent',
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  tabCount: {
    marginLeft: Space.xs + 2,
    minWidth: Space.lg - Space.xs,
    textAlign: 'center',
    borderRadius: Radius.lg,
    paddingHorizontal: Space.xs + 2,
    paddingVertical: Space.xs / 2,
    overflow: 'hidden',
    backgroundColor: colors.surfaceAlt,
    color: colors.textSecondary,
    fontSize: Type.meta.size,
    fontFamily: Typography.family.semibold,
  },
  tabCountActive: {
    backgroundColor: colors.textPrimary,
    color: colors.textInverse,
  },
  syncRetryBanner: {
    marginHorizontal: Space.md,
    marginBottom: Space.sm + Space.xs,
  },

  // Lists
  listContent: { paddingHorizontal: Space.md, paddingBottom: Space.xxl * 2 + Space.lg },
  gridContent: { paddingBottom: Space.xxl * 2 + Space.lg },
  gridRow: { justifyContent: 'space-between' },
  wishlistLoadingGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingHorizontal: Space.sm + Space.xs,
    paddingBottom: Space.xxl * 2 + Space.lg,
    rowGap: Space.sm + Space.xs,
  },
  wishlistLoadingCard: {
    width: (SCREEN_WIDTH - Space.xl) / 2,
    borderRadius: Radius.xl,
    borderWidth: 0,
    borderColor: 'transparent',
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  wishlistLoadingBody: {
    paddingHorizontal: Space.sm + 2,
    paddingVertical: Space.sm + 2,
  },

  emptyFooter: {
    alignItems: 'center',
    paddingVertical: Space.lg,
  },
  footerHint: {
    fontSize: Type.captionElevated.size,
    fontFamily: Typography.family.regular,
    color: colors.textMuted,
    textAlign: 'center',
    letterSpacing: LetterSpacing.wide,
  },
  closetShortcut: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: Space.md,
    marginBottom: Space.md,
    padding: Space.md,
    borderRadius: Radius.lg,
    backgroundColor: colors.surface,
    borderWidth: Stroke.standard,
    borderColor: colors.border,
  },
  closetShortcutLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm + Space.xs,
  },
  closetShortcutIcon: {
    width: Space.xxl - Space.sm,
    height: Space.xxl - Space.sm,
    borderRadius: Radius.lg,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closetShortcutTitle: {
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.semibold,
    color: colors.textPrimary,
  },
  closetShortcutSub: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    color: colors.textMuted,
    marginTop: Space.xs / 2,
  },
  }), [colors]);

  const renderTabContent = () => {
    switch (activeTab) {
      case 'discover':
        return (
          <PinterestMasonryGrid
            items={listings}
            onPressItem={(item) => navigation.navigate('ItemDetail', { itemId: item.id })}
            onPressSeller={(item) => navigation.navigate('UserProfile', { userId: item.sellerId })}
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
      case 'edit':
        return <EditTab />;
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />

      {/* -- Header -- */}
      <View style={styles.headerRow}>
        <Text style={styles.hugeTitle}>Explore</Text>
      </View>

      {/* -- Search Bar -- */}
      <View style={styles.searchRow}>
        <AnimatedPressable
          style={styles.searchBar}
          onPress={() => navigation.navigate('GlobalSearch')}
          activeOpacity={0.76}
          accessibilityRole="search"
          accessibilityLabel="Search items, brands and people"
        >
          <Ionicons name="search" size={19} color={colors.textMuted} />
          <Text style={styles.searchPlaceholder} numberOfLines={1}>Search items, brands and people</Text>
        </AnimatedPressable>
        <AnimatedPressable
          style={styles.visualSearchButton}
          onPress={() => navigation.navigate('VisualSearch')}
          activeOpacity={0.76}
          accessibilityLabel="Search with an image"
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

          <View style={styles.exploreTabs} accessibilityRole="tablist">
            {EXPLORE_TABS.map((tab) => {
              const selected = activeTab === tab.value;
              return (
                <AnimatedPressable
                  key={tab.value}
                  style={styles.exploreTab}
                  onPress={() => setActiveTab(tab.value as 'discover' | 'pulse' | 'looks' | 'edit')}
                  activeOpacity={0.68}
                  accessibilityRole="tab"
                  accessibilityLabel={`${tab.label} explore tab`}
                  accessibilityState={{ selected }}
                >
                  <Text style={[styles.exploreTabText, selected && styles.exploreTabTextActive]} numberOfLines={1}>
                    {tab.label}
                  </Text>
                  {selected ? <View style={styles.exploreTabIndicator} /> : null}
                </AnimatedPressable>
              );
            })}
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
              <EmptyState
                density="compact"
                icon="compass-outline"
                title="Nothing to explore yet"
                subtitle="New items are uploaded every day. Check back soon or browse categories."
                ctaLabel="Browse Categories"
                onCtaPress={() => navigation.navigate('Browse', { categoryId: 'all', title: 'Browse' })}
              />
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
