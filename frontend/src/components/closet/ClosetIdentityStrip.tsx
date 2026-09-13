import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { useFormattedPrice } from '../../hooks/useFormattedPrice';
import type { ClosetStats } from '../../domain/closet';
import { closetStyles, useClosetThemedStyles } from './closetStyles';

interface ClosetIdentityStripProps {
  stats: ClosetStats;
}

/**
 * Closet identity strip — flat canvas + hairline dividers, no card.
 * This is the closet's headline (value, items, collections, savings),
 * promoted to the first viewport so the surface reads as an identity
 * moment, not a footer (AGENTS.md §4 — no card-on-card, hierarchy).
 * Rendered by the parent only when totalItems > 0.
 */
export function ClosetIdentityStrip({ stats }: ClosetIdentityStripProps) {
  const { colors } = useAppTheme();
  const t = useClosetThemedStyles();
  const { formatFromFiat } = useFormattedPrice();
  return (
    <View style={t.identityStrip}>
      <View style={closetStyles.statsRow}>
        <View style={closetStyles.statItem}>
          <Text style={[closetStyles.statValue, t.statValue]}>{stats.totalItems}</Text>
          <Text style={[closetStyles.statLabel, t.statLabel]}>Items</Text>
        </View>
        <View style={[closetStyles.statDivider, t.statDivider]} />
        <View style={closetStyles.statItem}>
          <Text style={[closetStyles.statValue, t.statValue]}>{formatFromFiat(stats.totalValue, 'GBP')}</Text>
          <Text style={[closetStyles.statLabel, t.statLabel]}>Total value</Text>
        </View>
        <View style={[closetStyles.statDivider, t.statDivider]} />
        <View style={closetStyles.statItem}>
          <Text style={[closetStyles.statValue, t.statValue]}>{stats.collectionsCount}</Text>
          <Text style={[closetStyles.statLabel, t.statLabel]}>Collections</Text>
        </View>
      </View>
      {stats.totalSavings > 0 ? (
        <View style={[closetStyles.savingsRow, t.savingsRow]}>
          <Ionicons name="trending-down" size={12} color={colors.success} />
          <Text style={[closetStyles.savingsText, t.savingsText]} maxFontSizeMultiplier={2}>
            {formatFromFiat(stats.totalSavings, 'GBP')} in price drops tracked
          </Text>
        </View>
      ) : null}
    </View>
  );
}
