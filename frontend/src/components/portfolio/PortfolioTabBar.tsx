import React from 'react';
import { View, Text } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { FontFamily } from '../../theme/designTokens';
import { AnimatedPressable } from '../AnimatedPressable';
import { haptics } from '../../utils/haptics';
import type { PortfolioTab } from '../../hooks/portfolio/types';
import { portfolioScreenStyles as styles } from './portfolioScreenStyles';

export interface PortfolioTabBarProps {
  activeTab: PortfolioTab;
  onSelect: (tab: PortfolioTab) => void;
}

/**
 * Tab toggle — Positions (default) vs Insights. Positions shows holdings
 * immediately; Insights moves allocations, P&L decomposition, performers
 * and storytelling to a separate tab.
 */
export function PortfolioTabBar({ activeTab, onSelect }: PortfolioTabBarProps) {
  const { colors } = useAppTheme();
  return (
    <View style={[styles.portfolioTabRow, { borderColor: colors.border }]}>
      <AnimatedPressable
        onPress={() => { haptics.selection(); onSelect('positions'); }}
        style={[styles.portfolioTab, activeTab === 'positions' && { borderBottomColor: colors.textPrimary }]}
        hitSlop={{ top: 8, bottom: 8, left: 0, right: 0 }}
        accessibilityRole="tab"
        accessibilityLabel="Positions tab"
        accessibilityState={{ selected: activeTab === 'positions' }}
      >
        <Text style={[
          styles.portfolioTabText,
          {
            color: activeTab === 'positions' ? colors.textPrimary : colors.textSecondary,
            fontFamily: activeTab === 'positions' ? FontFamily.semibold : FontFamily.regular,
          },
        ]}>
          Positions
        </Text>
      </AnimatedPressable>
      <AnimatedPressable
        onPress={() => { haptics.selection(); onSelect('insights'); }}
        style={[styles.portfolioTab, activeTab === 'insights' && { borderBottomColor: colors.textPrimary }]}
        hitSlop={{ top: 8, bottom: 8, left: 0, right: 0 }}
        accessibilityRole="tab"
        accessibilityLabel="Insights tab"
        accessibilityState={{ selected: activeTab === 'insights' }}
      >
        <Text style={[
          styles.portfolioTabText,
          {
            color: activeTab === 'insights' ? colors.textPrimary : colors.textSecondary,
            fontFamily: activeTab === 'insights' ? FontFamily.semibold : FontFamily.regular,
          },
        ]}>
          Insights
        </Text>
      </AnimatedPressable>
    </View>
  );
}
