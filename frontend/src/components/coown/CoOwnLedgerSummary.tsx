import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Radius, Type, Typography } from '../../theme/designTokens';

export interface CoOwnLedgerSummaryProps {
  issuedCount: number;
  boughtCount: number;
  soldCount: number;
  pausedCount: number;
}

export function CoOwnLedgerSummary({
  issuedCount,
  boughtCount,
  soldCount,
  pausedCount,
}: CoOwnLedgerSummaryProps) {
  const { colors } = useAppTheme();

  const items = [
    { icon: 'add-circle-outline', label: 'Issued', value: issuedCount },
    { icon: 'arrow-down-circle-outline', label: 'Bought', value: boughtCount },
    { icon: 'arrow-up-circle-outline', label: 'Sold', value: soldCount },
    { icon: 'pause-circle-outline', label: 'Paused', value: pausedCount },
  ];

  return (
    <View style={[styles.root, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {items.map((item, i) => (
        <View
          key={item.label}
          style={[
            styles.item,
            i < items.length - 1 && { borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: colors.border },
          ]}
        >
          <Ionicons name={item.icon as any} size={18} color={colors.textSecondary} />
          <Text style={[styles.itemValue, { color: colors.textPrimary }]}>{item.value}</Text>
          <Text style={[styles.itemLabel, { color: colors.textMuted }]}>{item.label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    borderRadius: Radius.lg,
    borderWidth: 0.5,
    paddingVertical: Space.md,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  itemValue: {
    fontSize: Type.priceList.size,
    fontFamily: Typography.family.bold,
    letterSpacing: -0.3,
  },
  itemLabel: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.medium,
    letterSpacing: 0.2,
    textTransform: 'uppercase',
  },
});
