import React from 'react';
import { View, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { Colors } from '../../constants/colors';
import { Space, Radius, Elevation } from '../../theme/designTokens';

export type SurfaceVariant = 'surface' | 'elevated' | 'subtle' | 'tint';

interface ElevatedSurfaceProps {
  children: React.ReactNode;
  variant?: SurfaceVariant;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  noBorder?: boolean;
}

function resolveSurfaceStyle(variant: SurfaceVariant) {
  switch (variant) {
    case 'elevated':
      return {
        backgroundColor: Colors.surface,
        borderColor: Colors.border,
        shadowConfig: Elevation.card,
      };
    case 'subtle':
      return {
        backgroundColor: Colors.surfaceAlt,
        borderColor: Colors.borderLight,
        shadowConfig: Elevation.subtle,
      };
    case 'tint':
      return {
        backgroundColor: Colors.surfaceAlt,
        borderColor: Colors.borderLight,
        shadowConfig: Elevation.none,
      };
    case 'surface':
    default:
      return {
        backgroundColor: Colors.surface,
        borderColor: Colors.border,
        shadowConfig: Elevation.none,
      };
  }
}

export function ElevatedSurface({
  children,
  variant = 'surface',
  style,
  contentStyle,
  noBorder = false,
}: ElevatedSurfaceProps) {
  const tone = resolveSurfaceStyle(variant);

  return (
    <View
      style={[
        styles.base,
        {
          backgroundColor: tone.backgroundColor,
          borderColor: noBorder ? 'transparent' : tone.borderColor,
        },
        variant === 'elevated' || variant === 'subtle' ? tone.shadowConfig : undefined,
        style,
      ]}
    >
      <View style={[{ flex: 1 }, contentStyle]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
});