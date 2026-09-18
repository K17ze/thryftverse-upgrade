/**
 * MoodboardPickerTile — a listing thumbnail in the bottom picker rail.
 *
 * 72px image + title + price; tapping adds the item to the canvas center.
 * PICKER_TILE_SIZE / PICKER_TILE_GAP are exported for the rail container
 * and the loading skeleton, which mirrors this geometry.
 */
import React from 'react';
import { Text, StyleSheet, ImageStyle } from 'react-native';

import { Space, Radius, LetterSpacing } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { AnimatedPressable } from '../AnimatedPressable';
import { CachedImage } from '../CachedImage';
import { useFormattedPrice } from '../../hooks/useFormattedPrice';
import type { MoodboardItem } from '../../services/moodboardApi';

// ── Layout constants ──
export const PICKER_TILE_SIZE = 72;
export const PICKER_TILE_GAP = Space.sm;

export interface PickerTileProps {
  item: MoodboardItem;
  onPress: () => void;
}

export const PickerTile = React.memo(function PickerTile({ item, onPress }: PickerTileProps) {
  const { currencySymbol, currencyCode } = useFormattedPrice();
  return (
    <AnimatedPressable
      style={[styles.pickerTile, { width: PICKER_TILE_SIZE }]}
      onPress={onPress}
      activeOpacity={0.85}
      scaleValue={0.96}
      accessibilityRole="button"
      accessibilityLabel={`Add ${item.title}, ${item.price.toFixed(0)} ${currencyCode} to moodboard`}
      accessibilityHint="Adds this item to the center of the canvas"
    >
      <CachedImage
        uri={item.imageUri}
        style={styles.pickerTileImage as ImageStyle}
        contentFit="cover"
        priority="normal"
        accessible={false}
      />
      <Text style={styles.pickerTileTitle} numberOfLines={1}>
        {item.title}
      </Text>
      <Text style={styles.pickerTilePrice} numberOfLines={1}>
        {currencySymbol}{item.price.toFixed(0)}
      </Text>
    </AnimatedPressable>
  );
});

// ---------------------------------------------------------------------------
// Static styles (no theme dependency)
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  pickerTile: {
    alignItems: 'flex-start',
    gap: Space.xs / 2 },
  pickerTileImage: {
    width: PICKER_TILE_SIZE,
    height: PICKER_TILE_SIZE,
    borderRadius: Radius.md } as ImageStyle,
  pickerTileTitle: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: LetterSpacing.normal },
  pickerTilePrice: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily } });
