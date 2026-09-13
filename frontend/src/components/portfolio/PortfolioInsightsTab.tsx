import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { AnimatedPressable } from '../AnimatedPressable';
import { CoOwnNumericText } from '../ui/CoOwnNumericText';
import { CoOwnPortfolioStorytelling } from '../coown';
import type { CoOwnPositionVM, CoOwnPortfolioSummary } from '../../services/coOwnPortfolio';
import { PortfolioPnlSection } from './PortfolioPnlSection';
import { PortfolioPerformersCard } from './PortfolioPerformersCard';
import { PortfolioAllocationCard } from './PortfolioAllocationCard';
import type {
  AllocationBar,
  ClassBar,
  FormatFromFiat,
  IssuerBand,
  PortfolioPerformers,
} from './portfolioViewModels';
import { portfolioScreenStyles as styles } from './portfolioScreenStyles';

export interface PortfolioInsightsTabProps {
  summary: CoOwnPortfolioSummary;
  positions: CoOwnPositionVM[];
  totalCostBasisGbp: number;
  performers: PortfolioPerformers;
  allocationBars: AllocationBar[];
  classBars: ClassBar[];
  issuerBands: IssuerBand[];
  watchlistCount: number;
  formatFromFiat: FormatFromFiat;
  allocationExpanded: boolean;
  onToggleAllocation: () => void;
  onPositionPress: (position: CoOwnPositionVM) => void;
  onOpenWatchlist: () => void;
}

/**
 * Insights tab — allocations, P&L decomposition, performers, realised
 * returns, storytelling and watchlist, moved here from the default view
 * to keep the Positions tab calm and focused.
 */
export function PortfolioInsightsTab({
  summary,
  positions,
  totalCostBasisGbp,
  performers,
  allocationBars,
  classBars,
  issuerBands,
  watchlistCount,
  formatFromFiat,
  allocationExpanded,
  onToggleAllocation,
  onPositionPress,
  onOpenWatchlist,
}: PortfolioInsightsTabProps) {
  const { colors } = useAppTheme();

  return (
    <>
      <PortfolioPnlSection
        summary={summary}
        positions={positions}
        totalCostBasisGbp={totalCostBasisGbp}
      />

      <PortfolioPerformersCard
        performers={performers}
        onPositionPress={onPositionPress}
      />

      <PortfolioAllocationCard
        positions={positions}
        totalValueGbp={summary.totalValueGbp}
        allocationBars={allocationBars}
        classBars={classBars}
        issuerBands={issuerBands}
        allocationExpanded={allocationExpanded}
        onToggleAllocation={onToggleAllocation}
      />

      {/* Realised returns — income surface from closed positions */}
      {summary.totalRealizedGbp !== 0 && (
        <View style={[styles.realisedCard, { borderBottomColor: colors.border }]}>
          <View style={styles.realisedHeader}>
            <Text style={[styles.realisedLabel, { color: colors.textMuted }]}>Realised returns</Text>
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
        </View>
      )}

      {/* Phase 6: Portfolio storytelling — premium of last/NAV explanation */}
      {performers.best && performers.best.avgEntryPriceGbp > 0 && (
        <CoOwnPortfolioStorytelling
          premiumPct={null}
          lastPriceLabel={formatFromFiat(performers.best.currentValueGbp / performers.best.unitsOwned, 'GBP')}
          markSourceLabel="Last trade"
          markAgeLabel={undefined}
        />
      )}

      {/* Watchlist summary */}
      {watchlistCount > 0 && (
        <AnimatedPressable
          style={[styles.watchlistRow, { borderBottomColor: colors.border }]}
          onPress={onOpenWatchlist}
          accessibilityRole="button"
          accessibilityLabel={`Open watchlist with ${watchlistCount} watched assets`}
          scaleValue={0.98}
          hapticFeedback="light"
        >
          <View style={styles.watchlistBody}>
            <Text style={[styles.watchlistTitle, { color: colors.textPrimary }]}>Watchlist</Text>
            <Text style={[styles.watchlistSub, { color: colors.textSecondary }]} numberOfLines={1}>
              {watchlistCount} {watchlistCount === 1 ? 'asset' : 'assets'} watched
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={15} color={colors.textMuted} />
        </AnimatedPressable>
      )}

      {/* Ownership rights — what Co-Own entitles */}
      <View style={[styles.rightsCard, { borderBottomColor: colors.border }]}>
        <View style={styles.rightsHeader}>
          <Ionicons name="document-text-outline" size={14} color={colors.textSecondary} />
          <Text style={[styles.rightsTitle, { color: colors.textPrimary }]}>Rights depend on the instrument</Text>
        </View>
        <Text style={[styles.rightsText, { color: colors.textSecondary }]}>Open a position to review.</Text>
      </View>
    </>
  );
}
