import React from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { useAppTheme } from '../../../theme/ThemeContext';
import { Space } from '../../../theme/designTokens';
import { TypographyV2 } from '../../../theme/typography.v2';
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
  variant = 'standard' }: CommerceDetailSectionProps) {
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
          : colors.textSecondary },
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
    paddingTop: Space.md,
    paddingBottom: Space.sm },
  // editorial: stronger heading, more breathing room, no divider.
  // Uses Space.lg (24px) for a chapter break — enough to separate
  // sections visually without creating excessive white space.
  containerEditorial: {
    paddingTop: Space.lg,
    paddingBottom: Space.sm },
  // compact: disclosure row with minimal vertical spacing.
  containerCompact: {
    paddingTop: Space.sm,
    paddingBottom: Space.xs },
  // continuation: no heading or divider — just children with page padding.
  containerContinuation: {
    paddingHorizontal: Space.md,
    paddingTop: 0,
    paddingBottom: 0 },
  // legal: subdued, collapsed-first.
  containerLegal: {
    paddingTop: Space.md,
    paddingBottom: Space.sm },
  // discovery: visual heading and rail spacing.
  // Matches editorial rhythm (24px) so discovery sections don't
  // create a larger gap than editorial sections.
  containerDiscovery: {
    paddingTop: Space.lg,
    paddingBottom: Space.sm },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: -Space.md,
    marginBottom: Space.sm },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Space.sm,
    marginBottom: Space.sm + Space.xs },
  label: {
    fontSize: TypographyV2.bodyStrong.size,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    letterSpacing: TypographyV2.bodyStrong.letterSpacing,
    textTransform: 'none' },
  // editorial: stronger heading — slightly larger, tighter tracking.
  labelEditorial: {
    fontSize: TypographyV2.sectionTitle.size,
    lineHeight: TypographyV2.sectionTitle.lineHeight,
    fontFamily: TypographyV2.sectionTitle.fontFamily,
    letterSpacing: TypographyV2.sectionTitle.letterSpacing,
    textTransform: 'none' },
  // legal: subdued — muted weight, smaller.
  labelLegal: {
    fontSize: TypographyV2.label.size,
    lineHeight: TypographyV2.label.lineHeight,
    fontFamily: TypographyV2.label.fontFamily,
    textTransform: 'none' } });
