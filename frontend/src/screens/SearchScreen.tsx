import React, { useState } from 'react';
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
  RefreshControl
} from 'react-native';
import { CachedImage } from '../components/CachedImage';
import Reanimated, { useSharedValue, useAnimatedScrollHandler } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { MasonryGrid } from '../components/ProductCardV2';
import { Colors } from '../constants/colors';
import { useAppTheme } from '../theme/ThemeContext';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/types';
import { RefreshIndicator } from '../components/RefreshIndicator';
import { EmptyState } from '../components/EmptyState';
import { SkeletonLoader } from '../components/SkeletonLoader';
import { SyncRetryBanner } from '../components/SyncRetryBanner';
import { useStore } from '../store/useStore';
import { useBackendData } from '../context/BackendDataContext';
import { getBackendSyncStatus } from '../utils/syncStatus';
import { useToast } from '../context/ToastContext';
import { ENABLE_RUNTIME_MOCKS } from '../constants/runtimeFlags';
import { AppButton } from '../components/ui/AppButton';
import { SharedTransitionView } from '../components/SharedTransitionView';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { Motion } from '../constants/motion';
import { Type , Typography  } from '../theme/designTokens';
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


const PANEL_BG = Colors.surface;
const PANEL_ALT = Colors.surfaceAlt;
const BRAND = Colors.brand;

// Saved look data
interface SavedLook {
  id: string;
  title: string;
  coverImage: string;
  items: { id: string; label: string; x: number; y: number }[];
  creator: { name: string; avatar: string };
  likes: number;
  comments: number;
  saved: boolean;
}

const SAVED_LOOKS_SEED: SavedLook[] = [
  {
    id: 'look1',
    title: 'Winter Layers',
    coverImage: 'https://images.unsplash.com/photo-1509631179647-0177331693ae?w=600&q=80',
    items: [
      { id: 'l5', label: 'Off-White Hoodie', x: 0.2, y: 0.3 },
      { id: 'l7', label: 'Cargo Trousers', x: 0.6, y: 0.65 },
      { id: 'l6', label: 'Air Max 90', x: 0.5, y: 0.85 },
    ],
    creator: { name: 'mariefullery', avatar: '' },
    likes: 234,
    comments: 18,
    saved: true,
  },
  {
    id: 'look2',
    title: 'Minimal Monochrome',
    coverImage: 'https://images.unsplash.com/photo-1529139574466-a303027c1d8b?w=600&q=80',
    items: [
      { id: 'l2', label: 'AMI Striped Shirt', x: 0.35, y: 0.25 },
      { id: 'l3', label: 'RL Harrington', x: 0.7, y: 0.4 },
    ],
    creator: { name: 'scott_art', avatar: '' },
    likes: 156,
    comments: 12,
    saved: true,
  },
  {
    id: 'look3',
    title: 'Streetwear Daily',
    coverImage: 'https://images.unsplash.com/photo-1552374196-1ab2a1c593e8?w=600&q=80',
    items: [
      { id: 'l4', label: 'Stussy Logo Tee', x: 0.4, y: 0.3 },
      { id: 'l9', label: 'Represent Hoodie', x: 0.25, y: 0.15 },
      { id: 'l10', label: 'Chuck Taylor', x: 0.6, y: 0.8 },
    ],
    creator: { name: 'dankdunksuk', avatar: '' },
    likes: 89,
    comments: 7,
    saved: true,
  },
];

const SAVED_LOOKS: SavedLook[] = ENABLE_RUNTIME_MOCKS ? SAVED_LOOKS_SEED : [];

// Look card component
function LookCard({
  look,
  onPress,
  onLikePress,
  onCommentPress,
  onSavePress,
  isLiked,
  isSaved,
  sharedTransitionTag,
}: {
  look: SavedLook;
  onPress: () => void;
  onLikePress: () => void;
  onCommentPress: () => void;
  onSavePress: () => void;
  isLiked: boolean;
  isSaved: boolean;
  sharedTransitionTag?: string;
}) {
  const likeCount = look.likes + (isLiked ? 1 : 0);

  return (
    <AnimatedPressable style={lookStyles.card} onPress={onPress} activeOpacity={0.92}>
      {/* Cover Image */}
      <View style={lookStyles.imageWrap}>
        <SharedTransitionView
          style={lookStyles.imageShared}
          sharedTransitionTag={sharedTransitionTag}
        >
          <CachedImage uri={look.coverImage} style={lookStyles.image} containerStyle={{ width: '100%', height: 200, borderRadius: 14 }} contentFit="cover" />
        </SharedTransitionView>

        {/* Floating item tags */}
        {look.items.map((item, i) => (
          <View
            key={item.id}
            style={[
              lookStyles.itemTag,
              { left: `${item.x * 100}%` as any, top: `${item.y * 100}%` as any },
            ]}
          >
            <View style={lookStyles.tagDot} />
            <Text style={lookStyles.tagLabel} numberOfLines={1}>{item.label}</Text>
          </View>
        ))}

        {/* Gradient overlay at bottom */}
        <View style={lookStyles.gradient} />
      </View>

      {/* Bottom info row */}
      <View style={lookStyles.infoRow}>
        <CachedImage uri={look.creator.avatar} style={lookStyles.creatorAvatar} containerStyle={{ width: 24, height: 24, borderRadius: 12 }} contentFit="cover" />
        <View style={lookStyles.infoText}>
          <Text style={lookStyles.lookTitle}>{look.title}</Text>
          <Text style={lookStyles.creatorName}>by @{look.creator.name}</Text>
        </View>
        <View style={lookStyles.statsRow}>
          <AnimatedPressable
            style={lookStyles.statBtn}
            onPress={(event) => {
              event.stopPropagation();
              onLikePress();
            }}
          >
            <Ionicons name={isLiked ? 'heart' : 'heart-outline'} size={18} color={isLiked ? Colors.danger : BRAND} />
            <Text style={lookStyles.statCount}>{likeCount}</Text>
          </AnimatedPressable>
          <AnimatedPressable
            style={lookStyles.statBtn}
            onPress={(event) => {
              event.stopPropagation();
              onCommentPress();
            }}
          >
            <Ionicons name="chatbubble-outline" size={16} color={Colors.textSecondary} />
            <Text style={lookStyles.statCount}>{look.comments}</Text>
          </AnimatedPressable>
          <AnimatedPressable
            style={lookStyles.statBtn}
            onPress={(event) => {
              event.stopPropagation();
              onSavePress();
            }}
          >
            <Ionicons name={isSaved ? 'bookmark' : 'bookmark-outline'} size={16} color={isSaved ? BRAND : Colors.textSecondary} />
          </AnimatedPressable>
        </View>
      </View>
    </AnimatedPressable>
  );
}

// Main screen
export default function SearchScreen() {
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [likedLooks, setLikedLooks] = useState<Record<string, boolean>>({});
  const navigation = useNavigation<NavT>();
  const { show } = useToast();
  const { listings, source, isSyncing, lastError, refreshListings } = useBackendData();

  const [refreshing, setRefreshing] = useState(false);
  const scrollY = useSharedValue(0);
  const reducedMotionEnabled = useReducedMotion();

  const listingIdSet = React.useMemo(() => new Set(listings.map((item) => item.id)), [listings]);
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



  const handleToggleLookLike = React.useCallback(
    (look: SavedLook) => {
      setLikedLooks((prev) => {
        const nextLiked = !prev[look.id];
        show(nextLiked ? 'Added to liked looks' : 'Removed from liked looks', 'info');
        return {
          ...prev,
          [look.id]: nextLiked,
        };
      });
    },
    [navigation, show],
  );

  const resolveLookItemId = React.useCallback(
    (look: SavedLook) => look.items.find((entry) => listingIdSet.has(entry.id))?.id ?? listings[0]?.id,
    [listingIdSet, listings]
  );

  const { isDark } = useAppTheme();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={Colors.background} />

      {/* -- Header -- */}
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.hugeTitle}>Explore</Text>
        </View>
        <View style={styles.headerRight}>
          <View style={styles.creatorActions}>
            <AnimatedPressable style={styles.iconCircle} onPress={() => navigation.navigate('CreateLook')}>
              <Ionicons name="camera-outline" size={18} color={Colors.textPrimary} />
            </AnimatedPressable>
            {/* OutfitBuilder hidden — no backend */}
            {/* <AnimatedPressable style={styles.iconCircle} onPress={() => navigation.navigate('OutfitBuilder')}>
              <Ionicons name="shirt-outline" size={18} color={Colors.textPrimary} />
            </AnimatedPressable> */}
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

          {activeTab === 'pulse' && <PulseTab />}
          {activeTab === 'looks' && <LooksTab />}
          {activeTab === 'edit' && <EditTab />}

          <View style={styles.emptyFooter} />
        </Reanimated.ScrollView>
      </View>
    </SafeAreaView>
  );
}

// -- Look Card Styles --
const lookStyles = StyleSheet.create({
  card: {
    backgroundColor: PANEL_BG,
    borderRadius: 20,
    marginBottom: 20,
    overflow: 'hidden',
  },
  imageWrap: {
    width: '100%',
    height: SCREEN_WIDTH * 1.1,
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  imageShared: {
    ...StyleSheet.absoluteFillObject,
  },
  gradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 100,
    backgroundColor: 'transparent',
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  itemTag: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
    maxWidth: 160,
  },
  tagDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: BRAND,
    marginRight: 6,
  },
  tagLabel: {
    color: '#fff',
    fontSize: 11,
    fontFamily: Typography.family.medium,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  creatorAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surface,
  },
  infoText: {
    flex: 1,
  },
  lookTitle: {
    color: Colors.textPrimary,
    fontSize: 16,
    fontFamily: Typography.family.semibold,
    letterSpacing: 0.06,
    marginBottom: 2,
  },
  creatorName: {
    color: Colors.textMuted,
    fontSize: 12,
    fontFamily: Typography.family.regular,
    letterSpacing: 0.1,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  statBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statCount: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontFamily: Typography.family.medium,
  },
});

// ------------------------------------------------------------------------------
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
  headerLabel: {
    fontSize: 11,
    fontFamily: Typography.family.semibold,
    color: BRAND,
    letterSpacing: 1.1,
    marginBottom: 4,
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
    borderRadius: 30,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  searchBarFocused: { backgroundColor: Colors.surfaceAlt, borderColor: Colors.brand },
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

  // Empty states
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    paddingBottom: 80,
  },
  emptyIcon: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 20,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    fontFamily: Typography.family.regular,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    letterSpacing: 0.1,
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
