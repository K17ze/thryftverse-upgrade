import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import {
  getHealthGrade,
  getHealthLabel,
  type ListingHealthMetrics,
} from '../../domain/listingHealth';

/**
 * Semantic colour per health grade. Maps to existing theme tokens —
 * no hardcoded hex. A = success, B = brand, C = warning, D = danger.
 */
function gradeColor(
  grade: ListingHealthMetrics['healthGrade'],
  colors: ThemeColors,
): string {
  switch (grade) {
    case 'A': return colors.success;
    case 'B': return colors.brand;
    case 'C': return colors.warning;
    case 'D': return colors.danger;
  }
}

function gradeSubtle(
  grade: ListingHealthMetrics['healthGrade'],
  colors: ThemeColors,
): string {
  switch (grade) {
    case 'A': return colors.successSubtle;
    case 'B': return colors.brandSubtle;
    case 'C': return colors.warningSubtle;
    case 'D': return colors.dangerSubtle;
  }
}

function gradeBorder(
  grade: ListingHealthMetrics['healthGrade'],
  colors: ThemeColors,
): string {
  switch (grade) {
    case 'A': return colors.successBorder;
    case 'B': return colors.brandBorder;
    case 'C': return colors.warningBorder;
    case 'D': return colors.dangerBorder;
  }
}

interface MetricCell {
  label: string;
  value: string;
}

function buildMetricCells(m: ListingHealthMetrics): MetricCell[] {
  const cells: MetricCell[] = [
    { label: 'Views', value: String(m.views) },
    { label: 'Saves', value: String(m.saves) },
    { label: 'Inquiries', value: String(m.inquiries) },
    { label: 'Offers', value: String(m.offers) },
  ];
  return cells;
}

const POSITIONING_LABEL: Record<ListingHealthMetrics['priceVsComparable'], string> = {
  below: 'Below market',
  at: 'At market',
  above: 'Above market',
  'no-data': 'No comparables',
};

export interface ListingHealthCardProps {
  metrics: ListingHealthMetrics;
  /** Optional onPress handler — when provided the card becomes pressable */
  onPress?: () => void;
}

/**
 * Listing Health Card — evidence-backed listing performance summary.
 *
 * Composition (flat, no card-on-card):
 *   grade badge (single letter + label) → metric row (4 cells) →
 *   price positioning + days listed
 *
 * Per AGENTS.md §4 anti-AI design:
 * - One radius grammar (sm for badge, no nested cards)
 * - Hairline separators, not shadows
 * - The grade letter IS the dominant object; metrics recede
 * - No decorative chrome, no eyebrow restating the title
 * - Full a11y labels for every metric
 */
export function ListingHealthCard({ metrics, onPress }: ListingHealthCardProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  const grade = metrics.healthGrade ?? getHealthGrade(metrics.healthScore);
  const label = getHealthLabel(grade);
  const gradeClr = gradeColor(grade, colors);
  const gradeSubtleBg = gradeSubtle(grade, colors);
  const gradeBdr = gradeBorder(grade, colors);

  const cells = React.useMemo(() => buildMetricCells(metrics), [metrics]);

  const positioning = metrics.priceVsComparable;
  const positioningLabel = POSITIONING_LABEL[positioning];
  const showPercent =
    positioning !== 'no-data' &&
    metrics.priceVsComparablePercent !== 0 &&
    metrics.priceVsComparablePercent != null;
  const percentText = showPercent
    ? `${metrics.priceVsComparablePercent > 0 ? '+' : ''}${Math.round(metrics.priceVsComparablePercent)}%`
    : null;

  const daysText = `${metrics.daysListed}d listed`;

  const a11yParts = [
    `Health grade ${grade}, ${label}`,
    ...cells.map((c) => `${c.label} ${c.value}`),
    positioningLabel,
    daysText,
  ];
  const a11yLabel = a11yParts.join(', ');

  const inner = (
    <>
      {/* Grade badge — the dominant object */}
      <View style={styles.gradeRow}>
        <View
          style={[
            styles.gradeBadge,
            { backgroundColor: gradeSubtleBg, borderColor: gradeBdr },
          ]}
        >
          <Text style={[styles.gradeLetter, { color: gradeClr }]}>{grade}</Text>
        </View>
        <View style={styles.gradeMeta}>
          <Text style={[styles.gradeLabel, { color: colors.textPrimary }]}>
            {label}
          </Text>
          <Text style={[styles.gradeScore, { color: colors.textMuted }]}>
            {metrics.healthScore}/100
          </Text>
        </View>
        <View style={styles.positioningWrap}>
          <Text style={[styles.positioningLabel, { color: colors.textSecondary }]}>
            {positioningLabel}
          </Text>
          {percentText ? (
            <Text style={[styles.positioningPercent, { color: gradeClr }]}>
              {percentText}
            </Text>
          ) : null}
        </View>
      </View>

      {/* Metric row — flat, hairline-divided cells */}
      <View style={[styles.metricRow, { borderColor: colors.borderSubtle }]}>
        {cells.map((cell, i) => (
          <React.Fragment key={cell.label}>
            {i > 0 ? <View style={[styles.metricDivider, { backgroundColor: colors.borderSubtle }]} /> : null}
            <View style={styles.metricCell}>
              <Text style={[styles.metricValue, { color: colors.textPrimary }]}>
                {cell.value}
              </Text>
              <Text style={[styles.metricLabel, { color: colors.textMuted }]}>
                {cell.label}
              </Text>
            </View>
          </React.Fragment>
        ))}
      </View>

      {/* Footer — days listed */}
      <Text style={[styles.daysText, { color: colors.textMuted }]}>
        {daysText}
      </Text>
    </>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.container, pressed && { opacity: 0.6 }]}
        accessibilityRole="button"
        accessibilityLabel={a11yLabel}
      >
        {inner}
      </Pressable>
    );
  }

  return (
    <View
      style={styles.container}
      accessibilityRole="summary"
      accessibilityLabel={a11yLabel}
    >
      {inner}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      paddingVertical: Space.sm + 2,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderSubtle,
    },
    gradeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
    },
    gradeBadge: {
      width: 32,
      height: 32,
      borderRadius: Radius.sm,
      borderWidth: StyleSheet.hairlineWidth,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    gradeLetter: {
      fontSize: TypographyV2.bodyStrong.size,
      lineHeight: TypographyV2.bodyStrong.lineHeight,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
    },
    gradeMeta: {
      flex: 1,
      gap: 0,
    },
    gradeLabel: {
      fontSize: TypographyV2.body.size,
      lineHeight: TypographyV2.body.lineHeight,
      fontFamily: TypographyV2.body.fontFamily,
    },
    gradeScore: {
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      fontFamily: TypographyV2.meta.fontFamily,
      fontVariant: ['tabular-nums'] as ['tabular-nums'],
    },
    positioningWrap: {
      alignItems: 'flex-end',
      gap: 0,
    },
    positioningLabel: {
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      fontFamily: TypographyV2.meta.fontFamily,
    },
    positioningPercent: {
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      fontFamily: TypographyV2.meta.fontFamily,
      fontVariant: ['tabular-nums'] as ['tabular-nums'],
    },
    metricRow: {
      flexDirection: 'row',
      marginTop: Space.sm,
      paddingTop: Space.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
    },
    metricDivider: {
      width: StyleSheet.hairlineWidth,
      alignSelf: 'stretch',
    },
    metricCell: {
      flex: 1,
      alignItems: 'center',
      gap: 1,
    },
    metricValue: {
      fontSize: TypographyV2.bodyStrong.size,
      lineHeight: TypographyV2.bodyStrong.lineHeight,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      fontVariant: ['tabular-nums'] as ['tabular-nums'],
    },
    metricLabel: {
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      fontFamily: TypographyV2.meta.fontFamily,
    },
    daysText: {
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      fontFamily: TypographyV2.meta.fontFamily,
      marginTop: Space.xs,
    },
  });
}
