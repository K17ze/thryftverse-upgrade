import React from 'react';
import { View, StyleSheet, StatusBar } from 'react-native';
import { ActiveTheme, Colors } from '../../constants/colors';
import { Space, Radius } from '../../theme/designTokens';

const BG = Colors.background;
const BORDER = Colors.border;
const SURFACE_ALT = Colors.surfaceAlt;

const COVER_HEIGHT = 168;
const AVATAR_SIZE = 84;
const AVATAR_OVERLAP = AVATAR_SIZE / 2;
const GRID_GAP = 8;
const CARD_ASPECT = 1.25;
const LOOK_COLS = 3;
const LOOK_GAP = 2;

interface ProfileSkeletonProps {
  coverHeight?: number;
  avatarSize?: number;
  screenWidth?: number;
}

/**
 * Loading skeleton that mirrors the final cover/avatar/identity/proof/actions/tabs/grid geometry.
 * Avatar is absolutely positioned at the exact cover/canvas seam — same as the loaded state.
 * No layout shift when data resolves.
 */
export function ProfileSkeleton({ coverHeight = COVER_HEIGHT, avatarSize = AVATAR_SIZE, screenWidth }: ProfileSkeletonProps) {
  const avatarOverlap = avatarSize / 2;
  const cardW = screenWidth ? (screenWidth - Space.md * 2 - GRID_GAP) / 2 : 160;
  const cardH = cardW * CARD_ASPECT;
  const lookW = screenWidth ? (screenWidth - Space.md * 2 - LOOK_GAP * (LOOK_COLS - 1)) / LOOK_COLS : 110;

  return (
    <View style={styles.container}>
      <StatusBar barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'} backgroundColor={BG} />
      {/* Cover stage — exact final height */}
      <View style={[styles.coverSkeleton, { height: coverHeight }]} />

      {/* Hero root — position relative for absolute avatar, same as loaded state */}
      <View style={styles.heroRoot}>
        {/* Avatar skeleton — absolutely positioned at the seam */}
        <View style={[styles.skeletonAvatar, {
          width: avatarSize, height: avatarSize, borderRadius: avatarSize / 2,
          top: -avatarOverlap, left: Space.md,
        }]} />

        {/* Identity canvas — paddingTop reserves avatar space */}
        <View style={[styles.skeletonBody, { paddingTop: avatarOverlap + Space.sm }]}>
          {/* Name + handle — aligned to the right of the avatar */}
          <View style={[styles.skeletonName, { marginLeft: avatarSize + Space.sm }]} />
          <View style={[styles.skeletonHandle, { marginLeft: avatarSize + Space.sm }]} />

          {/* Proof system skeleton — 4 equal cells */}
          <View style={styles.skeletonProofRow}>
            <View style={styles.skeletonProofCell} />
            <View style={styles.skeletonProofCell} />
            <View style={styles.skeletonProofCell} />
            <View style={styles.skeletonProofCell} />
          </View>

          {/* Action row skeleton */}
          <View style={styles.skeletonActionRow}>
            <View style={styles.skeletonActionPrimary} />
            <View style={styles.skeletonActionSecondary} />
          </View>

          {/* Tab rail skeleton */}
          <View style={styles.skeletonTabRail} />

          {/* Grid skeletons — 4:5 tiles for Shop */}
          <View style={styles.skeletonGrid}>
            <View style={[styles.skeletonCard, { width: cardW, height: cardH }]} />
            <View style={[styles.skeletonCard, { width: cardW, height: cardH }]} />
            <View style={[styles.skeletonCard, { width: cardW, height: cardH }]} />
            <View style={[styles.skeletonCard, { width: cardW, height: cardH }]} />
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  coverSkeleton: { backgroundColor: SURFACE_ALT },
  heroRoot: { position: 'relative', backgroundColor: BG },
  skeletonAvatar: {
    position: 'absolute',
    backgroundColor: SURFACE_ALT,
    borderWidth: 3,
    borderColor: BG,
    zIndex: 10,
  },
  skeletonBody: { paddingHorizontal: Space.md, paddingBottom: Space.sm },
  skeletonName: { width: 180, height: 22, borderRadius: 4, backgroundColor: SURFACE_ALT, marginBottom: 6 },
  skeletonHandle: { width: 120, height: 14, borderRadius: 4, backgroundColor: SURFACE_ALT, marginBottom: Space.sm },
  skeletonProofRow: {
    flexDirection: 'row',
    paddingVertical: Space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: BORDER,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
    marginBottom: Space.sm,
  },
  skeletonProofCell: { flex: 1, height: 40, borderRadius: 4, backgroundColor: SURFACE_ALT, marginHorizontal: 2 },
  skeletonActionRow: { flexDirection: 'row', gap: Space.sm, marginBottom: Space.sm },
  skeletonActionPrimary: { flex: 1, height: 44, borderRadius: 22, backgroundColor: SURFACE_ALT },
  skeletonActionSecondary: { width: 44, height: 44, borderRadius: 22, backgroundColor: SURFACE_ALT },
  skeletonTabRail: { height: 44, backgroundColor: SURFACE_ALT, marginBottom: Space.md },
  skeletonGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP },
  skeletonCard: { borderRadius: Radius.sm, backgroundColor: SURFACE_ALT },
});
