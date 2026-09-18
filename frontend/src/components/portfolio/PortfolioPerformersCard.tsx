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
/** Direction (glyph + colour) derives from the SIGNED return, never from
 *  rank: the "highest return" row can still be a loss and must render red
 *  down — never a green up arrow on a negative position (F09). */
function directionFor(pct: number, colors: { coownUp: string; coownDown: string; textMuted: string }) {
  if (pct > 0) return { icon: 'arrow-up-outline' as const, color: colors.coownUp };
  if (pct < 0) return { icon: 'arrow-down-outline' as const, color: colors.coownDown };
  return { icon: 'remove-outline' as const, color: colors.textMuted };
}

function returnPct(p: CoOwnPositionVM): number {
  return (p.unrealizedPnlGbp / (p.avgEntryPriceGbp * p.unitsOwned)) * 100;
}

export function PortfolioPerformersCard({ performers, onPositionPress }: PortfolioPerformersCardProps) {
  const { colors } = useAppTheme();

  if (!performers.best && !performers.worst) return null;

  return (
    <View style={[styles.insightCard, { borderBottomColor: colors.border }]}>
      {performers.best && performers.best.avgEntryPriceGbp > 0 && (() => {
        const pct = returnPct(performers.best);
        const dir = directionFor(pct, colors);
        return (
          <AnimatedPressable
            style={styles.insightRow}
            onPress={() => onPositionPress(performers.best!)}
            accessibilityRole="button"
            accessibilityLabel={`Highest return: ${performers.best!.title}, ${pct.toFixed(1)} percent`}
          >
            <Ionicons name={dir.icon} size={14} color={dir.color} />
            <Text style={[styles.insightLabel, { color: colors.textMuted }]} numberOfLines={1}>
              Highest return
            </Text>
            <Text style={[styles.insightTitle, { color: colors.textPrimary }]} numberOfLines={1}>
              {performers.best!.title}
            </Text>
            <CoOwnNumericText
              value={pct}
              unit="pct"
              size="mono"
              signed
              showGlyph={false}
              color={dir.color}
            />
          </AnimatedPressable>
        );
      })()}
      {performers.worst && performers.worst.avgEntryPriceGbp > 0 && performers.worst.assetId !== performers.best?.assetId && (() => {
        const pct = returnPct(performers.worst!);
        const dir = directionFor(pct, colors);
        return (
          <AnimatedPressable
            style={[styles.insightRow, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}
            onPress={() => onPositionPress(performers.worst!)}
            accessibilityRole="button"
            accessibilityLabel={`Lowest return: ${performers.worst!.title}, ${pct.toFixed(1)} percent`}
          >
            <Ionicons name={dir.icon} size={14} color={dir.color} />
            <Text style={[styles.insightLabel, { color: colors.textMuted }]} numberOfLines={1}>
              Lowest return
            </Text>
            <Text style={[styles.insightTitle, { color: colors.textPrimary }]} numberOfLines={1}>
              {performers.worst!.title}
            </Text>
            <CoOwnNumericText
              value={pct}
              unit="pct"
              size="mono"
              signed
              showGlyph={false}
              color={dir.color}
            />
          </AnimatedPressable>
        );
      })()}
    </View>
  );
}
