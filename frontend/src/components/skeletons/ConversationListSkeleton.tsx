import React from 'react';
import { View } from 'react-native';
import { SkeletonLoader } from '../SkeletonLoader';
import { Radius, Space, Control } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';

function ConvoRow() {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, gap: 14 }}>
      <SkeletonLoader width={52} height={52} borderRadius={Radius.full} />
      <View style={{ flex: 1, gap: Space.sm }}>
        <SkeletonLoader width="60%" height={TypographyV2.body.size} borderRadius={Radius.md} />
        <SkeletonLoader width="85%" height={TypographyV2.meta.size} borderRadius={Radius.sm} />
      </View>
      <SkeletonLoader width={Control.chrome} height={Control.chrome} borderRadius={Radius.xl} />
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