import React, { useState, useRef } from 'react';
import {
  AnimatedPressable
} from '../components/AnimatedPressable';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  TextInput,
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
import { AppSegmentControl } from '../components/ui/AppSegmentControl';
import PulseTab from '../components/explore/PulseTab';
import LooksTab from '../components/explore/LooksTab';
import EditTab from '../components/explore/EditTab';

type NavT = StackNavigationProp<RootStackParamList>;
const { width: SCREEN_WIDTH } = Dimensions.get('window');

const EXPLORE_TABS = [
  { value: 'pulse', label: 'Pulse' },
  { value: 'looks', label: 'Looks' },
  { value: 'edit', label: 'Edit' },
];

// Main screen
export default function SearchScreen() {
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const navigation = useNavigation<NavT>();
  const { listings, isSyncing, lastError, refreshListings } = useBackendData();

  const [refreshing, setRefreshing] = useState(false);
  const scrollY = useSharedValue(0);
  const scrollRef = useRef<Reanimated.ScrollView>(null);
  useScrollToTop(scrollRef);

  const [activeTab, setActiveTab] = useState<'pulse' | 'looks' | 'edit'>('pulse');

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
        <View style={styles.headerTitleBlock}>
          <Text style={styles.headerLabel}>DISCOVER</Text>
          <Text style={styles.hugeTitle}>Explore</Text>
        </View>
        <View style={styles.headerRight}>
          <View style={styles.creatorActions}>
            <AnimatedPressable style={styles.iconCircle} onPress={() => navigation.navigate('CreatorStudio', { type: 'look' })}>
              <Ionicons name="camera-outline" size={18} color={Colors.textPrimary} />
            </AnimatedPressable>
            <AnimatedPressable style={styles.iconCircle} onPress={() => navigation.navigate('GlobalSearch')}>
              <Ionicons name="compass-outline" size={18} color={Colors.textPrimary} />
            </AnimatedPressable>
          </View>
        </View>
      </View>

      {/* -- Search Bar -- */}
      <View style={styles.searchRow}>
        <View style={[styles.searchBar, isSearchFocused && styles.searchBarFocused]}>
          <Ionicons name="search" size={20} color={Colors.textMuted} style={{ marginLeft: 4 }} />
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search Thryftverse"
            placeholderTextColor={Colors.textMuted}
            onFocus={() => setIsSearchFocused(true)}
            onBlur={() => setIsSearchFocused(false)}
            selectionColor={Colors.brand}
            returnKeyType="search"
          />
          {searchQuery.length > 0 ? (
            <AnimatedPressable onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={20} color={Colors.textMuted} />
            </AnimatedPressable>
          ) : (
            <AnimatedPressable onPress={() => navigation.navigate('VisualSearch')} activeOpacity={0.85} accessibilityLabel="Visual search" accessibilityRole="button">
              <Ionicons name="camera-outline" size={22} color={Colors.textMuted} style={{ marginRight: 4 }} />
            </AnimatedPressable>
          )}
        </View>
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
          <AppSegmentControl
            options={EXPLORE_TABS}
            value={activeTab}
            onChange={(v) => setActiveTab(v as 'pulse' | 'looks' | 'edit')}
            style={{ marginHorizontal: 16, marginBottom: 12 }}
            fullWidth
          />

          {/* Empty state when no listings and not loading */}
          {listings.length === 0 && !isSyncing && !lastError ? (
            <Reanimated.View entering={FadeInDown.duration(400)}>
              <EmptyState
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 16,
  },
  headerTitleBlock: {
    gap: 2,
  },
  headerLabel: {
    fontSize: 10,
    fontFamily: Typography.family.semibold,
    color: Colors.brand,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  hugeTitle: {
    fontSize: Type.title.size,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
    letterSpacing: -0.5,
  },
  headerRight: {
    alignItems: 'flex-end',
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

  creatorActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surfaceAlt,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Search
  searchRow: { paddingHorizontal: 16, paddingBottom: 12 },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  searchBarFocused: {
    backgroundColor: Colors.background,
    borderColor: Colors.brand,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: Colors.textPrimary,
    fontFamily: Typography.family.medium,
    letterSpacing: 0.08,
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
  gridContent: { paddingHorizontal: 12, paddingBottom: 120 },
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