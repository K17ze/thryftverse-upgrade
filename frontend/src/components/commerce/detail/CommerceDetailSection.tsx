import React from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { useAppTheme } from '../../../theme/ThemeContext';
import { Space, Type, Typography } from '../../../theme/designTokens';
import type { CommerceDetailSectionVariant } from './types';

/**
 * Section rhythm — a flat section header for grouped content.
 *
 * Per spec 02: no separate rounded card for every subsection. Use
 * whitespace, hairline dividers and a quiet section label. The section
 * header is a single small label, not a large bordered title.
 *
 * Per spec 05 §2 (section rhythm variants):
 *   - standard: existing simple section.
 *   - editorial: stronger heading, more breathing room, no divider.
 *   - compact: disclosure row with minimal vertical spacing.
 *   - continuation: no heading or divider.
 *   - legal: subdued, collapsed-first.
 *   - discovery: visual heading and rail spacing.
 *
 * Optional `trailing` slot renders a quiet action (e.g. "See all").
 */
export interface CommerceDetailSectionProps {
  label: string;
  /** Optional trailing quiet action (e.g. "See all"). */
  trailing?: React.ReactNode;
  children?: React.ReactNode;
  /** When true, a hairline divider renders above the label. Use for
   * mid-page sections; omit for the first section after the hero. */
  divider?: boolean;
  /** Optional accessibility label override. */
  accessibilityLabel?: string;
  /** Section rhythm variant. Defaults to `standard`. */
  variant?: CommerceDetailSectionVariant;
}

export function CommerceDetailSection({
  label,
  trailing,
  children,
  divider = false,
  accessibilityLabel,
  variant = 'standard',
}: CommerceDetailSectionProps) {
  const { colors } = useAppTheme();

  // Per spec 05 §2: variant-driven rhythm.
  const containerStyle = [
    styles.container,
    variant === 'editorial' && styles.containerEditorial,
    variant === 'compact' && styles.containerCompact,
    variant === 'continuation' && styles.containerContinuation,
    variant === 'legal' && styles.containerLegal,
    variant === 'discovery' && styles.containerDiscovery,
  ];

  const labelStyle = [
    styles.label,
    variant === 'editorial' && styles.labelEditorial,
    variant === 'legal' && styles.labelLegal,
    {
      color:
        variant === 'editorial' || variant === 'discovery'
          ? colors.textPrimary
          : colors.textSecondary,
    },
  ];

  // continuation: no heading or divider — children render directly.
  if (variant === 'continuation') {
    return <View style={containerStyle}>{children}</View>;
  }

  // compact: minimal vertical spacing, divider suppressed.
  const showDivider = divider && variant !== 'compact' && variant !== 'editorial';

  return (
    <View style={containerStyle}>
      {showDivider ? (
        <View style={[styles.divider, { backgroundColor: colors.borderSubtle }]} />
      ) : null}
      <View style={styles.header}>
        <Text
          style={labelStyle}
          accessibilityRole="header"
          accessibilityLabel={accessibilityLabel ?? label}
        >
          {label}
        </Text>
        {trailing}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Space.md,
    paddingTop: Space.md + Space.xs,
    paddingBottom: Space.sm,
  },
  // editorial: stronger heading, more breathing room, no divider.
  // Uses Space.xl for a true chapter-break feel — the editorial variant
  // marks a new section in the product story, not just a row group.
  containerEditorial: {
    paddingTop: Space.xl,
    paddingBottom: Space.md,
  },
  // compact: disclosure row with minimal vertical spacing.
  containerCompact: {
    paddingTop: Space.sm,
    paddingBottom: Space.xs,
  },
  // continuation: no heading or divider — just children with page padding.
  containerContinuation: {
    paddingHorizontal: Space.md,
    paddingTop: 0,
    paddingBottom: 0,
  },
  // legal: subdued, collapsed-first.
  containerLegal: {
    paddingTop: Space.md,
    paddingBottom: Space.sm,
  },
  // discovery: visual heading and rail spacing.
  containerDiscovery: {
    paddingTop: Space.xl,
    paddingBottom: Space.md,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: -Space.md,
    marginBottom: Space.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Space.sm,
    marginBottom: Space.md,
  },
  label: {
    fontSize: Type.bodyEmphasis.size,
    lineHeight: Type.bodyEmphasis.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.bodyEmphasis.letterSpacing,
    textTransform: 'none',
  },
  // editorial: stronger heading — slightly larger, tighter tracking.
  labelEditorial: {
    fontSize: Type.subtitle.size,
    lineHeight: Type.subtitle.lineHeight,
    fontFamily: Typography.family.bold,
    letterSpacing: Type.subtitle.letterSpacing,
    textTransform: 'none',
  },
  // legal: subdued — muted weight, smaller.
  labelLegal: {
    fontSize: Type.metaElevated.size,
    lineHeight: Type.metaElevated.lineHeight,
    fontFamily: Typography.family.medium,
    textTransform: 'none',
  },
});
