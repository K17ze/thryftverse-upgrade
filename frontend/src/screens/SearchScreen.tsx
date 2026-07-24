import React, { useState, useRef } from 'react';
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
import { Colors } from '../constants/colors';
import { useAppTheme } from '../theme/ThemeContext';
import { useNavigation, useScrollToTop } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/types';
import { RefreshIndicator } from '../components/RefreshIndicator';
import { EmptyState } from '../components/EmptyState';
import { SyncRetryBanner } from '../components/SyncRetryBanner';
import { useBackendData } from '../context/BackendDataContext';
import { Type , Typography, Space, Radius  } from '../theme/designTokens';
import { PinterestMasonryGrid } from '../components/discover/PinterestMasonryGrid';
import PulseTab from '../components/explore/PulseTab';
import LooksTab from '../components/explore/LooksTab';
import EditTab from '../components/explore/EditTab';

type NavT = StackNavigationProp<RootStackParamList>;
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
    setTimeout(() => setRefreshing(false), 400);
  };

  const { isDark } = useAppTheme();

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
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={Colors.background} />

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
          <Ionicons name="search" size={19} color={Colors.textMuted} />
          <Text style={styles.searchPlaceholder} numberOfLines={1}>Search items, brands and people</Text>
        </AnimatedPressable>
        <AnimatedPressable
          style={styles.visualSearchButton}
          onPress={() => navigation.navigate('VisualSearch')}
          activeOpacity={0.76}
          accessibilityLabel="Search with an image"
          accessibilityRole="button"
        >
          <Ionicons name="camera-outline" size={20} color={Colors.textPrimary} />
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

          {/* Empty state when no listings and not loading */}
          {listings.length === 0 && !isSyncing && !lastError ? (
            <Reanimated.View entering={FadeInDown.duration(400)}>
              <EmptyState
                density="compact"
                icon="compass-outline"
                title="Nothing to explore yet"
                subtitle="New items are uploaded every day. Check back soon or browse categories."
                ctaLabel="Browse Categories"
                onCtaPress={() => navigation.navigate('Browse', { categoryId: 'all', title: 'Browse' })}
                suggestedActions={[
                  { label: 'Search', onPress: () => navigation.navigate('GlobalSearch') },
                  { label: 'Visual Search', onPress: () => navigation.navigate('VisualSearch') },
                ]}
              />
            </Reanimated.View>
          ) : (
            <Reanimated.View entering={FadeInDown.duration(350).delay(100)}>
              {renderTabContent()}
            </Reanimated.View>
          )}

          <View style={styles.emptyFooter} />
        </Reanimated.ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  // Header
  headerRow: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  hugeTitle: {
    fontSize: Type.title.size,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
    letterSpacing: -0.5,
  },
  itemCount: {
    fontSize: 13,
    fontFamily: Typography.family.medium,
    letterSpacing: 0.12,
    color: Colors.textSecondary,
  },
  headerStatusWrap: {
    marginTop: 7,
  },
  discoverBtn: {
    marginTop: 8,
    minHeight: 32,
    borderRadius: 16,
    borderWidth: 0,
    backgroundColor: Colors.surfaceAlt,
    alignSelf: 'flex-end',
    paddingHorizontal: 12,
  },
  discoverBtnIconWrap: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'transparent',
  },
  discoverBtnText: {
    color: '#fff',
    fontSize: 12,
    fontFamily: Typography.family.semibold,
    letterSpacing: 0.2,
  },

  // Search
  searchRow: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  searchBar: {
    flex: 1,
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.background,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    paddingHorizontal: 14,
  },
  searchPlaceholder: {
    flex: 1,
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
    color: Colors.textMuted,
    fontFamily: Typography.family.regular,
    letterSpacing: 0.08,
  },
  visualSearchButton: {
    width: 46,
    height: 46,
    borderRadius: Radius.md,
    backgroundColor: 'transparent',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },

  exploreTabs: {
    minHeight: 48,
    marginBottom: 10,
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'stretch',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  exploreTab: {
    flex: 1,
    minWidth: 0,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    paddingHorizontal: 4,
  },
  exploreTabText: {
    fontSize: Type.captionElevated.size,
    lineHeight: Type.captionElevated.lineHeight,
    fontFamily: Typography.family.medium,
    color: Colors.textMuted,
  },
  exploreTabTextActive: {
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
  },
  exploreTabIndicator: {
    position: 'absolute',
    bottom: -StyleSheet.hairlineWidth,
    width: 28,
    height: 2,
    borderRadius: 1,
    backgroundColor: Colors.textPrimary,
  },

  // Tabs
  tabsContainer: { paddingHorizontal: 16, paddingBottom: 12 },
  tabsWrapper: { flexDirection: 'row', backgroundColor: 'transparent', gap: 10 },
  tab: {
    flex: 1,
    borderRadius: 24,
    minHeight: 40,
    borderWidth: 0,
    backgroundColor: Colors.surface,
    paddingHorizontal: 12,
  },
  activeTab: { backgroundColor: Colors.textPrimary },
  tabIconWrap: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: 'transparent',
  },
  tabText: { fontSize: 13, fontFamily: Typography.family.semibold, color: Colors.textMuted, letterSpacing: 0.2 },
  activeTabText: { color: Colors.textPrimary },
  tabCountWrap: {
    width: 'auto',
    height: 'auto',
    borderRadius: 0,
    backgroundColor: 'transparent',
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  tabCount: {
    marginLeft: 6,
    minWidth: 20,
    textAlign: 'center',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    overflow: 'hidden',
    backgroundColor: Colors.surfaceAlt,
    color: Colors.textSecondary,
    fontSize: 11,
    fontFamily: Typography.family.semibold,
  },
  tabCountActive: {
    backgroundColor: Colors.textPrimary,
    color: Colors.textInverse,
  },
  syncRetryBanner: {
    marginHorizontal: 16,
    marginBottom: 12,
  },

  // Lists
  listContent: { paddingHorizontal: 16, paddingBottom: 120 },
  gridContent: { paddingBottom: 120 },
  gridRow: { justifyContent: 'space-between' },
  wishlistLoadingGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 120,
    rowGap: 12,
  },
  wishlistLoadingCard: {
    width: (SCREEN_WIDTH - 32) / 2,
    borderRadius: 16,
    borderWidth: 0,
    borderColor: 'transparent',
    backgroundColor: Colors.surface,
    overflow: 'hidden',
  },
  wishlistLoadingBody: {
    paddingHorizontal: 10,
    paddingVertical: 10,
  },

  emptyFooter: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  footerHint: {
    fontSize: 13,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    textAlign: 'center',
    letterSpacing: 0.1,
  },
  closetShortcut: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 14,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  closetShortcutLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  closetShortcutIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: Colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closetShortcutTitle: {
    fontSize: 15,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
  },
  closetShortcutSub: {
    fontSize: 12,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    marginTop: 2,
  },
});
