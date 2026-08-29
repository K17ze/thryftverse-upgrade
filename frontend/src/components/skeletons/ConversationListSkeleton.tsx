import React from 'react';
import { View } from 'react-native';
import { SkeletonLoader } from '../SkeletonLoader';
import { Radius, Space } from '../../theme/designTokens';

function ConvoRow() {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, gap: 14 }}>
      <SkeletonLoader width={52} height={52} borderRadius={Radius.full} />
      <View style={{ flex: 1, gap: Space.sm }}>
        <SkeletonLoader width="60%" height={14} borderRadius={Radius.md} />
        <SkeletonLoader width="85%" height={11} borderRadius={Radius.sm} />
      </View>
      <SkeletonLoader width={36} height={36} borderRadius={Radius.xl} />
    </View>
  );
}

export function ConversationListSkeleton({ count = 6 }: { count?: number }) {
  return (
    <View>
      {Array.from({ length: count }).map((_, i) => (
        <ConvoRow key={i} />
      ))}
    </View>
  );
}