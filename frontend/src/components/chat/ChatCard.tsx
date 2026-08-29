import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Radius, Elevation, Stroke, Space } from '../../theme/designTokens';

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
        backgroundColor: colors.surface,
        borderColor: colors.brand,
      };
    case 'elevated':
      return {
        backgroundColor: colors.surfaceElevated,
        borderColor: colors.border,
        ...Elevation.card,
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

  return (
    <View
      style={[
        styles.base,
        tone,
        noBorder && { borderColor: 'transparent' },
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
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
  },
});
