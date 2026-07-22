import React, { useMemo } from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import Reanimated, { FadeIn } from 'react-native-reanimated';
import { Listing } from '../../data/mockData';
import { ProductCardV2 } from '../ProductCardV2';
import { Space } from '../../theme/designTokens';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { resolveListingMediaAspectRatio } from '../../utils/listingMediaGeometry';

interface Props {
  items: Listing[];
  onPressItem: (item: Listing) => void;
  onPressSeller?: (item: Listing) => void;
  onMessageSeller?: (item: Listing) => void;
  numColumns?: number;
  showSaveButton?: boolean;
  visualOnly?: boolean;
  gap?: number;
  horizontalPadding?: number;
  enableEntranceAnimation?: boolean;
}

export function PinterestMasonryGrid({
  items,
  onPressItem,
  onPressSeller,
  onMessageSeller,
  numColumns = 2,
  showSaveButton = false,
  visualOnly = false,
  gap = Space.sm,
  horizontalPadding = Space.md,
  enableEntranceAnimation = true,
}: Props) {
  const { width: windowWidth } = useWindowDimensions();
  const reducedMotionEnabled = useReducedMotion();
  const colWidth = (windowWidth - horizontalPadding * 2 - gap * (numColumns - 1)) / numColumns;

  // True masonry: assign each item to the shortest column by cumulative height
  const columns = useMemo(() => {
    const cols: { item: Listing; index: number }[][] = Array.from({ length: numColumns }, () => []);
    const heights = Array.from({ length: numColumns }, () => 0);

    items.forEach((item, idx) => {
      const aspect = resolveListingMediaAspectRatio(item);
      const imgHeight = colWidth / aspect;
      const titleLines = item.title.length > 22 ? 2 : 1;
      const infoHeight = visualOnly ? 0 : 68 + titleLines * 19;
      const itemHeight = imgHeight + infoHeight + gap;

      // Find shortest column
      let shortestCol = 0;
      let shortestHeight = heights[0];
      for (let c = 1; c < numColumns; c++) {
        if (heights[c] < shortestHeight) {
          shortestCol = c;
          shortestHeight = heights[c];
        }
      }

      cols[shortestCol].push({ item, index: idx });
      heights[shortestCol] += itemHeight;
    });

    return cols;
  }, [items, numColumns, colWidth, gap, visualOnly]);

  return (
    <View style={[styles.grid, { gap, paddingHorizontal: horizontalPadding }]}>
      {items.length === 0 ? null : columns.map((columnItems, colIndex) => (
        <View key={colIndex} style={[styles.column, { width: colWidth, gap }]}>
          {columnItems.map(({ item, index }) => (
            enableEntranceAnimation && !reducedMotionEnabled ? (
              <Reanimated.View
                key={item.id}
                entering={FadeIn.duration(240).delay(Math.min(index, 6) * 35)}
              >
                <ProductCardV2
                  item={item}
                  onPress={() => onPressItem(item)}
                  index={index}
                  showSaveButton={showSaveButton}
                  visualOnly={visualOnly}
                  mediaAspectRatio={resolveListingMediaAspectRatio(item)}
                  enableEntranceAnimation={false}
                  onPressSeller={onPressSeller ? () => onPressSeller(item) : undefined}
                  onMessageSeller={onMessageSeller ? () => onMessageSeller(item) : undefined}
                />
              </Reanimated.View>
            ) : (
              <ProductCardV2
                key={item.id}
                item={item}
                onPress={() => onPressItem(item)}
                index={index}
                showSaveButton={showSaveButton}
                visualOnly={visualOnly}
                mediaAspectRatio={resolveListingMediaAspectRatio(item)}
                enableEntranceAnimation={false}
                onPressSeller={onPressSeller ? () => onPressSeller(item) : undefined}
                onMessageSeller={onMessageSeller ? () => onMessageSeller(item) : undefined}
              />
            )
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
});
