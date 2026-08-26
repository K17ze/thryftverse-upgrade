import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Typography, Type } from '../../theme/designTokens';

// --- Transaction row (monetary line item) ---

export function TxRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  const { colors } = useAppTheme();
  const txThemed = useMemo(() => ({
    label: { color: colors.textSecondary },
    labelBold: { color: colors.textPrimary },
    value: { color: colors.textPrimary },
    valueBold: { color: colors.textPrimary },
  }), [colors]);
  return (
    <View style={txStyles.row}>
      <Text style={[txStyles.label, txThemed.label, bold && txStyles.labelBold, bold && txThemed.labelBold]}>{label}</Text>
      <Text style={[txStyles.value, txThemed.value, bold && txStyles.valueBold, bold && txThemed.valueBold]}>{value}</Text>
    </View>
  );
}

// --- Detail row (label + value pair) ---

export function DetailRow({ label, value }: { label: string; value: string }) {
  const { colors } = useAppTheme();
  const detailThemed = useMemo(() => ({
    label: { color: colors.textSecondary },
    value: { color: colors.textPrimary },
  }), [colors]);
  return (
    <View style={styles.detailRow}>
      <Text style={[styles.detailLabel, detailThemed.label]}>{label}</Text>
      <Text style={[styles.detailValue, detailThemed.value]}>{value}</Text>
    </View>
  );
}

const txStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Space.xs + 2,
  },
  label: {
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.caption.letterSpacing,
  },
  labelBold: {
    fontSize: Type.bodyStrong.size,
    lineHeight: Type.bodyStrong.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.bodyStrong.letterSpacing,
  },
  // Transaction values use tabular-nums per spec — all monetary values aligned
  value: {
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    fontFamily: Typography.family.medium,
    letterSpacing: Type.caption.letterSpacing,
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
  },
  // Total uses priceList per spec — hero financial value
  valueBold: {
    fontSize: Type.priceList.size,
    lineHeight: Type.priceList.lineHeight,
    fontFamily: Typography.family.bold,
    letterSpacing: Type.priceList.letterSpacing,
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
  },
});

const styles = StyleSheet.create({
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Space.sm,
    gap: Space.md,
  },
  detailLabel: {
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.caption.letterSpacing,
  },
  detailValue: {
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.caption.letterSpacing,
    textAlign: 'right',
    flex: 1,
  },
});
