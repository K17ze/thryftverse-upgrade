import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { AnimatedPressable } from '../AnimatedPressable';
import { CoOwnNumericText } from '../ui/CoOwnNumericText';
import { CoOwnPortfolioAllocation } from '../coown';
import type { CoOwnPositionVM } from '../../services/coOwnPortfolio';
import type { AllocationBar, ClassBar, IssuerBand } from './portfolioViewModels';
import { portfolioScreenStyles as styles } from './portfolioScreenStyles';

export interface PortfolioAllocationCardProps {
  positions: CoOwnPositionVM[];
  totalValueGbp: number;
  allocationBars: AllocationBar[];
  classBars: ClassBar[];
  issuerBands: IssuerBand[];
  /** Expanded state lives on the screen so it survives Positions ↔
   *  Insights tab switches (this card unmounts when its tab hides). */
  allocationExpanded: boolean;
  onToggleAllocation: () => void;
}

/**
 * Allocation breakdowns — collapsible for progressive disclosure.
 * Collapsed by default to calm the screen; expands on tap.
 */
export function PortfolioAllocationCard({
  positions,
  totalValueGbp,
  allocationBars,
  classBars,
  issuerBands,
  allocationExpanded,
  onToggleAllocation,
}: PortfolioAllocationCardProps) {
  const { colors } = useAppTheme();

  if (allocationBars.length === 0) return null;

  return (
    <View style={[styles.allocationCard, { borderBottomColor: colors.border }]}>
      <AnimatedPressable
        style={styles.allocationHeader}
        onPress={onToggleAllocation}
        accessibilityRole="button"
        accessibilityLabel={allocationExpanded ? 'Collapse allocation breakdown' : 'Expand allocation breakdown'}
        accessibilityState={{ expanded: allocationExpanded }}
      >
        <View>
          <Text style={[styles.allocationTitle, { color: colors.textPrimary }]}>Allocation</Text>
          <Text style={[styles.allocationSubtitle, { color: colors.textMuted }]} numberOfLines={1}>
            {allocationBars.length} {allocationBars.length === 1 ? 'asset' : 'assets'}
            {classBars.length > 0 ? ` · ${classBars.length} ${classBars.length === 1 ? 'class' : 'classes'}` : ''}
          </Text>
        </View>
        <Ionicons
          name={allocationExpanded ? 'chevron-up-outline' : 'chevron-down-outline'}
          size={18}
          color={colors.textSecondary}
        />
      </AnimatedPressable>
      {allocationExpanded && (
        <>
          {/* Allocation donut — flagship portfolio visualization.
              Sits at the top of the expanded allocation section so
              the user sees the overall composition at a glance,
              with the bar breakdowns below for detail. */}
          {allocationBars.length > 0 && (
            <CoOwnPortfolioAllocation
              positions={positions.map((p) => ({
                assetId: p.assetId,
                title: p.title,
                marketValueGbp: p.currentValueGbp,
                category: p.category,
              }))}
              totalValueGbp={totalValueGbp}
              groupBy="asset"
            />
          )}
          <Text style={[styles.allocationSubtitle, { color: colors.textMuted }]}>By asset</Text>
          <View style={styles.barsContainer}>
            {allocationBars.map((bar) => (
              <View key={bar.id} style={styles.barItem}>
                <View style={styles.barHeader}>
                  <Text style={[styles.barLabel, { color: colors.textSecondary }]} numberOfLines={1}>{bar.title}</Text>
                  <CoOwnNumericText
                    value={bar.ratio * 100}
                    unit="pct"
                    size="mono"
                    showUnit={false}
                    color={colors.textMuted}
                  />
                </View>
                <View style={[styles.barTrack, { backgroundColor: colors.surfaceAlt }]}>
                  <View style={[styles.barFill, { width: `${bar.ratio * 100}%`, backgroundColor: colors.brand }]} />
                </View>
              </View>
            ))}
          </View>

          {/* By class allocation — spec 06 §1.2 */}
          {classBars.length > 0 && (
            <View style={[styles.issuerSection, { borderTopColor: colors.border }]}>
              <Text style={[styles.allocationSubtitle, { color: colors.textMuted }]}>By class</Text>
              <View style={styles.barsContainer}>
                {classBars.map((bar) => (
                  <View key={bar.id} style={styles.barItem}>
                    <View style={styles.barHeader}>
                      <Text style={[styles.barLabel, { color: colors.textSecondary }]} numberOfLines={1}>{bar.label}</Text>
                      <CoOwnNumericText
                        value={bar.ratio * 100}
                        unit="pct"
                        size="mono"
                        showUnit={false}
                        color={colors.textMuted}
                      />
                    </View>
                    <View style={[styles.barTrack, { backgroundColor: colors.surfaceAlt }]}>
                      <View style={[styles.barFill, { width: `${bar.ratio * 100}%`, backgroundColor: colors.textSecondary }]} />
                    </View>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Issuer concentration bands — privacy-safe (spec 06 §1.2) */}
          {issuerBands.length > 1 && (
            <View style={[styles.issuerSection, { borderTopColor: colors.border }]}>
              <Text style={[styles.allocationSubtitle, { color: colors.textMuted }]}>By issuer concentration</Text>
              <View style={styles.barsContainer}>
                {issuerBands.map((band) => (
                  <View key={band.id} style={styles.barItem}>
                    <View style={styles.barHeader}>
                      <Text style={[styles.barLabel, { color: colors.textSecondary }]} numberOfLines={1}>
                        {band.label}
                      </Text>
                      <Text style={[styles.barPct, { color: colors.textMuted }]}>{band.band}</Text>
                    </View>
                    <View style={[styles.barTrack, { backgroundColor: colors.surfaceAlt }]}>
                      <View style={[styles.barFill, { width: `${band.ratio * 100}%`, backgroundColor: colors.textSecondary }]} />
                    </View>
                  </View>
                ))}
              </View>
            </View>
          )}
        </>
      )}
    </View>
  );
}
