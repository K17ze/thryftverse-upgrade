/**
 * LayoutPreviewRenderer — thumbnail rendering a layout with actual asset thumbnails.
 */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { Radius, Stroke } from '../../../theme/designTokens';
import { useAppTheme } from '../../../theme/ThemeContext';
import type { LayoutPreview } from './layoutTypes';

export interface LayoutPreviewRendererProps {
  assetUris: string[];
  assetFocalPoints?: ({ x: number; y: number } | undefined)[];
  layout: LayoutPreview;
  /** Thumbnail width in pt. Default 80. */
  width?: number;
  /** Thumbnail height in pt. Default 100. */
  height?: number;
  /** Whether this preview is the currently-selected layout. */
  selected?: boolean;
}

/**
 * Render a mini canvas with the layout applied to the actual asset thumbnails.
 */
export function LayoutPreviewRenderer({
  assetUris,
  assetFocalPoints,
  layout,
  width = 48,
  height = 60,
  selected = false,
}: LayoutPreviewRendererProps) {
  const { colors } = useAppTheme();

  return (
    <View
      style={[
        styles.container,
        {
          width,
          height,
          backgroundColor: colors.surfaceAlt,
          borderColor: selected ? colors.brand : 'transparent',
          borderWidth: selected ? Stroke.emphasis : 0,
        },
      ]}
    >
      {layout.transforms.map((transform, index) => {
        const uri = assetUris[index];
        if (!uri) return null;
        const left = transform.x * width;
        const top = transform.y * height;
        const w = transform.width * width;
        const h = transform.height * height;
        const focalPoint = assetFocalPoints?.[index];
        const contentPosition = focalPoint
          ? { top: `${Math.round(focalPoint.y * 100)}%`, left: `${Math.round(focalPoint.x * 100)}%` }
          : undefined;
        return (
          <View
            key={`${layout.id}-${index}`}
            style={[
              styles.assetSlot,
              {
                left,
                top,
                width: w,
                height: h,
                zIndex: transform.zIndex,
                transform: [{ rotate: `${transform.rotation}deg` }],
              },
            ]}
          >
            <ExpoImage
              source={{ uri }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              contentPosition={contentPosition}
              recyclingKey={uri}
              transition={0}
            />
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  assetSlot: {
    position: 'absolute',
    overflow: 'hidden',
  },
});
