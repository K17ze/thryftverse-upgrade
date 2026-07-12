import React, { useEffect } from 'react';
import { View, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
  interpolate,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppTheme } from '../theme/ThemeContext';
import { useReducedMotion } from '../hooks/useReducedMotion';

// Neutral shimmer wave — no decorative gold per Design.md v1.4.
// The wave opacity is theme-aware (computed inside the component).

interface SkeletonProps {
  width: number | `${number}%`;
  height: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
}

export function SkeletonLoader({ width, height, borderRadius = 8, style }: SkeletonProps) {
  const { colors, isDark } = useAppTheme();
  const reducedMotionEnabled = useReducedMotion();
  const translateX = useSharedValue(-400);
  const breathe = useSharedValue(1);

  const shimmerWave: [string, string, string] = isDark
    ? ['rgba(255,255,255,0)', 'rgba(255,255,255,0.06)', 'rgba(255,255,255,0)']
    : ['rgba(255,255,255,0)', 'rgba(255,255,255,0.45)', 'rgba(255,255,255,0)'];

  useEffect(() => {
    if (reducedMotionEnabled) {
      translateX.value = 0;
      breathe.value = 1;
      return;
    }
    // Primary wave sweep
    translateX.value = withRepeat(
      withSequence(
        withTiming(500, { duration: 1600, easing: Easing.inOut(Easing.ease) }),
        withTiming(-400, { duration: 0 })
      ),
      -1,
      false,
    );

    // Subtle breathing pulse on the base
    breathe.value = withRepeat(
      withSequence(
        withTiming(1.02, { duration: 1800, easing: Easing.inOut(Easing.sin) }),
        withTiming(0.98, { duration: 1800, easing: Easing.inOut(Easing.sin) })
      ),
      -1,
      true,
    );
  }, [translateX, breathe, reducedMotionEnabled]);

  const waveStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const breatheStyle = useAnimatedStyle(() => ({
    opacity: interpolate(breathe.value, [0.98, 1.02], [0.92, 1]),
  }));

  return (
    <Reanimated.View
      style={[
        {
          width: width as any,
          height,
          borderRadius,
          backgroundColor: colors.surface,
          overflow: 'hidden',
        },
        breatheStyle,
        style,
      ]}
    >
      {/* Neutral shimmer wave */}
      {!reducedMotionEnabled && (
        <Reanimated.View style={[StyleSheet.absoluteFill, waveStyle]}>
          <LinearGradient
            colors={shimmerWave}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ width: 280, height: '100%' }}
          />
        </Reanimated.View>
      )}
    </Reanimated.View>
  );
}

/** Skeleton composite: a grid of product card placeholders */
export function ProductGridSkeleton({ columns = 2, count = 6 }: { columns?: number; count?: number }) {
  const items = Array.from({ length: count }, (_, i) => i);
  return (
    <View style={gridStyles.container}>
      {items.map((i) => (
        <View key={i} style={[gridStyles.card, { width: `${(100 / columns) - 3}%` as any }]}>
          <SkeletonLoader width="100%" height={180} borderRadius={14} />
          <SkeletonLoader width="60%" height={12} borderRadius={6} style={{ marginTop: 10 }} />
          <SkeletonLoader width="40%" height={10} borderRadius={6} style={{ marginTop: 6 }} />
        </View>
      ))}
    </View>
  );
}

/** Skeleton composite: stories row placeholder */
export function StoriesRowSkeleton({ count = 5 }: { count?: number }) {
  const items = Array.from({ length: count }, (_, i) => i);
  return (
    <View style={storiesStyles.container}>
      {items.map((i) => (
        <View key={i} style={storiesStyles.item}>
          <SkeletonLoader width={68} height={68} borderRadius={34} />
          <SkeletonLoader width={48} height={8} borderRadius={4} style={{ marginTop: 6 }} />
        </View>
      ))}
    </View>
  );
}

/** Skeleton composite: conversation list placeholder */
export function ConversationListSkeleton({ count = 6 }: { count?: number }) {
  const items = Array.from({ length: count }, (_, i) => i);
  return (
    <View>
      {items.map((i) => (
        <View key={i} style={convoStyles.row}>
          <SkeletonLoader width={50} height={50} borderRadius={25} />
          <View style={convoStyles.textCol}>
            <SkeletonLoader width="55%" height={12} borderRadius={6} />
            <SkeletonLoader width="80%" height={10} borderRadius={6} style={{ marginTop: 8 }} />
          </View>
          <SkeletonLoader width={36} height={10} borderRadius={5} />
        </View>
      ))}
    </View>
  );
}

/** Skeleton composite: profile hero placeholder */
export function ProfileSkeleton() {
  const { colors } = useAppTheme();
  return (
    <View style={profileStyles.container}>
      <SkeletonLoader width="100%" height={160} borderRadius={0} />
      <View style={profileStyles.avatarRow}>
        <SkeletonLoader width={84} height={84} borderRadius={42} style={[profileStyles.avatar, { borderColor: colors.background }]} />
      </View>
      <View style={profileStyles.info}>
        <SkeletonLoader width={140} height={16} borderRadius={8} />
        <SkeletonLoader width={100} height={12} borderRadius={6} style={{ marginTop: 10 }} />
        <View style={profileStyles.statsRow}>
          <SkeletonLoader width={60} height={28} borderRadius={8} />
          <SkeletonLoader width={60} height={28} borderRadius={8} />
          <SkeletonLoader width={60} height={28} borderRadius={8} />
          <SkeletonLoader width={60} height={28} borderRadius={8} />
        </View>
      </View>
    </View>
  );
}

const gridStyles = StyleSheet.create({
  container: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', paddingHorizontal: 16 },
  card: { marginBottom: 20 },
});

const storiesStyles = StyleSheet.create({
  container: { flexDirection: 'row', paddingHorizontal: 16, gap: 14, paddingVertical: 12 },
  item: { alignItems: 'center' },
});

const convoStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
  textCol: { flex: 1 },
});

const profileStyles = StyleSheet.create({
  container: {},
  avatarRow: { alignItems: 'flex-start', paddingHorizontal: 20, marginTop: -42 },
  avatar: { borderWidth: 3 },
  info: { paddingHorizontal: 20, marginTop: 12 },
  statsRow: { flexDirection: 'row', gap: 14, marginTop: 16 },
});