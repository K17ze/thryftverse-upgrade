import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { Colors } from '../../constants/colors';
import { Radius, Elevation } from '../../theme/designTokens';

export type ChatCardVariant = 'surface' | 'elevated' | 'tint';

interface ChatCardProps {
  children: React.ReactNode;
  variant?: ChatCardVariant;
  style?: StyleProp<ViewStyle>;
  noBorder?: boolean;
}

function resolveChatCardStyle(variant: ChatCardVariant) {
  switch (variant) {
    case 'tint':
      return {
        backgroundColor: Colors.surfaceAlt,
        borderColor: Colors.borderLight,
      };
    case 'elevated':
      return {
        backgroundColor: Colors.surface,
        borderColor: Colors.border,
      };
    case 'surface':
    default:
      return {
        backgroundColor: Colors.surface,
        borderColor: Colors.border,
      };
  }
}

export function ChatCard({
  children,
  variant = 'surface',
  style,
  noBorder = false,
}: ChatCardProps) {
  const tone = resolveChatCardStyle(variant);
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

const styles = StyleSheet.create({
  base: {
    borderRadius: Radius.lg,
    borderWidth: 1,
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
