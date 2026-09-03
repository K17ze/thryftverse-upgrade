import React from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import { SkeletonLoader } from '../SkeletonLoader';
import { Space, AspectRatio, Radius } from '../../theme/designTokens';
import { useAppTheme } from '../../theme/ThemeContext';

interface Props {
  numColumns?: number;
  itemCount?: number;
  horizontalPadding?: number;
  gap?: number;
}

/**
 * Natural masonry height-variation pattern (2026 Pinterest rhythm). The
 * values are offsets around a 175pt baseline, applied to the responsive
 * `baseHeight` so the skeleton matches the final render's masonry rhythm
 * across screen sizes instead of a uniform grid.
 */
const HEIGHT_PATTERN = [140, 190, 165, 210, 175, 200] as const;
const HEIGHT_PATTERN_BASELINE = 175;

/** Number of category pill placeholders in the skeleton bar. */
const CATEGORY_PILL_COUNT = 8;

/**
 * MasonrySkeleton — loading frame for the heterogeneous Discovery feed.
 *
 * Matches the final feed silhouette so there is no loading→final geometry
 * shift (AGENTS.md §4 / §14). The skeleton is NOT a uniform 2-column grid:
 * it includes a category pill bar, a full-width hero row, a full-width
 * context-break eyebrow, and naturally varying masonry column heights —
 * reflecting the authored feed rhythm produced by `assembleDiscoveryFeed`.
 *
 * Dimensions are read via `useWindowDimensions` (not module-level
 * `Dimensions.get('window')`) so the skeleton responds to rotation and
 * adaptive layout changes instead of being frozen at mount. Shimmer is
 * provided by the `SkeletonLoader` primitive (white sweep + brand tint),
 * which honours `useReducedMotion` internally.
 */
export function MasonrySkeleton({
  numColumns = 2,
  itemCount = 6,
  horizontalPadding = Space.md,
  gap = 3,
}: Props) {
  const { width: screenWidth } = useWindowDimensions();
  const { colors } = useAppTheme();
  const colWidth =
    (screenWidth - horizontalPadding * 2 - gap * (numColumns - 1)) / numColumns;
  // 3:4 portrait skeleton heights derived from the column width so the
  // loading frame matches the final render. The HEIGHT_PATTERN offsets are
  // applied around a baseline so variation is natural and responsive.
  const baseHeight = Math.round(colWidth / AspectRatio.portrait);
  const heights = HEIGHT_PATTERN.map(
    (h) => baseHeight + (h - HEIGHT_PATTERN_BASELINE),
  );

  // Reserve the first unit as a full-width hero (landscape skeleton), then a
  // context-break eyebrow, then the masonry columns — mirroring the real
  // feed's first viewport. This is what makes the skeleton match the final
  // silhouette instead of a uniform catalogue grid.
  const heroHeight = Math.round((screenWidth - horizontalPadding * 2) / AspectRatio.landscape);
  const remainingCount = Math.max(0, itemCount - 1);

  const columns: { height: number; index: number }[][] = Array.from({ length: numColumns }, () => []);
  const colHeights = Array.from({ length: numColumns }, () => 0);

  for (let i = 0; i < remainingCount; i++) {
    const shortestCol = colHeights.indexOf(Math.min(...colHeights));
    columns[shortestCol].push({ height: heights[i % heights.length], index: i });
    colHeights[shortestCol] += heights[i % heights.length] + gap + 42;
  }

  return (
    <View style={styles.container}>
      {/* Category pill bar skeleton — horizontal row of pill shapes with a
          hairline bottom border, matching DiscoverCategoryBar. */}
      <View style={[styles.categoryBar, { borderBottomColor: colors.borderSubtle }]}>
        <View style={styles.categoryPillRow}>
          {Array.from({ length: CATEGORY_PILL_COUNT }).map((_, i) => (
            <SkeletonLoader
              key={i}
              width={i === 0 ? 56 : 72}
              height={24}
              borderRadius={Radius.full}
            />
          ))}
        </View>
      </View>

      {/* Full-width hero skeleton — matches the hero listing row. */}
      <View style={{ paddingHorizontal: horizontalPadding }}>
        <SkeletonLoader width="100%" height={heroHeight} borderRadius={Radius.lg} />
        <SkeletonLoader width="45%" height={12} borderRadius={Radius.sm} style={{ marginTop: Space.sm }} />
      </View>

      {/* Context-break eyebrow skeleton — a quiet full-width line. */}
      <View style={{ paddingHorizontal: horizontalPadding, marginTop: Space.lg, marginBottom: Space.xs }}>
        <SkeletonLoader width="28%" height={10} borderRadius={Radius.sm} />
      </View>

      {/* Masonry columns — the single-column tiles. */}
      <View style={[styles.grid, { gap, paddingHorizontal: horizontalPadding }]}>
        {columns.map((columnItems, colIndex) => (
          <View key={colIndex} style={[styles.column, { width: colWidth, gap }]}>
            {columnItems.map(({ height, index }) => (
              <View key={index} style={styles.card}>
                <SkeletonLoader width="100%" height={height} borderRadius={Radius.lg} />
                <SkeletonLoader width="60%" height={12} borderRadius={Radius.sm} style={{ marginTop: 10 }} />
                <SkeletonLoader width="40%" height={10} borderRadius={Radius.sm} style={{ marginTop: 6 }} />
              </View>
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  categoryBar: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  categoryPillRow: {
    flexDirection: 'row',
    gap: Space.xs,
    alignItems: 'center',
  },
  grid: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  column: {
    flexDirection: 'column',
  },
  card: {
    marginBottom: Space.sm,
  },
});
