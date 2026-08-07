import React from 'react';
import { View, Dimensions } from 'react-native';
import { SkeletonLoader } from '../SkeletonLoader';
import { useAppTheme } from '../../theme/ThemeContext';

import { Radius, Space } from '../../theme/designTokens';
const { width: W } = Dimensions.get('window');
const ITEM_W = (W - 48) / 2;

export function ProfileSkeleton() {
  const { colors } = useAppTheme();
  const statsBg = colors.surface;

  return (
    <View style={{ paddingHorizontal: 20 }}>
      {/* Hero section */}
      <View style={{ alignItems: 'center', paddingVertical: 28, gap: 14 }}>
        <SkeletonLoader width={96} height={96} borderRadius={Radius.full} />
        <SkeletonLoader width={140} height={18} borderRadius={Radius.sm} />
        <SkeletonLoader width={100} height={13} borderRadius={Radius.sm} />
      </View>
      {/* Stats bar */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-around', backgroundColor: statsBg, borderRadius: Radius.xl, padding: 20, marginBottom: Space.lg }}>
        {[0, 1, 2, 3].map(i => (
          <View key={i} style={{ alignItems: 'center', gap: 6 }}>
            <SkeletonLoader width={40} height={22} borderRadius={Radius.sm} />
            <SkeletonLoader width={52} height={11} borderRadius={Radius.sm} />
          </View>
        ))}
      </View>
      {/* Grid */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonLoader key={i} width={ITEM_W} height={ITEM_W * 1.35} borderRadius={Radius.lg} />
        ))}
      </View>
    </View>
  );
}
