import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  RefreshControl,
  Dimensions,
  Alert,
  AccessibilityInfo,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { Space, Radius, Type, Typography, Control, Stroke } from '../theme/designTokens';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { SkeletonLoader } from '../components/SkeletonLoader';
import { useHaptic } from '../hooks/useHaptic';
import { useToast } from '../context/ToastContext';
import { fetchPosterStoryArchive, deletePosterStory } from '../services/postersApi';
import type { PosterStory } from '../services/postersApi';
import { CachedImage } from '../components/CachedImage';

type Props = NativeStackScreenProps<RootStackParamList, 'PosterArchive'>;

const { width: SCREEN_W } = Dimensions.get('window');
// 16px screen padding + 8px gap between cards
const CARD_W = (SCREEN_W - Space.md * 2 - Space.sm) / 2;
const CARD_H = CARD_W * (16 / 9);

export default function PosterArchiveScreen({ navigation }: Props) {
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { show } = useToast();
  const haptic = useHaptic();

  const [stories, setStories] = useState<PosterStory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [filter, setFilter] = useState<'all' | 'active' | 'archived'>('all');

  const filteredStories = useMemo(() => {
    if (filter === 'active') return stories.filter((s) => s.status === 'active');
    if (filter === 'archived') return stories.filter((s) => s.status !== 'active');
    return stories;
  }, [stories, filter]);

  const activeCount = useMemo(() => stories.filter((s) => s.status === 'active').length, [stories]);
  const archivedCount = stories.length - activeCount;

  const loadArchive = useCallback(async (isRefresh = false) => {
    if (isRefresh) setIsRefreshing(true);
    else setIsLoading(true);
    try {
      const res = await fetchPosterStoryArchive({ includeActive: true });
      setStories(res.items);
      setLoadError(false);
    } catch {
      setLoadError(true);
      if (!isRefresh) show('Could not load archive', 'error');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [show]);

  useEffect(() => {
    loadArchive();
  }, [loadArchive]);

  const handleDelete = (storyId: string) => {
    haptic.medium();
    Alert.alert(
      'Delete story?',
      'This will permanently remove your poster story.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deletePosterStory(storyId);
              setStories((prev) => prev.filter((s) => s.id !== storyId));
              haptic.success();
              AccessibilityInfo.announceForAccessibility('Story deleted');
              show('Story deleted', 'info');
            } catch {
              haptic.error();
              show('Failed to delete story', 'error');
            }
          },
        },
      ]
    );
  };

  const renderItem = ({ item }: { item: PosterStory }) => {
    const firstFrame = item.frames[0];
    const isActive = item.status === 'active';
    const expiresAt = new Date(item.expiresAt).getTime();
    const isExpired = expiresAt <= Date.now();
    const hoursLeft = Math.max(0, Math.ceil((expiresAt - Date.now()) / (60 * 60 * 1000)));

    return (
      <AnimatedPressable
        onPress={() => navigation.navigate('PosterViewer', { storyId: item.id })}
        style={styles.card}
        scaleValue={0.97}
        hapticFeedback="light"
        activeOpacity={0.85}
        accessibilityLabel={`Story with ${item.totalFrameCount} frames${isActive ? ` (${hoursLeft}h left)` : ' (archived)'}`}
        accessibilityHint="Opens this story in the viewer"
        accessibilityRole="button"
      >
        <View style={styles.cardMedia}>
          {firstFrame?.mediaUrl ? (
            <CachedImage
              uri={firstFrame.mediaUrl}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              containerStyle={{ borderRadius: 0, overflow: 'hidden' }}
            />
          ) : (
            <View style={[styles.cardPlaceholder, { backgroundColor: firstFrame?.backgroundColor ?? colors.surfaceAlt }]}>
              <Text style={styles.cardPlaceholderText} numberOfLines={2}>
                {firstFrame?.caption || 'Text story'}
              </Text>
            </View>
          )}
          <View style={styles.cardOverlay}>
            {isActive ? (
              <View style={[styles.statusPill, styles.statusActive]}>
                <Text style={styles.statusText}>{hoursLeft}h left</Text>
              </View>
            ) : (
              <View style={[styles.statusPill, styles.statusArchived]}>
                <Text style={styles.statusText}>Archived</Text>
              </View>
            )}
            {item.totalFrameCount > 1 && (
              <View style={styles.frameCountPill}>
                <Ionicons name="layers" size={12} color="#fff" />
                <Text style={styles.frameCountText}>{item.totalFrameCount}</Text>
              </View>
            )}
          </View>
        </View>
        <View style={styles.cardFooter}>
          <Text style={styles.cardDate}>
            {new Date(item.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
          </Text>
          <AnimatedPressable
            onPress={() => handleDelete(item.id)}
            style={styles.deleteBtn}
            scaleValue={0.97}
            hapticFeedback="medium"
            activeOpacity={0.7}
            hitSlop={8}
            accessibilityLabel="Delete story"
            accessibilityRole="button"
            accessibilityHint="Deletes this archived story"
          >
            <Ionicons name="trash-outline" size={16} color="#fff" />
          </AnimatedPressable>
        </View>
      </AnimatedPressable>
    );
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
        <View style={styles.topBar}>
          <AnimatedPressable
            onPress={() => navigation.goBack()}
            style={styles.iconBtn}
            activeOpacity={0.7}
            scaleValue={0.97}
            hapticFeedback="light"
            accessibilityLabel="Back"
            accessibilityHint="Returns to the previous screen"
            accessibilityRole="button"
          >
            <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
          </AnimatedPressable>
          <Text style={styles.topTitle}>Archive</Text>
          <View style={styles.iconBtn} />
        </View>
        {/* Skeleton grid — 6 cards in a 2-column grid */}
        <View style={styles.listContent}>
          <View style={styles.skeletonGrid}>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <View key={i} style={styles.skeletonCard}>
                <SkeletonLoader width="100%" height={CARD_H} borderRadius={Radius.lg} />
                <View style={styles.skeletonFooter}>
                  <SkeletonLoader width={40} height={Type.caption.size} borderRadius={Radius.sm} />
                  <View style={{ width: 18 }} />
                </View>
              </View>
            ))}
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (loadError && stories.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
        <View style={styles.topBar}>
          <AnimatedPressable
            onPress={() => navigation.goBack()}
            style={styles.iconBtn}
            activeOpacity={0.7}
            scaleValue={0.97}
            hapticFeedback="light"
            accessibilityLabel="Back"
            accessibilityHint="Returns to the previous screen"
            accessibilityRole="button"
          >
            <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
          </AnimatedPressable>
          <Text style={styles.topTitle}>Archive</Text>
          <View style={styles.iconBtn} />
        </View>
        <View style={styles.errorBody}>
          <View style={styles.errorIconWrap}>
            <Ionicons name="cloud-offline-outline" size={36} color={colors.textMuted} />
          </View>
          <Text style={styles.errorTitle}>Could not load archive</Text>
          <Text style={styles.errorHint}>Check your connection and try again.</Text>
          <AnimatedPressable
            onPress={() => loadArchive()}
            style={styles.retryBtn}
            activeOpacity={0.8}
            scaleValue={0.97}
            hapticFeedback="medium"
            accessibilityLabel="Retry loading"
            accessibilityHint="Reloads the archive"
            accessibilityRole="button"
          >
            <Ionicons name="refresh-outline" size={18} color={colors.textInverse} />
            <Text style={styles.retryBtnText}>Try again</Text>
          </AnimatedPressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <View style={styles.topBar}>
        <AnimatedPressable
          onPress={() => navigation.goBack()}
          style={styles.iconBtn}
          activeOpacity={0.7}
          scaleValue={0.97}
          hapticFeedback="light"
          accessibilityLabel="Back"
          accessibilityHint="Returns to the previous screen"
          accessibilityRole="button"
        >
          <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
        </AnimatedPressable>
        <Text style={styles.topTitle}>My Poster Archive</Text>
        <View style={styles.iconBtn} />
      </View>

      {/* Filter segmented control — All / Active / Archived */}
      <View style={styles.filterRow}>
        {([
          { key: 'all', label: `All (${stories.length})` },
          { key: 'active', label: `Active (${activeCount})` },
          { key: 'archived', label: `Archived (${archivedCount})` },
        ] as const).map((opt) => (
          <AnimatedPressable
            key={opt.key}
            onPress={() => {
              haptic.selection();
              setFilter(opt.key);
              AccessibilityInfo.announceForAccessibility(`Showing ${opt.label}`);
            }}
            style={[styles.filterChip, filter === opt.key && styles.filterChipActive]}
            scaleValue={0.97}
            activeOpacity={0.85}
            hapticFeedback="light"
            accessibilityLabel={opt.label}
            accessibilityRole="button"
            accessibilityState={{ selected: filter === opt.key }}
          >
            <Text style={[styles.filterChipText, filter === opt.key && styles.filterChipTextActive]}>
              {opt.label}
            </Text>
          </AnimatedPressable>
        ))}
      </View>

      <FlashList
        data={filteredStories}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        numColumns={2}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => loadArchive(true)}
            tintColor={colors.brand}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyBody}>
            <Ionicons name="archive-outline" size={56} color={colors.textMuted} />
            <Text style={styles.emptyTitle}>
              {filter === 'active'
                ? 'No active stories'
                : filter === 'archived'
                  ? 'No archived stories'
                  : 'No stories yet'}
            </Text>
            <Text style={styles.emptySubtitle}>
              {filter === 'active'
                ? 'Your active stories will appear here while they are live.'
                : filter === 'archived'
                  ? 'Archived stories will appear here after 24 hours.'
                  : 'Your published and archived stories will appear here.'}
            </Text>
          </View>
        }
        // Performance: archive grids can grow large; FlashList v2 handles
        // recycling automatically.
      />
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Space.sm,
      paddingVertical: Space.sm + 2,
    },
    topTitle: {
      fontSize: Type.subtitle.size,
      fontFamily: Typography.family.bold,
      color: colors.textPrimary,
      letterSpacing: Type.subtitle.letterSpacing,
    },
  iconBtn: {
    width: Control.hit,
    height: Control.hit,
    borderRadius: Radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  skeletonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.sm,
  },
  skeletonCard: {
    width: CARD_W,
  },
  skeletonFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Space.xs,
  },
  listContent: {
    paddingHorizontal: Space.md,
    paddingBottom: Space.xl,
  },
  // Filter segmented control — flat chips, no card-on-card
  filterRow: {
    flexDirection: 'row',
    gap: Space.xs,
    paddingHorizontal: Space.md,
    paddingBottom: Space.sm,
  },
  filterChip: {
    paddingVertical: Space.xs + 1,
    paddingHorizontal: Space.sm + 2,
    borderRadius: Radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  filterChipActive: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  filterChipText: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.medium,
    color: colors.textSecondary,
  },
  filterChipTextActive: {
    color: colors.textInverse,
    fontFamily: Typography.family.semibold,
  },
  columnWrapper: {
    gap: Space.sm,
    marginBottom: Space.sm,
  },
  card: {
    width: CARD_W,
    backgroundColor: colors.surface,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  cardMedia: {
    width: CARD_W,
    aspectRatio: 9 / 16,
    backgroundColor: colors.surfaceAlt,
    overflow: 'hidden',
  },
  cardPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Space.sm,
  },
  cardPlaceholderText: {
    color: '#fff',
    fontFamily: Typography.family.semibold,
    fontSize: Type.caption.size,
    textAlign: 'center',
  },
  cardOverlay: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'space-between',
    padding: Space.xs,
  },
  statusPill: {
    alignSelf: 'flex-start',
    borderRadius: Radius.full,
    paddingHorizontal: Space.sm,
    paddingVertical: 3,
  },
  statusActive: {
    backgroundColor: 'rgba(76, 217, 100, 0.85)',
  },
  statusArchived: {
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  statusText: {
    color: '#fff',
    fontSize: Type.meta.size,
    fontFamily: Typography.family.semibold,
  },
  frameCountPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs - 1,
    alignSelf: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: Radius.full,
    paddingHorizontal: Space.xs + 2,
    paddingVertical: Space.xs / 2,
  },
  frameCountText: {
    color: '#fff',
    fontSize: Type.meta.size,
    fontFamily: Typography.family.semibold,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Space.xs,
  },
  deleteBtn: {
    width: 28,
    height: 28,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardDate: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    color: colors.textSecondary,
  },
  emptyBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Space.xxl,
    gap: Space.sm,
  },
  emptyTitle: {
    fontSize: Type.bodyLarge.size,
    fontFamily: Typography.family.semibold,
    color: colors.textSecondary,
  },
  emptySubtitle: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
    color: colors.textMuted,
  },
  errorBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.sm,
    paddingHorizontal: Space.xl,
  },
  errorIconWrap: {
    width: Space.xxl + Space.sm,
    height: Space.xxl + Space.sm,
    borderRadius: Radius.full,
    backgroundColor: colors.surfaceAlt,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Space.xs,
  },
  errorTitle: {
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.semibold,
    color: colors.textPrimary,
  },
  errorHint: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    color: colors.textMuted,
    textAlign: 'center',
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
    paddingHorizontal: Space.md + 4,
    paddingVertical: Space.sm,
    borderRadius: Radius.full,
    backgroundColor: colors.brand,
    marginTop: Space.xs,
  },
  retryBtnText: {
    color: colors.textInverse,
    fontFamily: Typography.family.semibold,
    fontSize: Type.body.size,
  },
  });
}
