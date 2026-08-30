import React from 'react';
import { View, StyleSheet, StatusBar } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Radius, ProfileLayout } from '../../theme/designTokens';
import { SkeletonLoader } from '../SkeletonLoader';

const GRID_GAP = Space.sm;
const CARD_ASPECT = 1.25;
const LOOK_COLS = 2;
const LOOK_GAP = Space.xxs;

type SkeletonDestination = 'Listings' | 'Looks' | 'About' | 'Reviews';

interface ProfileSkeletonProps {
  coverHeight?: number;
  avatarSize?: number;
  screenWidth?: number;
  destination?: SkeletonDestination;
}

/**
 * Loading skeleton that mirrors the final seam-row composition exactly:
 *   cover → avatar at seam → 3 stats beside avatar → full-width identity →
 *   trust line → actions → primary rail → destination-specific content.
 *
 * Destination-specific content skeletons:
 *   Shop: four 4:5 tiles
 *   Looks: six two-column portrait tiles
 *   Reviews: reputation summary + three review rows
 *
 * No layout shift when data resolves.
 */
export function ProfileSkeleton({
  coverHeight = ProfileLayout.coverHeightSkeleton,
  avatarSize = ProfileLayout.avatarSkeleton,
  screenWidth,
  destination = 'Listings',
}: ProfileSkeletonProps) {
  const { colors, isDark } = useAppTheme();
  const avatarOverlap = avatarSize / 2;
  const cardW = screenWidth ? (screenWidth - Space.md * 2 - GRID_GAP) / 2 : 160;
  const cardH = cardW * CARD_ASPECT;
  const lookW = screenWidth ? (screenWidth - Space.md * 2 - LOOK_GAP * (LOOK_COLS - 1)) / LOOK_COLS : 110;
  const lookH = lookW * (4 / 3);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
      {/* Cover stage — exact final height */}
      <SkeletonLoader width="100%" height={coverHeight} borderRadius={Radius.none} />

      {/* Hero root — position relative for absolute avatar */}
      <View style={[styles.heroRoot, { backgroundColor: colors.background }]}>
        {/* Avatar skeleton — absolutely positioned at the seam */}
        <View style={[styles.skeletonAvatar, {
          width: avatarSize, height: avatarSize, borderRadius: avatarSize / 2,
          top: -avatarOverlap, left: Space.md,
          borderColor: colors.background,
        }]}>
          <SkeletonLoader width={avatarSize} height={avatarSize} borderRadius={avatarSize / 2} />
        </View>

        {/* Identity canvas — no top padding; seamRow reserves avatar overlap height */}
        <View style={[styles.skeletonBody, { paddingTop: 0 }]}>
          {/* Seam row — begins at canvas boundary, minHeight reserves avatar space */}
          <View style={[styles.skeletonSeamRow, { minHeight: avatarOverlap + Space.sm }]}>
            <View style={{ width: avatarSize + Space.sm }} />
            <View style={styles.skeletonSeamStats}>
              <SkeletonLoader width={40} height={36} borderRadius={Radius.sm} />
              <SkeletonLoader width={40} height={36} borderRadius={Radius.sm} />
              <SkeletonLoader width={40} height={36} borderRadius={Radius.sm} />
            </View>
          </View>

          {/* Identity — full-width, left-aligned */}
          <SkeletonLoader width={180} height={20} borderRadius={Radius.sm} style={{ marginBottom: 6 }} />
          <SkeletonLoader width={120} height={14} borderRadius={Radius.sm} style={{ marginBottom: Space.sm }} />
          <SkeletonLoader width="100%" height={14} borderRadius={Radius.sm} style={{ marginBottom: Space.xs }} />
          <SkeletonLoader width="60%" height={14} borderRadius={Radius.sm} style={{ marginBottom: Space.xs }} />

          {/* Trust line */}
          <SkeletonLoader width={160} height={13} borderRadius={Radius.sm} style={{ marginBottom: Space.sm }} />

          {/* Action row skeleton */}
          <View style={styles.skeletonActionRow}>
            <View style={styles.skeletonActionPrimary}>
              <SkeletonLoader width="100%" height={44} borderRadius={Radius.lg} />
            </View>
            <View style={styles.skeletonActionPrimary}>
              <SkeletonLoader width="100%" height={44} borderRadius={Radius.lg} />
            </View>
            <View style={styles.skeletonActionSecondary}>
              <SkeletonLoader width={44} height={44} borderRadius={Radius.lg} />
            </View>
          </View>

          {/* Tab rail skeleton */}
          <View style={styles.skeletonTabRail}>
            <SkeletonLoader width="100%" height={44} borderRadius={Radius.none} />
          </View>

          {/* Destination-specific content skeletons */}
          {destination === 'Listings' ? (
            <View style={styles.skeletonGrid}>
              <SkeletonLoader width={cardW} height={cardH} borderRadius={Radius.sm} />
              <SkeletonLoader width={cardW} height={cardH} borderRadius={Radius.sm} />
              <SkeletonLoader width={cardW} height={cardH} borderRadius={Radius.sm} />
              <SkeletonLoader width={cardW} height={cardH} borderRadius={Radius.sm} />
            </View>
          ) : destination === 'Looks' ? (
            <View style={styles.skeletonLookGrid}>
              {Array.from({ length: 6 }).map((_, i) => (
                <SkeletonLoader key={i} width={lookW} height={lookH} borderRadius={Radius.sm} />
              ))}
            </View>
          ) : (
            <View style={styles.skeletonReviews}>
              {/* Reputation summary skeleton */}
              <View style={styles.skeletonReviewSummary}>
                <SkeletonLoader width={60} height={60} borderRadius={Radius.sm} />
                <View style={styles.skeletonReviewDist}>
                  <SkeletonLoader width="100%" height={10} borderRadius={Radius.sm} />
                  <SkeletonLoader width="100%" height={10} borderRadius={Radius.sm} />
                  <SkeletonLoader width="100%" height={10} borderRadius={Radius.sm} />
                </View>
              </View>
              {/* Three review rows */}
              {[0, 1, 2].map((i) => (
                <View key={i} style={styles.skeletonReviewRow}>
                  <SkeletonLoader width={36} height={36} borderRadius={Radius.full} />
                  <View style={styles.skeletonReviewIdentity}>
                    <SkeletonLoader width="50%" height={12} borderRadius={Radius.sm} />
                    <SkeletonLoader width="30%" height={10} borderRadius={Radius.sm} style={{ marginTop: 4 }} />
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  heroRoot: { position: 'relative' },
  skeletonAvatar: {
    position: 'absolute',
    borderWidth: 3,
    zIndex: 10,
    overflow: 'hidden',
    borderRadius: Radius.full,
  },
  skeletonBody: { paddingHorizontal: Space.md, paddingBottom: Space.sm },
  // Seam row — begins at canvas boundary, minHeight reserves avatar overlap
  skeletonSeamRow: { flexDirection: 'row', alignItems: 'center', marginBottom: Space.xs },
  skeletonSeamStats: { flex: 1, flexDirection: 'row', justifyContent: 'space-around' },
  // Actions — flat 11pt radius
  skeletonActionRow: { flexDirection: 'row', gap: Space.sm, marginBottom: Space.sm },
  skeletonActionPrimary: { flex: 1, height: 44, borderRadius: Radius.lg, overflow: 'hidden' },
  skeletonActionSecondary: { width: 44, height: 44, borderRadius: Radius.lg, overflow: 'hidden' },
  // Tab rail
  skeletonTabRail: { height: 44, marginBottom: Space.md, overflow: 'hidden' },
  // Shop grid — 4:5 tiles
  skeletonGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP },
  // Looks grid — 2-column portrait
  skeletonLookGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: LOOK_GAP },
  // Reviews
  skeletonReviews: { gap: Space.sm },
  skeletonReviewSummary: { flexDirection: 'row', gap: Space.md, paddingVertical: Space.md },
  skeletonReviewDist: { flex: 1, gap: Space.xs },
  skeletonReviewRow: { flexDirection: 'row', alignItems: 'center', gap: Space.smMd, paddingVertical: Space.smMd },
  skeletonReviewIdentity: { flex: 1, gap: Space.xs },
});
