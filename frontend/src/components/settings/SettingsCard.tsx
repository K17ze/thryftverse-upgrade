import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { Colors } from '../../constants/colors';
import { Space, Radius, Elevation } from '../../theme/designTokens';
import { Glass } from '../../theme/gradients';

export type SettingsCardVariant = 'surface' | 'elevated' | 'tint' | 'glass';

interface SettingsCardProps {
  children: React.ReactNode;
  variant?: SettingsCardVariant;
  style?: ViewStyle;
  noBorder?: boolean;
}

function resolveVariantStyle(variant: SettingsCardVariant) {
  switch (variant) {
    case 'elevated':
      return {
        backgroundColor: Colors.surface,
        borderColor: Colors.border,
        shadowConfig: Elevation.card,
      };
    case 'tint':
      return {
        backgroundColor: Colors.surfaceAlt,
        borderColor: Colors.borderLight,
        shadowConfig: Elevation.none,
      };
    case 'glass':
      return {
        backgroundColor: Glass.bg,
        borderColor: Glass.border,
        shadowConfig: Elevation.card,
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

export function SettingsCard({
  children,
  variant = 'surface',
  style,
  noBorder = false,
}: SettingsCardProps) {
  const tone = resolveVariantStyle(variant);

  return (
    <View
      style={[
        styles.base,
        {
          backgroundColor: tone.backgroundColor,
          borderColor: noBorder ? 'transparent' : tone.borderColor,
        },
        (variant === 'elevated' || variant === 'glass') && tone.shadowConfig,
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
    marginHorizontal: Space.md,
    marginBottom: Space.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
});