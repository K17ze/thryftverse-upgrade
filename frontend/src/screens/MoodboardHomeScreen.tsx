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
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAppTheme } from '../theme/ThemeContext';
import { Space, Radius, Control, LetterSpacing, PressScale } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { RootStackParamList } from '../navigation/types';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { CachedImage } from '../components/CachedImage';
import { HorizontalRail } from '../components/HorizontalRail';
import { OfflineBanner } from '../components/OfflineBanner';
import { AppIcon } from '../components/common/AppIcon';
import { IconSize } from '../theme/iconTokens';
import { AppInput } from '../components/ui/AppInput';
import { PremiumSkeletonTile } from '../components/discover/PremiumSkeletonTile';
import {
  FlagshipScreen,
  FlagshipHeader,
  FlagshipState } from '../components/flagship';
import { useHaptic } from '../hooks/useHaptic';
import { useConnectivity } from '../hooks/useConnectivity';
import { useReducedMotion } from '../hooks/useReducedMotion';
import Reanimated, { FadeIn } from 'react-native-reanimated';
import {
  fetchMoodboards,
  fetchPublicMoodboards,
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
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const { isOffline } = useConnectivity();
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
              <AppIcon name="search" size={IconSize.sm} color="textMuted" accessible={false} />
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
                  <AppIcon name="closeCircle" size={IconSize.sm} color="textMuted" accessible={false} />
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

  // ── Header actions — transparent 44pt icon targets (AGENTS.md §4) ──
  const headerActions = (
    <View style={styles.headerActions}>
      <AnimatedPressable
        style={styles.headerActionButton}
        onPress={handleCreateWithPosterStudio}
        activeOpacity={0.7}
        scaleValue={PressScale.icon}
        hapticFeedback="light"
        accessibilityRole="button"
        accessibilityLabel="Create moodboard with Poster Studio"
        accessibilityHint="Opens the Poster Creator with moodboard collage templates"
      >
        <AppIcon name="edit" size={IconSize.md} color="textPrimary" accessible={false} />
      </AnimatedPressable>
      <AnimatedPressable
        style={styles.headerActionButton}
        onPress={handleCreatePress}
        activeOpacity={0.7}
        scaleValue={PressScale.icon}
        hapticFeedback="light"
        accessibilityRole="button"
        accessibilityLabel={moodboardBetaEnabled ? 'Create a new moodboard (beta)' : 'Create a new moodboard'}
        accessibilityHint="Opens the moodboard editor to create a new collage"
      >
        <AppIcon name="plus" size={IconSize.lg} color="textPrimary" accessible={false} />
      </AnimatedPressable>
    </View>
  );

  // ── Error state ──
  if (error && !loading && userMoodboards.length === 0 && publicMoodboards.length === 0) {
    return (
      <FlagshipScreen
        scrollEnabled={false}
        header={
          <FlagshipHeader title="Moodboards" onBack={handleGoBack} />
        }
      >
        <View style={styles.stateContainer}>
          <FlagshipState
            variant="error"
            title="Moodboards unavailable"
            subtitle={error}
            actionLabel="Retry"
            onAction={() => void loadAll(false)}
          />
        </View>
      </FlagshipScreen>
    );
  }

  // ── Empty state (no moodboards at all) ──
  if (
    !loading &&
    userMoodboards.length === 0 &&
    publicMoodboards.length === 0
  ) {
    return (
      <FlagshipScreen
        scrollEnabled={false}
        header={
          <FlagshipHeader title="Moodboards" onBack={handleGoBack} rightAction={headerActions} />
        }
      >
        <View style={styles.stateContainer}>
          <FlagshipState
            variant="empty"
            actionIcon="image"
            title="No moodboards yet"
            subtitle="Create a collage from your listings."
            actionLabel="Create a moodboard"
            onAction={handleCreatePress}
          />
        </View>
      </FlagshipScreen>
    );
  }

  return (
    <FlagshipScreen
      testID="moodboard-home-screen"
      scrollEnabled={false}
      contentStyle={styles.screenContent}
      header={
        <FlagshipHeader title="Moodboards" onBack={handleGoBack} rightAction={headerActions} />
      }
    >
      {/* Offline banner */}
      {isOffline && (
        <OfflineBanner message="Offline — moodboards aren't refreshing." />
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
          paddingTop: Space.sm,
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
    </FlagshipScreen>
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
        screenContent: {
          paddingHorizontal: 0 },
        stateContainer: {
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          paddingHorizontal: Space.lg },
        // ── Header actions ──
        headerActions: {
          flexDirection: 'row',
          alignItems: 'center' },
        headerActionButton: {
          width: Control.hit,
          height: Control.hit,
          alignItems: 'center',
          justifyContent: 'center' },
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
        coverPlaceholder: {},
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
