/**
 * Shared ColorSlider components — flagship slider primitives.
 *
 * Replaces copy-pasted slider implementations across DrawingCanvas.tsx,
 * BackgroundPicker.tsx, and CreatorAssetPicker.tsx.
 *
 * Flagship pattern:
 * - Gesture.Pan() from react-native-gesture-handler
 * - Worklet-based updates (shared values, NO setState during drag)
 * - runOnJS to bridge onValueChange / onComplete callbacks
 * - Debounced selection haptic every 60ms during drag
 * - Spring settle on release (Motion.spring.tap via useMotionConfig)
 * - Reduced-motion-aware configs via useMotionConfig
 * - 44pt minimum touch targets
 * - Theme tokens for all colors
 */

import React from 'react';
import {
  View,
  StyleSheet,
  Text,
  LayoutChangeEvent,
  ViewStyle,
  AccessibilityRole } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS } from 'react-native-reanimated';
import { Radius, Space, Stroke, Elevation } from '../../../theme/designTokens';
import { TypographyV2 } from '../../../theme/typography.v2';
import { Motion } from '../../../theme/motionTokens';
import { useAppTheme, type ThemeColors } from '../../../theme/ThemeContext';
import { useHaptic } from '../../../hooks/useHaptic';
import { useReducedMotion } from '../../../hooks/useReducedMotion';
import { useMotionConfig } from '../../../hooks/useMotionConfig';
import { hslToHex, hexToHsl } from './colorUtils';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const HUE_SEGMENTS = 12;
const SLIDER_TRACK_HEIGHT = 36;
const SLIDER_THUMB_SIZE = 28;
const MIN_TOUCH_TARGET = 44;
const HAPTIC_DEBOUNCE_MS = 60;

// ─────────────────────────────────────────────────────────────────────────────
// Shared styles
// ─────────────────────────────────────────────────────────────────────────────

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    sliderWrap: {
      flexDirection: 'column',
      gap: Space.xs },
    sliderLabel: {
      fontSize: TypographyV2.meta.size,
      color: colors.textSecondary,
      fontWeight: '500' },
    sliderTrack: {
      height: SLIDER_TRACK_HEIGHT,
      borderRadius: Radius.sm,
      overflow: 'hidden',
      position: 'relative',
      // 44pt touch target — track height is 36, vertical padding extends hit area
      minHeight: MIN_TOUCH_TARGET,
      justifyContent: 'center' },
    sliderThumb: {
      position: 'absolute',
      width: SLIDER_THUMB_SIZE,
      height: SLIDER_THUMB_SIZE,
      borderRadius: SLIDER_THUMB_SIZE / 2,
      backgroundColor: '#FFFFFF',
      borderWidth: Stroke.standard,
      borderColor: 'rgba(0,0,0,0.15)',
      marginLeft: -SLIDER_THUMB_SIZE / 2,
      top: (SLIDER_TRACK_HEIGHT - SLIDER_THUMB_SIZE) / 2,
      // Subtle elevation — thumb lifts above the track
      ...Elevation.modal },
    hueSegmentRow: {
      flexDirection: 'row',
      position: 'absolute',
      top: 0,
      bottom: 0,
      left: 0,
      right: 0 },
    sizeSliderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm },
    sizeSliderTrack: {
      flex: 1,
      height: SLIDER_TRACK_HEIGHT,
      borderRadius: Radius.sm,
      overflow: 'hidden',
      position: 'relative',
      minHeight: MIN_TOUCH_TARGET,
      justifyContent: 'center' },
    sizeSliderGradient: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: 'rgba(128,128,128,0.2)' },
    sizeSliderValue: {
      fontSize: TypographyV2.meta.size,
      color: colors.textSecondary,
      minWidth: 40,
      textAlign: 'right',
      fontWeight: '500' },
    sizePreview: {
      width: MIN_TOUCH_TARGET,
      height: MIN_TOUCH_TARGET,
      alignItems: 'center',
      justifyContent: 'center' },
    sizePreviewDot: {
      backgroundColor: '#FFFFFF' },
    disabledOverlay: {
      opacity: 0.4 } });
}

// ─────────────────────────────────────────────────────────────────────────────
// HueTrack — rainbow gradient rendered as discrete segments
// ─────────────────────────────────────────────────────────────────────────────

function HueTrack() {
  const segments = [];
  for (let i = 0; i < HUE_SEGMENTS; i++) {
    const h = (i / HUE_SEGMENTS) * 360;
    segments.push(
      <View key={i} style={{ flex: 1, backgroundColor: hslToHex(h, 100, 50) }} />
    );
  }
  return (
    <View style={createStyles(useAppTheme().colors).hueSegmentRow}>
      {segments}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// HueSlider — horizontal hue slider (0-360°), rainbow gradient track
// ─────────────────────────────────────────────────────────────────────────────

export interface HueSliderProps {
  /** Hue value 0-360 */
  value: number;
  /** Called continuously during drag with the new hue (0-360) */
  onValueChange: (value: number) => void;
  /** Called once when a drag begins */
  onDragStart?: () => void;
  /** Called once when a drag ends, with the final hue value */
  onDragEnd?: (value: number) => void;
  /** When true, the slider is non-interactive and dimmed */
  disabled?: boolean;
  /** Optional accessibility label override */
  accessibilityLabel?: string;
}

export function HueSlider({
  value,
  onValueChange,
  onDragStart,
  onDragEnd,
  disabled = false,
  accessibilityLabel }: HueSliderProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const reducedMotion = useReducedMotion();
  const { spring } = useMotionConfig();
  const haptic = useHaptic();

  // Shared values — no setState during drag
  const widthSV = useSharedValue(0);
  const thumbPos = useSharedValue(0);
  const lastHapticSV = useSharedValue(0);
  const isDraggingSV = useSharedValue(false);

  // Track width state for external-value effect (setState only on layout, not drag)
  const [width, setWidth] = React.useState(0);

  const MAX_VALUE = 360;

  // Spring-based thumb position when value changes externally
  React.useEffect(() => {
    if (width > 0 && !isDraggingSV.value) {
      thumbPos.value = withSpring((value / MAX_VALUE) * width, spring.tap);
    }
  }, [value, width, spring.tap, thumbPos, isDraggingSV]);

  const handleLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    setWidth(w);
    widthSV.value = w;
  };

  // Worklet-based update — runs on UI thread for smooth 60fps
  const updateFromPosition = (x: number) => {
    'worklet';
    const w = widthSV.value;
    if (w <= 0) return;
    const ratio = Math.max(0, Math.min(1, x / w));
    const newVal = Math.round(ratio * MAX_VALUE);
    thumbPos.value = ratio * w;
    runOnJS(onValueChange)(newVal);
    // Debounced selection haptic during drag — 60ms cadence
    const now = Date.now();
    if (now - lastHapticSV.value > HAPTIC_DEBOUNCE_MS) {
      lastHapticSV.value = now;
      runOnJS(haptic.selection)();
    }
  };

  const panGesture = React.useMemo(
    () =>
      Gesture.Pan()
        .activateAfterLongPress(0)
        .enabled(!disabled)
        .onBegin((e) => {
          'worklet';
          isDraggingSV.value = true;
          if (onDragStart) runOnJS(onDragStart)();
          updateFromPosition(e.x);
        })
        .onChange((e) => {
          'worklet';
          updateFromPosition(e.x);
        })
        .onEnd(() => {
          'worklet';
          // Spring settle on release
          const w = widthSV.value;
          if (w > 0) {
            thumbPos.value = withSpring(thumbPos.value, {
              damping: reducedMotion ? 100 : Motion.spring.tap.damping,
              stiffness: reducedMotion ? 1000 : Motion.spring.tap.stiffness,
              mass: Motion.spring.tap.mass });
          }
          isDraggingSV.value = false;
          if (onDragEnd) {
            const w2 = widthSV.value;
            const ratio = w2 > 0 ? Math.max(0, Math.min(1, thumbPos.value / w2)) : 0;
            runOnJS(onDragEnd)(Math.round(ratio * MAX_VALUE));
          }
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [disabled, reducedMotion, onDragStart, onDragEnd]
  );

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: thumbPos.value }] }));

  return (
    <View style={[styles.sliderWrap, disabled && styles.disabledOverlay]}>
      <GestureDetector gesture={panGesture}>
        <View
          style={styles.sliderTrack}
          onLayout={handleLayout}
          accessibilityRole={'adjustable' as AccessibilityRole}
          accessibilityLabel={accessibilityLabel ?? 'Hue slider'}
          accessibilityValue={{ min: 0, max: 360, now: Math.round(value) }}
          accessible
        >
          <HueTrack />
          <Reanimated.View style={[styles.sliderThumb, thumbStyle]} />
        </View>
      </GestureDetector>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SaturationLightnessSlider — 1D saturation or lightness slider with gradient
// ─────────────────────────────────────────────────────────────────────────────

export interface SaturationLightnessSliderProps {
  /** Base hex color whose hue/saturation drives the gradient */
  baseColor: string;
  /** Current value 0-100 */
  value: number;
  /** Whether this slider controls saturation or lightness */
  mode: 'saturation' | 'lightness';
  /** Called continuously during drag with the new value (0-100) */
  onValueChange: (value: number) => void;
  /** Called once when a drag begins */
  onDragStart?: () => void;
  /** Called once when a drag ends, with the final value */
  onDragEnd?: (value: number) => void;
  /** When true, the slider is non-interactive and dimmed */
  disabled?: boolean;
  /** Optional accessibility label override */
  accessibilityLabel?: string;
}

export function SaturationLightnessSlider({
  baseColor,
  value,
  mode,
  onValueChange,
  onDragStart,
  onDragEnd,
  disabled = false,
  accessibilityLabel }: SaturationLightnessSliderProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const reducedMotion = useReducedMotion();
  const { spring } = useMotionConfig();
  const haptic = useHaptic();

  const widthSV = useSharedValue(0);
  const thumbPos = useSharedValue(0);
  const lastHapticSV = useSharedValue(0);
  const isDraggingSV = useSharedValue(false);

  const [width, setWidth] = React.useState(0);
  const MAX_VALUE = 100;

  React.useEffect(() => {
    if (width > 0 && !isDraggingSV.value) {
      thumbPos.value = withSpring((value / MAX_VALUE) * width, spring.tap);
    }
  }, [value, width, spring.tap, thumbPos, isDraggingSV]);

  const handleLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    setWidth(w);
    widthSV.value = w;
  };

  const updateFromPosition = (x: number) => {
    'worklet';
    const w = widthSV.value;
    if (w <= 0) return;
    const ratio = Math.max(0, Math.min(1, x / w));
    const newVal = Math.round(ratio * MAX_VALUE);
    thumbPos.value = ratio * w;
    runOnJS(onValueChange)(newVal);
    const now = Date.now();
    if (now - lastHapticSV.value > HAPTIC_DEBOUNCE_MS) {
      lastHapticSV.value = now;
      runOnJS(haptic.selection)();
    }
  };

  const panGesture = React.useMemo(
    () =>
      Gesture.Pan()
        .activateAfterLongPress(0)
        .enabled(!disabled)
        .onBegin((e) => {
          'worklet';
          isDraggingSV.value = true;
          if (onDragStart) runOnJS(onDragStart)();
          updateFromPosition(e.x);
        })
        .onChange((e) => {
          'worklet';
          updateFromPosition(e.x);
        })
        .onEnd(() => {
          'worklet';
          const w = widthSV.value;
          if (w > 0) {
            thumbPos.value = withSpring(thumbPos.value, {
              damping: reducedMotion ? 100 : Motion.spring.tap.damping,
              stiffness: reducedMotion ? 1000 : Motion.spring.tap.stiffness,
              mass: Motion.spring.tap.mass });
          }
          isDraggingSV.value = false;
          if (onDragEnd) {
            const w2 = widthSV.value;
            const ratio = w2 > 0 ? Math.max(0, Math.min(1, thumbPos.value / w2)) : 0;
            runOnJS(onDragEnd)(Math.round(ratio * MAX_VALUE));
          }
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [disabled, reducedMotion, onDragStart, onDragEnd]
  );

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: thumbPos.value }] }));

  // Build gradient segments from base color
  const SEGMENTS = 12;
  const segments: React.ReactNode[] = [];
  const baseHsl = hexToHsl(baseColor);
  for (let i = 0; i < SEGMENTS; i++) {
    const ratio = i / (SEGMENTS - 1);
    let color = baseColor;
    if (mode === 'saturation') {
      color = hslToHex(baseHsl.h, Math.round(ratio * 100), 50);
    } else {
      color = hslToHex(baseHsl.h, baseHsl.s, Math.round(ratio * 100));
    }
    segments.push(<View key={i} style={{ flex: 1, backgroundColor: color }} />);
  }

  const label = accessibilityLabel ?? (mode === 'saturation' ? 'Saturation slider' : 'Lightness slider');

  return (
    <GestureDetector gesture={panGesture}>
      <View
        style={[styles.sliderTrack, disabled && styles.disabledOverlay]}
        onLayout={handleLayout}
        accessibilityRole={'adjustable' as AccessibilityRole}
        accessibilityLabel={label}
        accessibilityValue={{ min: 0, max: 100, now: Math.round(value) }}
        accessible
      >
        <View style={styles.hueSegmentRow}>
          {segments}
        </View>
        <Reanimated.View style={[styles.sliderThumb, thumbStyle]} />
      </View>
    </GestureDetector>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SizeSlider — horizontal size slider with live preview dot
// ─────────────────────────────────────────────────────────────────────────────

export interface SizeSliderProps {
  /** Current size value */
  value: number;
  /** Minimum size (default 1) */
  min?: number;
  /** Maximum size (default 50) */
  max?: number;
  /** Called continuously during drag with the new size */
  onValueChange: (value: number) => void;
  /** Called once when a drag begins */
  onDragStart?: () => void;
  /** Called once when a drag ends, with the final size */
  onDragEnd?: (value: number) => void;
  /** Preview dot color (defaults to white) */
  previewColor?: string;
  /** Preview dot opacity (0-1) */
  previewOpacity?: number;
  /** Whether to show the live preview dot on the left */
  showPreview?: boolean;
  /** Whether to show the numeric value label on the right */
  showValueLabel?: boolean;
  /** Unit suffix for the value label (default 'px') */
  valueSuffix?: string;
  /** When true, the slider is non-interactive and dimmed */
  disabled?: boolean;
  /** Optional accessibility label override */
  accessibilityLabel?: string;
}

export function SizeSlider({
  value,
  min = 1,
  max = 50,
  onValueChange,
  onDragStart,
  onDragEnd,
  previewColor = '#FFFFFF',
  previewOpacity = 1,
  showPreview = true,
  showValueLabel = true,
  valueSuffix = 'px',
  disabled = false,
  accessibilityLabel }: SizeSliderProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const reducedMotion = useReducedMotion();
  const { spring } = useMotionConfig();
  const haptic = useHaptic();

  const widthSV = useSharedValue(0);
  const thumbPos = useSharedValue(0);
  const lastHapticSV = useSharedValue(0);
  const isDraggingSV = useSharedValue(false);

  const [width, setWidth] = React.useState(0);
  const RANGE = max - min;

  React.useEffect(() => {
    if (width > 0 && !isDraggingSV.value) {
      thumbPos.value = withSpring(((value - min) / RANGE) * width, spring.tap);
    }
  }, [value, min, RANGE, width, spring.tap, thumbPos, isDraggingSV]);

  const handleLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    setWidth(w);
    widthSV.value = w;
  };

  const updateFromPosition = (x: number) => {
    'worklet';
    const w = widthSV.value;
    if (w <= 0) return;
    const ratio = Math.max(0, Math.min(1, x / w));
    const newVal = Math.round(min + ratio * RANGE);
    thumbPos.value = ratio * w;
    runOnJS(onValueChange)(newVal);
    const now = Date.now();
    if (now - lastHapticSV.value > HAPTIC_DEBOUNCE_MS) {
      lastHapticSV.value = now;
      runOnJS(haptic.selection)();
    }
  };

  const panGesture = React.useMemo(
    () =>
      Gesture.Pan()
        .activateAfterLongPress(0)
        .enabled(!disabled)
        .onBegin((e) => {
          'worklet';
          isDraggingSV.value = true;
          if (onDragStart) runOnJS(onDragStart)();
          updateFromPosition(e.x);
        })
        .onChange((e) => {
          'worklet';
          updateFromPosition(e.x);
        })
        .onEnd(() => {
          'worklet';
          const w = widthSV.value;
          if (w > 0) {
            thumbPos.value = withSpring(thumbPos.value, {
              damping: reducedMotion ? 100 : Motion.spring.tap.damping,
              stiffness: reducedMotion ? 1000 : Motion.spring.tap.stiffness,
              mass: Motion.spring.tap.mass });
          }
          isDraggingSV.value = false;
          if (onDragEnd) {
            const w2 = widthSV.value;
            const ratio = w2 > 0 ? Math.max(0, Math.min(1, thumbPos.value / w2)) : 0;
            runOnJS(onDragEnd)(Math.round(min + ratio * RANGE));
          }
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [disabled, reducedMotion, min, RANGE, onDragStart, onDragEnd]
  );

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: thumbPos.value }] }));

  const previewSize = Math.max(4, Math.min(value, 40));

  return (
    <View style={[styles.sizeSliderRow, disabled && styles.disabledOverlay]}>
      {showPreview && (
        <View style={styles.sizePreview} pointerEvents="none">
          <View
            style={[
              styles.sizePreviewDot,
              {
                width: previewSize,
                height: previewSize,
                borderRadius: previewSize / 2,
                backgroundColor: previewColor,
                opacity: previewOpacity },
            ]}
          />
        </View>
      )}
      <GestureDetector gesture={panGesture}>
        <View
          style={styles.sizeSliderTrack}
          onLayout={handleLayout}
          accessibilityRole={'adjustable' as AccessibilityRole}
          accessibilityLabel={accessibilityLabel ?? 'Size slider'}
          accessibilityValue={{ min, max, now: Math.round(value) }}
          accessible
        >
          <View style={styles.sizeSliderGradient} />
          <Reanimated.View style={[styles.sliderThumb, thumbStyle]} />
        </View>
      </GestureDetector>
      {showValueLabel && (
        <Text style={styles.sizeSliderValue}>
          {value}{valueSuffix}
        </Text>
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// GenericSlider — generic horizontal slider for any 0-1 value
// ─────────────────────────────────────────────────────────────────────────────

export interface GenericSliderProps {
  /** Current value 0-1 */
  value: number;
  /** Called continuously during drag with the new value (0-1) */
  onValueChange: (value: number) => void;
  /** Called once when a drag begins */
  onDragStart?: () => void;
  /** Called once when a drag ends, with the final value */
  onDragEnd?: (value: number) => void;
  /** Track background color (defaults to theme surfaceAlt) */
  trackColor?: string;
  /** Filled portion color (defaults to theme brand) */
  fillColor?: string;
  /** Thumb color (defaults to white) */
  thumbColor?: string;
  /** Optional label displayed above the track */
  label?: string;
  /** When true, the slider is non-interactive and dimmed */
  disabled?: boolean;
  /** Optional accessibility label override */
  accessibilityLabel?: string;
}

export function GenericSlider({
  value,
  onValueChange,
  onDragStart,
  onDragEnd,
  trackColor,
  fillColor,
  thumbColor = '#FFFFFF',
  label,
  disabled = false,
  accessibilityLabel }: GenericSliderProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const reducedMotion = useReducedMotion();
  const { spring } = useMotionConfig();
  const haptic = useHaptic();

  const widthSV = useSharedValue(0);
  const thumbPos = useSharedValue(0);
  const lastHapticSV = useSharedValue(0);
  const isDraggingSV = useSharedValue(false);

  const [width, setWidth] = React.useState(0);
  const MAX_VALUE = 1;

  React.useEffect(() => {
    if (width > 0 && !isDraggingSV.value) {
      thumbPos.value = withSpring(value * width, spring.tap);
    }
  }, [value, width, spring.tap, thumbPos, isDraggingSV]);

  const handleLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    setWidth(w);
    widthSV.value = w;
  };

  const updateFromPosition = (x: number) => {
    'worklet';
    const w = widthSV.value;
    if (w <= 0) return;
    const ratio = Math.max(0, Math.min(1, x / w));
    thumbPos.value = ratio * w;
    runOnJS(onValueChange)(ratio);
    const now = Date.now();
    if (now - lastHapticSV.value > HAPTIC_DEBOUNCE_MS) {
      lastHapticSV.value = now;
      runOnJS(haptic.selection)();
    }
  };

  const panGesture = React.useMemo(
    () =>
      Gesture.Pan()
        .activateAfterLongPress(0)
        .enabled(!disabled)
        .onBegin((e) => {
          'worklet';
          isDraggingSV.value = true;
          if (onDragStart) runOnJS(onDragStart)();
          updateFromPosition(e.x);
        })
        .onChange((e) => {
          'worklet';
          updateFromPosition(e.x);
        })
        .onEnd(() => {
          'worklet';
          const w = widthSV.value;
          if (w > 0) {
            thumbPos.value = withSpring(thumbPos.value, {
              damping: reducedMotion ? 100 : Motion.spring.tap.damping,
              stiffness: reducedMotion ? 1000 : Motion.spring.tap.stiffness,
              mass: Motion.spring.tap.mass });
          }
          isDraggingSV.value = false;
          if (onDragEnd) {
            const w2 = widthSV.value;
            const ratio = w2 > 0 ? Math.max(0, Math.min(1, thumbPos.value / w2)) : 0;
            runOnJS(onDragEnd)(ratio);
          }
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [disabled, reducedMotion, onDragStart, onDragEnd]
  );

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: thumbPos.value }] }));

  // Fill style — animated width following thumb position
  const fillStyle = useAnimatedStyle(() => ({
    width: thumbPos.value }));

  const resolvedTrackColor = trackColor ?? colors.surfaceAlt;
  const resolvedFillColor = fillColor ?? colors.brand;

  const sliderContent = (
    <GestureDetector gesture={panGesture}>
      <View
        style={[styles.sliderTrack, { backgroundColor: resolvedTrackColor }, disabled && styles.disabledOverlay]}
        onLayout={handleLayout}
        accessibilityRole={'adjustable' as AccessibilityRole}
        accessibilityLabel={accessibilityLabel ?? label ?? 'Slider'}
        accessibilityValue={{ min: 0, max: 1, now: value }}
        accessible
      >
        <Reanimated.View
          style={[
            {
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: 0,
              backgroundColor: resolvedFillColor },
            fillStyle,
          ]}
        />
        <Reanimated.View
          style={[
            styles.sliderThumb,
            { backgroundColor: thumbColor },
            thumbStyle,
          ]}
        />
      </View>
    </GestureDetector>
  );

  if (label) {
    return (
      <View style={styles.sliderWrap}>
        <Text style={styles.sliderLabel}>{label}</Text>
        {sliderContent}
      </View>
    );
  }

  return sliderContent;
}
