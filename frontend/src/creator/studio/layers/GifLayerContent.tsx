import React from 'react';
import { Image as ExpoImage } from 'expo-image';
import type { CreatorLayer } from '../../core/projectStore/composition';

// ── GIF layer content ──────────────────────────────────────────────
// Renders animated GIF using expo-image (supports animated GIF playback).
export function GifLayerContent({ layer }: { layer: Extract<CreatorLayer, { type: 'gif' }> }) {
  const { payload } = layer;
  return (
    <ExpoImage
      source={{ uri: payload.gifUrl }}
      style={{ width: '100%', height: '100%' }}
      contentFit="contain"
      cachePolicy="memory-disk"
      recyclingKey={payload.gifUrl}
      transition={300}
      enforceEarlyResizing
      accessible
      accessibilityLabel={payload.altText || 'GIF sticker'}
      accessibilityHint="Plays the GIF on the canvas"
    />
  );
}
