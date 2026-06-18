import React from 'react';
import { View, StyleSheet } from 'react-native';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '../../constants/colors';

const AnimatedLinearGradient = Reanimated.createAnimatedComponent(LinearGradient);

interface Props {
  width?: number | string;
  height?: number | string;
  borderRadius?: number;
  style?: object;
}

export function PremiumSkeletonTile({
  width = '100%',
  height = '100%',
  borderRadius = 8,
  style,
}: Props) {
  const shimmerX = useSharedValue(-1);

  React.useEffect(() => {
    shimmerX.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
        withTiming(-1, { duration: 0 })
      ),
      -1,
      false
    );
  }, [shimmerX]);

  const shimmerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shimmerX.value * 140 }],
  }));

  return (
    <View
      style={[
        styles.container,
        { width, height, borderRadius },
        style,
      ]}
    >
      <View style={[StyleSheet.absoluteFill, { backgroundColor: Colors.surfaceAlt, borderRadius }]} />
      <AnimatedLinearGradient
        colors={['transparent', 'rgba(255,255,255,0.05)', 'transparent']}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={[StyleSheet.absoluteFill, shimmerStyle, { borderRadius }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    position: 'relative',
  },
});