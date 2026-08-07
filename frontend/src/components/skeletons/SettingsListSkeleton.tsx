import React from 'react';
import { View } from 'react-native';
import { SkeletonLoader } from '../SkeletonLoader';
import { Space, Radius } from '../../theme/designTokens';

function SettingsRow() {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: Space.md, paddingVertical: 14, gap: 14 }}>
      <SkeletonLoader width={40} height={40} borderRadius={Radius.full} />
      <View style={{ flex: 1, gap: 8 }}>
        <SkeletonLoader width="55%" height={14} borderRadius={Radius.sm} />
        <SkeletonLoader width="75%" height={11} borderRadius={Radius.sm} />
      </View>
      <SkeletonLoader width={20} height={20} borderRadius={Radius.full} />
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
