import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Type, Radius, Typography, Control } from '../../theme/designTokens';

export interface SettingsSectionProps {
  title: string;
  /** Optional eyebrow rendered above the title in muted caps. */
  eyebrow?: string;
  /** Optional icon rendered beside the title. */
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  description?: string;
  children: React.ReactNode;
  style?: ViewStyle;
  noCard?: boolean;
}

export function SettingsSection({
  title,
  eyebrow,
  icon,
  description,
  children,
  style,
  noCard,
}: SettingsSectionProps) {
  const { colors } = useAppTheme();
  return (
    <View style={[styles.wrapper, style]}>
      {eyebrow ? (
        <Text style={[styles.eyebrow, { color: colors.textMuted }]}>{eyebrow}</Text>
      ) : null}
      <View style={styles.titleRow}>
        {icon ? (
          <View style={styles.titleIcon}>
            <Ionicons name={icon} size={20} color={colors.textPrimary} />
          </View>
        ) : null}
        <Text style={[noCard ? styles.titleFlat : styles.title, { color: noCard ? colors.textPrimary : colors.textSecondary }]}>
          {title}
        </Text>
      </View>
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
    marginBottom: Space.md + Space.xs,
  },
  eyebrow: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.semibold,
    marginBottom: Space.xs * 0.5,
    marginTop: Space.lg,
    paddingHorizontal: Space.md,
    letterSpacing: Type.metaElevated.letterSpacing,
    textTransform: 'uppercase',
    lineHeight: Type.meta.lineHeight,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    paddingHorizontal: Space.md,
  },
  titleIcon: {
    width: Control.hit,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -Space.xs,
  },
  title: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.semibold,
    marginBottom: Space.sm,
    marginTop: Space.md,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    lineHeight: Type.meta.lineHeight,
  },
  titleFlat: {
    fontSize: Type.subtitle.size,
    fontFamily: Typography.family.semibold,
    marginBottom: Space.xs,
    marginTop: Space.xs,
    letterSpacing: Type.subtitle.letterSpacing,
    lineHeight: Type.subtitle.lineHeight,
  },
  description: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    marginBottom: Space.sm + Space.xs,
    paddingHorizontal: Space.md,
    lineHeight: Type.caption.lineHeight,
    letterSpacing: Type.caption.letterSpacing,
  },
  card: {
    borderRadius: Radius.lg,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    elevation: 0,
  },
  noCard: {
    marginHorizontal: 0,
  },
});
