import React, { useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, LayoutChangeEvent } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSharedValue, runOnJS } from 'react-native-reanimated';
import { Space, FontFamily } from '../../../theme/designTokens';
import { TypographyV2 } from '../../../theme/typography.v2';
import { RadiusRoleValue } from '../../../theme/surfaceRadiusRules';
import { useAppTheme } from '../../../theme/ThemeContext';
import { useHaptic } from '../../../hooks/useHaptic';
import { formatTimecode, type PosterClip } from './TimelineTypes';

// ───────────────────────────────────────────────────────────────────────────
// ClipThumb — a single clip thumbnail on the timeline track.
//
// Width is proportional to the clip's (speed-adjusted) duration. The
// thumbnail fills the 60pt track height. When selected, a 2pt brand border
// (selection stroke grammar) wraps the clip and trim handles appear on the
// left/right edges. A duration label overlays the bottom edge.
// ───────────────────────────────────────────────────────────────────────────

const CLIP_HEIGHT = 60;
const TRIM_HANDLE_WIDTH = 14;

export interface ClipThumbProps {
  clip: PosterClip;
  width: number;
  isSelected: boolean;
  onPress: () => void;
  onTrimStart?: (deltaMs: number) => void;
  onTrimEnd?: (deltaMs: number) => void;
}

export const ClipThumb = React.memo(function ClipThumb({
  clip,
  width,
  isSelected,
  onPress,
  onTrimStart,
  onTrimEnd,
}: ClipThumbProps) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const trackWidthSV = useSharedValue(width);

  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    trackWidthSV.value = e.nativeEvent.layout.width;
  }, [trackWidthSV]);

  // Trim handles convert a horizontal pixel delta into a millisecond delta
  // using the clip's own pixel-per-ms ratio. The parent owns the actual
  // trim mutation; we only emit the requested delta.
  const pxToMs = useCallback((px: number) => {
    if (width <= 0 || clip.durationMs <= 0) return 0;
    return (px / width) * clip.durationMs;
  }, [width, clip.durationMs]);

  const startTrimGesture = React.useMemo(() =>
    Gesture.Pan()
      .activateAfterLongPress(120)
      .onChange((e) => {
        'worklet';
        const delta = -pxToMs(e.changeX);
        if (onTrimStart) runOnJS(onTrimStart)(delta);
      })
      .onEnd(() => {
        'worklet';
        runOnJS(haptic.light)();
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pxToMs, onTrimStart, haptic]
  );

  const endTrimGesture = React.useMemo(() =>
    Gesture.Pan()
      .activateAfterLongPress(120)
      .onChange((e) => {
        'worklet';
        const delta = pxToMs(e.changeX);
        if (onTrimEnd) runOnJS(onTrimEnd)(delta);
      })
      .onEnd(() => {
        'worklet';
        runOnJS(haptic.light)();
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pxToMs, onTrimEnd, haptic]
  );

  const uri = clip.thumbnailUri || clip.sourceUri;

  return (
    <Pressable
      onPress={() => { haptic.selection(); onPress(); }}
      onLayout={handleLayout}
      accessibilityLabel={`Clip, ${formatTimecode(clip.durationMs)}`}
      accessibilityRole="button"
      style={[
        clipStyles.container,
        {
          width,
          height: CLIP_HEIGHT,
          borderColor: isSelected ? colors.brand : 'transparent',
          borderWidth: isSelected ? 2 : 0,
          backgroundColor: colors.surfaceAlt,
        },
      ]}
    >
      <ExpoImage
        source={{ uri }}
        style={clipStyles.thumb}
        contentFit="cover"
        transition={120}
        recyclingKey={clip.id}
      />
      {/* Subtle scrim so the duration label stays legible over any media. */}
      <View style={clipStyles.scrim} />
      <Text style={clipStyles.durationLabel} numberOfLines={1}>
        {formatTimecode(clip.durationMs)}
      </Text>

      {isSelected && onTrimStart && (
        <GestureDetector gesture={startTrimGesture}>
          <View
            style={[clipStyles.trimHandle, clipStyles.trimHandleStart, { backgroundColor: colors.brand }]}
            accessibilityLabel="Trim start"
            accessibilityRole="adjustable"
          />
        </GestureDetector>
      )}
      {isSelected && onTrimEnd && (
        <GestureDetector gesture={endTrimGesture}>
          <View
            style={[clipStyles.trimHandle, clipStyles.trimHandleEnd, { backgroundColor: colors.brand }]}
            accessibilityLabel="Trim end"
            accessibilityRole="adjustable"
          />
        </GestureDetector>
      )}
    </Pressable>
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
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  durationLabel: {
    position: 'absolute',
    left: Space.xs,
    bottom: 3,
    fontFamily: FontFamily.semibold,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    color: '#fff',
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
});
