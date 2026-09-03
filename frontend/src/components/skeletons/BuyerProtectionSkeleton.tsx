import React from 'react';
import { View, StyleSheet } from 'react-native';
import { SkeletonLoader } from '../SkeletonLoader';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Radius, Stroke} from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';

// Mirrors BuyerProtectionScreen layout: coverage summary card (icon + title + subtitle + detail rows),
// "What's covered" section card with checklist, claims history placeholder, claim CTA button.
export function BuyerProtectionSkeleton() {
  const { colors } = useAppTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Coverage summary card */}
      <View style={[styles.coverageCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.coverageHeader}>
          <SkeletonLoader width={48} height={48} borderRadius={Radius.full} />
          <View style={styles.coverageHeaderText}>
            <SkeletonLoader width={140} height={TypographyV2.itemTitle.size} borderRadius={Radius.sm} />
            <SkeletonLoader width={180} height={13} borderRadius={Radius.sm} style={{ marginTop: 6 }} />
          </View>
        </View>
        {/* Detail rows */}
        <View style={styles.coverageDetails}>
          <View style={styles.detailRow}>
            <SkeletonLoader width={140} height={13} borderRadius={Radius.sm} />
            <SkeletonLoader width={70} height={13} borderRadius={Radius.sm} />
          </View>
          <View style={styles.detailRow}>
            <SkeletonLoader width={130} height={13} borderRadius={Radius.sm} />
            <SkeletonLoader width={70} height={13} borderRadius={Radius.sm} />
          </View>
          <View style={styles.detailRow}>
            <SkeletonLoader width={100} height={13} borderRadius={Radius.sm} />
            <SkeletonLoader width={90} height={13} borderRadius={Radius.sm} />
          </View>
        </View>
      </View>

      {/* What's covered section */}
      <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <SkeletonLoader width={130} height={TypographyV2.sectionTitle.size} borderRadius={Radius.sm} />
        <View style={styles.coverageList}>
          {Array.from({ length: 4 }).map((_, i) => (
            <View key={i} style={styles.coverageItem}>
              <SkeletonLoader width={18} height={18} borderRadius={Radius.full} />
              <SkeletonLoader width={180} height={TypographyV2.body.size} borderRadius={Radius.sm} />
            </View>
          ))}
        </View>
      </View>

      {/* Claim CTA button */}
      <SkeletonLoader width="100%" height={52} borderRadius={Radius.full} style={{ marginTop: Space.md }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Space.md,
    paddingTop: Space.md,
    gap: Space.md,
  },
  coverageCard: {
    borderRadius: Radius.xl,
    padding: Space.md,
    borderWidth: Stroke.standard,
  },
  coverageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
  },
  coverageHeaderText: {
    flex: 1,
    gap: Space.xs,
  },
  coverageDetails: {
    marginTop: Space.md,
    gap: Space.sm,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionCard: {
    borderRadius: Radius.xl,
    padding: Space.md,
    borderWidth: Stroke.standard,
    gap: Space.sm,
  },
  coverageList: {
    gap: Space.sm,
    marginTop: Space.xs,
  },
  coverageItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
});
