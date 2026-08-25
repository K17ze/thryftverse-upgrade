import React, { useMemo, useCallback } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { useWindowDimensions } from 'react-native';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space } from '../../theme/designTokens';
import type { LookApiItem } from '../../services/looksApi';
import { LookMasonryTile } from './LookMasonryTile';

export interface LookMasonryGridProps {
  looks: LookApiItem[];
  onPress: (lookId: string) => void;
  /** Aspect ratio override for all tiles. If not provided, uses 4/5 for all. */
  aspectRatio?: number;
  isLoadingMore?: boolean;
  horizontalPadding?: number;
  gap?: number;
  testIDPrefix?: string;
}

export function LookMasonryGrid({
  looks,
  onPress,
  aspectRatio = 4 / 5,
  isLoadingMore = false,
  horizontalPadding = Space.md,
  gap = Space.sm,
  testIDPrefix,
}: LookMasonryGridProps) {
  const { width: windowWidth } = useWindowDimensions();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors, horizontalPadding, gap), [colors, horizontalPadding, gap]);

  // Column width for the masonry
  const colWidth = Math.max(1, Math.floor((windowWidth - horizontalPadding * 2 - gap) / 2));

  // Distribute items into 2 columns by assigning each to the shorter column.
  // Since we use a fixed aspect ratio, we can compute cumulative height precisely.
  const { leftColumn, rightColumn } = useMemo(() => {
    const left: { item: LookApiItem; index: number }[] = [];
    const right: { item: LookApiItem; index: number }[] = [];
    let leftHeight = 0;
    let rightHeight = 0;
    const tileHeight = colWidth / aspectRatio;

    looks.forEach((item, index) => {
      if (leftHeight <= rightHeight) {
        left.push({ item, index });
        leftHeight += tileHeight + gap;
      } else {
        right.push({ item, index });
        rightHeight += tileHeight + gap;
      }
    });

    return { leftColumn: left, rightColumn: right };
  }, [looks, colWidth, aspectRatio, gap]);

  const handlePress = useCallback(
    (lookId: string) => onPress(lookId),
    [onPress]
  );

  if (looks.length === 0) return null;

  return (
    <View>
      <View style={styles.container}>
        <View style={styles.column}>
          {leftColumn.map(({ item, index }) => (
            <LookMasonryTile
              key={item.id}
              look={item}
              onPress={handlePress}
              aspectRatio={aspectRatio}
              testID={testIDPrefix && index === 0 ? `${testIDPrefix}-first` : undefined}
            />
          ))}
        </View>
        <View style={styles.column}>
          {rightColumn.map(({ item }) => (
            <LookMasonryTile
              key={item.id}
              look={item}
              onPress={handlePress}
              aspectRatio={aspectRatio}
            />
          ))}
        </View>
      </View>
      {isLoadingMore && (
        <View style={styles.loadingMore}>
          <ActivityIndicator size="small" color={colors.textMuted} />
        </View>
      )}
    </View>
  );
}

const createStyles = (colors: ThemeColors, horizontalPadding: number, gap: number) => StyleSheet.create({
  container: {
    flexDirection: 'row',
    paddingHorizontal: horizontalPadding,
    gap,
  },
  column: {
    flex: 1,
    gap,
  },
  loadingMore: {
    alignItems: 'center',
    paddingVertical: Space.md,
  },
});
