import React from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { SkeletonLoader } from '../SkeletonLoader';
import { Space, Radius } from '../../theme/designTokens';

const { width: SCREEN_W } = Dimensions.get('window');
const CARD_W = (SCREEN_W - Space.md * 2 - Space.sm) / 2;

interface Props {
  count?: number;
}

export function BoardSkeleton({ count = 4 }: Props) {
  return (
    <View style={styles.grid}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={styles.card}>
          <SkeletonLoader width="100%" height={CARD_W * 1.15} borderRadius={Radius.lg} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: Space.md,
    gap: Space.sm,
  },
  card: {
    width: CARD_W,
  },
});