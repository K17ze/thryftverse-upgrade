import React from 'react';
import { View, Text } from 'react-native';
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
  const todayChangeGbp = summary.todayChangeGbp;
  const todayChangePct = summary.todayChangePct;
  const hasTodayChange = todayChangeGbp != null && Number.isFinite(todayChangeGbp);
  const changeColor = todayChangeGbp == null || todayChangeGbp === 0
    ? colors.textSecondary : todayChangeGbp > 0 ? colors.coownUp : colors.coownDown;
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

      {hasTodayChange ? (
        <View style={[styles.todayChangeRow, { flexWrap: 'wrap' }]}>
          <CoOwnNumericText value={todayChangeGbp} unit="1ZE" size="price" signed
            showUnit={false} showGlyph={false} color={changeColor} />
          {todayChangePct != null && Number.isFinite(todayChangePct) && (
            <Text style={[styles.todayChangePct, { color: changeColor }]}>
              ({todayChangePct > 0 ? '+' : ''}{todayChangePct.toFixed(2)}%)
            </Text>
          )}
          <Text style={[styles.todayChangeTime, { color: colors.textSecondary }]}>Today</Text>
          {summary.todayChangeTimestamp && <Text style={[styles.todayChangeTime, { color: colors.textMuted }]}>
            As of {summary.todayChangeTimestamp}
          </Text>}
        </View>
      ) : null}

      {/* Data-quality note — only when stale marks exist */}
      {staleMarkCount > 0 && (
        <Text style={[styles.dataQualityText, { color: colors.textSecondary }]}>
          {staleMarkCount} {staleMarkCount === 1 ? 'position has' : 'positions have'} stale marks ({'>'}24h)
        </Text>
      )}
    </View>
  );
}
