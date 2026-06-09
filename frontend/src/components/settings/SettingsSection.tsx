import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Type, Radius , Typography  } from '../../theme/designTokens';

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
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>{children}</View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: Space.lg,
  },
  title: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.bold,
    marginBottom: Space.sm,
    marginTop: Space.lg,
    paddingHorizontal: Space.md,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    lineHeight: Type.caption.lineHeight,
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
    borderRadius: Radius.lg,
    overflow: 'hidden',
    marginHorizontal: Space.md,
    borderWidth: StyleSheet.hairlineWidth,
    elevation: 0,
  },
  noCard: {
    marginHorizontal: Space.md,
  },
});
