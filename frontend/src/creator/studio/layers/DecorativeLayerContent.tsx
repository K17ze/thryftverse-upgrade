import React from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Radius, Elevation } from '../../../theme/designTokens';
import { useAppTheme } from '../../../theme/ThemeContext';
import type { CreatorLayer } from '../../core/projectStore/composition';

export function DecorativeLayerContent({ layer, width, height }: { layer: Extract<CreatorLayer, { type: 'decorative' }>; width: number; height: number }) {
  const { colors } = useAppTheme();
  const { payload } = layer;
  const fillColor = payload.fillColor ?? colors.brand;
  const subtleShadow = {
    ...Elevation.floating };
  const iconSize = Math.min(width, height);

  // Icon stickers (arrows, symbols, decorative icons) persist their picked
  // Ionicons glyph in `icon` — render it directly so an "arrow-down"
  // sticker shows a down arrow, not a generic shape or a fixed arrow-up.
  if (payload.icon) {
    return (
      <View
        style={{ width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center', opacity: payload.opacity, ...subtleShadow }}
        accessibilityLabel={`Decorative ${payload.icon} sticker`}
        accessibilityRole="image"
        accessibilityHint="Adds a decorative accent to the canvas"
      >
        <Ionicons name={payload.icon as never} size={iconSize} color={fillColor} />
      </View>
    );
  }

  switch (payload.shape) {
    case 'circle':
      return (
        <View
          style={{
            width: '100%',
            height: '100%',
            borderRadius: width / 2,
            backgroundColor: fillColor,
            opacity: payload.opacity,
            ...subtleShadow }}
          accessibilityLabel="Decorative circle shape"
          accessibilityRole="image"
          accessibilityHint="Adds a decorative accent to the canvas"
        />
      );
    case 'square':
      return (
        <View
          style={{
            width: '100%',
            height: '100%',
            borderRadius: Radius.md,
            backgroundColor: fillColor,
            opacity: payload.opacity,
            ...subtleShadow }}
          accessibilityLabel="Decorative square shape"
          accessibilityRole="image"
          accessibilityHint="Adds a decorative accent to the canvas"
        />
      );
    case 'line':
      return (
        <View
          style={{
            width: '100%',
            height: 4,
            borderRadius: Radius.sm,
            backgroundColor: fillColor,
            opacity: payload.opacity,
            marginTop: height / 2 - 2 }}
        />
      );
    case 'arrow':
      // The layer container already applies layer.rotation — rotating the
      // glyph again here would double the angle.
      return (
        <View style={{ width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center', opacity: payload.opacity }}>
          <Ionicons
            name="arrow-up"
            size={iconSize}
            color={fillColor}
          />
        </View>
      );
    case 'star':
      return (
        <View style={{ width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center', opacity: payload.opacity, ...subtleShadow }} accessibilityLabel="Decorative star shape" accessibilityRole="image" accessibilityHint="Adds a decorative accent to the canvas">
          <Ionicons name="star" size={iconSize} color={fillColor} />
        </View>
      );
    case 'heart':
      return (
        <View style={{ width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center', opacity: payload.opacity, ...subtleShadow }} accessibilityLabel="Decorative heart shape" accessibilityRole="image" accessibilityHint="Adds a decorative accent to the canvas">
          <Ionicons name="heart" size={iconSize} color={fillColor} />
        </View>
      );
    case 'triangle':
      return (
        <View
          style={{
            width: 0,
            height: 0,
            borderLeftWidth: width / 2,
            borderRightWidth: width / 2,
            borderBottomWidth: height,
            borderLeftColor: 'transparent',
            borderRightColor: 'transparent',
            borderBottomColor: fillColor,
            opacity: payload.opacity,
            alignSelf: 'center' }}
        />
      );
    case 'hexagon':
      return (
        <View style={{ width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center', opacity: payload.opacity, ...subtleShadow }}>
          <Ionicons name="stop" size={iconSize} color={fillColor} style={{ transform: [{ rotate: '45deg' }] }} />
        </View>
      );
    default:
      return null;
  }
}
