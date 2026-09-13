import React, { useMemo } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { createCreatorAnalyticsStyles } from './creatorAnalyticsStyles';
import { PERIOD_LABELS, type PeriodKey } from './creatorAnalyticsTypes';

// ── Period selector: hairline tabs ──────────────────────────────────
export function CreatorAnalyticsPeriodSelector({
  period,
  onSelectPeriod }: {
  period: PeriodKey;
  onSelectPeriod: (next: PeriodKey) => void;
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createCreatorAnalyticsStyles(colors), [colors]);
  return (
    <View style={styles.periodRow}>
      {(['7d', '30d', '90d'] as PeriodKey[]).map((key) => {
        const active = key === period;
        return (
          <Pressable
            key={key}
            onPress={() => onSelectPeriod(key)}
            style={styles.periodTab}
            accessibilityRole="button"
            accessibilityLabel={`Show last ${PERIOD_LABELS[key]}`}
            accessibilityState={{ selected: active }}
            hitSlop={4}
          >
            <Text
              style={[
                styles.periodTabText,
                { color: active ? colors.textPrimary : colors.textMuted },
              ]}
            >
              {key}
            </Text>
            {active && (
              <View style={[styles.periodTabIndicator, { backgroundColor: colors.textPrimary }]} />
            )}
          </Pressable>
        );
      })}
    </View>
  );
}
