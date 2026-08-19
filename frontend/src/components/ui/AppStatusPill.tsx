import React from 'react';
import { StyleProp, StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Typography, Radius, Space, Type } from '../../theme/designTokens';

export type AppStatusTone = 'neutral' | 'accent' | 'positive' | 'negative' | 'warning';
export type AppStatusSize = 'sm' | 'md';

interface AppStatusPillProps {
  label: string;
  tone?: AppStatusTone;
  size?: AppStatusSize;
  iconName?: keyof typeof Ionicons.glyphMap;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}

type ToneTokens = {
  backgroundColor: string;
  borderColor: string;
  textColor: string;
};

function resolveTone(tone: AppStatusTone, colors: ThemeColors, isDark: boolean): ToneTokens {
  switch (tone) {
    case 'accent':
      return {
        backgroundColor: colors.brandSubtle,
        borderColor: colors.borderSubtle,
        textColor: colors.brand,
      };
    case 'positive':
      return {
        backgroundColor: colors.successSubtle,
        borderColor: colors.successBorder,
        textColor: colors.success,
      };
    case 'negative':
      return {
        backgroundColor: colors.dangerSubtle,
        borderColor: colors.dangerBorder,
        textColor: colors.danger,
      };
    case 'warning':
      return {
        backgroundColor: colors.warningSubtle,
        borderColor: colors.warningBorder,
        textColor: colors.warning,
      };
    case 'neutral':
    default:
      return {
        backgroundColor: colors.surfaceAlt,
        borderColor: colors.border,
        textColor: colors.textSecondary,
      };
  }
}

export function AppStatusPill({
  label,
  tone = 'neutral',
  size = 'sm',
  iconName,
  style,
  textStyle,
}: AppStatusPillProps) {
  const { colors, isDark } = useAppTheme();
  const tokens = resolveTone(tone, colors, isDark);
  const iconSize = size === 'sm' ? 12 : 14;

  return (
    <View
      style={[
        styles.base,
        size === 'md' ? styles.sizeMd : styles.sizeSm,
        {
          backgroundColor: tokens.backgroundColor,
          borderColor: tokens.borderColor,
        },
        style,
      ]}
    >
      {iconName ? <Ionicons name={iconName} size={iconSize} color={tokens.textColor} /> : null}
      <Text style={[styles.text, size === 'md' && styles.textMd, { color: tokens.textColor }, textStyle]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: Radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  sizeSm: {
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs,
  },
  sizeMd: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  text: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.bold,
    letterSpacing: 0.25,
  },
  textMd: {
    fontSize: Type.caption.size,
  },
});