import React, { useMemo } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { Listing } from '../../data/mockData';
import { ProductCardV2 } from '../ProductCardV2';
import { Space } from '../../theme/designTokens';

const { width: SCREEN_W } = Dimensions.get('window');

interface Props {
  items: Listing[];
  onPressItem: (item: Listing) => void;
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
  numColumns = 2,
  showSaveButton = false,
  visualOnly = false,
  gap = 3,
  horizontalPadding = Space.md,
  enableEntranceAnimation = true,
}: Props) {
  const colWidth = (SCREEN_W - horizontalPadding * 2 - gap * (numColumns - 1)) / numColumns;

  // True masonry: assign each item to the shortest column by cumulative height
  const columns = useMemo(() => {
    const cols: { item: Listing; index: number }[][] = Array.from({ length: numColumns }, () => []);
    const heights = Array.from({ length: numColumns }, () => 0);

    const ASPECT_RATIOS = [0.75, 1.0, 1.25, 1.5];

    items.forEach((item, idx) => {
      const aspect = ASPECT_RATIOS[item.id.charCodeAt(0) % ASPECT_RATIOS.length];
      const imgHeight = colWidth / aspect;
      const infoHeight = visualOnly ? 0 : 42;
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
      {columns.map((columnItems, colIndex) => (
        <View key={colIndex} style={[styles.column, { width: colWidth, gap }]}>
          {columnItems.map(({ item, index }) => (
            enableEntranceAnimation ? (
              <Reanimated.View
                key={item.id}
                entering={FadeInDown.duration(350).delay(index * 50).springify()}
              >
                <ProductCardV2
                  item={item}
                  onPress={() => onPressItem(item)}
                  index={index}
                  showSaveButton={showSaveButton}
                  visualOnly={visualOnly}
                  enableEntranceAnimation={false}
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
                enableEntranceAnimation={false}
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