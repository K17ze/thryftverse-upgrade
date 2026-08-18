/**
 * FlagshipFormSection — Surface Hierarchy V2 section primitive.
 *
 * Replaces the old card-by-default pattern with a variant system that
 * makes containment a deliberate choice, not a default.
 *
 * Variants (per closure program 04_SURFACE_HIERARCHY):
 *   flat     — no border, no background. Default. Plain canvas + spacing.
 *   grouped  — tonal group (surfaceAlt), no outer stroke. For settings groups.
 *   state    — semantic leading tint (subtle left accent). For status-led sections.
 *   critical — warning/security/payment tinted background. Used sparingly.
 *
 * The old `noCard` prop is preserved for backward compatibility:
 *   noCard=true  → variant='flat'
 *   noCard=false → variant='flat' (new default; old card mode removed)
 *
 * Per AGENTS.md §4: visible containment must have meaning. Ordinary sections
 * default to flat canvas; grouping is achieved through proximity, dividers,
 * and typography — not borders.
 */

import React from 'react';
import { View, Text, StyleSheet, type ViewStyle } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Radius, Type, FontFamily, Typography } from '../../theme/designTokens';

export type FlagshipFormSectionVariant = 'flat' | 'grouped' | 'state' | 'critical';

export interface FlagshipFormSectionProps {
  title?: string;
  description?: string;
  children: React.ReactNode;
  style?: ViewStyle;
  /** Section variant. Defaults to 'flat'. */
  variant?: FlagshipFormSectionVariant;
  /** Semantic tone for 'state' and 'critical' variants. */
  tone?: 'neutral' | 'brand' | 'success' | 'warning' | 'danger';
  /** @deprecated Use variant='flat' instead. */
  noCard?: boolean;
}

export function FlagshipFormSection({
  title,
  description,
  children,
  style,
  variant,
  tone = 'neutral',
  noCard,
}: FlagshipFormSectionProps) {
  const { colors } = useAppTheme();

  // Resolve variant: explicit variant wins; noCard=true maps to flat for
  // backward compat. New default is 'flat' (no card).
  const resolvedVariant: FlagshipFormSectionVariant =
    variant ?? (noCard ? 'flat' : 'flat');

  const containerStyle = (() => {
    switch (resolvedVariant) {
      case 'flat':
        return styles.flat;
      case 'grouped':
        return [styles.grouped, { backgroundColor: colors.surfaceAlt }];
      case 'state':
        return [styles.state, { backgroundColor: colors.surfaceAlt, borderLeftColor: resolveToneColor(colors, tone) }];
      case 'critical':
        return [styles.critical, { backgroundColor: resolveCriticalTint(colors, tone) }];
      default:
        return styles.flat;
    }
  })();

  return (
    <View style={[styles.wrapper, style]}>
      {title ? (
        <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>{title}</Text>
      ) : null}
      {description ? (
        <Text style={[styles.sectionDescription, { color: colors.textSecondary }]}>{description}</Text>
      ) : null}
      <View style={containerStyle}>{children}</View>
    </View>
  );
}

function resolveToneColor(colors: ReturnType<typeof useAppTheme>['colors'], tone: string): string {
  switch (tone) {
    case 'brand': return colors.brand;
    case 'success': return colors.success;
    case 'warning': return colors.warning;
    case 'danger': return colors.danger;
    default: return colors.border;
  }
}

function resolveCriticalTint(colors: ReturnType<typeof useAppTheme>['colors'], tone: string): string {
  switch (tone) {
    case 'warning': return colors.warning + '14'; // ~8% opacity
    case 'danger': return colors.danger + '14';
    case 'success': return colors.success + '14';
    default: return colors.surfaceAlt;
  }
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: Space.lg,
  },
  sectionTitle: {
    fontSize: Type.metaElevated.size,
    fontFamily: FontFamily.semibold,
    letterSpacing: 0.3,
    marginBottom: Space.sm,
    marginLeft: Space.xs,
    lineHeight: Type.metaElevated.lineHeight,
  },
  sectionDescription: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    marginBottom: Space.smMd,
    marginLeft: Space.xs,
    lineHeight: Type.caption.lineHeight,
    letterSpacing: Type.caption.letterSpacing,
  },
  flat: {
    // No border, no background — plain canvas. Grouping via spacing.
  },
  grouped: {
    borderRadius: Radius.lg,
    overflow: 'hidden',
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
  },
  state: {
    borderRadius: Radius.lg,
    overflow: 'hidden',
    borderLeftWidth: 3,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
  },
  critical: {
    borderRadius: Radius.lg,
    overflow: 'hidden',
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
  },
});
