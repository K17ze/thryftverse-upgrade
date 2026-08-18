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
        backgroundColor: isDark ? '#17302b' : '#ece4d8',
        borderColor: isDark ? '#35574d' : '#d0c3af',
        textColor: isDark ? '#d7b98f' : '#7c5f1e',
      };
    case 'positive':
      return {
        backgroundColor: isDark ? colors.success + '18' : '#efe7d6',
        borderColor: isDark ? colors.success + '30' : '#d9c6a2',
        textColor: isDark ? '#7bc99a' : '#3a6b42',
      };
    case 'negative':
      return {
        backgroundColor: isDark ? colors.danger + '18' : '#f6e6e6',
        borderColor: isDark ? colors.danger + '30' : '#ddb0b0',
        textColor: isDark ? '#ff9d9d' : '#b64242',
      };
    case 'warning':
      return {
        backgroundColor: isDark ? colors.warning + '18' : '#f7ecdb',
        borderColor: isDark ? colors.warning + '30' : '#dfc9a5',
        textColor: isDark ? '#ffcf8a' : '#8a6a3f',
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