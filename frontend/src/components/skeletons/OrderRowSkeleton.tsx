import React from 'react';
import { View, StyleSheet } from 'react-native';
import { SkeletonLoader } from '../SkeletonLoader';
import { Space, Radius } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';

interface Props {
  count?: number;
}

export function OrderRowSkeleton({ count = 4 }: Props) {
  return (
    <View style={styles.container}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={styles.row}>
          <SkeletonLoader width={80} height={100} borderRadius={Radius.md} />
          <View style={styles.textCol}>
            <View style={styles.metaRow}>
              <SkeletonLoader width={64} height={22} borderRadius={Radius.full} />
              <SkeletonLoader width={44} height={10} borderRadius={Radius.sm} />
            </View>
            <SkeletonLoader width="70%" height={TypographyV2.body.size} borderRadius={Radius.md} />
            <View style={styles.metaRow}>
              <SkeletonLoader width="45%" height={10} borderRadius={Radius.sm} />
              <SkeletonLoader width={48} height={14} borderRadius={Radius.sm} />
            </View>
          </View>
          <SkeletonLoader width={8} height={16} borderRadius={Radius.sm} style={styles.chevron} />
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
    alignItems: 'flex-start',
    paddingVertical: Space.md,
    gap: Space.md,
  },
  textCol: {
    flex: 1,
    gap: Space.xs / 2 + 1,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Space.sm,
  },
  chevron: {
    marginTop: 2,
  },
});