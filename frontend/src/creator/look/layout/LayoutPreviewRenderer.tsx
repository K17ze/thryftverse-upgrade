/**
 * LayoutPreviewRenderer — a small thumbnail that renders a layout using the
 * user's actual asset thumbnails.
 *
 * Replaces the blind "Try arrangement" cycling in the Look composer with
 * truthful previews of each layout. The renderer is intentionally tiny
 * (80×100pt default) so a horizontal rail of options stays scannable.
 *
 * Per AGENTS.md §4: authored composition, clear hierarchy, restraint.
 */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { Radius, Stroke } from '../../../theme/designTokens';
import { useAppTheme } from '../../../theme/ThemeContext';
import type { LayoutPreview } from './layoutTypes';

export interface LayoutPreviewRendererProps {
  assetUris: string[];
  layout: LayoutPreview;
  /** Thumbnail width in pt. Default 80. */
  width?: number;
  /** Thumbnail height in pt. Default 100. */
  height?: number;
  /** Whether this preview is the currently-selected layout. */
  selected?: boolean;
}

/**
 * Render a mini canvas with the layout applied to the actual asset
 * thumbnails. Asset rectangles are positioned per the layout's normalized
 * transforms (0–1), scaled to the thumbnail dimensions.
 */
export function LayoutPreviewRenderer({
  assetUris,
  layout,
  width = 80,
  height = 100,
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
    borderWidth: Stroke.emphasis,
  },
  assetSlot: {
    position: 'absolute',
    overflow: 'hidden',
  },
});
