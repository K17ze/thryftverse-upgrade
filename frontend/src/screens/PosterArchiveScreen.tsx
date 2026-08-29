import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  RefreshControl,
  Dimensions,
  AccessibilityInfo,
  TextInput,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { RootStackParamList } from '../navigation/types';
import { Space, Radius, Type, Typography, Control, Stroke, Elevation } from '../theme/designTokens';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { SkeletonLoader } from '../components/SkeletonLoader';
import { useHaptic } from '../hooks/useHaptic';
import { useToast } from '../context/ToastContext';
import { fetchPosterStoryArchive, deletePosterStory, fetchPosterHighlights } from '../services/postersApi';
import type { PosterStory, PosterHighlight } from '../services/postersApi';
import { CachedImage } from '../components/CachedImage';
import { useStore } from '../store/useStore';
import { ConfirmationSheet } from '../components/ConfirmationSheet';

type Props = NativeStackScreenProps<RootStackParamList, 'PosterArchive'>;

const { width: SCREEN_W } = Dimensions.get('window');
// 16px screen padding + 8px gap between cards
const CARD_W = (SCREEN_W - Space.md * 2 - Space.sm) / 2;
const CARD_H = CARD_W * (16 / 9);

/**
 * Relative date formatter — "just now", "3h ago", "2d ago", "1w ago".
 * Falls back to an absolute date ("Mar 4") for anything older than ~4 weeks,
 * matching Instagram's archive scannability.
 */
function formatRelativeDate(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffMs = Math.max(0, now - then);
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function PosterArchiveScreen({ navigation }: Props) {
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { show } = useToast();
  const haptic = useHaptic();

  const [stories, setStories] = useState<PosterStory[]>([]);
  const [highlights, setHighlights] = useState<PosterHighlight[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [filter, setFilter] = useState<'all' | 'active' | 'archived' | 'highlights'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [confirmSheet, setConfirmSheet] = useState<{
    visible: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    confirmLabel?: string;
    variant?: 'default' | 'danger';
  }>({ visible: false, title: '', message: '', onConfirm: () => {} });
  const currentUser = useStore((state) => state.currentUser);

  const filteredStories = useMemo(() => {
    if (filter === 'active') return stories.filter((s) => s.status === 'active');
    if (filter === 'archived') return stories.filter((s) => s.status !== 'active');
    return stories;
  }, [stories, filter]);

  // Client-side search — matches firstFrame.caption and item.title (case-insensitive, partial word).
  const filteredBySearch = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return filteredStories;
    return filteredStories.filter((s) => {
      const caption = s.frames[0]?.caption?.toLowerCase() ?? '';
      const title = 'title' in s && typeof s.title === 'string' ? s.title.toLowerCase() : '';
      return caption.includes(q) || title.includes(q);
    });
  }, [filteredStories, searchQuery]);

  const activeCount = useMemo(() => stories.filter((s) => s.status === 'active').length, [stories]);
  const archivedCount = stories.length - activeCount;

  const loadArchive = useCallback(async (isRefresh = false) => {
    if (isRefresh) setIsRefreshing(true);
    else setIsLoading(true);
    try {
      const [storyRes, highlightRes] = await Promise.all([
        fetchPosterStoryArchive({ includeActive: true }),
        currentUser ? fetchPosterHighlights(currentUser.id).catch(() => ({ items: [] as PosterHighlight[] })) : Promise.resolve({ items: [] as PosterHighlight[] }),
      ]);
      setStories(storyRes.items);
      setHighlights(highlightRes.items);
      setLoadError(false);
    } catch {
      setLoadError(true);
      if (!isRefresh) show('Could not load archive', 'error');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [show, currentUser]);

  // Refetch on focus so newly published/archived posters appear without
  // requiring a manual pull-to-refresh. The poster AsyncStorage cache is
  // invalidated by the API layer after publish/archive, so a focus refetch
  // always hits the server for fresh data.
  useFocusEffect(
    useCallback(() => {
      loadArchive();
    }, [loadArchive]),
  );

  const handleDelete = (storyId: string) => {
    haptic.medium();
    setConfirmSheet({
      visible: true,
      title: 'Delete story?',
      message: 'This will permanently remove your poster story.',
      confirmLabel: 'Delete',
      variant: 'danger',
      onConfirm: async () => {
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
    });
  };

  const renderItem = ({ item }: { item: PosterStory }) => {
    const firstFrame = item.frames[0];
    const isActive = item.status === 'active';
    const expiresAt = new Date(item.expiresAt).getTime();
    const isExpired = expiresAt <= Date.now();
    const hoursLeft = Math.max(0, Math.ceil((expiresAt - Date.now()) / (60 * 60 * 1000)));
    const viewCount = item.uniqueViewerCount ?? 0;

    return (
      <AnimatedPressable
        onPress={() => navigation.navigate('PosterViewer', { storyId: item.id })}
        style={styles.card}
        scaleValue={0.97}
        hapticFeedback="light"
        activeOpacity={0.85}
        accessibilityLabel={`Story with ${item.totalFrameCount} frames${isActive ? ` (${hoursLeft}h left)` : ' (archived)'}, ${viewCount} views`}
        accessibilityHint="Opens this story in the viewer"
        accessibilityRole="button"
      >
        <View style={styles.cardMedia}>
          {firstFrame?.mediaUrl ? (
            <CachedImage
              uri={firstFrame.mediaUrl}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              containerStyle={{ borderRadius: Radius.none, overflow: 'hidden' }}
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
            <View style={styles.cardOverlayRight}>
              {viewCount > 0 && (
                <View style={styles.viewCountPill}>
                  <Ionicons name="eye-outline" size={11} color={colors.scrimTextPrimary} />
                  <Text style={styles.viewCountText}>{viewCount}</Text>
                </View>
              )}
              {item.totalFrameCount > 1 && (
                <View style={styles.frameCountPill}>
                  <Ionicons name="layers" size={12} color={colors.scrimTextPrimary} />
                  <Text style={styles.frameCountText}>{item.totalFrameCount}</Text>
                </View>
              )}
            </View>
          </View>
        </View>
        <View style={styles.cardFooter}>
          <Text style={styles.cardDate}>
            {formatRelativeDate(item.createdAt)}
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
            <Ionicons name="trash-outline" size={16} color={colors.textMuted} />
          </AnimatedPressable>
        </View>
      </AnimatedPressable>
    );
  };

  const renderHighlightItem = ({ item }: { item: PosterHighlight }) => {
    const coverUrl = item.coverUrl ?? item.frames[0]?.mediaUrl;
    const frameCount = item.frames.length;

    return (
      <AnimatedPressable
        onPress={() => navigation.navigate('PosterHighlightViewer', { highlightId: item.id })}
        style={styles.card}
        scaleValue={0.97}
        hapticFeedback="light"
        activeOpacity={0.85}
        accessibilityLabel={`Highlight: ${item.title}, ${frameCount} frames`}
        accessibilityHint="Opens this highlight in the viewer"
        accessibilityRole="button"
      >
        <View style={styles.cardMedia}>
          {coverUrl ? (
            <CachedImage
              uri={coverUrl}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              containerStyle={{ borderRadius: Radius.none, overflow: 'hidden' }}
            />
          ) : (
            <View style={[styles.cardPlaceholder, { backgroundColor: colors.surfaceAlt }]}>
              <Ionicons name="star" size={28} color={colors.textMuted} />
            </View>
          )}
          <View style={styles.cardOverlay}>
            <View style={[styles.statusPill, styles.statusHighlight]}>
              <Ionicons name="star" size={10} color={colors.scrimTextPrimary} />
              <Text style={styles.statusText}>Highlight</Text>
            </View>
            {frameCount > 1 && (
              <View style={styles.frameCountPill}>
                <Ionicons name="layers" size={12} color={colors.scrimTextPrimary} />
                <Text style={styles.frameCountText}>{frameCount}</Text>
              </View>
            )}
          </View>
        </View>
        <View style={styles.cardFooter}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {item.title}
          </Text>
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

      {/* Filter segmented control — All / Active / Archived / Highlights */}
      <View style={styles.filterRow}>
        {([
          { key: 'all', label: `All (${stories.length})` },
          { key: 'active', label: `Active (${activeCount})` },
          { key: 'archived', label: `Archived (${archivedCount})` },
          { key: 'highlights', label: `Highlights (${highlights.length})` },
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

      {/* Search bar — client-side caption/title search (hidden for highlights) */}
      {filter !== 'highlights' && (
        <View style={styles.searchRow}>
          <View style={styles.searchBar}>
            <Ionicons name="search-outline" size={18} color={colors.textMuted} />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search stories"
              placeholderTextColor={colors.textMuted}
              style={styles.searchInput}
              accessibilityLabel="Search stories"
              accessibilityRole="search"
            />
            {searchQuery.length > 0 && (
              <AnimatedPressable
                onPress={() => setSearchQuery('')}
                style={styles.searchClear}
                activeOpacity={0.7}
                scaleValue={0.9}
                hapticFeedback="light"
                accessibilityLabel="Clear search"
                accessibilityRole="button"
              >
                <Ionicons name="close-circle" size={18} color={colors.textMuted} />
              </AnimatedPressable>
            )}
          </View>
        </View>
      )}

      <FlashList
        data={filter === 'highlights' ? highlights as unknown as PosterStory[] : filteredBySearch}
        keyExtractor={(item) => item.id}
        renderItem={filter === 'highlights' ? renderHighlightItem as unknown as typeof renderItem : renderItem}
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
            <View style={styles.emptyIconWrap}>
              <Ionicons
                name={searchQuery.trim().length > 0 ? 'search-outline' : 'archive-outline'}
                size={36}
                color={colors.textMuted}
              />
            </View>
            <Text style={styles.emptyTitle}>
              {searchQuery.trim().length > 0
                ? `No stories match '${searchQuery.trim()}'`
                : filter === 'active'
                  ? 'No active stories'
                  : filter === 'archived'
                    ? 'No archived stories'
                    : filter === 'highlights'
                      ? 'No highlights yet'
                      : 'No stories yet'}
            </Text>
            <Text style={styles.emptySubtitle}>
              {searchQuery.trim().length > 0
                ? 'Try a different search term or clear the search.'
                : filter === 'active'
                  ? 'Your active stories will appear here while they are live.'
                  : filter === 'archived'
                    ? 'Archived stories will appear here after 24 hours.'
                    : filter === 'highlights'
                      ? 'Create highlights from your archived stories to pin them to your profile.'
                      : 'Your published and archived stories will appear here.'}
            </Text>
          </View>
        }
        // Performance: archive grids can grow large; FlashList v2 handles
        // recycling automatically.
      />

      <ConfirmationSheet
        visible={confirmSheet.visible}
        onDismiss={() => setConfirmSheet((prev) => ({ ...prev, visible: false }))}
        title={confirmSheet.title}
        message={confirmSheet.message}
        confirmLabel={confirmSheet.confirmLabel ?? 'Confirm'}
        variant={confirmSheet.variant ?? 'default'}
        onConfirm={confirmSheet.onConfirm}
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
  // Filter segmented control — flat, no card-on-card. Inactive is plain text,
  // active is a filled brand pill (Instagram-style).
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
  },
  filterChipActive: {
    backgroundColor: colors.brand,
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
  // Search bar — flat, hairline border, no card-on-card.
  searchRow: {
    paddingHorizontal: Space.md,
    paddingBottom: Space.sm,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
    height: 40,
    paddingHorizontal: Space.md,
    borderRadius: Radius.md,
    backgroundColor: colors.surfaceAlt,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  searchInput: {
    flex: 1,
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
    color: colors.textPrimary,
    padding: 0,
  },
  searchClear: {
    width: Control.hit,
    height: Control.hit,
    borderRadius: Radius.full,
    justifyContent: 'center',
    alignItems: 'center',
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
    ...Elevation.card,
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
    color: colors.scrimTextPrimary,
    fontFamily: Typography.family.semibold,
    fontSize: Type.caption.size,
    textAlign: 'center',
  },
  cardOverlay: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'space-between',
    padding: Space.xs,
  },
  cardOverlayRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs - 2,
    alignSelf: 'flex-end',
  },
  viewCountPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: Radius.full,
    paddingHorizontal: Space.xs + 2,
    paddingVertical: Space.xs / 2,
  },
  viewCountText: {
    color: colors.scrimTextPrimary,
    fontSize: Type.meta.size,
    fontFamily: Typography.family.semibold,
  },
  statusHighlight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: 'rgba(244,240,232,0.85)',
  },
  cardTitle: {
    flex: 1,
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
    color: colors.textPrimary,
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
    color: colors.scrimTextPrimary,
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
    color: colors.scrimTextPrimary,
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
    paddingHorizontal: Space.xl,
  },
  emptyIconWrap: {
    width: Space.xxl + Space.sm,
    height: Space.xxl + Space.sm,
    borderRadius: Radius.full,
    backgroundColor: colors.surfaceAlt,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Space.xs,
  },
  emptyTitle: {
    fontSize: Type.bodyStrong.size,
    fontFamily: Typography.family.semibold,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
    color: colors.textMuted,
    textAlign: 'center',
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
    fontSize: Type.bodyStrong.size,
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
