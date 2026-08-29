import React from 'react';
import { View, Dimensions, StyleSheet } from 'react-native';
import { SkeletonLoader } from '../SkeletonLoader';
import { useAppTheme } from '../../theme/ThemeContext';

import { Radius, Space, AvatarSize } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';

const { width: W } = Dimensions.get('window');

// ── Geometry constants — mirror MyProfileScreen exact final layout ──
const COVER_HEIGHT = 152;
const AVATAR_SIZE = AvatarSize.identity;
const GRID_COLS = 3;
const GRID_GAP = Space.xs;
const CARD_WIDTH = (W - Space.md * 2 - GRID_GAP * (GRID_COLS - 1)) / GRID_COLS;
const CARD_HEIGHT = CARD_WIDTH * (4 / 3); // 3:4 portrait

/**
 * ProfileSkeleton — deterministic skeleton matching the exact final
 * geometry of MyProfileScreen.
 *
 * Layout (top to bottom):
 *  1. Full-width cover (152px)
 *  2. Avatar (84px circle) overlapping the cover seam
 *  3. Identity block (display name, username, bio line)
 *  4. Stats row (listings / looks / sold)
 *  5. Tab rail (Listings / Looks / About)
 *  6. 3-column listing grid (3:4 portrait cards)
 *
 * The skeleton preserves the same spacing, widths, and aspect ratios
 * as the final render so there is no layout shift when content loads
 * (AGENTS.md §14, §16).
 */
export function ProfileSkeleton() {
  const { colors } = useAppTheme();

  return (
    <View style={styles.container}>
      {/* ── 1. Full-width cover ── */}
      <SkeletonLoader
        width={W}
        height={COVER_HEIGHT}
        borderRadius={Radius.none}
      />

      {/* ── 2–4. Identity hero + stats (offset to overlap cover seam) ── */}
      <View style={styles.heroBlock}>
        {/* Avatar — overlaps the cover by ~40px */}
        <SkeletonLoader
          width={AVATAR_SIZE}
          height={AVATAR_SIZE}
          borderRadius={Radius.full}
          style={styles.avatar}
        />

        {/* Display name */}
        <SkeletonLoader
          width={160}
          height={TypographyV2.screenTitle.size}
          borderRadius={Radius.sm}
          style={styles.skeletonName}
        />

        {/* Username */}
        <SkeletonLoader
          width={120}
          height={TypographyV2.meta.size}
          borderRadius={Radius.sm}
          style={styles.skeletonUsername}
        />

        {/* Bio line */}
        <SkeletonLoader
          width={W - Space.md * 2}
          height={TypographyV2.body.size}
          borderRadius={Radius.sm}
          style={styles.skeletonBio}
        />

        {/* Stats row — 3 compact stat blocks */}
        <View style={styles.statsRow}>
          {Array.from({ length: 3 }).map((_, i) => (
            <View key={i} style={styles.statItem}>
              <SkeletonLoader
                width={48}
                height={TypographyV2.bodyStrong.size}
                borderRadius={Radius.sm}
              />
              <SkeletonLoader
                width={56}
                height={TypographyV2.meta.size}
                borderRadius={Radius.sm}
                style={{ marginTop: Space.xs }}
              />
            </View>
          ))}
        </View>
      </View>

      {/* ── 5. Tab rail ── */}
      <View style={styles.tabRail}>
        {Array.from({ length: 3 }).map((_, i) => (
          <SkeletonLoader
            key={i}
            width={70}
            height={TypographyV2.bodyStrong.size}
            borderRadius={Radius.sm}
          />
        ))}
      </View>

      {/* ── 6. Listing grid — 3 columns × 2 rows of 3:4 portrait cards ── */}
      <View style={styles.grid}>
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonLoader
            key={i}
            width={CARD_WIDTH}
            height={CARD_HEIGHT}
            borderRadius={Radius.sm}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent' },
  heroBlock: {
    paddingHorizontal: Space.md,
    alignItems: 'center',
    marginTop: -AVATAR_SIZE / 2 - 8,
    gap: Space.xs },
  avatar: {
    marginBottom: Space.xs },
  skeletonName: {
    marginTop: Space.xs },
  skeletonUsername: {
    marginTop: Space.xxs },
  skeletonBio: {
    marginTop: Space.sm },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    paddingVertical: Space.md,
    gap: Space.sm },
  statItem: {
    alignItems: 'center' },
  tabRail: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    gap: Space.md },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: Space.md,
    gap: GRID_GAP } });
