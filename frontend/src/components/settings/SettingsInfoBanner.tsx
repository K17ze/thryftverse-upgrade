import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Type , Typography  } from '../../theme/designTokens';

export interface SettingsInfoBannerProps {
  text: string;
  icon?: string;
  variant?: 'info' | 'warning' | 'error';
}

export function SettingsInfoBanner({
  text,
  icon = 'information-circle-outline',
  variant = 'info',
}: SettingsInfoBannerProps) {
  const { colors } = useAppTheme();
  const color =
    variant === 'error'
      ? colors.danger
      : variant === 'warning'
      ? colors.warning
      : colors.textMuted;

  return (
    <View style={[styles.container, { backgroundColor: colors.surfaceAlt }]}>
      <Ionicons name={icon as any} size={18} color={color} />
      <Text style={[styles.text, { color }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm + 4,
    borderRadius: 12,
    marginHorizontal: Space.md,
    marginBottom: Space.md,
  },
  text: {
    flex: 1,
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    lineHeight: Type.caption.lineHeight,
    letterSpacing: Type.caption.letterSpacing,
  },
});
