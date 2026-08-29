import React from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { Space, Radius, Type } from '../../theme/designTokens';
import { useAppTheme } from '../../theme/ThemeContext';
import { useReducedMotion } from '../../hooks/useReducedMotion';

const AnimatedLinearGradient = Reanimated.createAnimatedComponent(LinearGradient);

// Deterministic bubble-width fractions so the skeleton layout does not jump
// between renders. Matches the maxWidth: '78%' constraint in MessageBubble.
const BUBBLE_FRACTIONS = [0.62, 0.44, 0.7, 0.38, 0.55, 0.48, 0.66, 0.42];

/**
 * ShimmerBar — a single skeleton block with a premium shimmer sweep.
 * Replaces the old opacity-pulse with a directional shimmer that matches
 * the SkeletonLoader and PremiumSkeletonTile visual language.
 */
function ShimmerBar({
  width,
  height = 14,
  style,
  color,
  shimmer,
}: {
  width: number | string;
  height?: number;
  style?: any;
  color: string;
  shimmer: ReturnType<typeof useSharedValue<number>>;
}) {
  const shimmerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shimmer.value * 160 }],
  }));

  return (
    <View
      style={[
        { backgroundColor: color, borderRadius: Radius.sm, overflow: 'hidden' },
        { width, height },
        style,
      ]}
    >
      <AnimatedLinearGradient
        colors={['transparent', 'rgba(255,255,255,0.06)', 'transparent']}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={[StyleSheet.absoluteFill, shimmerStyle]}
      />
    </View>
  );
}

export function SkeletonChatLoader({ count = 8 }: { count?: number }) {
  const { colors } = useAppTheme();
  const { width: screenWidth } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const shimmer = useSharedValue(-1);

  React.useEffect(() => {
    if (reducedMotion) {
      shimmer.value = 0;
      return;
    }
    shimmer.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.ease) }),
        withTiming(-1, { duration: 0 }),
      ),
      -1,
      false,
    );
  }, [shimmer, reducedMotion]);

  const barColor = colors.border;

  return (
    <View style={styles.container}>
      {Array.from({ length: count }).map((_, index) => {
        const isMe = index % 3 === 0;
        // Show a sender label on some non-me messages to match group-chat
        // layout where MessageBubble renders senderLabel above the bubble.
        const showSender = !isMe && index % 5 === 2;
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
                <ShimmerBar
                  width={28}
                  height={28}
                  style={{ borderRadius: Radius.full }}
                  color={colors.surfaceAlt}
                  shimmer={shimmer}
                />
              </View>
            )}

            <View style={styles.bubbleColumn}>
              {showSender && (
                <ShimmerBar
                  width={80}
                  height={Type.caption.size}
                  style={styles.senderName}
                  color={barColor}
                  shimmer={shimmer}
                />
              )}

              <View
                style={[
                  styles.bubble,
                  isMe
                    ? { backgroundColor: colors.brand }
                    : { backgroundColor: colors.surfaceAlt, borderColor: colors.borderSubtle },
                ]}
              >
                <ShimmerBar
                  width="100%"
                  height={12}
                  color={isMe ? colors.scrimTextTertiary : barColor}
                  shimmer={shimmer}
                />
                <ShimmerBar
                  width="60%"
                  height={12}
                  style={{ marginTop: Space.xs }}
                  color={isMe ? colors.scrimTextTertiary : barColor}
                  shimmer={shimmer}
                />
              </View>
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
  // Matches MessageBubble row: flexDirection row, alignItems flex-end, gap Space.sm.
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Space.sm,
    marginVertical: Space.xs,
  },
  // Matches MessageBubble rowRight: flexDirection row-reverse.
  rowRight: {
    flexDirection: 'row-reverse',
  },
  // Matches MessageBubble avatar: 28x28, borderRadius full, marginBottom Space.xs.
  avatar: {
    marginBottom: Space.xs,
  },
  // Matches MessageBubble bubbleColumn: maxWidth 78%, gap 3.
  bubbleColumn: {
    maxWidth: '78%',
    gap: 3,
  },
  // Matches MessageBubble senderName: marginLeft Space.xs, marginBottom 2.
  senderName: {
    marginLeft: Space.xs,
    marginBottom: 2,
  },
  // Matches MessageBubble bubble: paddingHorizontal Space.sm + 2, paddingVertical Space.sm, gap 3.
  bubble: {
    borderRadius: Radius.lg,
    paddingHorizontal: Space.sm + 2,
    paddingVertical: Space.sm,
    gap: 3,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
  },
});
