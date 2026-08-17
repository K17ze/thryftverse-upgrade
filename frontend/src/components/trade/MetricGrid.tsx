import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Type , Space, Radius  } from '../../theme/designTokens';
import { TradeCard } from './TradeCard';
import { Meta, BodyEmphasis } from '../ui/Text';

export interface MetricItem {
  label: string;
  value: string;
  tone?: 'neutral' | 'positive' | 'negative';
  icon?: React.ReactNode;
}

interface MetricGridProps {
  metrics: MetricItem[];
  columns?: 2 | 3 | 4;
  style?: ViewStyle;
}

function resolveToneColor(tone: MetricItem['tone'], colors: ThemeColors) {
  switch (tone) {
    case 'positive':
      return colors.success;
    case 'negative':
      return colors.danger;
    case 'neutral':
    default:
      return colors.textPrimary;
  }
}

export function MetricGrid({ metrics, columns = 3, style }: MetricGridProps) {
  const { colors } = useAppTheme();

  return (
    <View style={[styles.container, style]}>
      <View style={[styles.row, { gap: Space.sm }]}>
        {metrics.map((metric, index) => (
          <View
            key={`${metric.label}-${index}`}
            style={[styles.cell, { flex: 1 / columns }]}
          >
            <TradeCard variant="surface" style={styles.card}>
              {metric.icon && (
                <View style={styles.iconWrap}>{metric.icon}</View>
              )}
              <BodyEmphasis
                style={[styles.value, { color: resolveToneColor(metric.tone, colors) }]}
                numberOfLines={1}
              >
                {metric.value}
              </BodyEmphasis>
              <Meta style={styles.label} numberOfLines={1}>
                {metric.label}
              </Meta>
            </TradeCard>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Space.md,
    marginBottom: Space.sm,
  },
  row: {
    flexDirection: 'row',
  },
  cell: {
    flex: 1,
  },
  card: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Space.smMd,
    paddingHorizontal: Space.sm,
    minHeight: 72,
  },
  iconWrap: {
    marginBottom: Space.xs,
  },
  value: {
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  label: {
    marginTop: 2,
    textAlign: 'center',
  },
});