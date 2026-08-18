import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  interpolate,
  Extrapolation,
  withRepeat,
  withTiming,
  Easing,
  SharedValue,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../theme/ThemeContext';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { Motion } from '../theme/motionTokens';

interface Props {
  scrollY: SharedValue<number>;
  isRefreshing: boolean;
  topInset?: number;
}

export function RefreshIndicator({ scrollY, isRefreshing, topInset = 60 }: Props) {
  const { colors } = useAppTheme();
  const reducedMotion = useReducedMotion();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const rotation = useSharedValue(0);

  useEffect(() => {
    if (isRefreshing) {
      // Reduced motion: collapse the continuous spin (rotation) to zero
      // travel — keep the indicator visible via opacity (§2.5).
      rotation.value = reducedMotion
        ? 0
        : withRepeat(
            withTiming(360, { duration: Motion.duration.slower, easing: Easing.linear }),
            -1
          );
    } else {
      rotation.value = 0;
    }
  }, [isRefreshing, reducedMotion, rotation]);

  const animStyle = useAnimatedStyle(() => {
    // When pulldown Y is negative
    const pullRotation = interpolate(scrollY.value, [-100, 0], [360, 0], Extrapolation.CLAMP);
    const scale = interpolate(scrollY.value, [-100, -20, 0], [1.2, 0.8, 0], Extrapolation.CLAMP);
    const opacity = interpolate(scrollY.value, [-40, -10], [1, 0], Extrapolation.CLAMP);

    // Reduced motion: remove rotation and scale (§2.5), keep opacity for
    // state-change communication.
    if (reducedMotion) {
      return {
        opacity: isRefreshing ? 1 : opacity,
        transform: [{ rotate: '0deg' }, { scale: 1 }],
      };
    }

    return {
      opacity: isRefreshing ? 1 : opacity,
      transform: [
        { rotate: `${isRefreshing ? rotation.value : pullRotation}deg` },
        { scale: isRefreshing ? 1.2 : scale },
      ],
    };
  });

  return (
    <View style={[styles.container, { top: topInset }]}>
      <Reanimated.View style={animStyle}>
        <View style={styles.circle}>
          <Text style={{ fontFamily: Typography.family.bold, color: '#111', fontSize: Type.body.size, marginTop: -2 }}>T</Text>
        </View>
      </Reanimated.View>
    </View>
  );
}

import { Text } from 'react-native';
import { Typography, Radius, Type } from '../theme/designTokens';

const createStyles = (colors: ReturnType<typeof useAppTheme>['colors']) => StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: -1,
  },
  circle: {
    width: 32,
    height: 32,
    borderRadius: Radius.xl,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.brand,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 4,
  },
});