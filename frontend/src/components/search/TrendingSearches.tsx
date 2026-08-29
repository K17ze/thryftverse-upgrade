import React, { useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { useHaptic } from '../../hooks/useHaptic';
import { AnimatedPressable } from '../AnimatedPressable';
import {
  Space,
  Radius,
  Stroke,
  Control } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';

export type TrendDirection = 'up' | 'down' | 'new' | 'stable';

export interface TrendingSearchItem {
  term: string;
  rank: number;
  trend: TrendDirection;
  category?: string;
}

export interface TrendingSearchesProps {
  items: TrendingSearchItem[];
  onSelect: (term: string) => void;
  groupByCategory?: boolean;
}

const TREND_ICON: Record<TrendDirection, keyof typeof Ionicons.glyphMap> = {
  up: 'trending-up',
  down: 'trending-down',
  new: 'flash-outline',
  stable: 'remove' };

const TREND_COLOR_KEY: Record<TrendDirection, Exclude<keyof ThemeColors, 'outfitBackgrounds'>> = {
  up: 'success',
  down: 'danger',
  new: 'brand',
  stable: 'textMuted' };

const TREND_LABEL: Record<TrendDirection, string> = {
  up: 'Rising',
  down: 'Falling',
  new: 'New',
  stable: 'Steady' };

export function TrendingSearches({
  items,
  onSelect,
  groupByCategory = false }: TrendingSearchesProps) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const groupedItems = useMemo(() => {
    if (!groupByCategory) return null;
    const groups = new Map<string, TrendingSearchItem[]>();
    for (const item of items) {
      const key = item.category ?? 'Trending';
      const arr = groups.get(key) ?? [];
      arr.push(item);
      groups.set(key, arr);
    }
    return [...groups.entries()];
  }, [items, groupByCategory]);

  const handleSelect = useCallback(
    (term: string) => {
      haptic.light();
      onSelect(term);
    },
    [haptic, onSelect],
  );

  const renderItem = (item: TrendingSearchItem) => {
    const trendColor = colors[TREND_COLOR_KEY[item.trend]];
    return (
      <AnimatedPressable
        key={`${item.rank}_${item.term}`}
        style={styles.row}
        activeOpacity={0.7}
        onPress={() => handleSelect(item.term)}
        accessibilityLabel={`Trending search rank ${item.rank}: ${item.term}, ${TREND_LABEL[item.trend]}`}
        accessibilityRole="button"
      >
        <Text style={styles.rankText}>{item.rank}</Text>
        <Text style={styles.termText} numberOfLines={1}>{item.term}</Text>
        <View style={styles.trendBadge}>
          <Ionicons name={TREND_ICON[item.trend]} size={12} color={trendColor} />
          {item.trend !== 'stable' && (
            <Text style={[styles.trendLabel, { color: trendColor }]}>
              {TREND_LABEL[item.trend]}
            </Text>
          )}
        </View>
      </AnimatedPressable>
    );
  };

  if (groupByCategory && groupedItems) {
    return (
      <View style={styles.container}>
        {groupedItems.map(([category, categoryItems]) => (
          <View key={category} style={styles.categoryGroup}>
            <Text style={styles.categoryHeader}>{category}</Text>
            {categoryItems.map(renderItem)}
          </View>
        ))}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {items.map(renderItem)}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      paddingHorizontal: Space.md },
    categoryGroup: {
      marginBottom: Space.md },
    categoryHeader: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textMuted,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
      marginBottom: Space.xs },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: Space.sm + 2,
      gap: Space.sm,
      minHeight: Control.hit,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.borderSubtle },
    rankText: {
      width: Control.chrome,
      fontSize: TypographyV2.bodyStrong.size,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      color: colors.textMuted,
      textAlign: 'center' },
    termText: {
      flex: 1,
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      color: colors.textPrimary },
    trendBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs / 2 },
    trendLabel: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: 0.15 } });
}
