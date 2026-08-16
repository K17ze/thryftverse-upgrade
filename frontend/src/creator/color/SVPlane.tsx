/**
 * SVPlane — 2D saturation/value plane for the CreatorColorPicker.
 *
 * Per spec 04_COLOR_SYSTEM_ZERO_GAP §2:
 * - Two-dimensional saturation/value plane.
 * - Drag to set S and V.
 * - Show current position indicator.
 *
 * Uses react-native-gesture-handler for drag gestures (no PanResponder)
 * and react-native-reanimated for smooth 60fps position indicator.
 * The plane is rendered with React Native primitives (LinearGradient
 * overlays) — no Skia dependency required for this component.
 *
 * History semantics (spec §12): onChange fires transiently during drag,
 * onCommit fires once on gesture end (one undo entry).
 */

import React, { useCallback, useRef } from 'react';
import { StyleSheet, View, LayoutChangeEvent } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import { useReducedMotion } from 'react-native-reanimated';
import { Space, Radius, Stroke } from '../../theme/designTokens';
import { useAppTheme } from '../../theme/ThemeContext';
import { hsvToRgb, toHexString } from './ColorMath';
import type { HSV } from './ColorTypes';

// ── Timing ───────────────────────────────────────────────────────────
const SNAP_TIMING = { duration: 120, easing: Easing.out(Easing.cubic) };

// ── Props ────────────────────────────────────────────────────────────
interface SVPlaneProps {
  /** Current HSV state (h from hue slider, s/v from this plane) */
  hsv: HSV;
  /** Plane size in px (square) */
  size: number;
  /** Transient change during drag — does NOT commit to history */
  onChange: (hsv: HSV) => void;
  /** Commit on gesture end — creates one undo entry */
  onCommit: (hsv: HSV) => void;
  /** Accessibility label override */
  accessibilityLabel?: string;
}

// ── Component ────────────────────────────────────────────────────────
export function SVPlane({
  hsv,
  size,
  onChange,
  onCommit,
  accessibilityLabel = 'Saturation and value color plane',
}: SVPlaneProps) {
  const { colors } = useAppTheme();
  const reduceMotion = useReducedMotion();
  const layoutRef = useRef({ width: size, height: size });

  // Animated indicator position
  const indicatorX = useSharedValue(hsv.s * size);
  const indicatorY = useSharedValue((1 - hsv.v) * size);

  // Update indicator when hsv changes externally (e.g. hue slider change)
  React.useEffect(() => {
    indicatorX.value = withTiming(hsv.s * size, SNAP_TIMING);
    indicatorY.value = withTiming((1 - hsv.v) * size, SNAP_TIMING);
  }, [hsv.s, hsv.v, size, indicatorX, indicatorY]);

  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    layoutRef.current = {
      width: e.nativeEvent.layout.width,
      height: e.nativeEvent.layout.height,
    };
  }, []);

  // Pan gesture — updates S and V from drag position
  const panGesture = React.useMemo(() => {
    return Gesture.Pan()
      .activateAfterLongPress(0)
      .onBegin((e) => {
        'worklet';
        const w = layoutRef.current.width;
        const h = layoutRef.current.height;
        const s = Math.max(0, Math.min(1, e.x / w));
        const v = Math.max(0, Math.min(1, 1 - e.y / h));
        indicatorX.value = s * w;
        indicatorY.value = (1 - v) * h;
        const newHsv: HSV = { h: hsv.h, s, v };
        runOnJS(onChange)(newHsv);
      })
      .onChange((e) => {
        'worklet';
        const w = layoutRef.current.width;
        const h = layoutRef.current.height;
        const s = Math.max(0, Math.min(1, e.x / w));
        const v = Math.max(0, Math.min(1, 1 - e.y / h));
        indicatorX.value = s * w;
        indicatorY.value = (1 - v) * h;
        const newHsv: HSV = { h: hsv.h, s, v };
        runOnJS(onChange)(newHsv);
      })
      .onEnd(() => {
        'worklet';
        const w = layoutRef.current.width;
        const h = layoutRef.current.height;
        const s = Math.max(0, Math.min(1, indicatorX.value / w));
        const v = Math.max(0, Math.min(1, 1 - indicatorY.value / h));
        const finalHsv: HSV = { h: hsv.h, s, v };
        runOnJS(onCommit)(finalHsv);
      });
  }, [hsv.h, indicatorX, indicatorY, onChange, onCommit]);

  // Animated indicator style
  const indicatorStyle = useAnimatedStyle(() => {
    if (reduceMotion) {
      return {
        transform: [
          { translateX: indicatorX.value - 10 },
          { translateY: indicatorY.value - 10 },
        ],
      };
    }
    return {
      transform: [
        { translateX: withTiming(indicatorX.value - 10, SNAP_TIMING) },
        { translateY: withTiming(indicatorY.value - 10, SNAP_TIMING) },
      ],
    };
  });

  // Current hue color (full saturation, full value) for the base layer
  const hueColor = toHexString(hsvToRgb({ h: hsv.h, s: 1, v: 1 }));

  // Indicator color — the actual current color
  const currentColor = toHexString(hsvToRgb(hsv));

  // Whether the indicator should have a light or dark border
  const indicatorBorderColor =
    hsv.v > 0.5 && hsv.s < 0.5 ? '#000000' : '#FFFFFF';

  return (
    <GestureDetector gesture={panGesture}>
      <View
        onLayout={handleLayout}
        style={[
          styles.container,
          { width: size, height: size, borderRadius: Radius.md },
        ]}
        accessibilityRole="adjustable"
        accessibilityLabel={accessibilityLabel}
        accessibilityValue={{
          text: `Saturation ${Math.round(hsv.s * 100)} percent, Value ${Math.round(hsv.v * 100)} percent`,
        }}
      >
        {/* Base hue color */}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: hueColor }]} />

        {/* Saturation gradient (white → transparent, left to right) */}
        <LinearGradient
          colors={['#ffffff', 'rgba(255,255,255,0)']}
          style={[StyleSheet.absoluteFill]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
        />

        {/* Value gradient (transparent → black, top to bottom) */}
        <LinearGradient
          colors={['rgba(0,0,0,0)', '#000000']}
          style={[StyleSheet.absoluteFill]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
        />

        {/* Position indicator */}
        <Reanimated.View
          style={[
            styles.indicator,
            indicatorStyle,
            {
              backgroundColor: currentColor,
              borderColor: indicatorBorderColor,
            },
          ]}
        />
      </View>
    </GestureDetector>
  );
}

// ── Styles ───────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    borderWidth: Stroke.hairline,
    borderColor: 'rgba(0,0,0,0.1)',
  },
  indicator: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 3,
  },
});
