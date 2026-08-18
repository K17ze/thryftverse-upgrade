import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Type, Typography } from '../../theme/designTokens';

export interface SettingsSectionProps {
  title: string;
  /** Optional eyebrow rendered above the title in muted caps. */
  eyebrow?: string;
  /** Optional icon rendered beside the title. */
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  description?: string;
  children: React.ReactNode;
  style?: ViewStyle;
  /** @deprecated Flat composition is now the default. Kept for backward compatibility. */
  noCard?: boolean;
}

export function SettingsSection({
  title,
  eyebrow,
  icon,
  description,
  children,
  style,
  noCard: _noCard,
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
            <Ionicons name={icon} size={20} color={colors.textSecondary} />
          </View>
        ) : null}
        <Text style={[styles.titleFlat, { color: colors.textPrimary }]}>
          {title}
        </Text>
      </View>
      {description ? <Text style={[styles.description, { color: colors.textMuted }]}>{description}</Text> : null}
      <View style={styles.noCard}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: Space.lg,
  },
  eyebrow: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.semibold,
    marginBottom: Space.xs * 0.5,
    marginTop: Space.lg,
    paddingHorizontal: Space.md,
    letterSpacing: Type.label.letterSpacing,
    textTransform: 'uppercase',
    lineHeight: Type.meta.lineHeight,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
    paddingHorizontal: Space.md,
  },
  titleIcon: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -2,
  },
  titleFlat: {
    fontSize: Type.sectionTitle.size,
    fontFamily: Typography.family.semibold,
    marginBottom: Space.xs,
    marginTop: Space.xs,
    letterSpacing: Type.sectionTitle.letterSpacing,
    lineHeight: Type.sectionTitle.lineHeight,
  },
  description: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    marginBottom: Space.sm + Space.xs,
    paddingHorizontal: Space.md,
    lineHeight: Type.caption.lineHeight,
    letterSpacing: Type.caption.letterSpacing,
  },
  noCard: {
    marginHorizontal: 0,
  },
});
