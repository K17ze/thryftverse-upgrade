/**
 * ActivityBadge — Real-time social proof & scarcity indicators.
 * Contextual urgency signals for activity badges.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius, Typography } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';

export type ActivityBadgeVariant =
  | 'viewers'
  | 'closeted'
  | 'recentSale'
  | 'trending'
  | 'offersPending'
  | 'priceDropped'
  | 'rareItem'
  | 'fastSelling';

interface ActivityBadgeProps {
  variant: ActivityBadgeVariant;
  count?: number;
  label?: string;
  subtitle?: string;
  style?: object;
}

function buildVariantConfig(colors: ThemeColors): Record<ActivityBadgeVariant, {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  iconColor: string;
  glowColor: string;
  defaultLabel: string;
  accent: boolean;
}> {
  return {
    viewers: {
      icon: 'eye-outline',
      iconColor: colors.textSecondary,
      glowColor: colors.brand,
      defaultLabel: 'people viewing',
      accent: false },
    closeted: {
      icon: 'bookmark-outline',
      iconColor: colors.brand,
      glowColor: colors.brand,
      defaultLabel: 'in closets',
      accent: true },
    recentSale: {
      icon: 'checkmark-circle-outline',
      iconColor: colors.success,
      glowColor: colors.success,
      defaultLabel: 'sold recently',
      accent: false },
    trending: {
      icon: 'flame-outline',
      iconColor: colors.warning,
      glowColor: colors.warning,
      defaultLabel: 'trending',
      accent: true },
    offersPending: {
      icon: 'chatbubble-outline',
      iconColor: colors.brand,
      glowColor: colors.brand,
      defaultLabel: 'offers pending',
      accent: true },
    priceDropped: {
      icon: 'trending-down-outline',
      iconColor: colors.success,
      glowColor: colors.success,
      defaultLabel: 'price dropped',
      accent: false },
    rareItem: {
      icon: 'diamond-outline',
      iconColor: colors.brand,
      glowColor: colors.brand,
      defaultLabel: 'rare find',
      accent: true },
    fastSelling: {
      icon: 'timer-outline',
      iconColor: colors.warning,
      glowColor: colors.warning,
      defaultLabel: 'selling fast',
      accent: true } };
}

function PulsingDot({ color }: { color: string }) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  return (
    <View
      style={[
        styles.pulseDot,
        { backgroundColor: color },
      ]}
    />
  );
}

export function ActivityBadge({
  variant,
  count,
  label,
  subtitle,
  style }: ActivityBadgeProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const variantConfig = React.useMemo(() => buildVariantConfig(colors), [colors]);
  const config = variantConfig[variant];
  const displayLabel = label ?? config.defaultLabel;
  const showCount = count !== undefined && count > 0;

  return (
    <View style={style}>
      <View
        style={[
          styles.badge,
          config.accent && styles.badgeAccent,
          styles.badgeContent,
        ]}
      >
        <View style={styles.row}>
          {config.accent && (
            <PulsingDot color={config.glowColor} />
          )}
          <Ionicons
            name={config.icon}
            size={14}
            color={config.iconColor}
            style={styles.icon}
          />
          <Text style={styles.text}>
            {showCount && (
              <Text style={[styles.count, { color: config.iconColor }]}>
                {count}{' '}
              </Text>
            )}
            {displayLabel}
          </Text>
        </View>
        {subtitle && (
          <Text style={styles.subtitle}>{subtitle}</Text>
        )}
      </View>
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: Radius.lg },
  badgeAccent: {
    borderColor: colors.brand },
  badgeContent: {
    paddingHorizontal: Space.sm + 2,
    paddingVertical: Space.xs + 2,
    flexDirection: 'row',
    alignItems: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center' },
  pulseDot: {
    width: 6,
    height: 6,
    borderRadius: Radius.sm,
    marginRight: 6 },
  icon: {
    marginRight: Space.xs },
  text: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.weight === '500' ? Typography.family.medium : Typography.family.regular,
    color: colors.textSecondary,
    lineHeight: TypographyV2.meta.lineHeight,
    letterSpacing: TypographyV2.meta.letterSpacing },
  count: {
    fontFamily: Typography.family.semibold },
  subtitle: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textMuted,
    marginTop: 2,
    marginLeft: 20,
    lineHeight: TypographyV2.meta.lineHeight },
  rowContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.xs + 2 } });

/**
 * ActivityBadgeRow — Horizontal stack of multiple badges for ItemDetail
 */
interface ActivityBadgeRowProps {
  badges: Array<{
    variant: ActivityBadgeVariant;
    count?: number;
    label?: string;
    subtitle?: string;
  }>;
  style?: object;
}

export function ActivityBadgeRow({ badges, style }: ActivityBadgeRowProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={[styles.rowContainer, style]}>
      {badges.map((badge, index) => (
        <ActivityBadge
          key={`${badge.variant}-${index}`}
          variant={badge.variant}
          count={badge.count}
          label={badge.label}
          subtitle={badge.subtitle}
        />
      ))}
    </View>
  );
}
