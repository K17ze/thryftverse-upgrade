import React from 'react';
import { View } from 'react-native';
import { SkeletonLoader } from '../SkeletonLoader';
import { Space } from '../../theme/designTokens';

function SettingsRow() {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: Space.md, paddingVertical: 14, gap: 14 }}>
      <SkeletonLoader width={40} height={40} borderRadius={20} />
      <View style={{ flex: 1, gap: 8 }}>
        <SkeletonLoader width="55%" height={14} borderRadius={7} />
        <SkeletonLoader width="75%" height={11} borderRadius={6} />
      </View>
      <SkeletonLoader width={20} height={20} borderRadius={10} />
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
