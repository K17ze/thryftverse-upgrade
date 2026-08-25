import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Type, Typography, FontFamily } from '../../theme/designTokens';

export interface SettingsSectionProps {
  title: string;
  /** Optional eyebrow rendered above the title in muted caps. */
  eyebrow?: string;
  /** @deprecated Section headers are now small uppercase labels. Kept for backward compatibility. */
  icon?: string;
  description?: string;
  children: React.ReactNode;
  style?: ViewStyle;
  /** @deprecated Flat composition is now the default. Kept for backward compatibility. */
  noCard?: boolean;
  /** @deprecated Flat canvas is now the default. Kept for backward compatibility. */
  grouped?: boolean;
}

export function SettingsSection({
  title,
  eyebrow,
  icon: _icon,
  description,
  children,
  style,
  noCard: _noCard,
  grouped: _grouped,
}: SettingsSectionProps) {
  const { colors } = useAppTheme();
  return (
    <View style={[styles.wrapper, style]}>
      {eyebrow ? (
        <Text style={[styles.eyebrow, { color: colors.textMuted }]}>{eyebrow}</Text>
      ) : null}
      {/* Small uppercase header label — flat canvas, no icon chrome */}
      <Text style={[styles.headerLabel, { color: colors.textMuted }]}>
        {title.toUpperCase()}
      </Text>
      {description ? <Text style={[styles.description, { color: colors.textMuted }]}>{description}</Text> : null}
      {/* Flat canvas — no card surface, hairline separators handled by rows */}
      <View style={styles.flatCanvas}>
        {children}
      </View>
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
  // Small uppercase header label — muted, caps, compact.
  // This is the group category label per 2026 mobile UX research.
  headerLabel: {
    fontSize: Type.meta.size,
    fontFamily: FontFamily.semibold,
    paddingHorizontal: Space.md,
    marginTop: Space.lg,
    marginBottom: Space.sm,
    letterSpacing: Type.label.letterSpacing,
    textTransform: 'uppercase',
    lineHeight: Type.meta.lineHeight,
  },
  description: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    marginBottom: Space.sm + Space.xs,
    paddingHorizontal: Space.md,
    lineHeight: Type.caption.lineHeight,
    letterSpacing: Type.caption.letterSpacing,
  },
  flatCanvas: {
    // Flat — no background, no border, no radius, no shadow.
    // Hairline separators between rows are handled by SettingsRow.
  },
});
