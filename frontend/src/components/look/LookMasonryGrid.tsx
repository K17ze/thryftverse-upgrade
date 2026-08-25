import React, { useMemo, useCallback } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { FlashList } from '@shopify/flash-list';
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
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const handlePress = useCallback(
    (lookId: string) => onPress(lookId),
    [onPress]
  );

  const keyExtractor = useCallback(
    (item: LookApiItem) => item.id,
    [],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: LookApiItem; index: number }) => (
      <View style={{ paddingHorizontal: gap / 2, paddingBottom: gap, width: '100%' }}>
        <LookMasonryTile
          look={item}
          onPress={handlePress}
          aspectRatio={aspectRatio}
          testID={testIDPrefix && index === 0 ? `${testIDPrefix}-first` : undefined}
        />
      </View>
    ),
    [handlePress, aspectRatio, gap, testIDPrefix],
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
      numColumns={2}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      ListFooterComponent={ListFooterComponent}
      scrollEnabled={false}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: Math.max(horizontalPadding - gap / 2, 0) }}
    />
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  loadingMore: {
    alignItems: 'center',
    paddingVertical: Space.md,
  },
});
