import React, { useEffect } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  interpolate,
} from 'react-native-reanimated';
import { Colors } from '../constants/colors';

const { width } = Dimensions.get('window');

interface SkeletonProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: any;
}

const AnimatedView = Reanimated.createAnimatedComponent(View);

export function Skeleton({
  width: w = '100%',
  height = 20,
  borderRadius = 8,
  style,
}: SkeletonProps) {
  const shimmer = useSharedValue(0);

  useEffect(() => {
    shimmer.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1000 }),
        withTiming(0, { duration: 1000 })
      ),
      -1,
      true
    );
  }, []);

  const shimmerStyle = useAnimatedStyle(() => {
    const opacity = interpolate(shimmer.value, [0, 1], [0.4, 0.8]);
    return {
      opacity,
    };
  });

  const widthValue = typeof w === 'number' ? w : w;

  return (
    <AnimatedView
      style={[
        styles.skeleton,
        { width: widthValue, height, borderRadius },
        shimmerStyle,
        style,
      ]}
    />
  );
}

export function ProductCardSkeleton() {
  return (
    <View style={styles.card}>
      <Skeleton width={CARD_WIDTH} height={CARD_WIDTH * 1.2} borderRadius={16} />
      <View style={styles.content}>
        <Skeleton width="60%" height={16} borderRadius={8} />
        <Skeleton width="40%" height={14} borderRadius={7} style={{ marginTop: 8 }} />
        <View style={styles.row}>
          <Skeleton width={32} height={32} borderRadius={16} />
          <Skeleton width="50%" height={14} borderRadius={7} style={{ marginLeft: 8 }} />
        </View>
      </View>
    </View>
  );
}

export function ProfileSkeleton() {
  return (
    <View style={styles.profileContainer}>
      <Skeleton width="100%" height={200} borderRadius={0} />
      <View style={styles.avatarWrapper}>
        <Skeleton width={100} height={100} borderRadius={50} />
      </View>
      <View style={styles.profileInfo}>
        <Skeleton width="40%" height={24} borderRadius={12} />
        <Skeleton width="30%" height={16} borderRadius={8} style={{ marginTop: 12 }} />
        <Skeleton width="80%" height={14} borderRadius={7} style={{ marginTop: 16 }} />
      </View>
    </View>
  );
}

const CARD_WIDTH = (width - 48) / 2;

const styles = StyleSheet.create({
  skeleton: {
    backgroundColor: Colors.border,
  },
  card: {
    width: CARD_WIDTH,
    marginBottom: 16,
  },
  content: {
    padding: 12,
    gap: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  profileContainer: {
    width: '100%',
  },
  avatarWrapper: {
    marginTop: -50,
    alignSelf: 'center',
    padding: 4,
    backgroundColor: Colors.background,
    borderRadius: 54,
  },
  profileInfo: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 24,
  },
});
