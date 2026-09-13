import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { AnimatedPressable } from '../AnimatedPressable';
import { CoOwnNumericText } from '../ui/CoOwnNumericText';
import type { CoOwnPositionVM } from '../../services/coOwnPortfolio';
import type { PortfolioPerformers } from './portfolioViewModels';
import { portfolioScreenStyles as styles } from './portfolioScreenStyles';

export interface PortfolioPerformersCardProps {
  performers: PortfolioPerformers;
  onPositionPress: (position: CoOwnPositionVM) => void;
}

/**
 * Position insight — calm, factual summary replacing gamification. Shows
 * the best and worst positions by unrealized P&L without "TOP PERFORMER"
 * / "LAGGING" labels that gamify holding.
 */
export function PortfolioPerformersCard({ performers, onPositionPress }: PortfolioPerformersCardProps) {
  const { colors } = useAppTheme();

  if (!performers.best && !performers.worst) return null;

  return (
    <View style={[styles.insightCard, { borderBottomColor: colors.border }]}>
      {performers.best && performers.best.avgEntryPriceGbp > 0 && (
        <AnimatedPressable
          style={styles.insightRow}
          onPress={() => onPositionPress(performers.best!)}
          accessibilityRole="button"
          accessibilityLabel={`Best position: ${performers.best.title}`}
        >
          <Ionicons name="arrow-up-outline" size={14} color={colors.success} />
          <Text style={[styles.insightLabel, { color: colors.textMuted }]} numberOfLines={1}>
            Best position
          </Text>
          <Text style={[styles.insightTitle, { color: colors.textPrimary }]} numberOfLines={1}>
            {performers.best.title}
          </Text>
          <CoOwnNumericText
            value={(performers.best.unrealizedPnlGbp / (performers.best.avgEntryPriceGbp * performers.best.unitsOwned)) * 100}
            unit="pct"
            size="mono"
            signed
            showGlyph={false}
            color={colors.success}
          />
        </AnimatedPressable>
      )}
      {performers.worst && performers.worst.avgEntryPriceGbp > 0 && performers.worst.assetId !== performers.best?.assetId && (
        <AnimatedPressable
          style={[styles.insightRow, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}
          onPress={() => onPositionPress(performers.worst!)}
          accessibilityRole="button"
          accessibilityLabel={`Worst position: ${performers.worst.title}`}
        >
          <Ionicons name="arrow-down-outline" size={14} color={colors.danger} />
          <Text style={[styles.insightLabel, { color: colors.textMuted }]} numberOfLines={1}>
            Worst position
          </Text>
          <Text style={[styles.insightTitle, { color: colors.textPrimary }]} numberOfLines={1}>
            {performers.worst.title}
          </Text>
          <CoOwnNumericText
            value={(performers.worst.unrealizedPnlGbp / (performers.worst.avgEntryPriceGbp * performers.worst.unitsOwned)) * 100}
            unit="pct"
            size="mono"
            signed
            showGlyph={false}
            color={colors.danger}
          />
        </AnimatedPressable>
      )}
    </View>
  );
}
