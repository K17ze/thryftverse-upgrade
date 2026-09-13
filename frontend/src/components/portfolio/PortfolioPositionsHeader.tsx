import React from 'react';
import { View, Text } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { AnimatedPressable } from '../AnimatedPressable';
import { portfolioScreenStyles as styles } from './portfolioScreenStyles';

export interface PortfolioPositionsHeaderProps {
  onViewDistributions: () => void;
  onOpenMarketOverview: () => void;
}

/**
 * "Your positions" section row — rendered above the holdings list on the
 * Positions tab, with the quiet Distributions / Market overview links.
 */
export function PortfolioPositionsHeader({
  onViewDistributions,
  onOpenMarketOverview,
}: PortfolioPositionsHeaderProps) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.sectionRow}>
      <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Your positions</Text>
      <View style={styles.sectionActions}>
        <AnimatedPressable
          onPress={onViewDistributions}
          accessibilityRole="button"
          accessibilityLabel="View distribution history"
          scaleValue={0.96}
          hapticFeedback="light"
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={[styles.sectionLink, { color: colors.textSecondary }]}>Distributions</Text>
        </AnimatedPressable>
        <AnimatedPressable
          onPress={onOpenMarketOverview}
          accessibilityRole="button"
          accessibilityLabel="Open market overview"
          scaleValue={0.96}
          hapticFeedback="light"
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={[styles.sectionLink, { color: colors.textSecondary }]}>Market overview</Text>
        </AnimatedPressable>
      </View>
    </View>
  );
}
