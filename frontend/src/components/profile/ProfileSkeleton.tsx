import React from 'react';
import { View, StyleSheet, StatusBar } from 'react-native';
import { ActiveTheme, Colors } from '../../constants/colors';
import { Space, Radius } from '../../theme/designTokens';

const BG = Colors.background;
const SURFACE_ALT = Colors.surfaceAlt;

const COVER_HEIGHT = 176;
const AVATAR_SIZE = 88;
const AVATAR_OVERLAP = AVATAR_SIZE / 2;
const GRID_GAP = 8;
const CARD_ASPECT = 1.25;

interface ProfileSkeletonProps {
  coverHeight?: number;
  avatarSize?: number;
}

/**
 * Loading skeleton that mirrors the final cover/avatar/identity/stats/actions/tabs/grid geometry.
 * No floating avatar in the wrong position — the avatar sits at the exact cover/canvas seam.
 */
export function ProfileSkeleton({ coverHeight = COVER_HEIGHT, avatarSize = AVATAR_SIZE }: ProfileSkeletonProps) {
  const avatarOverlap = avatarSize / 2;
  return (
    <View style={styles.container}>
      <StatusBar barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'} backgroundColor={BG} />
      {/* Cover stage — exact final height */}
      <View style={[styles.coverSkeleton, { height: coverHeight }]} />
      {/* Identity canvas — lifted to meet avatar at the seam */}
      <View style={[styles.skeletonBody, { paddingTop: avatarOverlap + Space.sm }]}>
        <View style={[styles.skeletonAvatar, { width: avatarSize, height: avatarSize, borderRadius: avatarSize / 2 }]} />
        <View style={styles.skeletonName} />
        <View style={styles.skeletonHandle} />
        <View style={styles.skeletonStatsRow}>
          <View style={styles.skeletonStat} />
          <View style={styles.skeletonStat} />
          <View style={styles.skeletonStat} />
          <View style={styles.skeletonStat} />
        </View>
        <View style={styles.skeletonActionRow}>
          <View style={styles.skeletonActionPrimary} />
          <View style={styles.skeletonActionSecondary} />
        </View>
        <View style={styles.skeletonTabRail} />
        <View style={styles.skeletonGrid}>
          <View style={styles.skeletonCard} />
          <View style={styles.skeletonCard} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  coverSkeleton: { backgroundColor: SURFACE_ALT },
  skeletonBody: { paddingHorizontal: Space.md },
  skeletonAvatar: { backgroundColor: SURFACE_ALT, marginBottom: Space.sm },
  skeletonName: { width: 180, height: 22, borderRadius: 4, backgroundColor: SURFACE_ALT, marginBottom: 6 },
  skeletonHandle: { width: 120, height: 14, borderRadius: 4, backgroundColor: SURFACE_ALT, marginBottom: Space.md },
  skeletonStatsRow: { flexDirection: 'row', gap: Space.md, marginBottom: Space.md },
  skeletonStat: { flex: 1, height: 36, borderRadius: 4, backgroundColor: SURFACE_ALT },
  skeletonActionRow: { flexDirection: 'row', gap: Space.sm, marginBottom: Space.md },
  skeletonActionPrimary: { flex: 1, height: 44, borderRadius: 22, backgroundColor: SURFACE_ALT },
  skeletonActionSecondary: { width: 44, height: 44, borderRadius: 22, backgroundColor: SURFACE_ALT },
  skeletonTabRail: { height: 44, backgroundColor: SURFACE_ALT, marginBottom: Space.md },
  skeletonGrid: { flexDirection: 'row', gap: GRID_GAP },
  skeletonCard: { flex: 1, aspectRatio: 1 / CARD_ASPECT, borderRadius: Radius.sm, backgroundColor: SURFACE_ALT },
});
