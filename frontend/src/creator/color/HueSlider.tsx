/**
 * HueSlider — horizontal hue slider (0-360 degrees) for the CreatorColorPicker.
 *
 * Per spec 04_COLOR_SYSTEM_ZERO_GAP §2:
 * - Hue slider.
 * - Drag to set hue.
 * - Show current position.
 *
 * Uses react-native-gesture-handler for drag gestures and
 * react-native-reanimated for smooth thumb position.
 *
 * History semantics (spec §12): onChange fires transiently during drag,
 * onCommit fires once on gesture end.
 */

import React, { useCallback } from 'react';
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
import { Radius, Stroke } from '../../theme/designTokens';
import { useAppTheme } from '../../theme/ThemeContext';
import type { HSV } from './ColorTypes';

// ── Timing ───────────────────────────────────────────────────────────
const SNAP_TIMING = { duration: 120, easing: Easing.out(Easing.cubic) };

// ── Props ────────────────────────────────────────────────────────────
interface HueSliderProps {
  /** Current hue (0-360) */
  hue: number;
  /** Slider width in px */
  width: number;
  /** Transient change during drag — does NOT commit to history */
  onChange: (hue: number) => void;
  /** Commit on gesture end — creates one undo entry */
  onCommit: (hue: number) => void;
  /** Accessibility label override */
  accessibilityLabel?: string;
}

// ── Component ────────────────────────────────────────────────────────
export function HueSlider({
  hue,
  width,
  onChange,
  onCommit,
  accessibilityLabel = 'Hue slider',
}: HueSliderProps) {
  const { colors } = useAppTheme();
  const reduceMotion = useReducedMotion();
  // Shared value (not useRef) so the worklet can read the measured width
  // without triggering Reanimated's "Tried to modify key `current`" freeze
  // warning, which logs synchronously on the Android UI thread and causes
  // ANRs (input dispatch timeout).
  const layoutWidth = useSharedValue(width);

  const SLIDER_HEIGHT = 28;
  const THUMB_SIZE = 24;

  // Animated thumb position
  const thumbX = useSharedValue((hue / 360) * width);

  // Update thumb when hue changes externally
  React.useEffect(() => {
    thumbX.value = withTiming((hue / 360) * width, SNAP_TIMING);
  }, [hue, width, thumbX]);

  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    layoutWidth.value = e.nativeEvent.layout.width;
  }, [layoutWidth]);

  // Pan gesture
  const panGesture = React.useMemo(() => {
    return Gesture.Pan()
      .activateAfterLongPress(0)
      .onBegin((e) => {
        'worklet';
        const w = layoutWidth.value;
        const ratio = Math.max(0, Math.min(1, e.x / w));
        const h = ratio * 360;
        thumbX.value = ratio * w;
        runOnJS(onChange)(h);
      })
      .onChange((e) => {
        'worklet';
        const w = layoutWidth.value;
        const ratio = Math.max(0, Math.min(1, e.x / w));
        const h = ratio * 360;
        thumbX.value = ratio * w;
        runOnJS(onChange)(h);
      })
      .onEnd(() => {
        'worklet';
        const w = layoutWidth.value;
        const ratio = Math.max(0, Math.min(1, thumbX.value / w));
        const h = ratio * 360;
        runOnJS(onCommit)(h);
      });
  }, [thumbX, onChange, onCommit, layoutWidth]);

  // Animated thumb style
  const thumbStyle = useAnimatedStyle(() => {
    if (reduceMotion) {
      return {
        transform: [{ translateX: thumbX.value - THUMB_SIZE / 2 }],
      };
    }
    return {
      transform: [
        { translateX: withTiming(thumbX.value - THUMB_SIZE / 2, SNAP_TIMING) },
      ],
    };
  });

  // Thumb color — the current hue at full saturation/value
  const hueColor = `hsl(${hue}, 100%, 50%)`;

  return (
    <GestureDetector gesture={panGesture}>
      <View
        onLayout={handleLayout}
        style={[
          styles.container,
          { width, height: SLIDER_HEIGHT },
        ]}
        accessibilityRole="adjustable"
        accessibilityLabel={accessibilityLabel}
        accessibilityValue={{
          min: 0,
          max: 360,
          now: Math.round(hue),
          text: `Hue ${Math.round(hue)} degrees`,
        }}
      >
        {/* Hue spectrum gradient */}
        <LinearGradient
          colors={[
            '#ff0000', '#ffff00', '#00ff00',
            '#00ffff', '#0000ff', '#ff00ff', '#ff0000',
          ]}
          style={[StyleSheet.absoluteFill, { borderRadius: Radius.sm }]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
        />

        {/* Thumb */}
        <Reanimated.View
          style={[
            styles.thumb,
            thumbStyle,
            {
              width: THUMB_SIZE,
              height: THUMB_SIZE,
              borderRadius: THUMB_SIZE / 2,
              backgroundColor: hueColor,
              borderColor: colors.textInverse,
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
    justifyContent: 'center',
    overflow: 'visible',
  },
  thumb: {
    position: 'absolute',
    top: 2,
    borderWidth: Stroke.emphasis,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 3,
  },
});
