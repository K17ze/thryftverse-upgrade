import React from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { SkeletonLoader } from '../SkeletonLoader';
import { Space, AspectRatio, Radius } from '../../theme/designTokens';

const { width: SCREEN_W } = Dimensions.get('window');

interface Props {
  numColumns?: number;
  itemCount?: number;
  horizontalPadding?: number;
  gap?: number;
}

export function MasonrySkeleton({
  numColumns = 2,
  itemCount = 6,
  horizontalPadding = Space.md,
  gap = 3,
}: Props) {
  const colWidth = (SCREEN_W - horizontalPadding * 2 - gap * (numColumns - 1)) / numColumns;
  // 3:4 portrait skeleton heights derived from the column width so the
  // loading frame matches the final render (no loading→final geometry shift,
  // AGENTS.md §4 / §14). Small variation preserves the masonry rhythm.
  const baseHeight = Math.round(colWidth / AspectRatio.portrait);
  const heights = [
    baseHeight - 14,
    baseHeight + 18,
    baseHeight - 24,
    baseHeight + 8,
    baseHeight - 4,
    baseHeight - 18,
  ];

  const columns: { height: number; index: number }[][] = Array.from({ length: numColumns }, () => []);
  const colHeights = Array.from({ length: numColumns }, () => 0);

  for (let i = 0; i < itemCount; i++) {
    const shortestCol = colHeights.indexOf(Math.min(...colHeights));
    columns[shortestCol].push({ height: heights[i % heights.length], index: i });
    colHeights[shortestCol] += heights[i % heights.length] + gap + 42;
  }

  return (
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
  );
}

const styles = StyleSheet.create({
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