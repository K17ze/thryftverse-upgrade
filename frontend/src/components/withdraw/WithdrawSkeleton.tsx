import React from 'react';
import { View, StyleSheet } from 'react-native';
import { FlagshipScreen, FlagshipHeader } from '../flagship';
import { SkeletonLoader } from '../SkeletonLoader';
import { Space, Radius } from '../../theme/designTokens';

interface Props {
  onBack: () => void;
}

// Balance hydration skeleton: shows matching layout while balance loads.
// Prevents layout shift and provides immediate visual feedback on first render.
export function WithdrawSkeleton({ onBack }: Props) {
  return (
    <FlagshipScreen
      header={
        <FlagshipHeader
          title="Withdraw Balance"
          onBack={onBack}
          backIcon="arrow-back"
        />
      }
      scrollEnabled={false}
    >
      <View style={styles.skeletonContainer}>
        <SkeletonLoader width="60%" height={32} borderRadius={Radius.md} style={{ marginBottom: Space.lg }} />
        <SkeletonLoader width="100%" height={80} borderRadius={Radius.lg} style={{ marginBottom: Space.md }} />
        <SkeletonLoader width="100%" height={56} borderRadius={Radius.md} style={{ marginBottom: Space.sm }} />
        <SkeletonLoader width="100%" height={56} borderRadius={Radius.md} />
      </View>
    </FlagshipScreen>
  );
}

const styles = StyleSheet.create({
  skeletonContainer: { paddingHorizontal: Space.md + Space.xs, paddingTop: Space.md },
});
