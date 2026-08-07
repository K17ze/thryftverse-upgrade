import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Typography, Space, Radius, Type } from '../../theme/designTokens';
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

  const rating = seller.rating ?? null;
  const reviewCount = seller.reviewCount ?? null;
  if (rating !== null) {
    metrics.push({
      icon: 'star',
      label: 'Seller rating',
      value: reviewCount != null ? `${rating.toFixed(1)} (${reviewCount})` : rating.toFixed(1),
      progress: rating > 0 ? Math.min(rating / 5, 1) : undefined,
    });
  }

  const responseRate = seller.responseRate ?? null;
  if (responseRate !== null) {
    metrics.push({
      icon: 'chatbubble-ellipses',
      label: 'Response rate',
      value: `${responseRate}%`,
      progress: Math.min(responseRate / 100, 1),
    });
  }

  const responseTimeLabel = seller.responseTimeLabel ?? null;
  if (responseTimeLabel) {
    metrics.push({
      icon: 'time',
      label: 'Response time',
      value: responseTimeLabel,
    });
  }

  const dispatchTimeLabel = seller.dispatchTimeLabel ?? null;
  if (dispatchTimeLabel) {
    metrics.push({
      icon: 'cube',
      label: 'Ship time',
      value: dispatchTimeLabel,
    });
  }

  const completedSales = seller.completedSales ?? null;
  if (completedSales !== null) {
    metrics.push({
      icon: 'checkmark-done',
      label: 'Completed sales',
      value: `${completedSales}`,
    });
  }

  return metrics;
}

export interface SellerReputationCardProps {
  seller: SellerTrustSummary | null;
}

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
        {metrics.map((metric) => (
          <View
            key={metric.label}
            style={styles.metricRow}
            accessibilityLabel={`${metric.label}: ${metric.value}`}
          >
            <Ionicons name={metric.icon} size={15} color={colors.textMuted} />
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
      marginTop: Space.sm,
      marginHorizontal: Space.md,
      backgroundColor: colors.surface,
      borderRadius: Radius.lg,
      padding: Space.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderSubtle,
    },
    title: {
      fontSize: Type.captionElevated.size,
      lineHeight: Type.captionElevated.lineHeight,
      fontFamily: Typography.family.semibold,
      color: colors.textSecondary,
      letterSpacing: 0.2,
      marginBottom: Space.sm,
    },
    metricsList: {
      gap: Space.sm,
    },
    metricRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
    },
    metricBody: {
      flex: 1,
      minWidth: 0,
      gap: 5,
    },
    metricLabelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: Space.sm,
    },
    metricLabel: {
      fontSize: Type.body.size,
      lineHeight: Type.body.lineHeight,
      fontFamily: Typography.family.regular,
      color: colors.textPrimary,
      letterSpacing: Type.body.letterSpacing,
    },
    metricValue: {
      fontSize: Type.bodyEmphasis.size,
      lineHeight: Type.bodyEmphasis.lineHeight,
      fontFamily: Typography.family.semibold,
      color: colors.textPrimary,
      letterSpacing: Type.bodyEmphasis.letterSpacing,
    },
    progressTrack: {
      height: 3,
      backgroundColor: colors.surfaceAlt,
      borderRadius: Radius.full,
      overflow: 'hidden',
    },
    progressFill: {
      height: '100%',
      backgroundColor: colors.success,
      borderRadius: Radius.full,
    },
  });
}
