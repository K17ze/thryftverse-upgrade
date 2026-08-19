import React from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import { SkeletonLoader } from '../SkeletonLoader';
import { Space, AspectRatio, Radius } from '../../theme/designTokens';

interface Props {
  numColumns?: number;
  itemCount?: number;
  horizontalPadding?: number;
  gap?: number;
}

/**
 * MasonrySkeleton — loading frame for the heterogeneous Discovery feed.
 *
 * Matches the final feed silhouette so there is no loading→final geometry
 * shift (AGENTS.md §4 / §14). The skeleton is NOT a uniform 2-column grid:
 * it includes a full-width hero row and a full-width context-break eyebrow,
 * reflecting the authored feed rhythm produced by `assembleDiscoveryFeed`.
 *
 * Dimensions are read via `useWindowDimensions` (not module-level
 * `Dimensions.get('window')`) so the skeleton responds to rotation and
 * adaptive layout changes instead of being frozen at mount.
 */
export function MasonrySkeleton({
  numColumns = 2,
  itemCount = 6,
  horizontalPadding = Space.md,
  gap = 3,
}: Props) {
  const { width: screenWidth } = useWindowDimensions();
  const colWidth =
    (screenWidth - horizontalPadding * 2 - gap * (numColumns - 1)) / numColumns;
  // 3:4 portrait skeleton heights derived from the column width so the
  // loading frame matches the final render. Small variation preserves the
  // masonry rhythm.
  const baseHeight = Math.round(colWidth / AspectRatio.portrait);
  const heights = [
    baseHeight - 14,
    baseHeight + 18,
    baseHeight - 24,
    baseHeight + 8,
    baseHeight - 4,
    baseHeight - 18,
  ];

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
      {/* Full-width hero skeleton — matches the hero listing row. */}
      <View style={{ paddingHorizontal: horizontalPadding }}>
        <SkeletonLoader width="100%" height={heroHeight} borderRadius={Radius.lg} />
        <SkeletonLoader width="45%" height={12} borderRadius={Radius.sm} style={{ marginTop: 8 }} />
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
