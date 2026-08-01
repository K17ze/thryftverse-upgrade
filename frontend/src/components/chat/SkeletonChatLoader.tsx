import React from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { Space, Radius } from '../../theme/designTokens';
import { useAppTheme } from '../../theme/ThemeContext';

// Deterministic bubble-width fractions so the skeleton layout does not jump between renders.
const BUBBLE_FRACTIONS = [0.62, 0.44, 0.7, 0.38, 0.55, 0.48, 0.66, 0.42];

function SkeletonBar({ width, height = 14, style, barColor }: { width: number | string; height?: number; style?: any; barColor: string }) {
  const opacity = useSharedValue(0.3);

  React.useEffect(() => {
    opacity.value = withRepeat(
      withTiming(0.7, { duration: 1200 }),
      -1,
      true
    );
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Reanimated.View
      style={[
        { backgroundColor: barColor, borderRadius: Radius.sm },
        { width, height },
        animStyle,
        style,
      ]}
    />
  );
}

export function SkeletonChatLoader({ count = 8 }: { count?: number }) {
  const { colors } = useAppTheme();
  const { width: screenWidth } = useWindowDimensions();
  return (
    <View style={styles.container}>
      {Array.from({ length: count }).map((_, index) => {
        const isMe = index % 3 === 0;
        const bubbleWidth = screenWidth * BUBBLE_FRACTIONS[index % BUBBLE_FRACTIONS.length];

        return (
          <View
            key={index}
            style={[
              styles.row,
              isMe && styles.rowRight,
            ]}
          >
            {!isMe && (
              <View style={styles.avatar}>
                <SkeletonBar width={32} height={32} style={{ borderRadius: Radius.full }} barColor={colors.border} />
              </View>
            )}
            <View style={[styles.bubble, { backgroundColor: colors.surfaceAlt, borderColor: colors.borderSubtle }]}>
              <SkeletonBar width="100%" height={12} barColor={colors.border} />
              <SkeletonBar width="60%" height={12} style={{ marginTop: Space.xs }} barColor={colors.border} />
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginVertical: Space.xs + 2,
  },
  rowRight: {
    justifyContent: 'flex-end',
  },
  avatar: {
    marginRight: Space.sm,
  },
  bubble: {
    borderRadius: Radius.xl,
    paddingHorizontal: Space.md - 2,
    paddingVertical: Space.sm + 2,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
