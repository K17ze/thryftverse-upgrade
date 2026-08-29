import React from 'react';
import { View } from 'react-native';
import { SkeletonLoader } from '../SkeletonLoader';
import { Space, Radius, Control } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';

function SettingsRow() {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: Space.md, paddingVertical: Space.sm + Space.xs, gap: Space.sm + Space.xs }}>
      <SkeletonLoader width={Control.hit} height={Control.hit} borderRadius={Radius.full} />
      <View style={{ flex: 1, gap: Space.xs / 4 }}>
        <SkeletonLoader width="55%" height={TypographyV2.bodyStrong.size} borderRadius={Radius.sm} />
        <SkeletonLoader width="75%" height={TypographyV2.meta.size} borderRadius={Radius.sm} />
      </View>
      <SkeletonLoader width={18} height={18} borderRadius={Radius.full} />
    </View>
  );
}

export function SettingsListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <View>
      {Array.from({ length: count }).map((_, i) => (
        <SettingsRow key={i} />
      ))}
    </View>
  );
}
