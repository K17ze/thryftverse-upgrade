/**
 * AlphaSlider — horizontal alpha slider (0-1) with checkerboard background.
 *
 * Per spec 04_COLOR_SYSTEM_ZERO_GAP §2:
 * - Alpha slider.
 * - Show checkerboard background under current color.
 *
 * Uses react-native-gesture-handler for drag gestures and
 * react-native-reanimated for smooth thumb position.
 *
 * History semantics (spec §12): onChange fires transiently during drag,
 * onCommit fires once on gesture end.
 */

import React, { useCallback } from 'react';
import { StyleSheet, View, LayoutChangeEvent } from 'react-native';
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
import { toRgbaString } from './ColorMath';
import type { CreatorColor } from './ColorTypes';

// ── Timing ───────────────────────────────────────────────────────────
const SNAP_TIMING = { duration: 120, easing: Easing.out(Easing.cubic) };

// ── Props ────────────────────────────────────────────────────────────
interface AlphaSliderProps {
  /** Current alpha (0-1) */
  alpha: number;
  /** The current RGB color (alpha is controlled by this slider) */
  color: CreatorColor;
  /** Slider width in px */
  width: number;
  /** Transient change during drag — does NOT commit to history */
  onChange: (alpha: number) => void;
  /** Commit on gesture end — creates one undo entry */
  onCommit: (alpha: number) => void;
  /** Accessibility label override */
  accessibilityLabel?: string;
}

// ── Checkerboard pattern ─────────────────────────────────────────────
/**
 * Render a checkerboard pattern using a grid of View cells.
 * This is lightweight and works without Skia or SVG.
 */
function CheckerboardPattern({ size }: { size: number }) {
  const cellSize = 6;
  const cols = Math.ceil(size / cellSize);
  const rows = 2;
  const cells: React.ReactNode[] = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const isLight = (row + col) % 2 === 0;
      cells.push(
        <View
          key={`${row}-${col}`}
          style={{
            position: 'absolute',
            left: col * cellSize,
            top: row * cellSize,
            width: cellSize,
            height: cellSize,
            backgroundColor: isLight ? '#ffffff' : '#cccccc',
          }}
        />,
      );
    }
  }

  return (
    <View
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        overflow: 'hidden',
        borderRadius: Radius.sm,
      }}
    >
      {cells}
    </View>
  );
}

// ── Component ────────────────────────────────────────────────────────
export function AlphaSlider({
  alpha,
  color,
  width,
  onChange,
  onCommit,
  accessibilityLabel = 'Alpha opacity slider',
}: AlphaSliderProps) {
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
  const thumbX = useSharedValue(alpha * width);

  // Update thumb when alpha changes externally
  React.useEffect(() => {
    thumbX.value = withTiming(alpha * width, SNAP_TIMING);
  }, [alpha, width, thumbX]);

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
        const a = Math.max(0, Math.min(1, e.x / w));
        thumbX.value = a * w;
        runOnJS(onChange)(a);
      })
      .onChange((e) => {
        'worklet';
        const w = layoutWidth.value;
        const a = Math.max(0, Math.min(1, e.x / w));
        thumbX.value = a * w;
        runOnJS(onChange)(a);
      })
      .onEnd(() => {
        'worklet';
        const w = layoutWidth.value;
        const a = Math.max(0, Math.min(1, thumbX.value / w));
        runOnJS(onCommit)(a);
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

  // Color gradient from transparent to full opacity
  const transparentColor = toRgbaString({ ...color, a: 0 });
  const opaqueColor = toRgbaString({ ...color, a: 1 });

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
          max: 1,
          now: alpha,
          text: `Opacity ${Math.round(alpha * 100)} percent`,
        }}
      >
        {/* Checkerboard background */}
        <CheckerboardPattern size={width} />

        {/* Color opacity gradient overlay */}
        <Reanimated.View
          style={[
            StyleSheet.absoluteFill,
            {
              borderRadius: Radius.sm,
              overflow: 'hidden',
            },
          ]}
        >
          {/* Use a simple View with background for the gradient effect.
              We layer two views: transparent on left, opaque on right */}
          <View
            style={{
              ...StyleSheet.absoluteFill,
              backgroundColor: opaqueColor,
              opacity: 1,
            }}
          />
          {/* Linear gradient from transparent to opaque */}
          <AlphaGradient
            transparentColor={transparentColor}
            opaqueColor={opaqueColor}
          />
        </Reanimated.View>

        {/* Thumb */}
        <Reanimated.View
          style={[
            styles.thumb,
            thumbStyle,
            {
              width: THUMB_SIZE,
              height: THUMB_SIZE,
              borderRadius: THUMB_SIZE / 2,
              backgroundColor: opaqueColor,
              borderColor: colors.textInverse,
            },
          ]}
        />
      </View>
    </GestureDetector>
  );
}

// ── Alpha gradient (uses expo-linear-gradient) ───────────────────────
import { LinearGradient } from 'expo-linear-gradient';

function AlphaGradient({
  transparentColor,
  opaqueColor,
}: {
  transparentColor: string;
  opaqueColor: string;
}) {
  return (
    <LinearGradient
      colors={[transparentColor, opaqueColor]}
      style={StyleSheet.absoluteFill}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
    />
  );
}

// ── Styles ───────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    overflow: 'visible',
    borderWidth: Stroke.hairline,
    borderColor: 'rgba(0,0,0,0.1)',
    borderRadius: Radius.sm,
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
