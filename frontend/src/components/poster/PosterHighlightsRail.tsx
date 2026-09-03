import React, { useRef, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withDelay,
  useAnimatedReaction,
  runOnJS } from 'react-native-reanimated';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius, Typography, Stroke } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { Motion } from '../../theme/motionTokens';
import { CachedImage } from '../CachedImage';
import { AnimatedPressable } from '../AnimatedPressable';
import { useHaptic } from '../../hooks/useHaptic';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useMotionConfig } from '../../hooks/useMotionConfig';
import { Ionicons } from '@expo/vector-icons';
import type { PosterHighlight } from '../../services/postersApi';

/** Spring config shape returned by useMotionConfig().spring.* */
type SpringConfig = { damping: number; stiffness: number; mass: number };

interface PosterHighlightsRailProps {
  highlights: PosterHighlight[];
  onOpenHighlight: (highlightId: string) => void;
  onCreateHighlight?: () => void;
  isOwner?: boolean;
  /** Long-press handler for highlight tiles (e.g. context menu for edit/delete). */
  onHighlightLongPress?: (highlightId: string) => void;
  /** Currently active highlight ID (for ring indicator). */
  activeHighlightId?: string | null;
}

const HIGHLIGHT_SIZE = 80; // 2026 standard: 80-96px circular story highlights
// 2px — Instagram's refined gradient ring border at avatar sizes.
const RING_WIDTH = 2;
const NEW_ICON_SIZE = 24;
const FRAME_BADGE_SIZE = 18;
const TILE_WIDTH = HIGHLIGHT_SIZE + Space.sm;

// Instagram story gradient — used for the highlight ring border
const INSTAGRAM_GRADIENT = ['#F58529', '#DD2A7B', '#8134AF', '#515BD4'] as const;
// Active highlight gradient — warmer, more saturated to signal selection
const ACTIVE_GRADIENT = ['#F58529', '#DD2A7B', '#8134AF', '#515BD4'] as const;

/**
 * Individual highlight tile with stagger entrance and spring press feedback.
 * Each tile slides up + fades in with a staggered delay based on its index.
 */
function HighlightTile({
  highlight,
  index,
  coverUrl,
  isActive,
  reducedMotion,
  springConfig,
  staggerDelay,
  onOpen,
  onLongPress }: {
  highlight: PosterHighlight;
  index: number;
  coverUrl: string | null;
  isActive: boolean;
  reducedMotion: boolean;
  springConfig: SpringConfig;
  staggerDelay: number;
  onOpen: () => void;
  onLongPress: () => void;
}) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  // Stagger entrance: translate Y + opacity from 0 → 1 with delay
  const entranceY = useSharedValue(reducedMotion ? 0 : 12);
  const entranceOpacity = useSharedValue(reducedMotion ? 1 : 0);

  React.useEffect(() => {
    if (!reducedMotion) {
      entranceY.value = withDelay(
        staggerDelay * index,
        withSpring(0, springConfig)
      );
      entranceOpacity.value = withDelay(
        staggerDelay * index,
        withTiming(1, { duration: Motion.duration.normal })
      );
    }
  }, [index, staggerDelay, reducedMotion, springConfig, entranceY, entranceOpacity]);

  const entranceStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: entranceY.value }],
    opacity: entranceOpacity.value }));

  return (
    <Reanimated.View style={entranceStyle}>
      <AnimatedPressable
        style={styles.tile}
        scaleValue={0.97}
        activeOpacity={0.85}
        hapticFeedback="light"
        onPress={onOpen}
        onLongPress={onLongPress}
        delayLongPress={400}
        accessibilityLabel={`Highlight: ${highlight.title}, ${highlight.frames.length} frames`}
        accessibilityHint="Opens this highlight in the viewer"
        accessibilityRole="button"
        accessibilityState={{ selected: isActive }}
      >
        {/* Instagram-style gradient ring — active highlight gets a thicker,
            more saturated ring to signal selection. */}
        <LinearGradient
          colors={isActive ? ACTIVE_GRADIENT : INSTAGRAM_GRADIENT}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.ringGradient, isActive && styles.ringGradientActive]}
        >
          <View style={styles.ringInner}>
            {coverUrl ? (
              <HighlightCover coverUrl={coverUrl} reducedMotion={reducedMotion} />
            ) : (
              <View style={[styles.cover, styles.coverPlaceholder]}>
                <Ionicons name="image-outline" size={24} color={colors.textMuted} />
              </View>
            )}
          </View>
        </LinearGradient>
        {/* Frame count badge — bottom-right of the circle, adds information
            density without clutter. Only shown when there is more than one
            frame so single-frame highlights stay clean. */}
        {highlight.frames.length > 1 && (
          <View style={styles.frameBadge} pointerEvents="none">
            <Text style={styles.frameBadgeText}>{highlight.frames.length}</Text>
          </View>
        )}
        <Text style={[styles.label, isActive && styles.labelActive]} numberOfLines={1}>
          {highlight.title}
        </Text>
      </AnimatedPressable>
    </Reanimated.View>
  );
}

export function PosterHighlightsRail({
  highlights,
  onOpenHighlight,
  onCreateHighlight,
  isOwner,
  onHighlightLongPress,
  activeHighlightId }: PosterHighlightsRailProps) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const reducedMotion = useReducedMotion();
  const { spring, stagger } = useMotionConfig();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const scrollRef = useRef<ScrollView>(null);

  /**
   * Resolve the cover image URL for a highlight.
   * Falls back to the cover frame's mediaUrl when coverUrl is null
   * but coverFrameId points to a known frame in the highlight.
   */
  const resolveCoverUrl = (highlight: PosterHighlight): string | null => {
    if (highlight.coverUrl) return highlight.coverUrl;
    if (highlight.coverFrameId) {
      const coverFrame = highlight.frames.find((f) => f.frameId === highlight.coverFrameId);
      if (coverFrame) return coverFrame.mediaUrl;
    }
    // Last resort: first frame
    if (highlight.frames.length > 0) return highlight.frames[0].mediaUrl;
    return null;
  };

  const handleScrollEnd = useCallback((event: any) => {
    // Spring snap — round to nearest tile width
    const x = event.nativeEvent.contentOffset.x;
    const nearestIndex = Math.round(x / TILE_WIDTH);
    const targetX = nearestIndex * TILE_WIDTH;
    if (Math.abs(x - targetX) > 2) {
      scrollRef.current?.scrollTo({ x: targetX, animated: true });
    }
  }, []);

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.container}
      accessibilityRole="list"
      accessibilityLabel="Story highlights"
      onScrollEndDrag={handleScrollEnd}
      decelerationRate="fast"
      snapToInterval={TILE_WIDTH}
      snapToAlignment="start"
    >
      {highlights.map((highlight, index) => {
        const coverUrl = resolveCoverUrl(highlight);
        const isActive = activeHighlightId === highlight.id;
        return (
          <HighlightTile
            key={highlight.id}
            highlight={highlight}
            index={index}
            coverUrl={coverUrl}
            isActive={isActive}
            reducedMotion={reducedMotion}
            springConfig={spring.entrance as SpringConfig}
            staggerDelay={stagger.fast}
            onOpen={() => {
              haptic.selection();
              onOpenHighlight(highlight.id);
            }}
            onLongPress={() => {
              haptic.medium();
              onHighlightLongPress?.(highlight.id);
            }}
          />
        );
      })}

      {/* "New" highlight tile — only for the profile owner.
          Clean thin solid border with a plus icon (Instagram-style).
          Staggered entrance matches the highlight tiles. */}
      {isOwner && onCreateHighlight && (
        <NewHighlightTile
          index={highlights.length}
          reducedMotion={reducedMotion}
          springConfig={spring.entrance as SpringConfig}
          staggerDelay={stagger.fast}
          onCreate={onCreateHighlight}
        />
      )}
    </ScrollView>
  );
}

/**
 * "New" highlight tile with stagger entrance.
 */
function NewHighlightTile({
  index,
  reducedMotion,
  springConfig,
  staggerDelay,
  onCreate }: {
  index: number;
  reducedMotion: boolean;
  springConfig: SpringConfig;
  staggerDelay: number;
  onCreate: () => void;
}) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  const entranceY = useSharedValue(reducedMotion ? 0 : 12);
  const entranceOpacity = useSharedValue(reducedMotion ? 1 : 0);

  React.useEffect(() => {
    if (!reducedMotion) {
      entranceY.value = withDelay(
        staggerDelay * index,
        withSpring(0, springConfig)
      );
      entranceOpacity.value = withDelay(
        staggerDelay * index,
        withTiming(1, { duration: Motion.duration.normal })
      );
    }
  }, [index, staggerDelay, reducedMotion, springConfig, entranceY, entranceOpacity]);

  const entranceStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: entranceY.value }],
    opacity: entranceOpacity.value }));

  return (
    <Reanimated.View style={entranceStyle}>
      <AnimatedPressable
        style={styles.tile}
        scaleValue={0.97}
        activeOpacity={0.85}
        hapticFeedback="light"
        onPress={onCreate}
        accessibilityLabel="Create new highlight"
        accessibilityHint="Creates a new highlight from your stories"
        accessibilityRole="button"
      >
        <View style={styles.newRing}>
          <Ionicons name="add" size={NEW_ICON_SIZE} color={colors.textSecondary} />
        </View>
        <Text style={styles.label} numberOfLines={1}>New</Text>
      </AnimatedPressable>
    </Reanimated.View>
  );
}

/**
 * Cover image with a subtle fade-in on load.
 * The opacity animates from 0 → 1 using Motion.duration.normal so the
 * cover gracefully appears over the surfaceAlt placeholder background.
 */
function HighlightCover({ coverUrl, reducedMotion }: { coverUrl: string; reducedMotion: boolean }) {
  const coverOpacity = useSharedValue(reducedMotion ? 1 : 0);
  const animatedStyle = useAnimatedStyle(() => ({ opacity: coverOpacity.value }));
  return (
    <Reanimated.View style={[StyleSheet.absoluteFill, animatedStyle]}>
      <CachedImage
        uri={coverUrl}
        style={{ width: '100%', height: '100%' }}
        contentFit="cover"
        containerStyle={{ borderRadius: Radius.full, overflow: 'hidden' }}
        onLoad={() => {
          if (!reducedMotion) {
            coverOpacity.value = withTiming(1, { duration: Motion.duration.normal });
          }
        }}
      />
    </Reanimated.View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flexDirection: 'row',
      paddingHorizontal: Space.sm,
      paddingVertical: Space.sm,
      gap: Space.md },
    tile: {
      alignItems: 'center',
      width: HIGHLIGHT_SIZE + Space.sm },
    // Instagram-style gradient ring — wraps the avatar with a 2px gradient border
    ringGradient: {
      width: HIGHLIGHT_SIZE + RING_WIDTH * 2,
      height: HIGHLIGHT_SIZE + RING_WIDTH * 2,
      borderRadius: Radius.full,
      justifyContent: 'center',
      alignItems: 'center' },
    // Active highlight — thicker ring (4px) for clear selection signal
    ringGradientActive: {
      width: HIGHLIGHT_SIZE + RING_WIDTH * 4,
      height: HIGHLIGHT_SIZE + RING_WIDTH * 4,
      shadowColor: '#DD2A7B',
      shadowOpacity: 0.3,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 0 },
      elevation: 4 },
    ringInner: {
      width: HIGHLIGHT_SIZE,
      height: HIGHLIGHT_SIZE,
      borderRadius: Radius.full,
      overflow: 'hidden',
      backgroundColor: colors.surfaceAlt,
      borderWidth: Stroke.standard,
      borderColor: colors.background },
    cover: {
      width: '100%',
      height: '100%' },
    coverPlaceholder: {
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.surfaceAlt },
    // Frame count badge — small dark pill anchored to the bottom-right of the
    // highlight circle. Adds useful information density without clutter.
    frameBadge: {
      position: 'absolute',
      top: HIGHLIGHT_SIZE - FRAME_BADGE_SIZE / 2 + RING_WIDTH,
      right: Space.xs / 2,
      minWidth: FRAME_BADGE_SIZE,
      height: FRAME_BADGE_SIZE,
      paddingHorizontal: Space.xs,
      borderRadius: Radius.full,
      backgroundColor: colors.overlay,
      justifyContent: 'center',
      alignItems: 'center' },
    frameBadgeText: {
      color: '#fff',
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      lineHeight: FRAME_BADGE_SIZE },
    label: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textSecondary,
      marginTop: Space.xs,
      maxWidth: HIGHLIGHT_SIZE + Space.xs,
      textAlign: 'center' },
    // Active label — bold + primary color for clear selection
    labelActive: {
      fontFamily: Typography.family.semibold,
      color: colors.textPrimary },
    // "New" tile — clean thin solid border with a plus icon (Instagram-style)
    newRing: {
      width: HIGHLIGHT_SIZE + RING_WIDTH * 2,
      height: HIGHLIGHT_SIZE + RING_WIDTH * 2,
      borderRadius: Radius.full,
      borderWidth: Stroke.standard,
      borderColor: colors.border,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.background } });
}
