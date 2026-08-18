import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  RefreshControl,
  ImageStyle,
  ScrollView,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import { useAppTheme } from '../theme/ThemeContext';
import { Space, Radius, Type, Typography, Stroke, Control, LetterSpacing } from '../theme/designTokens';
import { RootStackParamList } from '../navigation/types';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { CachedImage } from '../components/CachedImage';
import { HorizontalRail } from '../components/HorizontalRail';
import { EmptyState } from '../components/EmptyState';
import { PremiumSkeletonTile } from '../components/discover/PremiumSkeletonTile';
import { useHaptic } from '../hooks/useHaptic';
import { useConnectivity } from '../hooks/useConnectivity';
import {
  fetchMoodboards,
  fetchPublicMoodboards,
  MOODBOARD_DEMO_MODE,
  type Moodboard,
} from '../services/moodboardApi';

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
const { width: SCREEN_W } = Dimensions.get('window');
const USER_CARD_WIDTH = 200;
const USER_CARD_HEIGHT = 240;
const MASONRY_GAP = Space.sm;
const MASONRY_COLUMN_COUNT = 2;
const MASONRY_PADDING = Space.md;
const MASONRY_COL_WIDTH =
  (SCREEN_W - MASONRY_PADDING * 2 - MASONRY_GAP * (MASONRY_COLUMN_COUNT - 1)) /
  MASONRY_COLUMN_COUNT;

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
  height,
}: {
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
  onPress,
}: {
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
  cardHeight,
}: {
  moodboard: Moodboard;
  onPress: () => void;
  cardHeight: number;
}) {
  const styles = useStyles();

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
// Section header — eyebrow + title
// ---------------------------------------------------------------------------
function SectionHeader({ eyebrow, title }: { eyebrow: string; title: string }) {
  const styles = useStyles();
  return (
    <View style={styles.sectionHeaderWrap}>
      <Text style={styles.sectionEyebrow}>{eyebrow}</Text>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Masonry layout — true Pinterest-style column assignment by shortest height
// ---------------------------------------------------------------------------
function buildMasonryColumns(items: Moodboard[]): { item: Moodboard; height: number }[][] {
  const cols: { item: Moodboard; height: number }[][] = Array.from(
    { length: MASONRY_COLUMN_COUNT },
    () => [],
  );
  const heights = Array.from({ length: MASONRY_COLUMN_COUNT }, () => 0);

  items.forEach((mb, idx) => {
    const ratio = MASONRY_ASPECT_RATIOS[idx % MASONRY_ASPECT_RATIOS.length];
    const imgHeight = Math.round(MASONRY_COL_WIDTH * ratio);
    const metaHeight = 64;
    const itemHeight = imgHeight + metaHeight + MASONRY_GAP;

    let shortestCol = 0;
    let shortestHeight = heights[0];
    for (let c = 1; c < MASONRY_COLUMN_COUNT; c++) {
      if (heights[c] < shortestHeight) {
        shortestCol = c;
        shortestHeight = heights[c];
      }
    }
    cols[shortestCol].push({ item: mb, height: imgHeight });
    heights[shortestCol] += itemHeight;
  });

  return cols;
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
  const styles = useStyles();

  const [userMoodboards, setUserMoodboards] = useState<Moodboard[]>([]);
  const [publicMoodboards, setPublicMoodboards] = useState<Moodboard[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      openTemplates: true,
    });
  }, [haptic, navigation]);

  const handleGoBack = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate('Galleria');
    }
  }, [navigation]);

  // ── Derived data ──
  const masonryColumns = useMemo(
    () => buildMasonryColumns(publicMoodboards),
    [publicMoodboards],
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
          subtitle="Create your first collage — arrange listings into a composition that tells your story."
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
          <Ionicons name="cloud-offline-outline" size={14} color={colors.textInverse} />
          <Text style={styles.offlineBannerText}>Offline — showing cached moodboards</Text>
        </View>
      )}

      {/* Demo mode banner — truthful per AGENTS.md §11 */}
      {MOODBOARD_DEMO_MODE && (
        <View style={styles.demoBanner}>
          <Ionicons name="information-circle-outline" size={13} color={colors.textSecondary} />
          <Text style={styles.demoBannerText}>
            Demo mode — moodboards are saved locally. Connect the backend to share publicly.
          </Text>
        </View>
      )}

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.listContent,
          { paddingTop: insets.top + Space.sm },
        ]}
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
              accessibilityLabel="Create a new moodboard"
              accessibilityHint="Opens the moodboard editor to create a new collage"
            >
              <Ionicons name="add" size={20} color={colors.textInverse} />
              <Text style={styles.createButtonText}>Create</Text>
            </AnimatedPressable>
          </View>
        </View>

        {/* ── Section 1: Your Moodboards rail ── */}
        {loading ? (
          <View style={styles.sectionWrap}>
            <SectionHeader eyebrow="YOUR MOODBOARDS" title="Your collages" />
            <UserRailSkeleton />
          </View>
        ) : userMoodboards.length > 0 ? (
          <View style={styles.sectionWrap}>
            <SectionHeader eyebrow="YOUR MOODBOARDS" title="Your collages" />
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
          </View>
        ) : null}

        {/* ── Section 2: Discover Moodboards masonry ── */}
        {loading ? (
          <View style={styles.sectionWrap}>
            <SectionHeader eyebrow="DISCOVER" title="Moodboards from the community" />
            <DiscoverMasonrySkeleton />
          </View>
        ) : publicMoodboards.length > 0 ? (
          <View style={styles.sectionWrap}>
            <SectionHeader eyebrow="DISCOVER" title="Moodboards from the community" />
            <View style={styles.masonryGrid}>
              {masonryColumns.map((col, colIdx) => (
                <View
                  key={colIdx}
                  style={[styles.masonryColumn, { width: MASONRY_COL_WIDTH }]}
                >
                  {col.map(({ item, height }) => (
                    <PublicMoodboardCard
                      key={item.id}
                      moodboard={item}
                      cardHeight={height}
                      onPress={() => handleMoodboardPress(item)}
                    />
                  ))}
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {/* ── Empty user moodboards inline prompt ── */}
        {!loading && userMoodboards.length === 0 && publicMoodboards.length > 0 ? (
          <View style={styles.inlineEmptyWrap}>
            <View style={styles.inlineEmptyCard}>
              <Ionicons name="grid-outline" size={28} color={colors.brand} />
              <Text style={styles.inlineEmptyTitle}>Create your first moodboard</Text>
              <Text style={styles.inlineEmptySubtitle}>
                Arrange listings into a collage that expresses your style.
              </Text>
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
        ) : null}
      </ScrollView>
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
          backgroundColor: colors.background,
        },
        stateContainer: {
          flex: 1,
          backgroundColor: colors.background,
          justifyContent: 'center',
          alignItems: 'center',
          paddingHorizontal: Space.lg,
        },
        listContent: {
          paddingBottom: Space.xxl,
        },
        // ── Offline banner ──
        offlineBanner: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: Space.xs,
          paddingHorizontal: Space.md,
          paddingVertical: Space.sm,
          backgroundColor: colors.surfaceAlt,
          borderBottomWidth: Stroke.hairline,
          borderBottomColor: colors.border,
        },
        offlineBannerText: {
          fontSize: Type.caption.size,
          fontFamily: Typography.family.medium,
          color: colors.textSecondary,
        },
        // ── Demo banner ──
        demoBanner: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: Space.xs,
          paddingHorizontal: Space.md,
          paddingVertical: Space.sm,
          backgroundColor: colors.surface,
          borderBottomWidth: Stroke.hairline,
          borderBottomColor: colors.borderSubtle,
        },
        demoBannerText: {
          fontSize: Type.caption.size,
          fontFamily: Typography.family.regular,
          color: colors.textSecondary,
          flex: 1,
        },
        // ── Header ──
        headerRow: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: Space.md,
          paddingBottom: Space.sm,
        },
        backButton: {
          width: Control.hit,
          height: Control.hit,
          alignItems: 'center',
          justifyContent: 'center',
          marginLeft: -Space.xs,
        },
        headerTitle: {
          fontSize: Type.title.size,
          lineHeight: Type.title.lineHeight,
          fontFamily: Typography.family.bold,
          color: colors.textPrimary,
          letterSpacing: Type.title.letterSpacing,
          flex: 1,
          textAlign: 'center',
        },
        headerActions: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: Space.sm,
        },
        studioButton: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: Space.xs,
          backgroundColor: colors.brand + '14',
          paddingHorizontal: Space.sm + 2,
          paddingVertical: Space.sm,
          borderRadius: Radius.full,
        },
        studioButtonText: {
          fontSize: Type.caption.size,
          fontFamily: Typography.family.semibold,
          color: colors.brand,
        },
        createButton: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: Space.xs,
          backgroundColor: colors.brand,
          paddingHorizontal: Space.md,
          paddingVertical: Space.sm,
          borderRadius: Radius.full,
        },
        createButtonText: {
          fontSize: Type.caption.size,
          fontFamily: Typography.family.semibold,
          color: colors.textInverse,
        },
        // ── Section wrappers ──
        sectionWrap: {
          marginBottom: Space.lg,
        },
        sectionHeaderWrap: {
          paddingHorizontal: Space.md,
          paddingTop: Space.lg,
          paddingBottom: Space.md,
        },
        sectionEyebrow: {
          fontSize: Type.label.size,
          fontFamily: Typography.family.semibold,
          color: colors.textMuted,
          letterSpacing: Type.label.letterSpacing,
          marginBottom: Space.xs,
        },
        sectionTitle: {
          fontSize: Type.subtitle.size,
          lineHeight: Type.subtitle.lineHeight,
          fontFamily: Typography.family.bold,
          color: colors.textPrimary,
          letterSpacing: Type.subtitle.letterSpacing,
        },
        railContent: {
          paddingHorizontal: Space.md,
          gap: Space.md,
        },
        // ── User moodboard card ──
        userCard: {
          borderRadius: Radius.lg,
          overflow: 'hidden',
        },
        userCardImageWrap: {
          borderRadius: Radius.lg,
          overflow: 'hidden',
        },
        userCardMeta: {
          paddingHorizontal: Space.sm,
          paddingVertical: Space.sm,
          gap: Space.xs - 2,
        },
        userCardMetaRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: Space.xs / 2 + 1,
        },
        userCardTitle: {
          fontSize: Type.bodyStrong.size,
          fontFamily: Typography.family.semibold,
          color: colors.textPrimary,
          letterSpacing: Type.body.letterSpacing,
        },
        userCardCount: {
          fontSize: Type.caption.size,
          fontFamily: Typography.family.regular,
          color: colors.textMuted,
        },
        userCardMetaDot: {
          fontSize: Type.caption.size,
          fontFamily: Typography.family.regular,
          color: colors.textMuted,
        },
        userCardUpdated: {
          fontSize: Type.caption.size,
          fontFamily: Typography.family.regular,
          color: colors.textMuted,
        },
        coverPlaceholder: {
          backgroundColor: colors.surfaceAlt,
        },
        // ── Public moodboard card ──
        publicCard: {
          marginBottom: MASONRY_GAP,
        },
        publicCardImageWrap: {
          borderRadius: Radius.lg,
          overflow: 'hidden',
        },
        publicCardMeta: {
          paddingTop: Space.sm,
          gap: Space.xs,
        },
        publicCardTitle: {
          fontSize: Type.bodyStrong.size,
          fontFamily: Typography.family.semibold,
          color: colors.textPrimary,
          letterSpacing: Type.body.letterSpacing,
          lineHeight: Type.body.lineHeight,
        },
        publicCardCuratorRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: Space.xs,
        },
        publicCardAvatar: {
          width: Space.md,
          height: Space.md,
          borderRadius: Radius.full,
        } as ImageStyle,
        publicCardCurator: {
          fontSize: Type.caption.size,
          fontFamily: Typography.family.regular,
          color: colors.textSecondary,
          flex: 1,
        },
        // ── Masonry ──
        masonryGrid: {
          flexDirection: 'row',
          paddingHorizontal: MASONRY_PADDING,
          gap: MASONRY_GAP,
        },
        masonryColumn: {
          gap: 0,
        },
        // ── Inline empty prompt ──
        inlineEmptyWrap: {
          paddingHorizontal: Space.md,
          paddingTop: Space.lg,
          paddingBottom: Space.xl,
        },
        inlineEmptyCard: {
          alignItems: 'center',
          gap: Space.sm,
          paddingVertical: Space.xl,
          paddingHorizontal: Space.lg,
          borderRadius: Radius.xl,
          backgroundColor: colors.surface,
          borderWidth: Stroke.hairline,
          borderColor: colors.border,
        },
        inlineEmptyTitle: {
          fontSize: Type.subtitle.size,
          fontFamily: Typography.family.semibold,
          color: colors.textPrimary,
          letterSpacing: Type.subtitle.letterSpacing,
        },
        inlineEmptySubtitle: {
          fontSize: Type.body.size,
          fontFamily: Typography.family.regular,
          color: colors.textMuted,
          textAlign: 'center',
          lineHeight: Type.body.lineHeight,
        },
        inlineEmptyCta: {
          marginTop: Space.xs,
          backgroundColor: colors.brand,
          paddingHorizontal: Space.xl,
          paddingVertical: Space.sm + 2,
          borderRadius: Radius.full,
        },
        inlineEmptyCtaText: {
          fontSize: Type.bodyStrong.size,
          fontFamily: Typography.family.bold,
          color: colors.textInverse,
          letterSpacing: LetterSpacing.wide,
        },
      }),
    [colors],
  );
}
