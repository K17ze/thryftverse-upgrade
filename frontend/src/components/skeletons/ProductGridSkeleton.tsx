import React from 'react';
import { View, useWindowDimensions } from 'react-native';
import { SkeletonLoader } from '../SkeletonLoader';

import { Space, Radius } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';

function GridItem({ itemW }: { itemW: number }) {
  return (
    <View style={{ width: itemW, marginBottom: Space.lg }}>
      <SkeletonLoader width={itemW} height={itemW * 1.35} borderRadius={Radius.lg} style={{ marginBottom: 10 }} />
      <SkeletonLoader width={itemW * 0.5} height={TypographyV2.body.size} borderRadius={Radius.sm} style={{ marginBottom: 6 }} />
      <SkeletonLoader width={itemW * 0.7} height={TypographyV2.meta.size} borderRadius={Radius.sm} />
    </View>
  );
}

export function ProductGridSkeleton({ count = 6 }: { count?: number }) {
  const { width: W } = useWindowDimensions();
  const ITEM_W = (W - Space.xxl) / 2;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: Space.md }}>
      {Array.from({ length: count }).map((_, i) => (
        <GridItem key={i} itemW={ITEM_W} />
      ))}
    </View>
  );
}