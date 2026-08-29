import React from 'react';
import { View, Dimensions } from 'react-native';
import { SkeletonLoader } from '../SkeletonLoader';
import { useAppTheme } from '../../theme/ThemeContext';

import { Radius, Space } from '../../theme/designTokens';
const { width: W } = Dimensions.get('window');

export function ItemDetailSkeleton() {
  const { colors } = useAppTheme();
  const sellerCardBg = colors.surface;

  return (
    <View>
      {/* Hero image */}
      <SkeletonLoader width={W} height={W} borderRadius={Radius.none} />
      <View style={{ paddingHorizontal: 20, paddingTop: 20, gap: Space.smMd }}>
        {/* Price */}
        <SkeletonLoader width={120} height={32} borderRadius={Radius.md} />
        {/* Title */}
        <SkeletonLoader width="90%" height={18} borderRadius={Radius.sm} />
        <SkeletonLoader width="70%" height={18} borderRadius={Radius.sm} />
        {/* Meta pills */}
        <View style={{ flexDirection: 'row', gap: 10, marginTop: Space.xs }}>
          <SkeletonLoader width={72} height={28} borderRadius={Radius.xl} />
          <SkeletonLoader width={72} height={28} borderRadius={Radius.xl} />
          <SkeletonLoader width={72} height={28} borderRadius={Radius.xl} />
        </View>
        {/* Description block */}
        <View style={{ gap: Space.sm, marginTop: Space.sm }}>
          <SkeletonLoader width="100%" height={13} borderRadius={Radius.sm} />
          <SkeletonLoader width="95%" height={13} borderRadius={Radius.sm} />
          <SkeletonLoader width="80%" height={13} borderRadius={Radius.sm} />
        </View>
        {/* Seller card */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: Space.smMd, backgroundColor: sellerCardBg, borderRadius: Radius.xl, padding: Space.md }}>
          <SkeletonLoader width={48} height={48} borderRadius={Radius.full} />
          <View style={{ flex: 1, gap: Space.sm }}>
            <SkeletonLoader width="50%" height={14} borderRadius={Radius.sm} />
            <SkeletonLoader width="35%" height={11} borderRadius={Radius.sm} />
          </View>
        </View>
      </View>
    </View>
  );
}
