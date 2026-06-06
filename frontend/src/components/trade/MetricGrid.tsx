import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { Colors } from '../../constants/colors';
import { Type , Space, Radius  } from '../../theme/designTokens';
import { Motion } from '../../constants/motion';
import { useReducedMotion } from '../../hooks/useReducedMotion';
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

function resolveToneColor(tone?: MetricItem['tone']) {
  switch (tone) {
    case 'positive':
      return Colors.success;
    case 'negative':
      return Colors.danger;
    case 'neutral':
    default:
      return Colors.textPrimary;
  }
}

export function MetricGrid({ metrics, columns = 3, style }: MetricGridProps) {
  const reducedMotionEnabled = useReducedMotion();

  return (
    <View style={[styles.container, style]}>
      <View style={[styles.row, { gap: Space.sm }]}>
        {metrics.map((metric, index) => (
          <Reanimated.View
            key={`${metric.label}-${index}`}
            style={[styles.cell, { flex: 1 / columns }]}
            entering={
              reducedMotionEnabled
                ? undefined
                : FadeInDown
                    .duration(Motion.list.enterDuration)
                    .delay(Math.min(index, Motion.list.maxStaggerItems) * Motion.list.staggerStep)
            }
          >
            <TradeCard variant="surface" style={styles.card}>
              {metric.icon && (
                <View style={styles.iconWrap}>{metric.icon}</View>
              )}
              <BodyEmphasis
                style={[styles.value, { color: resolveToneColor(metric.tone) }]}
                numberOfLines={1}
              >
                {metric.value}
              </BodyEmphasis>
              <Meta style={styles.label} numberOfLines={1}>
                {metric.label}
              </Meta>
            </TradeCard>
          </Reanimated.View>
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
    paddingVertical: Space.sm + 4,
    paddingHorizontal: Space.sm,
    minHeight: 72,
  },
  iconWrap: {
    marginBottom: 4,
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
