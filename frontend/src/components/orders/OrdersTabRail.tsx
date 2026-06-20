import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Colors } from '../../constants/colors';
import { Space, Typography } from '../../theme/designTokens';

export type OrdersTab = 'buying' | 'selling';

interface OrdersTabRailProps {
  activeTab: OrdersTab;
  buyingCount: number;
  sellingCount: number;
  onChange: (tab: OrdersTab) => void;
}

export function OrdersTabRail({
  activeTab,
  buyingCount,
  sellingCount,
  onChange,
}: OrdersTabRailProps) {
  const tabs: { key: OrdersTab; label: string; count: number }[] = [
    { key: 'buying', label: 'Buying', count: buyingCount },
    { key: 'selling', label: 'Selling', count: sellingCount },
  ];

  return (
    <View style={styles.container}>
      {tabs.map((tab) => {
        const isActive = activeTab === tab.key;
        return (
          <Pressable
            key={tab.key}
            style={styles.tab}
            onPress={() => onChange(tab.key)}
            hitSlop={{ top: 8, bottom: 8 }}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={`${tab.label} tab${tab.count > 0 ? `, ${tab.count} orders` : ''}`}
          >
            <Text
              style={[
                styles.tabText,
                isActive && styles.tabTextActive,
              ]}
            >
              {tab.label} {tab.count > 0 ? tab.count : ''}
            </Text>
            {isActive && <View style={styles.tabUnderline} />}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    paddingBottom: 2,
    gap: Space.lg,
  },
  tab: {
    paddingVertical: 8,
    alignItems: 'flex-start',
  },
  tabText: {
    fontSize: 15,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
  },
  tabTextActive: {
    fontSize: 15,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
  },
  tabUnderline: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: Colors.textPrimary,
    borderRadius: 1,
  },
});
