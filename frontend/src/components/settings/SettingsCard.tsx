import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { Colors } from '../../constants/colors';
import { Space, Radius, Elevation } from '../../theme/designTokens';

export type SettingsCardVariant = 'surface' | 'elevated' | 'tint';

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
        variant === 'elevated' && tone.shadowConfig,
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
  },
});
