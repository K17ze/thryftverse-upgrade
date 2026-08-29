import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius, Stroke } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import type { SellerTrustSummary } from '../../platform/product';

interface ReputationMetric {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  /** 0-1 progress fill for the metric bar, when a numeric ratio is available */
  progress?: number;
}

function buildReputationMetrics(seller: SellerTrustSummary | null): ReputationMetric[] {
  if (!seller) return [];
  const metrics: ReputationMetric[] = [];

  // Seller rating — omitted because the ProfileHero trust line already
  // shows "X.X ★" with a tap-through to reviews. Including it here would
  // duplicate the same number in two adjacent surfaces.

  const responseRate = seller.responseRate ?? null;
  if (responseRate !== null) {
    metrics.push({
      icon: 'chatbubble-ellipses',
      label: 'Response rate',
      value: `${responseRate}%`,
      progress: Math.min(responseRate / 100, 1) });
  }

  const responseTimeLabel = seller.responseTimeLabel ?? null;
  if (responseTimeLabel) {
    metrics.push({
      icon: 'time',
      label: 'Response time',
      value: responseTimeLabel });
  }

  const dispatchTimeLabel = seller.dispatchTimeLabel ?? null;
  if (dispatchTimeLabel) {
    metrics.push({
      icon: 'cube',
      label: 'Ship time',
      value: dispatchTimeLabel });
  }

  // Completed sales — omitted because the ProfileHero trust line already
  // shows "X sold". Including it here would duplicate the same number.

  return metrics;
}

export interface SellerReputationCardProps {
  seller: SellerTrustSummary | null;
}

/**
 * Seller reputation metrics — flat editorial rows, no card container.
 *
 * 2026 flagship pattern:
 *   section label: quiet, uppercase, muted
 *   metric rows: icon (muted) + label (body) + value (bodyEmphasis, right-aligned)
 *   progress bar: thin, success-colored, only when a numeric ratio exists
 *   hairline separators between rows — spacing gaps, not containers
 */
export function SellerReputationCard({ seller }: SellerReputationCardProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const metrics = React.useMemo(() => buildReputationMetrics(seller), [seller]);

  if (metrics.length === 0) return null;

  return (
    <View
      style={styles.container}
      accessibilityRole="summary"
      accessibilityLabel="Seller reputation metrics"
    >
      <Text style={styles.title}>Seller reputation</Text>
      <View style={styles.metricsList}>
        {metrics.map((metric, index) => (
          <View
            key={metric.label}
            style={[styles.metricRow, index > 0 && styles.metricRowSeparated]}
            accessibilityLabel={`${metric.label}: ${metric.value}`}
          >
            <View style={styles.metricIconWrap}>
              <Ionicons name={metric.icon} size={16} color={colors.textSecondary} />
            </View>
            <View style={styles.metricBody}>
              <View style={styles.metricLabelRow}>
                <Text style={styles.metricLabel}>{metric.label}</Text>
                <Text style={styles.metricValue} numberOfLines={1}>
                  {metric.value}
                </Text>
              </View>
              {typeof metric.progress === 'number' ? (
                <View style={styles.progressTrack}>
                  <View
                    style={[
                      styles.progressFill,
                      { width: `${Math.round(metric.progress * 100)}%` },
                    ]}
                  />
                </View>
              ) : null}
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  container: {
    marginTop: Space.sm + 2,
    marginHorizontal: Space.md,
    paddingVertical: Space.sm + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle },
  title: {
    fontSize: TypographyV2.label.size,
    lineHeight: TypographyV2.label.lineHeight,
    fontFamily: TypographyV2.label.fontFamily,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: TypographyV2.label.letterSpacing,
    marginBottom: Space.sm },
  metricsList: {
    gap: Space.sm },
  metricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm + 2 },
  metricRowSeparated: {
    paddingTop: Space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle },
  metricIconWrap: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0 },
  metricBody: {
    flex: 1,
    minWidth: 0,
    gap: Space.xs + 1 },
  metricLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Space.sm },
  metricLabel: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: TypographyV2.body.fontFamily,
    color: colors.textPrimary,
    letterSpacing: TypographyV2.body.letterSpacing },
  metricValue: {
    fontSize: TypographyV2.bodyStrong.size,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    color: colors.textPrimary,
    letterSpacing: TypographyV2.bodyStrong.letterSpacing,
    fontVariant: ['tabular-nums'] as ['tabular-nums'] },
  progressTrack: {
    height: 3,
    backgroundColor: colors.surfaceAlt,
    borderRadius: Radius.full,
    overflow: 'hidden' },
  progressFill: {
    height: '100%',
    backgroundColor: colors.success,
    borderRadius: Radius.full } });
}
