import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius, Elevation, Stroke} from '../../theme/designTokens';

export type SettingsCardVariant = 'surface' | 'elevated' | 'tint';

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
        variant === 'elevated' && tone.shadowConfig,
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
    borderWidth: Stroke.standard,
    overflow: 'hidden',
    marginHorizontal: Space.md,
    marginBottom: Space.md,
    ...Elevation.card,
  },
});
