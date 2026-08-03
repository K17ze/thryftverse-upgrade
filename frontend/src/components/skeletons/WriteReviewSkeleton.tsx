import React from 'react';
import { View, StyleSheet } from 'react-native';
import { SkeletonLoader } from '../SkeletonLoader';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Radius } from '../../theme/designTokens';

// Mirrors WriteReviewScreen layout: order context card (thumbnail + title + meta),
// star rating row, text input area, photo upload section, submit button.
export function WriteReviewSkeleton() {
  const { colors } = useAppTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Order context card */}
      <View style={[styles.orderCard, { backgroundColor: colors.surface }]}>
        <SkeletonLoader width={56} height={56} borderRadius={Radius.md} />
        <View style={styles.orderInfo}>
          <SkeletonLoader width="80%" height={16} borderRadius={Radius.sm} />
          <SkeletonLoader width={100} height={12} borderRadius={Radius.sm} style={{ marginTop: 8 }} />
        </View>
      </View>

      {/* Rating prompt */}
      <View style={styles.section}>
        <SkeletonLoader width="70%" height={18} borderRadius={Radius.sm} />
        <View style={styles.starsRow}>
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonLoader key={i} width={44} height={44} borderRadius={Radius.full} />
          ))}
        </View>
      </View>

      {/* Detailed review input */}
      <View style={styles.section}>
        <SkeletonLoader width={180} height={11} borderRadius={Radius.sm} />
        <View style={[styles.inputCard, { backgroundColor: colors.surface }]}>
          <SkeletonLoader width="95%" height={13} borderRadius={Radius.sm} />
          <SkeletonLoader width="88%" height={13} borderRadius={Radius.sm} style={{ marginTop: 8 }} />
          <SkeletonLoader width="60%" height={13} borderRadius={Radius.sm} style={{ marginTop: 8 }} />
        </View>
      </View>

      {/* Photo section */}
      <View style={styles.section}>
        <SkeletonLoader width={140} height={11} borderRadius={Radius.sm} />
        <View style={[styles.photoAddBtn, { backgroundColor: colors.surface }]}>
          <SkeletonLoader width={22} height={22} borderRadius={Radius.full} />
          <SkeletonLoader width={100} height={13} borderRadius={Radius.sm} />
        </View>
      </View>

      {/* Submit button */}
      <View style={styles.submitRow}>
        <SkeletonLoader width="100%" height={52} borderRadius={Radius.full} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Space.md,
    paddingTop: Space.md,
    gap: Space.lg,
  },
  orderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    borderRadius: Radius.xl,
    padding: Space.md,
  },
  orderInfo: {
    flex: 1,
    gap: 4,
  },
  section: {
    gap: Space.sm,
  },
  starsRow: {
    flexDirection: 'row',
    gap: Space.sm,
    marginTop: Space.xs,
  },
  inputCard: {
    borderRadius: Radius.lg,
    padding: Space.md,
    minHeight: 120,
    gap: 2,
  },
  photoAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.sm,
    borderRadius: Radius.lg,
    paddingVertical: Space.md,
    marginTop: Space.xs,
  },
  submitRow: {
    marginTop: Space.sm,
  },
});
