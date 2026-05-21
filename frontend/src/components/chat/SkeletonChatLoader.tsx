import React from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { Colors } from '../../constants/colors';
import { Space, Radius } from '../../theme/designTokens';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

function SkeletonBar({ width, height = 14, style }: { width: number | string; height?: number; style?: any }) {
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
        styles.bar,
        { width, height },
        animStyle,
        style,
      ]}
    />
  );
}

export function SkeletonChatLoader({ count = 8 }: { count?: number }) {
  return (
    <View style={styles.container}>
      {Array.from({ length: count }).map((_, index) => {
        const isMe = index % 3 === 0;
        const bubbleWidth = isMe
          ? SCREEN_WIDTH * (0.4 + Math.random() * 0.3)
          : SCREEN_WIDTH * (0.3 + Math.random() * 0.4);

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
                <SkeletonBar width={32} height={32} style={{ borderRadius: Radius.full }} />
              </View>
            )}
            <View style={[styles.bubble, { maxWidth: bubbleWidth }]}>
              <SkeletonBar width="100%" height={12} />
              <SkeletonBar width="60%" height={12} style={{ marginTop: Space.xs }} />
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
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    paddingHorizontal: Space.md - 2,
    paddingVertical: Space.sm + 2,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  bar: {
    backgroundColor: Colors.border,
    borderRadius: Radius.sm,
  },
});
