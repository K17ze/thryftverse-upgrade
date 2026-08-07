import React from 'react';
import { View, Dimensions } from 'react-native';
import { SkeletonLoader } from '../SkeletonLoader';

import { Space, Radius } from '../../theme/designTokens';
const { width: W } = Dimensions.get('window');
const ITEM_W = (W - 48) / 2;

function GridItem() {
  return (
    <View style={{ width: ITEM_W, marginBottom: Space.lg }}>
      <SkeletonLoader width={ITEM_W} height={ITEM_W * 1.35} borderRadius={Radius.lg} style={{ marginBottom: 10 }} />
      <SkeletonLoader width={ITEM_W * 0.5} height={14} borderRadius={Radius.sm} style={{ marginBottom: 6 }} />
      <SkeletonLoader width={ITEM_W * 0.7} height={11} borderRadius={Radius.sm} />
    </View>
  );
}

export function ProductGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: Space.md }}>
      {Array.from({ length: count }).map((_, i) => (
        <GridItem key={i} />
      ))}
    </View>
  );
}