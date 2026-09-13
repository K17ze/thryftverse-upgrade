import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { AnimatedPressable } from '../AnimatedPressable';
import { haptics } from '../../utils/haptics';
import { Typography, Radius, Space } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import {
  PRIMARY_FILTERS,
  type NotificationFilter } from './notificationViewModels';

export interface NotificationFilterTabsProps {
  activeFilter: NotificationFilter;
  filterCounts: Record<NotificationFilter, number>;
  onSelect: (filter: NotificationFilter) => void;
}

/**
 * Primary pill-style filter tabs — always visible at the top of the list.
 * The most useful commerce/social filters get direct one-tap access; the
 * remaining filters stay behind the overflow funnel icon.
 */
export function NotificationFilterTabs({
  activeFilter,
  filterCounts,
  onSelect,
}: NotificationFilterTabsProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View
      style={styles.filterTabRow}
      accessibilityRole="tablist"
      accessibilityLabel="Notification filters"
    >
      {PRIMARY_FILTERS.map((filter) => {
        const isActive = activeFilter === filter.key;
        const count = filterCounts[filter.key] ?? 0;
        return (
          <AnimatedPressable
            key={filter.key}
            style={[
              styles.filterTab,
              isActive && styles.filterTabActive,
            ]}
            onPress={() => { haptics.tap(); onSelect(filter.key); }}
            activeOpacity={0.7}
            scaleValue={0.96}
            hapticFeedback="light"
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={`${filter.label} filter${count > 0 ? `, ${count} items` : ''}`}
          >
            <Text
              style={[
                styles.filterTabText,
                isActive && styles.filterTabTextActive,
              ]}
              numberOfLines={1}
            >
              {filter.label}
            </Text>
            {count > 0 ? (
              <Text style={[styles.filterTabCount, isActive && styles.filterTabCountActive]}>
                {count > 99 ? '99+' : count}
              </Text>
            ) : null}
          </AnimatedPressable>
        );
      })}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  filterTabRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
    paddingHorizontal: Space.md,
    paddingTop: Space.sm + 2,
    paddingBottom: Space.xs },
  filterTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 1,
    paddingVertical: Space.xs + 2,
    paddingHorizontal: Space.sm + 4,
    borderRadius: Radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent' },
  // Active filter tab uses a solid brand fill, not brandSubtle (a 6% grey
  // wash). A solid fill creates a clear visual anchor at the top of the
  // screen and makes the selected state unmistakable at thumbnail scale.
  filterTabActive: {
    backgroundColor: colors.brand,
    borderColor: 'transparent' },
  filterTabText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textMuted,
    letterSpacing: TypographyV2.meta.letterSpacing },
  filterTabTextActive: {
    fontFamily: Typography.family.semibold,
    color: colors.textInverse },
  filterTabCount: {
    fontSize: TypographyV2.meta.size - 1,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textMuted,
    fontVariant: ['tabular-nums'] },
  filterTabCountActive: {
    color: colors.textInverse,
    opacity: 0.7 },
  });
}
