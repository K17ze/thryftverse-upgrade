import React from 'react';
import Svg, { Circle as SvgCircle } from 'react-native-svg';
import Reanimated, {
  SharedValue,
  useAnimatedProps,
  useAnimatedStyle,
} from 'react-native-reanimated';
import { useAppTheme } from '../../theme/ThemeContext';

// Animated SVG circle for recording ring stroke progress
const ReanimatedCircle = Reanimated.createAnimatedComponent(SvgCircle);

const DEFAULT_SIZE = 92; // SHUTTER_SIZE + 12
const DEFAULT_STROKE = 4;

export interface RecordingRingProps {
  /** Progress 0→1 — drives stroke-dashoffset. */
  progress: SharedValue<number>;
  /** Optional scale spring (pulse on recording start). */
  scale?: SharedValue<number>;
  /** Ring outer dimension in pixels (default 92). */
  size?: number;
  /** Stroke width (default 4). */
  stroke?: number;
}

/**
 * Recording ring — SVG circle that fills over the recording duration.
 *
 * Wraps the shutter button. A background track (rgba 0.2) sits behind a
 * red progress arc whose `strokeDashoffset` is driven by `progress`.
 * An optional `scale` shared value applies a pulse spring on start.
 */
export function RecordingRing({
  progress,
  scale,
  size = DEFAULT_SIZE,
  stroke = DEFAULT_STROKE,
}: RecordingRingProps) {
  const { colors } = useAppTheme();
  const radius = size / 2 - stroke / 2;
  const circumference = 2 * Math.PI * radius;

  const ringProps = useAnimatedProps(() => {
    const offset = circumference * (1 - progress.value);
    return {
      strokeDashoffset: offset,
    };
  });

  const scaleStyle = useAnimatedStyle(() => {
    if (!scale) return {};
    return { transform: [{ scale: scale.value }] };
  });

  // Offset so the ring centres on the 80pt shutter button
  const shutterSize = 80;
  const offset = -(size - shutterSize) / 2;

  return (
    <Reanimated.View
      style={[
        {
          position: 'absolute',
          top: offset,
          left: offset,
          width: size,
          height: size,
        },
        scaleStyle,
      ]}
      pointerEvents="none"
    >
      <Svg width={size} height={size}>
        {/* Background track — camera overlay, always high contrast on dark preview */}
        <SvgCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="rgba(255,255,255,0.2)"
          strokeWidth={stroke}
          fill="none"
        />
        {/* Progress arc — red, rotates -90° so it starts at top */}
        <ReanimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={colors.danger}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          animatedProps={ringProps}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
    </Reanimated.View>
  );
}
