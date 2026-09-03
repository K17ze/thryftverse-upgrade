import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, Pressable, LayoutChangeEvent } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  runOnJS,
} from 'react-native-reanimated';
import { Space, FontFamily, Radius, Typography } from '../../../theme/designTokens';
import { TypographyV2 } from '../../../theme/typography.v2';
import { RadiusRoleValue } from '../../../theme/surfaceRadiusRules';
import { useAppTheme } from '../../../theme/ThemeContext';
import { useHaptic } from '../../../hooks/useHaptic';
import { formatTimecode, type PosterClip } from './TimelineTypes';

// ───────────────────────────────────────────────────────────────────────────
// ClipThumb — a single clip thumbnail on the timeline track.
//
// Width is proportional to the clip's (speed-adjusted) duration. The
// thumbnail fills the 64pt track height. When selected, a 2pt brand border
// (selection stroke grammar) wraps the clip and trim handles appear on the
// left/right edges. A duration label overlays the bottom edge.
//
// Trim gestures are 1:1 and UI-thread driven: a SharedValue accumulates the
// pixel delta and an animated style resizes the clip visually in the
// worklet. The parent mutation (onTrimCommit) fires once on gesture end —
// never per frame.
// ───────────────────────────────────────────────────────────────────────────

const CLIP_HEIGHT = 64;
const TRIM_HANDLE_WIDTH = 14;
const TRIM_HIT_WIDTH = 44;

export interface ClipThumbProps {
  clip: PosterClip;
  width: number;
  isSelected: boolean;
  onPress: () => void;
  /** Fired once when a trim gesture ends, with the total delta in ms. */
  onTrimCommit?: (edge: 'start' | 'end', deltaMs: number) => void;
}

export const ClipThumb = React.memo(function ClipThumb({
  clip,
  width,
  isSelected,
  onPress,
  onTrimCommit,
}: ClipThumbProps) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const trackWidthSV = useSharedValue(width);
  const [isPressed, setIsPressed] = useState(false);

  // ── Trim visual feedback (UI thread) ────────────────────────────────
  // Accumulates the pixel delta during a trim drag. The animated style
  // reads this on the UI thread to resize the clip 1:1 with the finger.
  // Reset to 0 on gesture end after committing the delta to the parent.
  const trimDeltaSV = useSharedValue(0);

  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    trackWidthSV.value = e.nativeEvent.layout.width;
  }, [trackWidthSV]);

  // Convert a pixel delta to a millisecond delta using the clip's own
  // pixel-per-ms ratio. Used only on gesture end (in the worklet) to
  // compute the final committed delta.
  const pxToMs = useCallback((px: number) => {
    if (width <= 0 || clip.durationMs <= 0) return 0;
    return (px / width) * clip.durationMs;
  }, [width, clip.durationMs]);

  // ── Trim gestures ───────────────────────────────────────────────────
  // Each gesture accumulates the pixel delta in trimDeltaSV on the UI
  // thread. The animated style resizes the clip visually. On end, the
  // accumulated delta is converted to ms and committed once.
  const startTrimGesture = React.useMemo(() =>
    Gesture.Pan()
      .minDistance(3)
      .onBegin(() => {
        'worklet';
        trimDeltaSV.value = 0;
      })
      .onChange((e) => {
        'worklet';
        // Dragging the start handle left = wider clip (earlier trim start).
        trimDeltaSV.value += -e.changeX;
      })
      .onEnd(() => {
        'worklet';
        const deltaMs = pxToMs(trimDeltaSV.value);
        if (onTrimCommit) runOnJS(onTrimCommit)('start', deltaMs);
        runOnJS(haptic.light)();
        trimDeltaSV.value = 0;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pxToMs, onTrimCommit, haptic, trimDeltaSV]
  );

  const endTrimGesture = React.useMemo(() =>
    Gesture.Pan()
      .minDistance(3)
      .onBegin(() => {
        'worklet';
        trimDeltaSV.value = 0;
      })
      .onChange((e) => {
        'worklet';
        // Dragging the end handle right = wider clip (later trim end).
        trimDeltaSV.value += e.changeX;
      })
      .onEnd(() => {
        'worklet';
        const deltaMs = pxToMs(trimDeltaSV.value);
        if (onTrimCommit) runOnJS(onTrimCommit)('end', deltaMs);
        runOnJS(haptic.light)();
        trimDeltaSV.value = 0;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pxToMs, onTrimCommit, haptic, trimDeltaSV]
  );

  // ── Animated clip width (UI thread) ─────────────────────────────────
  // For end trim: width grows/shrinks from the right edge.
  // For start trim: width grows/shrinks and the clip translates to keep
  // the right edge stable (left edge moves).
  const clipAnimStyle = useAnimatedStyle(() => {
    const visualWidth = width + trimDeltaSV.value;
    return {
      width: Math.max(24, visualWidth),
      transform: [{ translateX: -Math.max(0, trimDeltaSV.value) }],
    };
  });

  const uri = clip.thumbnailUri || clip.sourceUri;

  // ── Metadata badges ─────────────────────────────────────────────────
  const showSpeed = clip.speed !== 1;
  const showReversed = clip.reversed;
  const showFreeze = clip.freezeFrameMs != null;
  const showVolume = clip.volume !== 1;
  const showMuted = clip.volume === 0;
  const hasAudio = clip.mediaType === 'video';
  const showAudioBadge = hasAudio && (showMuted || showVolume);
  const hasBadges = showSpeed || showReversed || showFreeze || showAudioBadge;

  return (
    <Reanimated.View
      onLayout={handleLayout}
      accessibilityLabel={`Clip, ${formatTimecode(clip.durationMs)}`}
      accessibilityRole="button"
      style={[
        clipAnimStyle,
        {
          height: CLIP_HEIGHT,
        },
      ]}
    >
      <Pressable
        onPress={() => { haptic.selection(); onPress(); }}
        onPressIn={() => setIsPressed(true)}
        onPressOut={() => setIsPressed(false)}
        accessibilityRole="button"
        accessibilityLabel={`Select clip, ${formatTimecode(clip.durationMs)}`}
        style={[
          clipStyles.container,
          {
            width: '100%',
            height: '100%',
            borderColor: isSelected ? colors.brand : colors.border,
            borderWidth: isSelected ? 2 : 1,
            backgroundColor: colors.surface,
            opacity: isPressed ? 0.8 : 1,
          },
        ]}
      >
        <ExpoImage
          source={{ uri }}
          style={clipStyles.thumb}
          contentFit="cover"
          recyclingKey={clip.id}
          placeholder={colors.surfaceAlt}
          transition={300}
        />
        {/* Subtle scrim so the duration label stays legible over any media. */}
        <View style={[clipStyles.scrim, { backgroundColor: colors.mediaOverlayScrim }]} />
        {width > 60 && (
          <Text style={[clipStyles.durationLabel, { color: colors.scrimTextPrimary }]} numberOfLines={1}>
            {formatTimecode(clip.durationMs)}
          </Text>
        )}

        {width > 80 && hasBadges && (
          <View style={clipStyles.badgeRow}>
            {showSpeed && (
              <View
                style={[clipStyles.badge, { backgroundColor: colors.surfaceAlt }]}
                accessibilityLabel={`Speed ${clip.speed}x`}
              >
                <Text style={[clipStyles.badgeText, { color: colors.textPrimary }]}>
                  {clip.speed}x
                </Text>
              </View>
            )}
            {showReversed && (
              <View
                style={[clipStyles.badge, { backgroundColor: colors.surfaceAlt }]}
                accessibilityLabel="Reversed playback"
              >
                <Ionicons name="play-skip-back" size={10} color={colors.textPrimary} />
              </View>
            )}
            {showFreeze && (
              <View
                style={[clipStyles.badge, { backgroundColor: colors.surfaceAlt }]}
                accessibilityLabel="Freeze frame"
              >
                <Ionicons name="snow" size={10} color={colors.textPrimary} />
              </View>
            )}
            {showMuted && (
              <View
                style={[clipStyles.badge, { backgroundColor: colors.surfaceAlt }]}
                accessibilityLabel="Audio muted"
              >
                <Ionicons name="volume-mute" size={10} color={colors.textPrimary} />
              </View>
            )}
            {showAudioBadge && !showMuted && (
              <View
                style={[clipStyles.badge, { backgroundColor: colors.surfaceAlt }]}
                accessibilityLabel={`Volume ${Math.round(clip.volume * 100)} percent`}
              >
                <Ionicons name="volume-medium" size={10} color={colors.textPrimary} />
              </View>
            )}
          </View>
        )}

        {isSelected && onTrimCommit && (
          <View style={clipStyles.trimHitStart}>
            <GestureDetector gesture={startTrimGesture}>
              <View
                style={[clipStyles.trimHandle, clipStyles.trimHandleStart, { backgroundColor: colors.brand }]}
                accessibilityLabel="Trim start"
                accessibilityRole="adjustable"
                accessibilityValue={{ min: 0, max: clip.trimEndMs - 100, now: clip.trimStartMs, unit: 'milliseconds' }}
                accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
                onAccessibilityAction={(event) => onTrimCommit('start', event.nativeEvent.actionName === 'increment' ? 1000 : -1000)}
              />
            </GestureDetector>
          </View>
        )}
        {isSelected && onTrimCommit && (
          <View style={clipStyles.trimHitEnd}>
            <GestureDetector gesture={endTrimGesture}>
              <View
                style={[clipStyles.trimHandle, clipStyles.trimHandleEnd, { backgroundColor: colors.brand }]}
                accessibilityLabel="Trim end"
                accessibilityRole="adjustable"
                accessibilityValue={{ min: clip.trimStartMs + 100, max: clip.trimEndMs + 60000, now: clip.trimEndMs, unit: 'milliseconds' }}
                accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
                onAccessibilityAction={(event) => onTrimCommit('end', event.nativeEvent.actionName === 'increment' ? 1000 : -1000)}
              />
            </GestureDetector>
          </View>
        )}
      </Pressable>
    </Reanimated.View>
  );
});

const CLIP_GAP = Space.xxs; // 1pt-ish gap between clips (see TimelineTrack)

const clipStyles = StyleSheet.create({
  container: {
    position: 'relative',
    borderRadius: RadiusRoleValue.mediaThumbnail,
    overflow: 'hidden',
    marginRight: CLIP_GAP,
  },
  thumb: {
    width: '100%',
    height: '100%',
  },
  scrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 20,
  },
  durationLabel: {
    position: 'absolute',
    left: Space.xs,
    bottom: 3,
    fontFamily: FontFamily.semibold,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontVariant: ['tabular-nums'],
  },
  trimHandle: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: TRIM_HANDLE_WIDTH,
    justifyContent: 'center',
    alignItems: 'center',
  },
  trimHitStart: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: TRIM_HIT_WIDTH,
    justifyContent: 'center',
    alignItems: 'center',
  },
  trimHitEnd: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    width: TRIM_HIT_WIDTH,
    justifyContent: 'center',
    alignItems: 'center',
  },
  trimHandleStart: {
    left: 0,
    borderTopLeftRadius: RadiusRoleValue.mediaThumbnail,
    borderBottomLeftRadius: RadiusRoleValue.mediaThumbnail,
  },
  trimHandleEnd: {
    right: 0,
    borderTopRightRadius: RadiusRoleValue.mediaThumbnail,
    borderBottomRightRadius: RadiusRoleValue.mediaThumbnail,
  },
  badgeRow: {
    position: 'absolute',
    top: Space.xs,
    left: Space.xs,
    flexDirection: 'row',
    gap: Space.xxs,
  },
  badge: {
    borderRadius: Radius.sm,
    paddingHorizontal: 4,
    paddingVertical: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontFamily: FontFamily.semibold,
    fontSize: Typography.size.micro,
    lineHeight: 12,
  },
});
