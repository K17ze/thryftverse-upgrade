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

import React, { useCallback, useMemo } from 'react';
import { StyleSheet, View, LayoutChangeEvent } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';

import { Radius, Stroke } from '../../theme/designTokens';
import { Motion } from '../../theme/motionTokens';
import { useAppTheme } from '../../theme/ThemeContext';
import { toRgbaString } from './ColorMath';
import type { CreatorColor } from './ColorTypes';

// ── Timing ───────────────────────────────────────────────────────────
const SNAP_TIMING = { duration: Motion.duration.snapToGuide, easing: Motion.easing.entrance };

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
const CheckerboardPattern = React.memo(function CheckerboardPattern({ size }: { size: number }) {
  const { colors } = useAppTheme();
  const cellSize = 6;
  const cols = Math.ceil(size / cellSize);
  const rows = 2;
  const cells = useMemo(() => {
    const arr: React.ReactNode[] = [];

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const isLight = (row + col) % 2 === 0;
        arr.push(
          <View
            key={`${row}-${col}`}
            style={{
              position: 'absolute',
              left: col * cellSize,
              top: row * cellSize,
              width: cellSize,
              height: cellSize,
              backgroundColor: isLight ? colors.surfaceElevated : colors.border,
            }}
          />,
        );
      }
    }
    return arr;
  }, [cols, colors.surfaceElevated, colors.border]);

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
});

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
  // Shared value (not useRef) so the worklet can read the measured width
  // without triggering Reanimated's "Tried to modify key `current`" freeze
  // warning, which logs synchronously on the Android UI thread and causes
  // ANRs (input dispatch timeout).
  const layoutWidth = useSharedValue(width);
  // Tracks an in-flight drag so the external-sync effect can't fight the
  // finger (same guard CreatorSlider uses).
  const isDraggingSV = useSharedValue(false);

  const SLIDER_HEIGHT = 28;
  const THUMB_SIZE = 24;

  // Animated thumb position
  const thumbX = useSharedValue(alpha * width);

  // Update thumb when alpha changes externally — skipped while the finger
  // owns the thumb, otherwise the echoed onChange prop write re-arms a
  // competing animation mid-drag.
  React.useEffect(() => {
    if (!isDraggingSV.value) {
      thumbX.value = withTiming(alpha * width, SNAP_TIMING);
    }
  }, [alpha, width, thumbX, isDraggingSV]);

  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    layoutWidth.value = e.nativeEvent.layout.width;
  }, [layoutWidth]);

  const commitPosition = useCallback(() => {
    'worklet';
    const w = layoutWidth.value;
    const a = Math.max(0, Math.min(1, thumbX.value / w));
    runOnJS(onCommit)(a);
  }, [layoutWidth, thumbX, onCommit]);

  // Pan gesture — onChange emits at most once per 0.5% alpha bucket.
  const lastAlphaBucketSV = useSharedValue(-1);
  const panGesture = React.useMemo(() => {
    return Gesture.Pan()
      .activateAfterLongPress(0)
      .onBegin((e) => {
        'worklet';
        isDraggingSV.value = true;
        const w = layoutWidth.value;
        const a = Math.max(0, Math.min(1, e.x / w));
        thumbX.value = a * w;
        lastAlphaBucketSV.value = Math.round(a * 200);
        runOnJS(onChange)(a);
      })
      .onChange((e) => {
        'worklet';
        const w = layoutWidth.value;
        const a = Math.max(0, Math.min(1, e.x / w));
        thumbX.value = a * w;
        const bucket = Math.round(a * 200);
        if (bucket !== lastAlphaBucketSV.value) {
          lastAlphaBucketSV.value = bucket;
          runOnJS(onChange)(a);
        }
      })
      .onEnd(() => {
        'worklet';
        commitPosition();
      })
      .onFinalize((_e, success) => {
        'worklet';
        // A cancelled gesture (scroll takeover, system interruption) still
        // changed the value — commit it so history matches the visible
        // thumb instead of drifting out of the undo stack.
        if (!success) commitPosition();
        isDraggingSV.value = false;
      });
  }, [thumbX, onChange, commitPosition, layoutWidth, isDraggingSV, lastAlphaBucketSV]);

  // Thumb tracks the finger 1:1 — a withTiming inside the animated style
  // re-arms a 120ms animation on every gesture frame and low-pass-filters
  // the drag. Settle animation lives in the external-sync effect instead.
  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: thumbX.value - THUMB_SIZE / 2 }],
  }));

  // Color gradient from transparent to full opacity
  const transparentColor = toRgbaString({ ...color, a: 0 });
  const opaqueColor = toRgbaString({ ...color, a: 1 });

  return (
    <GestureDetector gesture={panGesture}>
      {/* 44pt hit area wraps the 28pt visual track — visible shape and
          touch target stay separate per the charter. */}
      <View
        onLayout={handleLayout}
        style={[styles.hitArea, { width }]}
        accessibilityRole="adjustable"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint="Drag left for transparent, right for fully opaque"
        accessibilityValue={{
          min: 0,
          max: 100,
          now: Math.round(alpha * 100),
          text: `Opacity ${Math.round(alpha * 100)} percent`,
        }}
        accessibilityActions={[
          { name: 'increment', label: 'Increase opacity' },
          { name: 'decrement', label: 'Decrease opacity' },
        ]}
        onAccessibilityAction={(e) => {
          const delta = e.nativeEvent.actionName === 'increment' ? 0.05 : -0.05;
          const next = Math.max(0, Math.min(1, alpha + delta));
          onChange(next);
          onCommit(next);
        }}
      >
        <View style={[styles.container, { width, height: SLIDER_HEIGHT }]}>
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
      </View>
    </GestureDetector>
  );
}

// ── Alpha gradient (uses expo-linear-gradient) ───────────────────────
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
  // 44pt touch target; the 28pt visual track is centred inside it.
  hitArea: {
    height: 44,
    justifyContent: 'center',
  },
  container: {
    justifyContent: 'center',
    overflow: 'visible',
    borderRadius: Radius.sm,
  },
  thumb: {
    position: 'absolute',
    top: 2,
    borderWidth: Stroke.emphasis,
  },
});
