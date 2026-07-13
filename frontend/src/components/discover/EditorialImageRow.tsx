import React, { useMemo } from 'react';
import { View, FlatList, StyleSheet, Dimensions } from 'react-native';
import { AnimatedPressable } from '../AnimatedPressable';
import { CachedImage } from '../CachedImage';
import { SharedTransitionView } from '../SharedTransitionView';

const { width: SCREEN_W } = Dimensions.get('window');
const H_GAP = 3;
const COLS = 4;
const COL_WIDTH = (SCREEN_W - 32 - (COLS - 1) * H_GAP) / COLS;

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
  const renderItem = React.useCallback(
    ({ item }: { item: EditorialImage }) => {
      const height = COL_WIDTH * (item.aspectRatio ?? 1.35);
      const sharedTag = sharedTransitionPrefix
        ? `${sharedTransitionPrefix}-${item.id}`
        : undefined;

      return (
        <AnimatedPressable
          style={[styles.cell, { height }]}
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
    [onPressImage, sharedTransitionPrefix]
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
    paddingHorizontal: 16,
  },
  columnWrapper: {
    gap: H_GAP,
    marginBottom: H_GAP,
  },
  cell: {
    width: COL_WIDTH,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
});