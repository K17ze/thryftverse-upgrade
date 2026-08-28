import React, { useMemo, useCallback } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space } from '../../theme/designTokens';
import type { LookApiItem } from '../../services/looksApi';
import { LookMasonryTile } from './LookMasonryTile';
import { resolveLookTemplate } from '../../utils/lookTemplates';

export interface LookMasonryGridProps {
  looks: LookApiItem[];
  onPress: (lookId: string) => void;
  /** Aspect ratio override for all tiles. If not provided, uses template-driven
   *  aspect ratios for masonry rhythm. */
  aspectRatio?: number;
  isLoadingMore?: boolean;
  horizontalPadding?: number;
  gap?: number;
  testIDPrefix?: string;
  /** Number of columns. Defaults to 2. Set to 3 for Instagram-style Explore density. */
  numColumns?: 2 | 3;
  /** When true, renders tiles in explore variant (media badges, no text overlays)
   *  and uses tighter spacing for discovery density. */
  isExplore?: boolean;
}

export function LookMasonryGrid({
  looks,
  onPress,
  aspectRatio,
  isLoadingMore = false,
  horizontalPadding,
  gap,
  testIDPrefix,
  numColumns = 2,
  isExplore = false,
}: LookMasonryGridProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // Explore mode uses tighter gutters for Instagram-style density (4–8px).
  // Default mode keeps the original 8px gutter for the 2-column masonry.
  const resolvedGap = gap ?? (isExplore ? Space.xs : Space.sm);
  const resolvedPadding = horizontalPadding ?? (isExplore ? Space.xs : Space.md);

  const handlePress = useCallback(
    (lookId: string) => onPress(lookId),
    [onPress]
  );

  const keyExtractor = useCallback(
    (item: LookApiItem) => item.id,
    [],
  );

  // When a fixed aspectRatio is provided, all tiles use it (legacy mode).
  // Otherwise, tiles use template-driven aspect ratios for masonry rhythm.
  const useTemplates = aspectRatio === undefined;

  const renderItem = useCallback(
    ({ item, index }: { item: LookApiItem; index: number }) => {
      const template = useTemplates
        ? resolveLookTemplate(item, index, numColumns === 3 ? 2 : 2)
        : null;
      const tileAspect = template?.aspect ?? aspectRatio ?? 4 / 5;

      return (
        <View style={{ paddingHorizontal: resolvedGap / 2, paddingBottom: resolvedGap, width: '100%' }}>
          <LookMasonryTile
            look={item}
            onPress={handlePress}
            aspectRatio={tileAspect}
            variant={isExplore ? 'explore' : 'default'}
            testID={testIDPrefix && index === 0 ? `${testIDPrefix}-first` : undefined}
          />
        </View>
      );
    },
    [handlePress, useTemplates, aspectRatio, resolvedGap, isExplore, testIDPrefix, numColumns],
  );

  const overrideItemLayout = useCallback(
    (
      layout: { span?: number },
      item: LookApiItem,
      index: number,
    ) => {
      if (!useTemplates) return;
      const template = resolveLookTemplate(item, index, numColumns === 3 ? 2 : 2);
      if (template.span > 1) {
        layout.span = template.span;
      }
    },
    [useTemplates, numColumns],
  );

  const ListFooterComponent = useMemo(
    () =>
      isLoadingMore ? (
        <View style={styles.loadingMore}>
          <ActivityIndicator size="small" color={colors.textMuted} />
        </View>
      ) : null,
    [isLoadingMore, styles, colors.textMuted],
  );

  if (looks.length === 0) return null;

  return (
    <FlashList
      data={looks}
      masonry
      numColumns={numColumns}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      overrideItemLayout={overrideItemLayout}
      ListFooterComponent={ListFooterComponent}
      scrollEnabled={false}
      showsVerticalScrollIndicator={false}
      optimizeItemArrangement={false}
      contentContainerStyle={{ paddingHorizontal: Math.max(resolvedPadding - resolvedGap / 2, 0) }}
    />
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  loadingMore: {
    alignItems: 'center',
    paddingVertical: Space.md,
  },
});
