import React, { useMemo } from 'react';
import { View, FlatList, StyleSheet, useWindowDimensions } from 'react-native';
import { AnimatedPressable } from '../AnimatedPressable';
import { CachedImage } from '../CachedImage';
import { SharedTransitionView } from '../SharedTransitionView';

import { Radius, Space } from '../../theme/designTokens';
const H_GAP = 3;
const COLS = 4;

export interface EditorialImage {
  id: string;
  uri: string;
  aspectRatio?: number;
}

interface Props {
  images: EditorialImage[];
  onPressImage?: (id: string) => void;
  sharedTransitionPrefix?: string;
}

export function EditorialImageRow({ images, onPressImage, sharedTransitionPrefix }: Props) {
  const { width: SCREEN_W } = useWindowDimensions();
  const colWidth = (SCREEN_W - 32 - (COLS - 1) * H_GAP) / COLS;
  const renderItem = React.useCallback(
    ({ item }: { item: EditorialImage }) => {
      const height = colWidth * (item.aspectRatio ?? 1.35);
      const sharedTag = sharedTransitionPrefix
        ? `${sharedTransitionPrefix}-${item.id}`
        : undefined;

      return (
        <AnimatedPressable
          style={[styles.cell, { width: colWidth, height }]}
          onPress={() => onPressImage?.(item.id)}
          activeOpacity={0.92}
          accessibilityLabel="Discover image"
          accessibilityRole="button"
        >
          {sharedTag ? (
            <SharedTransitionView style={StyleSheet.absoluteFill} sharedTransitionTag={sharedTag}>
              <CachedImage
                uri={item.uri}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
              />
            </SharedTransitionView>
          ) : (
            <CachedImage
              uri={item.uri}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
            />
          )}
        </AnimatedPressable>
      );
    },
    [onPressImage, sharedTransitionPrefix, colWidth]
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={images}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        numColumns={COLS}
        scrollEnabled={false}
        columnWrapperStyle={styles.columnWrapper}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Space.md,
  },
  columnWrapper: {
    gap: H_GAP,
    marginBottom: H_GAP,
  },
  cell: {
    borderRadius: Radius.lg,
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
});