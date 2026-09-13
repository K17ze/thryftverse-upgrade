import React from 'react';
import { View, Text } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { CoOwnNumericText } from '../ui/CoOwnNumericText';
import { CoOwnPortfolioPerformanceChart } from '../coown';
import type { CoOwnPositionVM, CoOwnPortfolioSummary } from '../../services/coOwnPortfolio';
import { portfolioScreenStyles as styles } from './portfolioScreenStyles';

export interface PortfolioPnlSectionProps {
  summary: CoOwnPortfolioSummary;
  positions: CoOwnPositionVM[];
  totalCostBasisGbp: number;
}

/**
 * P&L breakdown — flat hairline rows, not a 4-tile grid. Per anti-AI
 * design: remove the generic dashboard silhouette. Each metric is a flat
 * row with a hairline divider, followed by the cost-vs-value comparison.
 */
export function PortfolioPnlSection({ summary, positions, totalCostBasisGbp }: PortfolioPnlSectionProps) {
  const { colors } = useAppTheme();
  const totalDistributionsGbp = summary.totalDistributionsGbp ?? 0;

  return (
    <>
      <View style={styles.pnlRows}>
        <View style={[styles.pnlRow, { borderBottomColor: colors.border }]}>
          <Text style={[styles.pnlLabel, { color: colors.textSecondary }]} numberOfLines={1}>Cost basis</Text>
          <CoOwnNumericText
            value={totalCostBasisGbp}
            unit="1ZE"
            size="price"
            showUnit={false}
            showGlyph={false}
            color={colors.textPrimary}
          />
        </View>
        <View style={[styles.pnlRow, { borderBottomColor: colors.border }]}>
          <Text style={[styles.pnlLabel, { color: colors.textSecondary }]} numberOfLines={1}>Total return</Text>
          <CoOwnNumericText
            value={summary.totalUnrealizedGbp + summary.totalRealizedGbp}
            unit="1ZE"
            size="price"
            signed
            showUnit={false}
            showGlyph={false}
            color={(summary.totalUnrealizedGbp + summary.totalRealizedGbp) >= 0 ? colors.success : colors.danger}
          />
        </View>
        <View style={[styles.pnlRow, { borderBottomColor: colors.border }]}>
          <Text style={[styles.pnlLabel, { color: colors.textSecondary }]} numberOfLines={1}>Unrealised</Text>
          <CoOwnNumericText
            value={summary.totalUnrealizedGbp}
            unit="1ZE"
            size="price"
            signed
            showUnit={false}
            showGlyph={false}
            color={summary.totalUnrealizedGbp >= 0 ? colors.success : colors.danger}
          />
        </View>
        <View style={[styles.pnlRow, { borderBottomColor: colors.border }]}>
          <Text style={[styles.pnlLabel, { color: colors.textSecondary }]} numberOfLines={1}>Realised</Text>
          <CoOwnNumericText
            value={summary.totalRealizedGbp}
            unit="1ZE"
            size="price"
            signed
            showUnit={false}
            showGlyph={false}
            color={summary.totalRealizedGbp >= 0 ? colors.success : colors.danger}
          />
        </View>
        {totalDistributionsGbp > 0 && (
          <View style={[styles.pnlRow, { borderBottomColor: colors.border }]}>
            <Text style={[styles.pnlLabel, { color: colors.textSecondary }]} numberOfLines={1}>Distributions</Text>
            <CoOwnNumericText
              value={totalDistributionsGbp}
              unit="1ZE"
              size="price"
              signed
              showUnit={false}
              showGlyph={false}
              color={totalDistributionsGbp >= 0 ? colors.success : colors.danger}
            />
          </View>
        )}
      </View>

      {/* Cost vs value comparison — flat canvas, no card chrome.
          Shows total cost basis against current marked value with
          unrealised and realised P&L. No fabricated historical line. */}
      {positions.length > 0 && (
        <CoOwnPortfolioPerformanceChart
          positions={positions}
          totalValueGbp={summary.totalValueGbp}
          totalCostBasisGbp={totalCostBasisGbp}
          totalRealizedGbp={summary.totalRealizedGbp}
        />
      )}
    </>
  );
}
