import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import Reanimated, {
  useAnimatedStyle,
  withTiming,
  Easing as ReanimatedEasing,
  useSharedValue,
} from 'react-native-reanimated';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Radius, Space } from '../../theme/designTokens';

const ReanimatedView = Reanimated.View;

export interface AppStoryProgressProps {
  /** Total number of story segments. */
  segments: number;
  /** Zero-based index of the currently-animating segment. */
  currentSegment: number;
  /** Progress (0–1) within the current segment. */
  progress: number;
  /** Fired when the current segment reaches full progress. */
  onSegmentComplete: () => void;
  /** Fill color for completed and in-progress segments. Defaults to brand. */
  color?: string;
  /** Track height in px. Defaults to 2. */
  height?: number;
}

/**
 * AppStoryProgress — a multi-segment progress bar for story-style content
 * (Instagram/Snapchat stories). Each segment is a thin rounded bar; completed
 * segments are full color, the current segment animates its fill width with
 * `progress`, and upcoming segments show the track color.
 *
 * The current segment uses a Reanimated `useAnimatedStyle` driven by the
 * `progress` shared value so the fill tracks the caller's progress without
 * re-rendering. When `progress` stops changing the fill pauses in place.
 */
export function AppStoryProgress({
  segments,
  currentSegment,
  progress,
  onSegmentComplete,
  color,
  height = 2,
}: AppStoryProgressProps) {
  const { colors } = useAppTheme();
  const fillColor = color ?? colors.scrimTextPrimary;
  const styles = React.useMemo(() => createStyles(colors, height), [colors, height]);

  const progressSV = useSharedValue(progress);
  const lastSegment = React.useRef(currentSegment);

  React.useEffect(() => {
    progressSV.value = withTiming(progress, {
      duration: 120,
      easing: ReanimatedEasing.linear,
    });
  }, [progress, progressSV]);

  React.useEffect(() => {
    if (currentSegment !== lastSegment.current) {
      lastSegment.current = currentSegment;
    }
  }, [currentSegment]);

  React.useEffect(() => {
    if (progress >= 1) {
      onSegmentComplete();
    }
  }, [progress, onSegmentComplete]);

  const currentFillStyle = useAnimatedStyle(() => ({
    width: `${Math.max(0, Math.min(1, progressSV.value)) * 100}%`,
  }));

  const items = React.useMemo(
    () => Array.from({ length: Math.max(1, segments) }, (_, i) => i),
    [segments],
  );

  return (
    <View
      style={styles.container}
      accessibilityRole="progressbar"
      accessibilityLabel={`Story progress, segment ${currentSegment + 1} of ${segments}`}
      accessibilityValue={{ min: 0, max: segments, now: currentSegment + progress }}
    >
      {items.map((i) => {
        if (i < currentSegment) {
          return (
            <View key={i} style={styles.segment}>
              <View style={[styles.track, { backgroundColor: fillColor }]} />
            </View>
          );
        }
        if (i === currentSegment) {
          return (
            <View key={i} style={styles.segment}>
              <View style={styles.track}>
                <ReanimatedView style={[styles.fill, currentFillStyle, { backgroundColor: fillColor }]} />
              </View>
            </View>
          );
        }
        return (
          <View key={i} style={styles.segment}>
            <View style={styles.track} />
          </View>
        );
      })}
    </View>
  );
}

function createStyles(colors: ThemeColors, height: number) {
  return StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      width: '100%',
    } as ViewStyle,
    segment: {
      flex: 1,
      height,
    } as ViewStyle,
    track: {
      flex: 1,
      backgroundColor: colors.scrimTextTertiary,
      borderRadius: Radius.full,
      overflow: 'hidden',
    } as ViewStyle,
    fill: {
      height: '100%',
      borderRadius: Radius.full,
    } as ViewStyle,
  });
}
