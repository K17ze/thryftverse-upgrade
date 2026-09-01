import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Radius } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { AppIcon } from '../common/AppIcon';
import { IconSize, type SemanticIconName } from '../../theme/iconTokens';

type BannerTone = 'info' | 'success' | 'warning' | 'error';

export interface SettingsInfoBannerProps {
  /** Single-line message. Use `title` + `description` for a two-line banner. */
  text?: string;
  /** Bold leading label for a two-line banner. */
  title?: string;
  /** Supporting copy beneath the title. */
  description?: string;
  icon?: SemanticIconName | React.ComponentProps<typeof Ionicons>['name'];
  /** Legacy prop — prefer `tone`. */
  variant?: 'info' | 'warning' | 'error';
  /** Visual tone. Takes precedence over `variant`. */
  tone?: BannerTone;
}

export function SettingsInfoBanner({
  text,
  title,
  description,
  icon = 'info',
  variant,
  tone }: SettingsInfoBannerProps) {
  const { colors } = useAppTheme();
  const resolvedTone: BannerTone = tone ?? variant ?? 'info';
  const color =
    resolvedTone === 'error'
      ? colors.danger
      : resolvedTone === 'warning'
      ? colors.warning
      : resolvedTone === 'success'
      ? colors.success
      : colors.textMuted;

  const hasTwoLine = Boolean(title || description);

  return (
    <View style={[styles.container, { backgroundColor: colors.surfaceAlt }]}>
      <AppIcon name={icon} size={IconSize.sm} color={color} opticalCenter accessible={false} />
      {hasTwoLine ? (
        <View style={styles.body}>
          {title ? (
            <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
          ) : null}
          {description ? (
            <Text style={[styles.description, { color: colors.textSecondary }]}>
              {description}
            </Text>
          ) : null}
        </View>
      ) : (
        <Text style={[styles.text, { color }]}>{text}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    paddingVertical: Space.smMd,
    borderRadius: Radius.lg,
    marginHorizontal: Space.md,
    marginBottom: Space.md },
  body: {
    flex: 1,
    gap: Space.xs / 2 },
  title: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    lineHeight: TypographyV2.body.lineHeight },
  description: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    lineHeight: TypographyV2.meta.lineHeight,
    letterSpacing: TypographyV2.meta.letterSpacing },
  text: {
    flex: 1,
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    lineHeight: TypographyV2.meta.lineHeight,
    letterSpacing: TypographyV2.meta.letterSpacing } });
