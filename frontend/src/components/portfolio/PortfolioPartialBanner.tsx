import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { portfolioScreenStyles as styles } from './portfolioScreenStyles';

/**
 * Inline warning when some asset fetches failed — sits above the
 * positions list as an advisory; does not replace the list.
 */
export function PortfolioPartialBanner() {
  const { colors } = useAppTheme();
  return (
    <View style={[styles.partialBanner, { backgroundColor: colors.warningSubtle, borderColor: colors.warningBorder }]}>
      <Ionicons name="alert-circle-outline" size={16} color={colors.warning} />
      <Text style={[styles.partialBannerText, { color: colors.textSecondary }]} numberOfLines={2}>
        Some positions are unavailable. Totals may be incomplete.
      </Text>
    </View>
  );
}
