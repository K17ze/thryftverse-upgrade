import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  useWindowDimensions,
  RefreshControl,
  ImageStyle,
  Pressable } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import { useAppTheme } from '../theme/ThemeContext';
import { Space, Radius, Stroke, Control, LetterSpacing } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { RootStackParamList } from '../navigation/types';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { CachedImage } from '../components/CachedImage';
import { HorizontalRail } from '../components/HorizontalRail';
import { EmptyState } from '../components/EmptyState';
import { AppInput } from '../components/ui/AppInput';
import { PremiumSkeletonTile } from '../components/discover/PremiumSkeletonTile';
import { useHaptic } from '../hooks/useHaptic';
import { useConnectivity } from '../hooks/useConnectivity';
import { useReducedMotion } from '../hooks/useReducedMotion';
import Reanimated, { FadeIn } from 'react-native-reanimated';
import {
  fetchMoodboards,
  fetchPublicMoodboards,
  MOODBOARD_DEMO_MODE,
  type Moodboard } from '../services/moodboardApi';
import { useFeatureFlag } from '../analytics';

type NavT = NativeStackNavigationProp<RootStackParamList>;

// ── Helpers ──
/**
 * Relative-time formatter for "last updated" metadata.
 * Returns compact strings: "now", "3d", "2w", "1mo", "1y".
 */
function formatRelativeTime(isoTimestamp: string): string {
  const ts = Date.parse(isoTimestamp);
  if (isNaN(ts)) return '';
  const diff = Date.now() - ts;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo`;
  const years = Math.floor(days / 365);
  return `${years}y`;
}

// ── Layout constants ──
const USER_CARD_WIDTH = 200;
const USER_CARD_HEIGHT = 240;
const MASONRY_GAP = Space.sm;
const MASONRY_COLUMN_COUNT = 2;
const MASONRY_PADDING = Space.md;

// Gap between items in the 2×2 cover collage (inset between collage tiles)
const COLLAGE_GAP = 2;

// Deterministic masonry heights for public moodboard cards
const MASONRY_ASPECT_RATIOS = [1.2, 1.0, 1.35, 0.95] as const;

// ---------------------------------------------------------------------------
// Moodboard cover collage — 2-4 item preview composed as a mini collage
// ---------------------------------------------------------------------------
const CoverCollage = React.memo(function CoverCollage({
  moodboard,
  width,
  height }: {
  moodboard: Moodboard;
  width: number;
  height: number;
}) {
  const styles = useStyles();
  const { colors } = useAppTheme();
  const items = moodboard.items.slice(0, 4);
  const coverUri = moodboard.coverImage || items[0]?.imageUri;

  if (items.length === 0 && !coverUri) {
    // Empty moodboard — show a neutral placeholder surface
    return <View style={[styles.coverPlaceholder, { width, height }]} />;
  }

  if (items.length <= 1) {
    // Single item or cover image — full bleed
    return (
      <CachedImage
        uri={coverUri ?? items[0]?.imageUri}
        style={{ width, height } as ImageStyle}
        contentFit="cover"
        priority="normal"
        accessible={false}
      />
    );
  }

  // 2-4 items: compose a 2x2 grid collage
  const halfW = (width - COLLAGE_GAP) / 2;
  const halfH = (height - COLLAGE_GAP) / 2;

  return (
    <View style={{ width, height, flexDirection: 'row', flexWrap: 'wrap' }}>
      {Array.from({ length: 4 }).map((_, i) => {
        const img = items[i];
        if (!img) {
          return <View key={i} style={{ width: halfW, height: halfH, backgroundColor: colors.surfaceAlt }} />;
        }
        return (
          <View key={img.id} style={{ width: halfW, height: halfH, overflow: 'hidden' }}>
            <CachedImage
              uri={img.imageUri}
              style={{ width: '100%', height: '100%' } as ImageStyle}
              contentFit="cover"
              priority="normal"
              accessible={false}
            />
          </View>
        );
      })}
    </View>
  );
});

// ---------------------------------------------------------------------------
// User moodboard rail card — 200pt wide, cover collage + title + item count
// ---------------------------------------------------------------------------
const UserMoodboardCard = React.memo(function UserMoodboardCard({
  moodboard,
  onPress }: {
  moodboard: Moodboard;
  onPress: () => void;
}) {
  const styles = useStyles();

  return (
    <AnimatedPressable
      style={[styles.userCard, { width: USER_CARD_WIDTH }]}
      onPress={onPress}
      activeOpacity={0.92}
      scaleValue={0.98}
      accessibilityRole="button"
      accessibilityLabel={`Moodboard: ${moodboard.title}, ${moodboard.items.length} items`}
      accessibilityHint="Opens the moodboard editor"
    >
      <View style={styles.userCardImageWrap}>
        <CoverCollage moodboard={moodboard} width={USER_CARD_WIDTH} height={USER_CARD_HEIGHT - 56} />
        <View style={styles.userCardMeta} pointerEvents="none">
          <Text style={styles.userCardTitle} numberOfLines={1}>
            {moodboard.title}
          </Text>
          <View style={styles.userCardMetaRow}>
            <Text style={styles.userCardCount} numberOfLines={1}>
              {moodboard.items.length} {moodboard.items.length === 1 ? 'item' : 'items'}
            </Text>
            {moodboard.updatedAt ? (
              <>
                <Text style={styles.userCardMetaDot}>·</Text>
                <Text style={styles.userCardUpdated} numberOfLines={1}>
                  {formatRelativeTime(moodboard.updatedAt)}
                </Text>
              </>
            ) : null}
          </View>
        </View>
      </View>
    </AnimatedPressable>
  );
});

// ---------------------------------------------------------------------------
// Public moodboard masonry card — cover collage + title + curator
// ---------------------------------------------------------------------------
const PublicMoodboardCard = React.memo(function PublicMoodboardCard({
  moodboard,
  onPress,
  cardHeight }: {
  moodboard: Moodboard;
  onPress: () => void;
  cardHeight: number;
}) {
  const styles = useStyles();
  const { width: SCREEN_W } = useWindowDimensions();
  const MASONRY_COL_WIDTH =
    (SCREEN_W - MASONRY_PADDING * 2 - MASONRY_GAP * (MASONRY_COLUMN_COUNT - 1)) /
    MASONRY_COLUMN_COUNT;

  return (
    <AnimatedPressable
      style={[styles.publicCard, { width: MASONRY_COL_WIDTH }]}
      onPress={onPress}
      activeOpacity={0.92}
      scaleValue={0.98}
      accessibilityRole="button"
      accessibilityLabel={`Moodboard: ${moodboard.title} by ${moodboard.curator}, ${moodboard.items.length} items`}
      accessibilityHint="Opens the moodboard editor"
    >
      <View style={[styles.publicCardImageWrap, { height: cardHeight }]}>
        <CoverCollage moodboard={moodboard} width={MASONRY_COL_WIDTH} height={cardHeight} />
      </View>
      <View style={styles.publicCardMeta}>
        <Text style={styles.publicCardTitle} numberOfLines={2}>
          {moodboard.title}
        </Text>
        <View style={styles.publicCardCuratorRow}>
          <CachedImage
            uri={moodboard.curatorAvatar}
            style={styles.publicCardAvatar}
            contentFit="cover"
            accessible={false}
          />
          <Text style={styles.publicCardCurator} numberOfLines={1}>
            {moodboard.curator}
          </Text>
        </View>
      </View>
    </AnimatedPressable>
  );
});

// ---------------------------------------------------------------------------
// Skeletons
// ---------------------------------------------------------------------------
function UserRailSkeleton() {
  const styles = useStyles();
  return (
    <HorizontalRail
      contentContainerStyle={styles.railContent}
      showsHorizontalScrollIndicator={false}
      accessibilityLabel="Loading your moodboards"
    >
      {Array.from({ length: 3 }).map((_, i) => (
        <View key={i} style={[styles.userCard, { width: USER_CARD_WIDTH }]}>
          <PremiumSkeletonTile width="100%" height={USER_CARD_HEIGHT - 56} borderRadius={Radius.lg} />
          <View style={styles.userCardMeta}>
            <PremiumSkeletonTile width="80%" height={14} borderRadius={Radius.sm} />
            <PremiumSkeletonTile width={50} height={11} borderRadius={Radius.sm} />
          </View>
        </View>
      ))}
    </HorizontalRail>
  );
}

function DiscoverMasonrySkeleton() {
  const styles = useStyles();
  const { width: SCREEN_W } = useWindowDimensions();
  const MASONRY_COL_WIDTH =
    (SCREEN_W - MASONRY_PADDING * 2 - MASONRY_GAP * (MASONRY_COLUMN_COUNT - 1)) /
    MASONRY_COLUMN_COUNT;
  return (
    <View style={styles.masonryGrid}>
      {Array.from({ length: MASONRY_COLUMN_COUNT }).map((_, colIdx) => (
        <View key={colIdx} style={[styles.masonryColumn, { width: MASONRY_COL_WIDTH }]}>
          {Array.from({ length: 2 }).map((_, i) => {
            const ratio = MASONRY_ASPECT_RATIOS[(colIdx * 2 + i) % MASONRY_ASPECT_RATIOS.length];
            const imgHeight = Math.round(MASONRY_COL_WIDTH * ratio);
            return (
              <View key={i} style={styles.publicCard}>
                <PremiumSkeletonTile width="100%" height={imgHeight} borderRadius={Radius.lg} />
                <View style={styles.publicCardMeta}>
                  <PremiumSkeletonTile width="90%" height={14} borderRadius={Radius.sm} />
                  <PremiumSkeletonTile width={60} height={11} borderRadius={Radius.sm} />
                </View>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Section header — single title, no decorative eyebrow
// ---------------------------------------------------------------------------
function SectionHeader({ title }: { title: string }) {
  const styles = useStyles();
  return (
    <View style={styles.sectionHeaderWrap}>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------
export default function MoodboardHomeScreen() {
  const navigation = useNavigation<NavT>();
  const { colors, isDark } = useAppTheme();
  const haptic = useHaptic();
  const { isOffline } = useConnectivity();
  const insets = useSafeAreaInsets();
  const { width: SCREEN_W } = useWindowDimensions();
  const MASONRY_COL_WIDTH =
    (SCREEN_W - MASONRY_PADDING * 2 - MASONRY_GAP * (MASONRY_COLUMN_COUNT - 1)) /
    MASONRY_COLUMN_COUNT;
  const styles = useStyles();
  const reducedMotion = useReducedMotion();

  // Feature flag — gates the moodboard beta badge on the creation entry
  // points. Additive indicator; absent when the flag is off (current
  // behaviour). When enabled, the Create and Studio buttons surface a
  // "Beta" label so users know the collage tooling is in beta.
  const moodboardBetaEnabled = useFeatureFlag('moodboard_beta');

  const [userMoodboards, setUserMoodboards] = useState<Moodboard[]>([]);
  const [publicMoodboards, setPublicMoodboards] = useState<Moodboard[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // ── Data loading ──
  const loadAll = useCallback(async (isRefresh: boolean) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const [userMbs, publicMbs] = await Promise.all([
        fetchMoodboards(),
        fetchPublicMoodboards(),
      ]);
      setUserMoodboards(userMbs);
      setPublicMoodboards(publicMbs);
    } catch (e) {
      setError('We couldn\u2019t load moodboards. Try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadAll(false);
  }, [loadAll]);

  const handleRefresh = useCallback(() => {
    haptic.selection();
    void loadAll(true);
  }, [haptic, loadAll]);

  // ── Navigation handlers ──
  const handleMoodboardPress = useCallback(
    (moodboard: Moodboard) => {
      haptic.selection();
      navigation.navigate('MoodboardEditor', { moodboardId: moodboard.id });
    },
    [haptic, navigation],
  );

  const handleCreatePress = useCallback(() => {
    haptic.selection();
    navigation.navigate('MoodboardEditor', {});
  }, [haptic, navigation]);

  // Open the Poster Creator Studio with moodboard templates — the poster
  // creative tooling owns the collage/composition canvas. Moodboards created
  // here use the same layer system as posters, with moodboard-specific
  // templates (grid, editorial, collection, inspiration wall).
  const handleCreateWithPosterStudio = useCallback(() => {
    haptic.selection();
    navigation.navigate('CreatorStudio', {
      type: 'poster',
      openTemplates: true });
  }, [haptic, navigation]);

  const handleGoBack = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate('Galleria');
    }
  }, [navigation]);

  // ── Derived data ──
  const filteredPublicMoodboards = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return publicMoodboards;
    return publicMoodboards.filter((mb) => {
      return (
        mb.title.toLowerCase().includes(q) ||
        mb.curator.toLowerCase().includes(q) ||
        mb.description.toLowerCase().includes(q)
      );
    });
  }, [publicMoodboards, searchQuery]);

  // ── FlashList masonry callbacks ──
  const keyExtractor = useCallback((item: Moodboard) => item.id, []);

  const renderMasonryItem = useCallback(
    ({ item, index }: { item: Moodboard; index: number }) => {
      const ratio = MASONRY_ASPECT_RATIOS[index % MASONRY_ASPECT_RATIOS.length];
      const imgHeight = Math.round(MASONRY_COL_WIDTH * ratio);
      return (
        <View style={{ paddingHorizontal: MASONRY_GAP / 2, width: '100%' }}>
          <PublicMoodboardCard
            moodboard={item}
            cardHeight={imgHeight}
            onPress={() => handleMoodboardPress(item)}
          />
        </View>
      );
    },
    [handleMoodboardPress, MASONRY_COL_WIDTH],
  );

  const overrideItemLayout = useCallback(
    (layout: { span?: number }) => {
      layout.span = 1;
    },
    [],
  );

  const listHeader = useMemo(
    () => (
      <View style={{ marginHorizontal: -(MASONRY_PADDING - MASONRY_GAP / 2) }}>
        {/* ── Header ── */}
        <View style={styles.headerRow}>
          <AnimatedPressable
            style={styles.backButton}
            onPress={handleGoBack}
            activeOpacity={0.7}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            accessibilityHint="Returns to the previous screen"
          >
            <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
          </AnimatedPressable>
          <Text style={styles.headerTitle}>Moodboards</Text>
          <View style={styles.headerActions}>
            <AnimatedPressable
              style={styles.studioButton}
              onPress={handleCreateWithPosterStudio}
              activeOpacity={0.8}
              scaleValue={0.96}
              accessibilityRole="button"
              accessibilityLabel="Create moodboard with Poster Studio"
              accessibilityHint="Opens the Poster Creator with moodboard collage templates"
            >
              <Ionicons name="create-outline" size={16} color={colors.brand} />
              <Text style={styles.studioButtonText}>Studio</Text>
            </AnimatedPressable>
            <AnimatedPressable
              style={styles.createButton}
              onPress={handleCreatePress}
              activeOpacity={0.8}
              scaleValue={0.96}
              accessibilityRole="button"
              accessibilityLabel={moodboardBetaEnabled ? 'Create a new moodboard (beta)' : 'Create a new moodboard'}
              accessibilityHint="Opens the moodboard editor to create a new collage"
            >
              <Ionicons name="add" size={20} color={colors.textInverse} />
              <Text style={styles.createButtonText}>Create</Text>
              {moodboardBetaEnabled ? (
                <View style={styles.betaBadge} pointerEvents="none" accessible={false}>
                  <Text style={styles.betaBadgeText}>Beta</Text>
                </View>
              ) : null}
            </AnimatedPressable>
          </View>
        </View>

        {/* ── Search ── */}
        <View style={styles.searchWrap}>
          <AppInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search moodboards"
            placeholderTextColor={colors.textMuted}
            appearance="filled"
            returnKeyType="search"
            autoCorrect={false}
            inputContainerStyle={styles.searchInputContainer}
            inputStyle={styles.searchInput}
            prefix={
              <Ionicons name="search-outline" size={18} color={colors.textMuted} />
            }
            suffix={
              searchQuery.length > 0 ? (
                <Pressable
                  hitSlop={{ top: 13, bottom: 13, left: 13, right: 13 }}
                  onPress={() => setSearchQuery('')}
                  accessibilityRole="button"
                  accessibilityLabel="Clear search"
                  accessibilityHint="Clears the search query"
                >
                  <Ionicons name="close-circle" size={18} color={colors.textMuted} />
                </Pressable>
              ) : null
            }
          />
        </View>

        {/* ── Section 1: Your Moodboards rail ── */}
        {loading ? (
          <View style={styles.sectionWrap}>
            <SectionHeader title="Your moodboards" />
            <UserRailSkeleton />
          </View>
        ) : userMoodboards.length > 0 ? (
          <Reanimated.View entering={reducedMotion ? undefined : FadeIn.duration(250)} style={styles.sectionWrap}>
            <SectionHeader title="Your moodboards" />
            <HorizontalRail
              contentContainerStyle={styles.railContent}
              showsHorizontalScrollIndicator={false}
              accessibilityLabel="Your moodboards rail"
            >
              {userMoodboards.map((mb) => (
                <UserMoodboardCard
                  key={mb.id}
                  moodboard={mb}
                  onPress={() => handleMoodboardPress(mb)}
                />
              ))}
            </HorizontalRail>
          </Reanimated.View>
        ) : null}

        {/* ── Section 2: Discover Moodboards — header + loading/empty states ── */}
        {loading ? (
          <View style={styles.sectionWrap}>
            <SectionHeader title="Discover" />
            <DiscoverMasonrySkeleton />
          </View>
        ) : searchQuery.trim().length > 0 && filteredPublicMoodboards.length === 0 ? (
          <View style={styles.sectionWrap}>
            <SectionHeader title="Discover" />
            <View style={styles.searchEmptyWrap}>
              <Text style={styles.searchEmptyTitle}>
                No moodboards match '{searchQuery.trim()}'
              </Text>
              <AnimatedPressable
                style={styles.searchEmptyCta}
                onPress={() => setSearchQuery('')}
                activeOpacity={0.8}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                accessibilityRole="button"
                accessibilityLabel="Clear search query"
              >
                <Text style={styles.searchEmptyCtaText}>Clear search</Text>
              </AnimatedPressable>
            </View>
          </View>
        ) : filteredPublicMoodboards.length > 0 ? (
          <SectionHeader title="Discover" />
        ) : null}
      </View>
    ),
    [
      loading,
      userMoodboards,
      searchQuery,
      filteredPublicMoodboards.length,
      reducedMotion,
      styles,
      colors,
      handleMoodboardPress,
      handleGoBack,
      handleCreatePress,
      handleCreateWithPosterStudio,
      moodboardBetaEnabled,
    ],
  );

  const listFooter = useMemo(
    () =>
      !loading && userMoodboards.length === 0 && publicMoodboards.length > 0 ? (
        <View style={{ marginHorizontal: -(MASONRY_PADDING - MASONRY_GAP / 2), marginTop: Space.lg }}>
          <View style={styles.inlineEmptyWrap}>
            <Text style={styles.inlineEmptyTitle}>Create your first moodboard</Text>
            <AnimatedPressable
              style={styles.inlineEmptyCta}
              onPress={handleCreatePress}
              activeOpacity={0.8}
              scaleValue={0.97}
              accessibilityRole="button"
              accessibilityLabel="Create your first moodboard"
              accessibilityHint="Opens the moodboard editor"
            >
              <Text style={styles.inlineEmptyCtaText}>Start creating</Text>
            </AnimatedPressable>
          </View>
        </View>
      ) : null,
    [loading, userMoodboards.length, publicMoodboards.length, styles, colors, handleCreatePress],
  );

  // ── Error state ──
  if (error && !loading && userMoodboards.length === 0 && publicMoodboards.length === 0) {
    return (
      <View style={styles.stateContainer}>
        <ExpoStatusBar style={isDark ? 'light' : 'dark'} />
        <EmptyState
          icon="cloud-offline-outline"
          title="Moodboards unavailable"
          subtitle={error}
          ctaLabel="Retry"
          onCtaPress={() => void loadAll(false)}
        />
      </View>
    );
  }

  // ── Empty state (no moodboards at all) ──
  if (
    !loading &&
    userMoodboards.length === 0 &&
    publicMoodboards.length === 0
  ) {
    return (
      <View style={styles.stateContainer}>
        <ExpoStatusBar style={isDark ? 'light' : 'dark'} />
        <EmptyState
          icon="images-outline"
          title="No moodboards yet"
          subtitle="Create a collage from your listings."
          ctaLabel="Create a moodboard"
          onCtaPress={handleCreatePress}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ExpoStatusBar style={isDark ? 'light' : 'dark'} />

      {/* Offline banner */}
      {isOffline && (
        <View style={styles.offlineBanner}>
          <Ionicons name="cloud-offline-outline" size={14} color={colors.textInverse} accessible={false} aria-hidden={true} />
          <Text style={styles.offlineBannerText}>Offline — moodboards aren't refreshing.</Text>
        </View>
      )}

      {/* Demo mode banner — truthful per AGENTS.md §11 */}
      {MOODBOARD_DEMO_MODE && (
        <View style={styles.demoBanner}>
          <Ionicons name="information-circle-outline" size={13} color={colors.textSecondary} accessible={false} aria-hidden={true} />
          <Text style={styles.demoBannerText}>
            Demo mode — moodboards are not persisted. Changes will be lost when the app restarts.
          </Text>
        </View>
      )}

      <FlashList
        data={loading ? [] : filteredPublicMoodboards}
        masonry
        numColumns={MASONRY_COLUMN_COUNT}
        renderItem={renderMasonryItem}
        keyExtractor={keyExtractor}
        overrideItemLayout={overrideItemLayout}
        ListHeaderComponent={listHeader}
        ListFooterComponent={listFooter}
        contentContainerStyle={{
          paddingHorizontal: Math.max(MASONRY_PADDING - MASONRY_GAP / 2, 0),
          paddingTop: insets.top + Space.sm,
          paddingBottom: Space.xxl }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="transparent"
            colors={['transparent']}
            progressBackgroundColor="transparent"
          />
        }
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
function useStyles() {
  const { colors } = useAppTheme();
  return React.useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: colors.background },
        stateContainer: {
          flex: 1,
          backgroundColor: colors.background,
          justifyContent: 'center',
          alignItems: 'center',
          paddingHorizontal: Space.lg },
        listContent: {
          paddingBottom: Space.xxl },
        // ── Offline banner ──
        offlineBanner: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: Space.xs,
          paddingHorizontal: Space.md,
          paddingVertical: Space.sm,
          backgroundColor: colors.surfaceAlt,
          borderBottomWidth: Stroke.hairline,
          borderBottomColor: colors.border },
        offlineBannerText: {
          fontSize: TypographyV2.meta.size,
          fontFamily: TypographyV2.meta.fontFamily,
          color: colors.textSecondary },
        // ── Demo banner ──
        demoBanner: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: Space.xs,
          paddingHorizontal: Space.md,
          paddingVertical: Space.sm,
          backgroundColor: colors.surface,
          borderBottomWidth: Stroke.hairline,
          borderBottomColor: colors.borderSubtle },
        demoBannerText: {
          fontSize: TypographyV2.meta.size,
          fontFamily: TypographyV2.meta.fontFamily,
          color: colors.textSecondary,
          flex: 1 },
        // ── Header ──
        headerRow: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: Space.md,
          paddingBottom: Space.sm },
        backButton: {
          width: Control.hit,
          height: Control.hit,
          alignItems: 'center',
          justifyContent: 'center',
          marginLeft: -Space.xs },
        headerTitle: {
          fontSize: TypographyV2.screenTitle.size,
          lineHeight: TypographyV2.screenTitle.lineHeight,
          fontFamily: TypographyV2.screenTitle.fontFamily,
          color: colors.textPrimary,
          letterSpacing: TypographyV2.screenTitle.letterSpacing,
          flex: 1,
          textAlign: 'center' },
        headerActions: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: Space.sm },
        studioButton: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: Space.xs,
          backgroundColor: colors.brandSubtle,
          paddingHorizontal: Space.sm + 2,
          paddingVertical: Space.sm,
          borderRadius: Radius.full },
        studioButtonText: {
          fontSize: TypographyV2.meta.size,
          fontFamily: TypographyV2.meta.fontFamily,
          color: colors.brand },
        createButton: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: Space.xs,
          backgroundColor: colors.brand,
          paddingHorizontal: Space.md,
          paddingVertical: Space.sm,
          borderRadius: Radius.full },
        createButtonText: {
          fontSize: TypographyV2.meta.size,
          fontFamily: TypographyV2.meta.fontFamily,
          color: colors.textInverse },
        // ── Search ──
        searchWrap: {
          paddingHorizontal: Space.md,
          paddingTop: Space.xs,
          paddingBottom: Space.sm },
        searchInputContainer: {
          minHeight: 40,
          borderRadius: Radius.lg },
        searchInput: {
          fontSize: TypographyV2.body.size,
          fontFamily: TypographyV2.body.fontFamily,
          paddingVertical: Space.sm },
        searchEmptyWrap: {
          alignItems: 'center',
          gap: Space.sm,
          paddingVertical: Space.xxl,
          paddingHorizontal: Space.lg },
        searchEmptyTitle: {
          fontSize: TypographyV2.bodyStrong.size,
          fontFamily: TypographyV2.bodyStrong.fontFamily,
          color: colors.textPrimary,
          textAlign: 'center',
          letterSpacing: TypographyV2.body.letterSpacing },
        searchEmptyCta: {
          marginTop: Space.xs,
          backgroundColor: colors.brand,
          paddingHorizontal: Space.lg,
          paddingVertical: Space.sm,
          borderRadius: Radius.full },
        searchEmptyCtaText: {
          fontSize: TypographyV2.bodyStrong.size,
          fontFamily: TypographyV2.bodyStrong.fontFamily,
          color: colors.textInverse,
          letterSpacing: LetterSpacing.wide },
        // Beta badge — additive indicator gated by the moodboard_beta flag.
        // A compact label on the Create button so users know the collage
        // tooling is in beta. Absent when the flag is off.
        betaBadge: {
          marginLeft: Space.xxs,
          paddingHorizontal: Space.xs,
          paddingVertical: 1,
          borderRadius: Radius.sm,
          // TODO: no textInverseSubtle token available
          backgroundColor: `${colors.textInverse}24` },
        betaBadgeText: {
          fontSize: TypographyV2.meta.size,
          lineHeight: TypographyV2.meta.lineHeight,
          fontFamily: TypographyV2.meta.fontFamily,
          color: colors.textInverse,
          letterSpacing: LetterSpacing.normal },
        // ── Section wrappers ──
        sectionWrap: {
          marginBottom: Space.lg },
        sectionHeaderWrap: {
          paddingHorizontal: Space.md,
          paddingTop: Space.lg,
          paddingBottom: Space.md },
        sectionTitle: {
          fontSize: TypographyV2.sectionTitle.size,
          lineHeight: TypographyV2.sectionTitle.lineHeight,
          fontFamily: TypographyV2.sectionTitle.fontFamily,
          color: colors.textPrimary,
          letterSpacing: TypographyV2.sectionTitle.letterSpacing },
        railContent: {
          paddingHorizontal: Space.md,
          gap: Space.md },
        // ── User moodboard card ──
        userCard: {
          borderRadius: Radius.lg,
          overflow: 'hidden' },
        userCardImageWrap: {
          borderRadius: Radius.lg,
          overflow: 'hidden' },
        userCardMeta: {
          paddingHorizontal: Space.sm,
          paddingVertical: Space.sm,
          gap: Space.xs - 2 },
        userCardMetaRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: Space.xs / 2 + 1 },
        userCardTitle: {
          fontSize: TypographyV2.bodyStrong.size,
          fontFamily: TypographyV2.bodyStrong.fontFamily,
          color: colors.textPrimary,
          letterSpacing: TypographyV2.body.letterSpacing },
        userCardCount: {
          fontSize: TypographyV2.meta.size,
          fontFamily: TypographyV2.meta.fontFamily,
          color: colors.textMuted },
        userCardMetaDot: {
          fontSize: TypographyV2.meta.size,
          fontFamily: TypographyV2.meta.fontFamily,
          color: colors.textMuted },
        userCardUpdated: {
          fontSize: TypographyV2.meta.size,
          fontFamily: TypographyV2.meta.fontFamily,
          color: colors.textMuted },
        coverPlaceholder: {
          backgroundColor: colors.surfaceAlt },
        // ── Public moodboard card ──
        publicCard: {
          marginBottom: MASONRY_GAP },
        publicCardImageWrap: {
          borderRadius: Radius.lg,
          overflow: 'hidden' },
        publicCardMeta: {
          paddingTop: Space.sm,
          gap: Space.xs },
        publicCardTitle: {
          fontSize: TypographyV2.bodyStrong.size,
          fontFamily: TypographyV2.bodyStrong.fontFamily,
          color: colors.textPrimary,
          letterSpacing: TypographyV2.body.letterSpacing,
          lineHeight: TypographyV2.body.lineHeight },
        publicCardCuratorRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: Space.xs },
        publicCardAvatar: {
          width: Space.md,
          height: Space.md,
          borderRadius: Radius.full } as ImageStyle,
        publicCardCurator: {
          fontSize: TypographyV2.meta.size,
          fontFamily: TypographyV2.meta.fontFamily,
          color: colors.textSecondary,
          flex: 1 },
        // ── Masonry ──
        masonryGrid: {
          flexDirection: 'row',
          paddingHorizontal: MASONRY_PADDING,
          gap: MASONRY_GAP },
        masonryColumn: {
          gap: 0 },
        // ── Inline empty prompt ──
        inlineEmptyWrap: {
          paddingHorizontal: Space.md,
          paddingTop: Space.lg,
          paddingBottom: Space.xl,
          alignItems: 'center',
          gap: Space.sm },
        inlineEmptyTitle: {
          fontSize: TypographyV2.sectionTitle.size,
          fontFamily: TypographyV2.sectionTitle.fontFamily,
          color: colors.textPrimary,
          letterSpacing: TypographyV2.sectionTitle.letterSpacing,
          textAlign: 'center' },
        inlineEmptyCta: {
          marginTop: Space.xs,
          backgroundColor: colors.brand,
          paddingHorizontal: Space.xl,
          paddingVertical: Space.sm + 2,
          borderRadius: Radius.full },
        inlineEmptyCtaText: {
          fontSize: TypographyV2.bodyStrong.size,
          fontFamily: TypographyV2.bodyStrong.fontFamily,
          color: colors.textInverse,
          letterSpacing: LetterSpacing.wide } }),
    [colors],
  );
}
