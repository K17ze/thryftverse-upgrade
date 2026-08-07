import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Radius, Elevation, Stroke } from '../../theme/designTokens';

export type ChatCardVariant = 'surface' | 'elevated' | 'tint';

interface ChatCardProps {
  children: React.ReactNode;
  variant?: ChatCardVariant;
  style?: StyleProp<ViewStyle>;
  noBorder?: boolean;
}

function resolveChatCardStyle(variant: ChatCardVariant, colors: ThemeColors) {
  switch (variant) {
    case 'tint':
      return {
        backgroundColor: colors.surfaceAlt,
        borderColor: colors.border,
      };
    case 'elevated':
      return {
        backgroundColor: colors.surfaceAlt,
        borderColor: colors.border,
      };
    case 'surface':
    default:
      return {
        backgroundColor: colors.surfaceAlt,
        borderColor: colors.border,
      };
  }
}

export function ChatCard({
  children,
  variant = 'surface',
  style,
  noBorder = false,
}: ChatCardProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const tone = resolveChatCardStyle(variant, colors);
  const isElevated = variant === 'elevated';

  return (
    <View
      style={[
        styles.base,
        {
          backgroundColor: tone.backgroundColor,
          borderColor: noBorder ? 'transparent' : tone.borderColor,
        },
        isElevated && styles.elevated,
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
    borderWidth: Stroke.hairline,
    paddingHorizontal: Radius.lg,
    paddingVertical: Radius.md,
  },
  elevated: {
    shadowColor: Elevation.card.shadowColor,
    shadowOffset: Elevation.card.shadowOffset,
    shadowOpacity: Elevation.card.shadowOpacity,
    shadowRadius: Elevation.card.shadowRadius,
    elevation: Elevation.card.elevation,
  },
});
