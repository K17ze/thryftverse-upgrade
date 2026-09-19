/**
 * MoodboardCanvasItem — draggable canvas item
 *
 * Pan + pinch + rotation + tap + long-press gestures on a single moodboard
 * canvas item. Shared values are created HERE (per-item, at render time) to
 * respect the Rules of Hooks. The parent passes the initial position; the
 * item owns its gesture state and commits final positions via
 * onPositionCommit.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, View, StyleSheet, ImageStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS } from 'react-native-reanimated';

import { useAppTheme } from '../../theme/ThemeContext';
import { PressScale, Radius, Stroke } from '../../theme/designTokens';
import { CachedImage } from '../CachedImage';
import { Motion } from '../../theme/motionTokens';
import { useHaptic } from '../../hooks/useHaptic';
import type { MoodboardItem, MoodboardItemPosition } from '../../services/moodboardApi';

// ── Layout constants ──
export const ITEM_BASE_SIZE = 120; // base pixel size of a canvas item at scale 1
export const MIN_SCALE = 0.4;
export const MAX_SCALE = 2.5;

// Media box aspect limits — the visible footprint preserves the item's
// aspectRatio within this band so extreme crops never break the gesture math.
const MIN_ASPECT = 0.5;
const MAX_ASPECT = 2;
// Minimum touch target for the selected-item playback control.
const PLAY_HIT_TARGET = 44;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Clamp a pixel position so the item center stays within the canvas. */
export function clampCenter(px: number, canvasSize: number, itemHalfPx: number): number {
  const min = itemHalfPx;
  const max = canvasSize - itemHalfPx;
  return Math.max(min, Math.min(max, px));
}

/** Convert a normalised (0–1) position to a center-origin pixel position. */
export function normToPx(norm: number, canvasSize: number): number {
  return norm * canvasSize;
}

/** Convert a center-origin pixel position to a normalised (0–1) value. */
export function pxToNorm(px: number, canvasSize: number): number {
  return canvasSize > 0 ? px / canvasSize : 0;
}

// ---------------------------------------------------------------------------
// Draggable canvas item — pan + pinch + rotation + tap + long-press
// ---------------------------------------------------------------------------
export interface CanvasItemProps {
  item: MoodboardItem;
  canvasWidth: number;
  canvasHeight: number;
  isSelected: boolean;
  multiSelectMode: boolean;
  reducedMotion: boolean;
  onSelect: (id: string) => void;
  onPositionCommit: (id: string, position: MoodboardItemPosition) => void;
  onLongPress: (id: string) => void;
}

export const CanvasItem = React.memo(function CanvasItem({
  item,
  canvasWidth,
  canvasHeight,
  isSelected,
  multiSelectMode,
  reducedMotion,
  onSelect,
  onPositionCommit,
  onLongPress }: CanvasItemProps) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();

  // Aspect-aware footprint — √ keeps the media box's area ≈ ITEM_BASE_SIZE²
  // so a tall 9:16 look or a wide clip doesn't dominate the canvas.
  const clampedAspect = Math.min(MAX_ASPECT, Math.max(MIN_ASPECT, item.aspectRatio > 0 ? item.aspectRatio : 1));
  const aspectRoot = Math.sqrt(clampedAspect);
  const mediaWidth = ITEM_BASE_SIZE * aspectRoot;
  const mediaHeight = ITEM_BASE_SIZE / aspectRoot;
  const mediaBoxStyle = useMemo(() => ({ width: mediaWidth, height: mediaHeight }), [mediaWidth, mediaHeight]);

  const isVideo = item.mediaType === 'video' && item.videoUri.length > 0;
  // Playback control only exists on the selected item in single-select mode —
  // the first tap selects, then the corner control toggles play/pause.
  const playControlVisible = isVideo && isSelected && !multiSelectMode;

  const [isPlaying, setIsPlaying] = useState(false);

  // Muted, looped, paused — the poster frame (imageUri) is the resting state.
  const player = useVideoPlayer(isVideo ? item.videoUri : null, (instance) => {
    try {
      instance.muted = true;
      instance.loop = true;
    } catch {
      /* no-op */
    }
  });

  // Mirror expo-video's playing state so the control glyph stays truthful.
  React.useEffect(() => {
    if (!player) return;
    const sub = player.addListener?.('playingChange', ({ isPlaying: playing }: { isPlaying: boolean }) => {
      setIsPlaying(playing);
    });
    return () => sub?.remove?.();
  }, [player]);

  // Pause when the control goes away (deselected or multi-select entered).
  React.useEffect(() => {
    if (!player || playControlVisible) return;
    try {
      player.pause();
    } catch {
      /* no-op */
    }
  }, [player, playControlVisible]);

  const handleTogglePlayback = useCallback(() => {
    if (!player) return;
    haptic.light();
    try {
      if (isPlaying) {
        player.pause();
      } else {
        player.play();
      }
    } catch {
      /* no-op */
    }
  }, [player, isPlaying, haptic]);

  // Shared values — initialised from the service position (normalised → px)
  const translateX = useSharedValue(normToPx(item.position.x, canvasWidth));
  const translateY = useSharedValue(normToPx(item.position.y, canvasHeight));
  const scale = useSharedValue(item.position.scale);
  const rotation = useSharedValue(item.position.rotation);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const startScale = useSharedValue(1);
  const startRotation = useSharedValue(0);

  // Sync shared values when the service position changes externally (e.g. after
  // a reorder or theme change that re-fetches the moodboard). We compare against
  // the incoming item position and update if it differs from the current SV.
  React.useEffect(() => {
    const expectedX = normToPx(item.position.x, canvasWidth);
    const expectedY = normToPx(item.position.y, canvasHeight);
    if (Math.abs(translateX.value - expectedX) > 1) {
      translateX.value = reducedMotion ? expectedX : withSpring(expectedX, Motion.spring.sharedElement);
    }
    if (Math.abs(translateY.value - expectedY) > 1) {
      translateY.value = reducedMotion ? expectedY : withSpring(expectedY, Motion.spring.sharedElement);
    }
    if (Math.abs(scale.value - item.position.scale) > 0.01) {
      scale.value = reducedMotion ? item.position.scale : withSpring(item.position.scale, Motion.spring.sharedElement);
    }
    if (Math.abs(rotation.value - item.position.rotation) > 0.5) {
      rotation.value = reducedMotion ? item.position.rotation : withSpring(item.position.rotation, Motion.spring.sharedElement);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.position.x, item.position.y, item.position.scale, item.position.rotation, canvasWidth, canvasHeight, reducedMotion]);

  // Commit the current transform to the service (on gesture end).
  const commitPosition = useCallback(
    (finalX: number, finalY: number, finalScale: number, finalRotation: number) => {
      // Clamp per-axis against the real media-box half extents so a
      // non-square item's center stays inside the canvas bounds.
      const halfW = (mediaWidth / 2) * finalScale;
      const halfH = (mediaHeight / 2) * finalScale;
      const clampedX = clampCenter(finalX, canvasWidth, halfW);
      const clampedY = clampCenter(finalY, canvasHeight, halfH);
      translateX.value = reducedMotion ? clampedX : withSpring(clampedX, Motion.spring.sharedElement);
      translateY.value = reducedMotion ? clampedY : withSpring(clampedY, Motion.spring.sharedElement);
      const position: MoodboardItemPosition = {
        x: pxToNorm(clampedX, canvasWidth),
        y: pxToNorm(clampedY, canvasHeight),
        scale: finalScale,
        rotation: finalRotation };
      onPositionCommit(item.id, position);
    },
    [canvasWidth, canvasHeight, mediaWidth, mediaHeight, item.id, onPositionCommit, reducedMotion, translateX, translateY],
  );

  // Pan — move the item, clamped on end.
  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(4)
        .onStart(() => {
          'worklet';
          startX.value = translateX.value;
          startY.value = translateY.value;
        })
        .onUpdate((e) => {
          'worklet';
          translateX.value = startX.value + e.translationX;
          translateY.value = startY.value + e.translationY;
        })
        .onEnd((e) => {
          'worklet';
          const finalX = startX.value + e.translationX;
          const finalY = startY.value + e.translationY;
          runOnJS(commitPosition)(finalX, finalY, scale.value, rotation.value);
        }),
    [commitPosition, scale, rotation, startX, startY, translateX, translateY],
  );

  // Pinch — scale the item, clamped to [MIN_SCALE, MAX_SCALE].
  const pinchGesture = useMemo(
    () =>
      Gesture.Pinch()
        .onStart(() => {
          'worklet';
          startScale.value = scale.value;
        })
        .onUpdate((e) => {
          'worklet';
          const next = startScale.value * e.scale;
          scale.value = Math.max(MIN_SCALE, Math.min(MAX_SCALE, next));
        })
        .onEnd(() => {
          'worklet';
          runOnJS(commitPosition)(translateX.value, translateY.value, scale.value, rotation.value);
        }),
    [commitPosition, scale, rotation, startScale, translateX, translateY],
  );

  // Rotation — two-finger rotation in degrees.
  const rotationGesture = useMemo(
    () =>
      Gesture.Rotation()
        .onStart(() => {
          'worklet';
          startRotation.value = rotation.value;
        })
        .onUpdate((e) => {
          'worklet';
          rotation.value = startRotation.value + (e.rotation * 180) / Math.PI;
        })
        .onEnd(() => {
          'worklet';
          runOnJS(commitPosition)(translateX.value, translateY.value, scale.value, rotation.value);
        }),
    [commitPosition, rotation, scale, startRotation, translateX, translateY],
  );

  // Tap — select the item. The playback control owns the bottom-right corner
  // of a selected video item, so taps landing there are left to the control
  // (a second tap must not toggle selection off).
  const tapGesture = useMemo(
    () =>
      Gesture.Tap().onEnd((e) => {
        'worklet';
        if (playControlVisible && e.x > mediaWidth - PLAY_HIT_TARGET && e.y > mediaHeight - PLAY_HIT_TARGET) {
          return;
        }
        runOnJS(onSelect)(item.id);
      }),
    [item.id, mediaHeight, mediaWidth, onSelect, playControlVisible],
  );

  // Long-press — reveal layer order controls.
  const longPressGesture = useMemo(
    () =>
      Gesture.LongPress()
        .minDuration(450)
        .onEnd(() => {
          'worklet';
          runOnJS(onLongPress)(item.id);
        }),
    [item.id, onLongPress],
  );

  // Compose: simultaneous pan+pinch+rotate, racing with tap and long-press.
  // In multi-select mode items are static — only tap (toggle selection) is active.
  const composedGesture = useMemo(
    () =>
      multiSelectMode
        ? tapGesture
        : Gesture.Race(
            Gesture.Simultaneous(panGesture, pinchGesture, rotationGesture),
            tapGesture,
            longPressGesture,
          ),
    [multiSelectMode, longPressGesture, panGesture, pinchGesture, rotationGesture, tapGesture],
  );

  const animatedStyle = useAnimatedStyle(() => {
    'worklet';
    return {
      transform: [
        { translateX: translateX.value - mediaWidth / 2 },
        { translateY: translateY.value - mediaHeight / 2 },
        { scale: scale.value },
        { rotate: `${rotation.value}deg` },
      ] };
  });

  const a11yLabel = multiSelectMode
    ? `Canvas ${isVideo ? 'video item' : 'item'}: ${item.title}, ${item.price.toFixed(0)} pounds. ${isSelected ? 'Selected.' : 'Tap to select.'} Multi-select mode.`
    : `Canvas ${isVideo ? 'video item' : 'item'}: ${item.title}, ${item.price.toFixed(0)} pounds. ${isSelected ? 'Selected.' : 'Tap to select.'} Drag to move, pinch to resize, rotate with two fingers. Long-press for layer order.`;

  // Glyph legibility on arbitrary media — semantic media-overlay tokens, no chrome.
  const glyphShadow = {
    textShadowColor: colors.mediaOverlayShadow,
    textShadowRadius: 6,
    textShadowOffset: { width: 0, height: 1 } };

  return (
    <GestureDetector gesture={composedGesture}>
      <Reanimated.View
        style={[styles.canvasItem, animatedStyle]}
        accessibilityLabel={a11yLabel}
        accessibilityRole="button"
        accessibilityHint={multiSelectMode ? 'Tap to toggle selection.' : 'Drag to move, pinch to resize, rotate with two fingers. Long-press for layer order.'}
        accessible
      >
        <View
          style={[
            styles.canvasItemInner,
            mediaBoxStyle,
            { backgroundColor: colors.surfaceAlt },
            isSelected && [
              styles.canvasItemInnerSelected,
              { borderColor: colors.textPrimary },
            ],
          ]}
        >
          {isVideo ? (
            <>
              {/* Poster under the player surface — the resting frame users see
                  while the paused player holds no rendered frame yet. */}
              <CachedImage
                uri={item.imageUri}
                style={mediaBoxStyle as ImageStyle}
                contentFit="cover"
                accessible={false}
              />
              {player ? (
                <VideoView
                  player={player}
                  style={styles.mediaSurface}
                  contentFit="cover"
                  nativeControls={false}
                  pointerEvents="none"
                />
              ) : null}
              {playControlVisible ? (
                <Pressable
                  style={({ pressed }) => [
                    styles.playToggle,
                    pressed && { transform: [{ scale: PressScale.icon }] },
                  ]}
                  onPress={handleTogglePlayback}
                  accessibilityRole="button"
                  accessibilityLabel={isPlaying ? 'Pause video' : 'Play video'}
                  accessibilityHint={isPlaying ? 'Pauses playback and returns to the poster frame' : 'Plays the video muted on a loop'}
                >
                  <Ionicons
                    name={isPlaying ? 'pause' : 'play'}
                    size={20}
                    color={colors.mediaOverlayText}
                    style={glyphShadow}
                  />
                </Pressable>
              ) : (
                // Persistent quiet play glyph so unselected tiles read as video.
                <View
                  pointerEvents="none"
                  style={styles.videoIndicator}
                  accessible={false}
                >
                  <Ionicons
                    name="play"
                    size={17}
                    color={colors.mediaOverlayText}
                    style={glyphShadow}
                  />
                </View>
              )}
            </>
          ) : (
            <CachedImage
              uri={item.imageUri}
              style={mediaBoxStyle as ImageStyle}
              contentFit="cover"
              accessible={false}
            />
          )}
        </View>
      </Reanimated.View>
    </GestureDetector>
  );
});

// ---------------------------------------------------------------------------
// Static styles (no theme dependency — themed colors are applied inline)
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  canvasItem: {
    position: 'absolute',
    top: 0,
    left: 0 },
  canvasItemInner: {
    borderRadius: Radius.md,
    overflow: 'hidden' },
  canvasItemInnerSelected: {
    borderWidth: Stroke.emphasis },
  // Player surface fills the media box, layered over the poster frame.
  mediaSurface: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0 },
  // Transparent 44pt target anchoring the glyph to the corner — no badge.
  playToggle: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: PLAY_HIT_TARGET,
    height: PLAY_HIT_TARGET,
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
    paddingRight: 8,
    paddingBottom: 8 },
  videoIndicator: {
    position: 'absolute',
    right: 9,
    bottom: 9,
    opacity: 0.7 } });
