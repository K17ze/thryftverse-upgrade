import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Type } from '../../theme/designTokens';
import { Typography } from '../../constants/typography';

export interface SettingsSectionProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  style?: ViewStyle;
  noCard?: boolean;
}

export function SettingsSection({
  title,
  description,
  children,
  style,
  noCard,
}: SettingsSectionProps) {
  const { colors } = useAppTheme();
  return (
    <View style={[styles.wrapper, style]}>
      <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
      {description ? <Text style={[styles.description, { color: colors.textMuted }]}>{description}</Text> : null}
      {noCard ? (
        <View style={styles.noCard}>{children}</View>
      ) : (
        <View style={[styles.card, { backgroundColor: colors.surface, shadowColor: colors.shadow }]}>{children}</View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: Space.lg,
  },
  title: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.bold,
    marginBottom: Space.sm + 4,
    marginTop: Space.lg,
    paddingHorizontal: Space.md,
    letterSpacing: Type.body.letterSpacing,
  },
  description: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    marginBottom: Space.sm + 4,
    paddingHorizontal: Space.md,
    lineHeight: Type.caption.lineHeight,
    letterSpacing: Type.caption.letterSpacing,
  },
  card: {
    borderRadius: 16,
    overflow: 'hidden',
    marginHorizontal: Space.md,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  noCard: {
    marginHorizontal: Space.md,
  },
});
