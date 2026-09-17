/**
 * MediaPickerPreview — long-press preview overlay (iOS Photos peek
 * pattern). Shows the full-resolution image while the user holds.
 * Dismisses on touch up. No chrome — the image is the preview.
 *
 * Extracted from MediaPicker.tsx (pure move — no behavior change).
 */

import React from 'react';
import { Pressable, type ImageStyle } from 'react-native';
import { Image } from 'expo-image';
import { createStyles } from './pickerShared';
import type { MediaAsset } from './mediaPickerTypes';

export function MediaPickerPreview({
  asset,
  onDismiss,
  styles }: {
  asset: MediaAsset;
  onDismiss: () => void;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <Pressable
      style={styles.previewOverlay}
      onPress={onDismiss}
      accessibilityLabel="Preview, tap to dismiss"
      accessibilityHint="Closes the preview"
      accessibilityRole="button"
    >
      <Image
        source={{ uri: asset.uri }}
        style={styles.previewImage as ImageStyle}
        contentFit="contain"
      />
    </Pressable>
  );
}
