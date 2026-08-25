import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius, Elevation } from '../../theme/designTokens';
import { Glass } from '../../theme/gradients';

export type SettingsCardVariant = 'surface' | 'elevated' | 'tint' | 'glass';

interface SettingsCardProps {
  children: React.ReactNode;
  variant?: SettingsCardVariant;
  style?: ViewStyle;
  noBorder?: boolean;
}

function resolveVariantStyle(variant: SettingsCardVariant, colors: ThemeColors) {
  switch (variant) {
    case 'elevated':
      return {
        backgroundColor: colors.surface,
        borderColor: colors.border,
        shadowConfig: Elevation.card,
      };
    case 'tint':
      return {
        backgroundColor: colors.surfaceAlt,
        borderColor: colors.borderSubtle,
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
        backgroundColor: colors.surface,
        borderColor: colors.border,
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
  const { colors } = useAppTheme();
  const tone = resolveVariantStyle(variant, colors);
  const styles = React.useMemo(() => createStyles(colors), [colors]);

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

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  base: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
    marginHorizontal: Space.md,
    marginBottom: Space.md,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
});
