import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { CoOwnNumericText } from '../ui/CoOwnNumericText';
import type { CoOwnPortfolioSummary } from '../../services/coOwnPortfolio';
import { portfolioScreenStyles as styles } from './portfolioScreenStyles';

export interface PortfolioSummaryCardProps {
  summary: CoOwnPortfolioSummary;
}

/**
 * Portfolio summary — ownership surface, not a finance dashboard. The one
 * dominant panel above the fold: total value, today's change with
 * timestamp, and a data-quality note when stale marks exist.
 */
export function PortfolioSummaryCard({ summary }: PortfolioSummaryCardProps) {
  const { colors } = useAppTheme();

  // Phase 3: derived summary values with defaults (fields are optional from the service)
  const todayChangeGbp = summary.todayChangeGbp ?? 0;
  const todayChangePct = summary.todayChangePct ?? 0;
  const staleMarkCount = summary.staleMarkCount ?? 0;

  return (
    <View style={[styles.summaryCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
      <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>Portfolio value · 1ZE</Text>
      <CoOwnNumericText
        value={summary.totalValueGbp}
        unit="1ZE"
        size="priceLarge"
        align="left"
        showUnit={false}
        color={colors.textPrimary}
      />

      {/* Phase 3: today's change with timestamp */}
      {todayChangeGbp !== 0 && (
        <View style={styles.todayChangeRow}>
          <CoOwnNumericText
            value={todayChangeGbp}
            unit="1ZE"
            size="price"
            signed
            showUnit={false}
            showGlyph={false}
            color={todayChangeGbp >= 0 ? colors.success : colors.danger}
          />
          <Text style={[styles.todayChangePct, { color: todayChangeGbp >= 0 ? colors.success : colors.danger }]}>
            ({todayChangeGbp >= 0 ? '+' : ''}{todayChangePct.toFixed(2)}%)
          </Text>
          <Ionicons
            name={todayChangeGbp >= 0 ? 'arrow-up' : 'arrow-down'}
            size={12}
            color={todayChangeGbp >= 0 ? colors.success : colors.danger}
          />
          {summary.todayChangeTimestamp ? (
            <Text style={[styles.todayChangeTime, { color: colors.textMuted }]} numberOfLines={1}>
              · as of {summary.todayChangeTimestamp}
            </Text>
          ) : null}
        </View>
      )}

      {/* Data-quality note — only when stale marks exist */}
      {staleMarkCount > 0 && (
        <Text style={[styles.dataQualityText, { color: colors.warning }]} numberOfLines={2}>
          {staleMarkCount} {staleMarkCount === 1 ? 'position has' : 'positions have'} stale marks ({'>'}24h)
        </Text>
      )}
    </View>
  );
}
