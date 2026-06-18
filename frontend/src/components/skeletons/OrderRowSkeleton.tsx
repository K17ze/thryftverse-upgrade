import React from 'react';
import { View, StyleSheet } from 'react-native';
import { SkeletonLoader } from '../SkeletonLoader';
import { Space, Radius } from '../../theme/designTokens';

interface Props {
  count?: number;
}

export function OrderRowSkeleton({ count = 4 }: Props) {
  return (
    <View style={styles.container}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={styles.row}>
          <SkeletonLoader width={64} height={64} borderRadius={Radius.md} />
          <View style={styles.textCol}>
            <SkeletonLoader width="70%" height={14} borderRadius={7} />
            <SkeletonLoader width="45%" height={10} borderRadius={5} style={{ marginTop: 8 }} />
            <SkeletonLoader width="30%" height={10} borderRadius={5} style={{ marginTop: 6 }} />
          </View>
          <SkeletonLoader width={56} height={24} borderRadius={Radius.sm} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Space.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
  },
  textCol: {
    flex: 1,
  },
});