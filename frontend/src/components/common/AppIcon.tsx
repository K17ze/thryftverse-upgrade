/**
 * AppIcon — Authoritative Flagship Icon Primitive for Thryftverse
 *
 * Core Capabilities:
 * 1. Semantic Token Sizing: Maps 'micro' | 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'hero' | 'display'
 *    to strictly normalized optical scales.
 * 2. Semantic Icon Registry: Supports high-level semantic names ('heart', 'cart', 'search',
 *    'lock', etc.) with automatic outline vs filled state mapping.
 * 3. Optical Centering: Applies centroid balancing for asymmetrical glyphs (play, chevrons, send).
 * 4. Theme Resolution: Direct support for theme color keys ('textPrimary', 'brand', 'danger', etc.)
 *    with automatic dark/light mode switching.
 * 5. Full Accessibility: Standardized screen-reader accessibility labeling.
 */

import React, { memo } from 'react';
import { View, StyleSheet, type StyleProp, type ViewStyle, type TextStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  IconSize,
  IconOpticalOffset,
  SemanticIconMap,
  getIconName,
  type IconSizeKey,
  type IoniconsGlyphName,
  type SemanticIconName,
  type SemanticIconDef,
  type IconConcept,
} from '../../theme/iconTokens';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';

export interface AppIconProps {
  /**
   * Semantic icon concept ('search', 'cart', 'heart', etc.) resolved via the
   * icon registry — the preferred way to specify an icon. When provided this
   * takes precedence over `name`.
   */
  concept?: IconConcept;
  /**
   * Semantic icon name ('heart', 'cart', 'search', 'lock', etc.)
   * OR any standard Ionicons glyph name ('heart-outline', 'bag-handle', etc.).
   * Ignored when `concept` is provided.
   */
  name?: SemanticIconName | IoniconsGlyphName;
  /**
   * Optical size token ('micro' | 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'hero' | 'display')
   * or explicit numeric point size. Defaults to 'md' (20pt).
   */
  size?: IconSizeKey | number;
  /**
   * Theme color token key ('textPrimary' | 'brand' | 'danger' | 'textMuted', etc.)
   * or raw color string (#hex, rgba). Defaults to 'textPrimary'.
   */
  color?: keyof ThemeColors | string;
  /**
   * State variant: 'outline' (default) vs 'filled' (active/selected state).
   */
  variant?: 'outline' | 'filled';
  /**
   * Shorthand boolean to toggle variant='filled'.
   */
  focused?: boolean;
  /**
   * Whether to apply optical centroid compensation (true by default).
   */
  opticalCenter?: boolean;
  /**
   * Optional container style.
   */
  style?: StyleProp<ViewStyle | TextStyle>;
  /**
   * Accessibility label for screen readers.
   */
  accessibilityLabel?: string;
  /**
   * Whether the icon is standalone accessible (defaults to true if accessibilityLabel is set).
   */
  accessible?: boolean;
  /**
   * Optional testID.
   */
  testID?: string;
}

export const AppIcon = memo(function AppIcon({
  concept,
  name,
  size = 'md',
  color = 'textPrimary',
  variant = 'outline',
  focused,
  opticalCenter = true,
  style,
  accessibilityLabel,
  accessible,
  testID,
}: AppIconProps) {
  const { colors } = useAppTheme();

  // 1. Resolve numeric point size
  const resolvedSize: number =
    typeof size === 'number'
      ? size
      : IconSize[size] ?? IconSize.md;

  // 2. Resolve color
  const resolvedColor: string =
    typeof color === 'string' && color in colors
      ? (colors[color as keyof ThemeColors] as string)
      : color;

  // 3. Resolve glyph name
  const effectiveVariant = focused ? 'filled' : variant;
  let resolvedGlyph: string;

  if (concept) {
    // Preferred path — semantic concept from the icon registry.
    resolvedGlyph = getIconName(concept, effectiveVariant === 'filled');
  } else if (name) {
    // Legacy path — semantic name from iconTokens or raw Ionicons glyph.
    if (name in SemanticIconMap) {
      const semanticDef = (SemanticIconMap as Record<string, SemanticIconDef>)[name];
      resolvedGlyph = semanticDef?.[effectiveVariant] ?? name;
    } else {
      resolvedGlyph = name;
    }
  } else {
    resolvedGlyph = 'help-outline';
  }

  // 4. Resolve optical centroid offset
  const offset = opticalCenter ? IconOpticalOffset[resolvedGlyph] : undefined;
  const isOffsetNeeded = offset && (offset.x !== 0 || offset.y !== 0);

  const iconElement = (
    <Ionicons
      name={resolvedGlyph as any}
      size={resolvedSize}
      color={resolvedColor}
      testID={testID}
    />
  );

  const isAccessible = accessible ?? Boolean(accessibilityLabel);

  if (!isOffsetNeeded && !style && !isAccessible) {
    return iconElement;
  }

  const offsetTransform = isOffsetNeeded
    ? [{ translateX: offset.x * (resolvedSize / 24) }, { translateY: offset.y * (resolvedSize / 24) }]
    : undefined;

  return (
    <View
      style={[
        styles.container,
        offsetTransform ? { transform: offsetTransform } : undefined,
        style,
      ]}
      accessible={isAccessible}
      accessibilityRole={isAccessible ? 'image' : undefined}
      accessibilityLabel={accessibilityLabel}
      importantForAccessibility={isAccessible ? 'yes' : 'no-hide-descendants'}
    >
      {iconElement}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
