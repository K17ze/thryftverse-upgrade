import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Reanimated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius, Type, Typography, Stroke } from '../../theme/designTokens';
import { Motion } from '../../theme/motionTokens';
import { CachedImage } from '../CachedImage';
import { AnimatedPressable } from '../AnimatedPressable';
import { useHaptic } from '../../hooks/useHaptic';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { Ionicons } from '@expo/vector-icons';
import type { PosterHighlight } from '../../services/postersApi';

interface PosterHighlightsRailProps {
  highlights: PosterHighlight[];
  onOpenHighlight: (highlightId: string) => void;
  onCreateHighlight?: () => void;
  isOwner?: boolean;
  /** Long-press handler for highlight tiles (e.g. context menu for edit/delete). */
  onHighlightLongPress?: (highlightId: string) => void;
}

const HIGHLIGHT_SIZE = 72;
// 3px — prominent gradient ring border at avatar sizes.
const RING_WIDTH = 3;
const NEW_ICON_SIZE = 28;

// Instagram story gradient — used for the highlight ring border
const INSTAGRAM_GRADIENT = ['#F58529', '#DD2A7B', '#8134AF', '#515BD4'] as const;

export function PosterHighlightsRail({
  highlights,
  onOpenHighlight,
  onCreateHighlight,
  isOwner,
  onHighlightLongPress,
}: PosterHighlightsRailProps) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const reducedMotion = useReducedMotion();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

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

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.container}
      accessibilityRole="list"
      accessibilityLabel="Story highlights"
    >
      {highlights.map((highlight) => {
        const coverUrl = resolveCoverUrl(highlight);
        return (
          <AnimatedPressable
            key={highlight.id}
            style={styles.tile}
            scaleValue={0.97}
            activeOpacity={0.85}
            hapticFeedback="light"
            onPress={() => onOpenHighlight(highlight.id)}
            onLongPress={() => {
              haptic.medium();
              onHighlightLongPress?.(highlight.id);
            }}
            delayLongPress={400}
            accessibilityLabel={`Highlight: ${highlight.title}, ${highlight.frames.length} frames`}
            accessibilityHint="Opens this highlight in the viewer"
            accessibilityRole="button"
          >
            {/* Instagram-style gradient ring */}
            <LinearGradient
              colors={INSTAGRAM_GRADIENT}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.ringGradient}
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
            <Text style={styles.label} numberOfLines={1}>{highlight.title}</Text>
          </AnimatedPressable>
        );
      })}

      {/* "New" highlight tile — only for the profile owner.
          Dashed border with a plus icon. */}
      {isOwner && onCreateHighlight && (
        <AnimatedPressable
          style={styles.tile}
          scaleValue={0.97}
          activeOpacity={0.85}
          hapticFeedback="light"
          onPress={onCreateHighlight}
          accessibilityLabel="Create new highlight"
          accessibilityHint="Creates a new highlight from your stories"
          accessibilityRole="button"
        >
          <View style={styles.newRing}>
            <Ionicons name="add" size={NEW_ICON_SIZE} color={colors.textSecondary} />
          </View>
          <Text style={styles.label} numberOfLines={1}>New</Text>
        </AnimatedPressable>
      )}
    </ScrollView>
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
      gap: Space.md,
    },
    tile: {
      alignItems: 'center',
      width: HIGHLIGHT_SIZE + Space.sm,
    },
    // Instagram-style gradient ring — wraps the avatar with a 3px gradient border
    ringGradient: {
      width: HIGHLIGHT_SIZE + RING_WIDTH * 2,
      height: HIGHLIGHT_SIZE + RING_WIDTH * 2,
      borderRadius: Radius.full,
      justifyContent: 'center',
      alignItems: 'center',
    },
    ringInner: {
      width: HIGHLIGHT_SIZE,
      height: HIGHLIGHT_SIZE,
      borderRadius: Radius.full,
      overflow: 'hidden',
      backgroundColor: colors.surfaceAlt,
    },
    cover: {
      width: '100%',
      height: '100%',
    },
    coverPlaceholder: {
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.surfaceAlt,
    },
    label: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.medium,
      color: colors.textSecondary,
      marginTop: Space.xs,
      maxWidth: HIGHLIGHT_SIZE,
      textAlign: 'center',
    },
    // "New" tile — dashed border with a plus icon
    newRing: {
      width: HIGHLIGHT_SIZE + RING_WIDTH * 2,
      height: HIGHLIGHT_SIZE + RING_WIDTH * 2,
      borderRadius: Radius.full,
      borderStyle: 'dashed',
      borderWidth: Stroke.standard,
      borderColor: colors.border,
      justifyContent: 'center',
      alignItems: 'center',
    },
  });
}
