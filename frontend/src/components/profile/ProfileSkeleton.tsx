import React from 'react';
import { View, StyleSheet, StatusBar } from 'react-native';
import { ActiveTheme, Colors } from '../../constants/colors';
import { Space, Radius } from '../../theme/designTokens';

const BG = Colors.background;
const BORDER = Colors.border;
const SURFACE_ALT = Colors.surfaceAlt;

const COVER_HEIGHT = 160;
const AVATAR_SIZE = 84;
const AVATAR_OVERLAP = AVATAR_SIZE / 2;
const GRID_GAP = 8;
const CARD_ASPECT = 1.25;
const LOOK_COLS = 3;
const LOOK_GAP = 2;

type SkeletonDestination = 'Shop' | 'Looks' | 'Reviews';

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
 *   Looks: nine three-column portrait tiles
 *   Reviews: reputation summary + three review rows
 *
 * No layout shift when data resolves.
 */
export function ProfileSkeleton({
  coverHeight = COVER_HEIGHT,
  avatarSize = AVATAR_SIZE,
  screenWidth,
  destination = 'Shop',
}: ProfileSkeletonProps) {
  const avatarOverlap = avatarSize / 2;
  const cardW = screenWidth ? (screenWidth - Space.md * 2 - GRID_GAP) / 2 : 160;
  const cardH = cardW * CARD_ASPECT;
  const lookW = screenWidth ? (screenWidth - Space.md * 2 - LOOK_GAP * (LOOK_COLS - 1)) / LOOK_COLS : 110;
  const lookH = lookW * (4 / 3);

  return (
    <View style={styles.container}>
      <StatusBar barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'} backgroundColor={BG} />
      {/* Cover stage — exact final height */}
      <View style={[styles.coverSkeleton, { height: coverHeight }]} />

      {/* Hero root — position relative for absolute avatar */}
      <View style={styles.heroRoot}>
        {/* Avatar skeleton — absolutely positioned at the seam */}
        <View style={[styles.skeletonAvatar, {
          width: avatarSize, height: avatarSize, borderRadius: avatarSize / 2,
          top: -avatarOverlap, left: Space.md,
        }]} />

        {/* Identity canvas — paddingTop reserves avatar space */}
        <View style={[styles.skeletonBody, { paddingTop: avatarOverlap + Space.sm }]}>
          {/* Seam row — 3 stats to the right of avatar */}
          <View style={styles.skeletonSeamRow}>
            <View style={{ width: avatarSize + Space.sm }} />
            <View style={styles.skeletonSeamStats}>
              <View style={styles.skeletonSeamStat} />
              <View style={styles.skeletonSeamStat} />
              <View style={styles.skeletonSeamStat} />
            </View>
          </View>

          {/* Identity — full-width, left-aligned */}
          <View style={styles.skeletonName} />
          <View style={styles.skeletonHandle} />
          <View style={styles.skeletonBioLine} />
          <View style={styles.skeletonBioLineShort} />

          {/* Trust line */}
          <View style={styles.skeletonTrustLine} />

          {/* Action row skeleton */}
          <View style={styles.skeletonActionRow}>
            <View style={styles.skeletonActionPrimary} />
            <View style={styles.skeletonActionPrimary} />
            <View style={styles.skeletonActionSecondary} />
          </View>

          {/* Tab rail skeleton */}
          <View style={styles.skeletonTabRail} />

          {/* Destination-specific content skeletons */}
          {destination === 'Shop' ? (
            <View style={styles.skeletonGrid}>
              <View style={[styles.skeletonCard, { width: cardW, height: cardH }]} />
              <View style={[styles.skeletonCard, { width: cardW, height: cardH }]} />
              <View style={[styles.skeletonCard, { width: cardW, height: cardH }]} />
              <View style={[styles.skeletonCard, { width: cardW, height: cardH }]} />
            </View>
          ) : destination === 'Looks' ? (
            <View style={styles.skeletonLookGrid}>
              {Array.from({ length: 9 }).map((_, i) => (
                <View key={i} style={[styles.skeletonLookCard, { width: lookW, height: lookH }]} />
              ))}
            </View>
          ) : (
            <View style={styles.skeletonReviews}>
              {/* Reputation summary skeleton */}
              <View style={styles.skeletonReviewSummary}>
                <View style={styles.skeletonReviewAvg} />
                <View style={styles.skeletonReviewDist}>
                  <View style={styles.skeletonDistRow} />
                  <View style={styles.skeletonDistRow} />
                  <View style={styles.skeletonDistRow} />
                </View>
              </View>
              {/* Three review rows */}
              <View style={styles.skeletonReviewRow}>
                <View style={styles.skeletonReviewAvatar} />
                <View style={styles.skeletonReviewIdentity}>
                  <View style={styles.skeletonReviewName} />
                  <View style={styles.skeletonReviewDate} />
                </View>
              </View>
              <View style={styles.skeletonReviewRow}>
                <View style={styles.skeletonReviewAvatar} />
                <View style={styles.skeletonReviewIdentity}>
                  <View style={styles.skeletonReviewName} />
                  <View style={styles.skeletonReviewDate} />
                </View>
              </View>
              <View style={styles.skeletonReviewRow}>
                <View style={styles.skeletonReviewAvatar} />
                <View style={styles.skeletonReviewIdentity}>
                  <View style={styles.skeletonReviewName} />
                  <View style={styles.skeletonReviewDate} />
                </View>
              </View>
            </View>
          )}
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
  // Seam row — 3 stats to the right of avatar
  skeletonSeamRow: { flexDirection: 'row', alignItems: 'center', marginBottom: Space.sm },
  skeletonSeamStats: { flex: 1, flexDirection: 'row', justifyContent: 'flex-end', gap: Space.lg },
  skeletonSeamStat: { width: 40, height: 36, borderRadius: 4, backgroundColor: SURFACE_ALT },
  // Identity — full-width
  skeletonName: { width: 180, height: 20, borderRadius: 4, backgroundColor: SURFACE_ALT, marginBottom: 6 },
  skeletonHandle: { width: 120, height: 14, borderRadius: 4, backgroundColor: SURFACE_ALT, marginBottom: Space.sm },
  skeletonBioLine: { width: '100%', height: 14, borderRadius: 4, backgroundColor: SURFACE_ALT, marginBottom: 4 },
  skeletonBioLineShort: { width: '60%', height: 14, borderRadius: 4, backgroundColor: SURFACE_ALT, marginBottom: Space.xs },
  // Trust line
  skeletonTrustLine: { width: 160, height: 13, borderRadius: 4, backgroundColor: SURFACE_ALT, marginBottom: Space.sm },
  // Actions — flat 11pt radius
  skeletonActionRow: { flexDirection: 'row', gap: 8, marginBottom: Space.sm },
  skeletonActionPrimary: { flex: 1, height: 44, borderRadius: 11, backgroundColor: SURFACE_ALT },
  skeletonActionSecondary: { width: 44, height: 44, borderRadius: 11, backgroundColor: SURFACE_ALT },
  // Tab rail
  skeletonTabRail: { height: 44, backgroundColor: SURFACE_ALT, marginBottom: Space.md },
  // Shop grid — 4:5 tiles
  skeletonGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP },
  skeletonCard: { borderRadius: Radius.sm, backgroundColor: SURFACE_ALT },
  // Looks grid — 3-column portrait
  skeletonLookGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: LOOK_GAP },
  skeletonLookCard: { borderRadius: 2, backgroundColor: SURFACE_ALT },
  // Reviews
  skeletonReviews: { gap: Space.sm },
  skeletonReviewSummary: { flexDirection: 'row', gap: Space.md, paddingVertical: Space.md },
  skeletonReviewAvg: { width: 60, height: 60, borderRadius: 4, backgroundColor: SURFACE_ALT },
  skeletonReviewDist: { flex: 1, gap: 4 },
  skeletonDistRow: { height: 8, borderRadius: 4, backgroundColor: SURFACE_ALT },
  skeletonReviewRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  skeletonReviewAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: SURFACE_ALT },
  skeletonReviewIdentity: { flex: 1, gap: 4 },
  skeletonReviewName: { width: 120, height: 14, borderRadius: 4, backgroundColor: SURFACE_ALT },
  skeletonReviewDate: { width: 80, height: 12, borderRadius: 4, backgroundColor: SURFACE_ALT },
});
