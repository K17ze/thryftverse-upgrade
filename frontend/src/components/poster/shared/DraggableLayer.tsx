/**
 * DraggableLayer — shared gesture component for text + sticker layers.
 *
 * Text (TextOverlayCanvas DraggableText) and stickers (PosterStickerLayer
 * DraggableSticker) share ~80% of their gesture logic: pan, pinch, rotation,
 * tap-to-select, double-tap-to-reset, long-press, spawn animation, selection
 * ring, and peel-off-on-grab. This component unifies that logic so both
 * surfaces stay in sync.
 *
 * Features:
 *  - Gesture.Simultaneous(pan, pinch, rotation) + Exclusive(double-tap, tap)
 *  - All gesture updates use shared values (NO setState during drag)
 *  - Spring settle on gesture end (useMotionConfig)
 *  - Haptic feedback: light on drag/pinch/rotation start, medium on spawn
 *  - Spawn animation: spring scale 0.8→1.0 with rotation wobble ±5°
 *  - Selection state: spring scale up + accent ring
 *  - Peel-off effect on grab: scale 1.1 + shadow
 *  - Double-tap-to-reset: spring back to origin (center, scale 1, rotation 0)
 *  - Reduced-motion fallbacks throughout
 *
 * The caller provides `children` for the layer's visual content. Position is
 * in pixels (x, y) relative to the canvas; the component offsets by the
 * layer's own centre so (x, y) represents the centre of the layer.
 */
import React, { useCallback, useEffect, useMemo } from 'react';
import { View, StyleSheet, AccessibilityInfo } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
  runOnJS,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Space, Radius, Stroke } from '../../../theme/designTokens';
import { useAppTheme } from '../../../theme/ThemeContext';
import { useReducedMotion } from '../../../hooks/useReducedMotion';
import { useMotionConfig } from '../../../hooks/useMotionConfig';
import { useHaptic } from '../../../hooks/useHaptic';

// ── Constants ────────────────────────────────────────────────────────

const SCALE_MIN = 0.4;
const SCALE_MAX = 3.0;

// ── Types ────────────────────────────────────────────────────────────

export interface DraggableLayerProps {
  /** Unique layer id. */
  id: string;
  /** Current x position in pixels (relative to canvas). Represents the layer centre. */
  x: number;
  /** Current y position in pixels (relative to canvas). Represents the layer centre. */
  y: number;
  /** Current scale factor. */
  scale: number;
  /** Current rotation in degrees. */
  rotation: number;
  /** Whether the canvas is in an active/editable mode. When false, gestures are disabled. */
  isActive: boolean;
  /** Whether this layer is currently selected. */
  isSelected: boolean;
  /** Canvas width in pixels (for clamping + double-tap reset). */
  canvasWidth: number;
  /** Canvas height in pixels (for clamping + double-tap reset). */
  canvasHeight: number;
  /** Accent colour for the selection ring + handles. */
  accentColor: string;
  /** Called when the layer position changes (committed on gesture end). x, y in pixels. */
  onPositionChange: (id: string, x: number, y: number) => void;
  /** Called when the layer scale changes (committed on gesture end). */
  onScaleChange: (id: string, scale: number) => void;
  /** Called when the layer rotation changes (committed on gesture end, snapped to 15°). */
  onRotationChange: (id: string, rotation: number) => void;
  /** Called when the layer is tapped (select). */
  onSelect: (id: string) => void;
  /** Called when the canvas background is tapped (deselect all). */
  onDeselect: () => void;
  /** Called on double-tap (optional — e.g. edit text or reset). */
  onDoubleTap?: (id: string) => void;
  /** Whether to play the spawn animation on mount. Defaults to false. */
  shouldSpawn?: boolean;
  /** The layer's visual content. */
  children: React.ReactNode;
}

// ── Component ────────────────────────────────────────────────────────

export function DraggableLayer({
  id,
  x,
  y,
  scale: scaleProp,
  rotation: rotationProp,
  isActive,
  isSelected,
  canvasWidth,
  canvasHeight,
  accentColor,
  onPositionChange,
  onScaleChange,
  onRotationChange,
  onSelect,
  onDeselect,
  onDoubleTap,
  shouldSpawn = false,
  children,
}: DraggableLayerProps) {
  const { colors } = useAppTheme();
  const reducedMotion = useReducedMotion();
  const { spring } = useMotionConfig();
  const haptic = useHaptic();

  // ── Shared values (NO setState during gestures) ────────────────────
  const translateX = useSharedValue(x);
  const translateY = useSharedValue(y);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);

  const scale = useSharedValue(scaleProp);
  const startScale = useSharedValue(scaleProp);

  const rotation = useSharedValue(rotationProp);
  const startRotation = useSharedValue(rotationProp);

  // Spawn animation — scale 0.8→1.0 with bouncy spring, rotation wobble ±5°
  const spawnScale = useSharedValue(reducedMotion ? 1 : 0.8);
  const spawnRotation = useSharedValue(0);
  const spawnShadow = useSharedValue(reducedMotion ? 1 : 0);

  // Peel-off effect on grab — scale up to 1.1, shadow grows
  const grabScale = useSharedValue(1);
  const grabShadowOpacity = useSharedValue(0);
  const grabShadowRadius = useSharedValue(5);

  // Selection visuals — spring appearance (scale 0.8→1.0)
  const selectionOpacity = useSharedValue(0);
  const handleScale = useSharedValue(0);

  // ── Sync external prop changes (e.g. undo/redo) ────────────────────
  useEffect(() => {
    translateX.value = x;
    translateY.value = y;
  }, [x, y, translateX, translateY]);

  useEffect(() => {
    scale.value = scaleProp;
  }, [scaleProp, scale]);

  useEffect(() => {
    rotation.value = rotationProp;
  }, [rotationProp, rotation]);

  // ── Haptic helpers ─────────────────────────────────────────────────
  const hapticLight = useCallback(() => haptic.light(), [haptic]);
  const hapticSelection = useCallback(() => haptic.selection(), [haptic]);
  const hapticMedium = useCallback(() => haptic.medium(), [haptic]);

  // ── Spawn animation ────────────────────────────────────────────────
  useEffect(() => {
    if (shouldSpawn) {
      if (reducedMotion) {
        spawnScale.value = 1;
        spawnRotation.value = 0;
        spawnShadow.value = 1;
      } else {
        spawnScale.value = 0.8;
        spawnRotation.value = 0;
        spawnShadow.value = 0;
        // Bouncy scale entrance
        spawnScale.value = withSpring(1, spring.lift);
        // Rotation wobble: +5° → -5° → 0°
        spawnRotation.value = withSequence(
          withSpring(5, spring.lift),
          withSpring(-5, spring.lift),
          withSpring(0, spring.entrance),
        );
        // Shadow grows during spawn then settles
        spawnShadow.value = withSequence(
          withSpring(1.3, spring.success),
          withSpring(1, spring.entrance),
        );
      }
      runOnJS(hapticMedium)();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldSpawn, reducedMotion]);

  // ── Selection spring appearance ────────────────────────────────────
  useEffect(() => {
    if (reducedMotion) {
      selectionOpacity.value = isSelected ? 1 : 0;
      handleScale.value = isSelected ? 1 : 0;
    } else if (isSelected) {
      selectionOpacity.value = withSpring(1, spring.entrance);
      // Spring appearance scale 0.8→1.0
      handleScale.value = 0.8;
      handleScale.value = withSpring(1, spring.success);
    } else {
      selectionOpacity.value = withSpring(0, spring.entrance);
      handleScale.value = withSpring(0, spring.entrance);
    }
    if (isSelected) {
      runOnJS(hapticLight)();
      runOnJS(AccessibilityInfo.announceForAccessibility)('Layer selected');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSelected, reducedMotion]);

  // ── Commit handlers (called via runOnJS on gesture end) ────────────
  const handlePositionCommit = useCallback(
    (finalX: number, finalY: number) => {
      // Clamp so the layer stays within the canvas bounds
      const maxX = Math.max(0, canvasWidth);
      const maxY = Math.max(0, canvasHeight);
      const clampedX = Math.min(Math.max(finalX, 0), maxX);
      const clampedY = Math.min(Math.max(finalY, 0), maxY);
      if (reducedMotion) {
        translateX.value = clampedX;
        translateY.value = clampedY;
      } else {
        translateX.value = withSpring(clampedX, spring.entrance);
        translateY.value = withSpring(clampedY, spring.entrance);
      }
      onPositionChange(id, clampedX, clampedY);
    },
    [canvasWidth, canvasHeight, reducedMotion, translateX, translateY, spring, onPositionChange, id],
  );

  const handleScaleCommit = useCallback(
    (finalScale: number) => {
      const clamped = Math.max(SCALE_MIN, Math.min(SCALE_MAX, finalScale));
      onScaleChange(id, clamped);
    },
    [onScaleChange, id],
  );

  const handleRotationCommit = useCallback(
    (finalRotation: number) => {
      // Snap to nearest 15° for precision
      const snapped = Math.round(finalRotation / 15) * 15;
      if (reducedMotion) {
        rotation.value = snapped;
      } else {
        rotation.value = withSpring(snapped, spring.entrance);
      }
      onRotationChange(id, snapped);
      runOnJS(hapticSelection)();
    },
    [reducedMotion, rotation, spring, onRotationChange, id, hapticSelection],
  );

  // ── Pan gesture with peel-off effect on grab ───────────────────────
  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(isActive)
        .minDistance(3)
        .onStart(() => {
          startX.value = translateX.value;
          startY.value = translateY.value;
          if (!reducedMotion) {
            grabScale.value = withSpring(1.1, spring.press);
            grabShadowOpacity.value = withSpring(0.3, spring.press);
            grabShadowRadius.value = withSpring(15, spring.press);
          }
          runOnJS(hapticLight)();
        })
        .onUpdate((e) => {
          translateX.value = startX.value + e.translationX;
          translateY.value = startY.value + e.translationY;
        })
        .onEnd((e) => {
          const finalX = startX.value + e.translationX;
          const finalY = startY.value + e.translationY;
          if (!reducedMotion) {
            grabScale.value = withSpring(1, spring.press);
            grabShadowOpacity.value = withSpring(0, spring.press);
            grabShadowRadius.value = withSpring(5, spring.press);
          }
          runOnJS(handlePositionCommit)(finalX, finalY);
        }),
    [
      isActive,
      reducedMotion,
      spring,
      translateX,
      translateY,
      startX,
      startY,
      grabScale,
      grabShadowOpacity,
      grabShadowRadius,
      hapticLight,
      handlePositionCommit,
    ],
  );

  // ── Tap gesture (select) ───────────────────────────────────────────
  const tapGesture = useMemo(
    () =>
      Gesture.Tap()
        .enabled(isActive)
        .onEnd(() => {
          runOnJS(hapticLight)();
          runOnJS(onSelect)(id);
        }),
    [isActive, hapticLight, onSelect, id],
  );

  // ── Double-tap to reset ────────────────────────────────────────────
  // Resets position to center, scale to 1.0, rotation to 0 with spring.
  // If onDoubleTap is provided, calls it instead of resetting.
  const doubleTapGesture = useMemo(
    () =>
      Gesture.Tap()
        .enabled(isActive)
        .numberOfTaps(2)
        .onEnd(() => {
          if (onDoubleTap) {
            runOnJS(hapticMedium)();
            runOnJS(onDoubleTap)(id);
            return;
          }
          const centerX = canvasWidth / 2;
          const centerY = canvasHeight / 2;
          if (reducedMotion) {
            translateX.value = centerX;
            translateY.value = centerY;
            scale.value = 1;
            rotation.value = 0;
          } else {
            translateX.value = withSpring(centerX, spring.entrance);
            translateY.value = withSpring(centerY, spring.entrance);
            scale.value = withSpring(1, spring.success);
            rotation.value = withSpring(0, spring.entrance);
          }
          runOnJS(onPositionChange)(id, centerX, centerY);
          runOnJS(onScaleChange)(id, 1);
          runOnJS(onRotationChange)(id, 0);
          runOnJS(hapticMedium)();
          runOnJS(AccessibilityInfo.announceForAccessibility)('Layer reset to center');
        }),
    [
      isActive,
      reducedMotion,
      canvasWidth,
      canvasHeight,
      translateX,
      translateY,
      scale,
      rotation,
      spring,
      onPositionChange,
      onScaleChange,
      onRotationChange,
      onDoubleTap,
      hapticMedium,
      id,
    ],
  );

  // ── Pinch-to-resize gesture ────────────────────────────────────────
  const pinchGesture = useMemo(
    () =>
      Gesture.Pinch()
        .enabled(isActive)
        .onStart(() => {
          startScale.value = scale.value;
          runOnJS(hapticLight)();
        })
        .onUpdate((e) => {
          const newScale = startScale.value * e.scale;
          scale.value = Math.max(SCALE_MIN, Math.min(SCALE_MAX, newScale));
        })
        .onEnd(() => {
          runOnJS(handleScaleCommit)(scale.value);
        }),
    [isActive, scale, startScale, handleScaleCommit, hapticLight],
  );

  // ── Two-finger rotation gesture ────────────────────────────────────
  // Rotates freely; snaps to nearest 15° on end for precision.
  const rotationGesture = useMemo(
    () =>
      Gesture.Rotation()
        .enabled(isActive)
        .onStart(() => {
          startRotation.value = rotation.value;
          runOnJS(hapticLight)();
        })
        .onUpdate((e) => {
          rotation.value = startRotation.value + (e.rotation * 180) / Math.PI;
        })
        .onEnd(() => {
          runOnJS(handleRotationCommit)(rotation.value);
        }),
    [isActive, rotation, startRotation, handleRotationCommit, hapticLight],
  );

  // ── Compose: simultaneous pan + pinch + rotation, exclusive tap/double-tap
  const composedGesture = useMemo(
    () =>
      Gesture.Simultaneous(
        Gesture.Exclusive(doubleTapGesture, tapGesture),
        panGesture,
        pinchGesture,
        rotationGesture,
      ),
    [panGesture, pinchGesture, rotationGesture, tapGesture, doubleTapGesture],
  );

  // ── Animated styles ────────────────────────────────────────────────
  const containerAnimatedStyle = useAnimatedStyle(() => {
    const combinedScale = scale.value * spawnScale.value * grabScale.value;
    const combinedRotation = rotation.value + spawnRotation.value;
    return {
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value },
        { rotate: `${combinedRotation}deg` },
        { scale: combinedScale },
      ],
      shadowColor: '#000',
      shadowOpacity: 0.25 * spawnShadow.value + grabShadowOpacity.value,
      shadowRadius: 6 * spawnShadow.value + grabShadowRadius.value,
      shadowOffset: { width: 0, height: 4 },
      elevation: 8 * spawnShadow.value + (grabShadowOpacity.value > 0 ? 8 : 0),
    };
  });

  const selectionBorderStyle = useAnimatedStyle(() => ({
    opacity: selectionOpacity.value,
  }));

  const handleAnimatedStyle = useAnimatedStyle(() => ({
    opacity: selectionOpacity.value,
    transform: [{ scale: handleScale.value }],
  }));

  // ── Render ─────────────────────────────────────────────────────────
  if (!isActive) {
    // View-only mode: no gestures, static transform
    return (
      <Reanimated.View
        style={[
          styles.base,
          {
            transform: [
              { translateX: x },
              { translateY: y },
              { rotate: `${rotationProp}deg` },
              { scale: scaleProp },
            ],
          },
        ]}
        pointerEvents="none"
      >
        {children}
      </Reanimated.View>
    );
  }

  return (
    <GestureDetector gesture={composedGesture}>
      <Reanimated.View
        style={[styles.base, containerAnimatedStyle]}
        pointerEvents="auto"
        accessibilityLabel="Layer"
        accessibilityHint="Drag to move, pinch to resize, rotate to rotate, double-tap to reset, tap to select"
        accessibilityRole="adjustable"
      >
        {children}

        {/* Selection ring — accent dashed border */}
        {isSelected && (
          <Reanimated.View
            style={[
              StyleSheet.absoluteFill,
              {
                borderColor: accentColor,
                borderWidth: Stroke.standard,
                borderRadius: Radius.sm,
                borderStyle: 'dashed',
              },
              selectionBorderStyle,
            ]}
            pointerEvents="none"
          />

        )}

        {/* Corner handles — accent dots at 4 corners */}
        {isSelected && (
          <>
            <Reanimated.View
              style={[styles.handle, styles.handleTopLeft, handleAnimatedStyle]}
              pointerEvents="none"
            >
              <View style={[styles.cornerDot, { backgroundColor: accentColor }]} />
            </Reanimated.View>
            <Reanimated.View
              style={[styles.handle, styles.handleTopRight, handleAnimatedStyle]}
              pointerEvents="none"
            >
              <View style={[styles.cornerDot, { backgroundColor: accentColor }]} />
            </Reanimated.View>
            <Reanimated.View
              style={[styles.handle, styles.handleBottomLeft, handleAnimatedStyle]}
              pointerEvents="none"
            >
              <View style={[styles.cornerDot, { backgroundColor: accentColor }]} />
            </Reanimated.View>
            <Reanimated.View
              style={[styles.handle, styles.handleBottomRight, handleAnimatedStyle]}
              pointerEvents="none"
            >
              <View style={[styles.cornerDot, { backgroundColor: accentColor }]} />
            </Reanimated.View>

            {/* Rotation handle above top-center */}
            <Reanimated.View
              style={[styles.rotationHandleWrap, handleAnimatedStyle]}
              pointerEvents="none"
            >
              <View style={[styles.rotationConnectLine, { backgroundColor: accentColor }]} />
              <View style={[styles.rotationHandleDot, { backgroundColor: accentColor }]}>
                <Ionicons name="refresh" size={12} color={colors.textInverse} />
              </View>
            </Reanimated.View>
          </>
        )}
      </Reanimated.View>
    </GestureDetector>
  );
}

// ── Styles ───────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  base: {
    position: 'absolute',
    // (x, y) represents the centre of the layer; offset by half so the
    // transform origin is the centre. Callers should size their content.
    alignSelf: 'flex-start',
  },
  handle: {
    position: 'absolute',
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  handleTopLeft: {
    top: -10,
    left: -10,
  },
  handleTopRight: {
    top: -10,
    right: -10,
  },
  handleBottomLeft: {
    bottom: -10,
    left: -10,
  },
  handleBottomRight: {
    bottom: -10,
    right: -10,
  },
  cornerDot: {
    width: 10,
    height: 10,
    borderRadius: Radius.full,
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  rotationHandleWrap: {
    position: 'absolute',
    top: -36,
    alignSelf: 'center',
    alignItems: 'center',
  },
  rotationConnectLine: {
    width: Stroke.standard,
    height: 16,
  },
  rotationHandleDot: {
    width: 24,
    height: 24,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#fff',
  },
});
