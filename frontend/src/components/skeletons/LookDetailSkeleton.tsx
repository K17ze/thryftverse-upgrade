import React from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { SkeletonLoader } from '../SkeletonLoader';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Radius, Typography } from '../../theme/designTokens';

const { width: SCREEN_W } = Dimensions.get('window');

// Mirrors the LookDetailScreen layout: full-bleed hero (SCREEN_W x SCREEN_W*1.15),
// editorial info section (eyebrow + caption + creator row), social actions row,
// and a horizontal "Shop the look" tray with 3 placeholder cards.
export function LookDetailSkeleton() {
  const { colors } = useAppTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Hero — matches heroWrap: SCREEN_W x SCREEN_W * 1.15 */}
      <SkeletonLoader width={SCREEN_W} height={SCREEN_W * 1.15} borderRadius={0} />

      {/* Info section — matches infoSection padding/gap */}
      <View style={styles.infoSection}>
        {/* Eyebrow */}
        <SkeletonLoader width={48} height={11} borderRadius={Radius.sm} />
        {/* Caption — 2 lines */}
        <SkeletonLoader width="92%" height={26} borderRadius={Radius.sm} />
        <SkeletonLoader width="68%" height={26} borderRadius={Radius.sm} />

        {/* Creator row */}
        <View style={styles.creatorRow}>
          <SkeletonLoader width={40} height={40} borderRadius={Radius.full} />
          <View style={styles.creatorInfo}>
            <SkeletonLoader width={120} height={14} borderRadius={Radius.sm} />
            <SkeletonLoader width={80} height={11} borderRadius={Radius.sm} style={{ marginTop: Space.xs }} />
          </View>
        </View>
      </View>

      {/* Social actions row — matches LookSocialActions layout */}
      <View style={styles.socialRow}>
        <SkeletonLoader width={44} height={44} borderRadius={Radius.full} />
        <SkeletonLoader width={44} height={44} borderRadius={Radius.full} />
        <SkeletonLoader width={44} height={44} borderRadius={Radius.full} />
        <View style={{ flex: 1 }} />
        <SkeletonLoader width={44} height={44} borderRadius={Radius.full} />
      </View>

      {/* Tray section — "Shop the look" rail */}
      <View style={styles.traySection}>
        <View style={styles.trayHeader}>
          <SkeletonLoader width={140} height={18} borderRadius={Radius.sm} />
          <SkeletonLoader width={60} height={12} borderRadius={Radius.sm} />
        </View>
        <View style={styles.trayScroll}>
          {Array.from({ length: 3 }).map((_, i) => (
            <View key={i} style={styles.trayCard}>
              <SkeletonLoader width={148} height={184} borderRadius={Radius.lg} />
              <SkeletonLoader width="80%" height={12} borderRadius={Radius.sm} style={{ marginTop: 6 }} />
              <SkeletonLoader width={50} height={11} borderRadius={Radius.sm} style={{ marginTop: Space.xs }} />
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  infoSection: {
    paddingHorizontal: Space.md,
    paddingTop: Space.lg,
    gap: Space.sm,
  },
  creatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    marginTop: 2,
  },
  creatorInfo: {
    gap: 2,
  },
  socialRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.md,
    paddingVertical: Space.md,
    gap: Space.sm,
  },
  traySection: {
    marginTop: Space.xl,
    paddingHorizontal: Space.md,
  },
  trayHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: Space.sm,
  },
  trayScroll: {
    flexDirection: 'row',
    gap: Space.sm,
    paddingRight: Space.md,
  },
  trayCard: {
    width: 148,
    gap: 6,
  },
});
