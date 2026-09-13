import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Typography } from '../../theme/designTokens';
import type { ThemeColors } from '../../theme/ThemeContext';
import { useHaptic } from '../../hooks/useHaptic';
import { INVENTORY_FILTER_TABS, type InventoryFilterTab } from '../../hooks/inventory/types';
import type { InventoryScreenStyles } from './inventoryScreenStyles';

export interface InventoryFilterRailProps {
  activeFilter: InventoryFilterTab;
  onSelectFilter: (tab: InventoryFilterTab) => void;
  colors: ThemeColors;
  styles: InventoryScreenStyles;
}

/** Filter tabs — underline indicator (InboxScreen segment rail pattern). */
export function InventoryFilterRail({ activeFilter, onSelectFilter, colors, styles }: InventoryFilterRailProps) {
  const haptic = useHaptic();

  return (
    <View style={styles.filterRail}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRailContent}>
        {INVENTORY_FILTER_TABS.map((tab) => {
          const isActive = tab.key === activeFilter;
          return (
            <Pressable
              key={tab.key}
              onPress={() => { haptic.selection(); onSelectFilter(tab.key); }}
              style={styles.filterTab}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={`${tab.label} filter`}
            >
              <Text
                style={[
                  styles.filterTabLabel,
                  { color: isActive ? colors.textPrimary : colors.textMuted },
                  isActive && { fontFamily: Typography.family.semibold },
                ]}
                numberOfLines={1}
              >
                {tab.label}
              </Text>
              <View style={[styles.filterIndicator, isActive && { backgroundColor: colors.textPrimary }]} />
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
