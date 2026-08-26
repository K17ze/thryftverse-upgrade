import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Typography, Type } from '../../theme/designTokens';
import { TxRow } from './OrderDetailRows';

interface Props {
  subtotal: number;
  platformCharge: number;
  buyerProtectionFee?: number | null;
  postageFee?: number | null;
  totalPaid: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  formatFromFiat: (amount: number, currency?: any, opts?: any) => string;
  currencyCode: string;
  fiatOpts: { displayMode: 'fiat' };
}

export function TransactionBreakdown({
  subtotal,
  platformCharge,
  buyerProtectionFee,
  postageFee,
  totalPaid,
  formatFromFiat,
  currencyCode,
  fiatOpts,
}: Props) {
  const { colors } = useAppTheme();

  const themed = useMemo(() => ({
    sectionLabel: { color: colors.textMuted },
    txDivider: { backgroundColor: colors.border },
  }), [colors]);

  return (
    <View style={styles.transactionSection}>
      <Text style={[styles.sectionLabel, themed.sectionLabel]}>Transaction</Text>
      <TxRow label="Item" value={formatFromFiat(subtotal, currencyCode, fiatOpts)} />
      <TxRow label="Platform charge" value={formatFromFiat(platformCharge, currencyCode, fiatOpts)} />
      {buyerProtectionFee != null && buyerProtectionFee !== 0 && buyerProtectionFee !== platformCharge ? (
        <TxRow label="Buyer protection fee" value={formatFromFiat(buyerProtectionFee, currencyCode, fiatOpts)} />
      ) : null}
      <TxRow
        label="Delivery"
        value={postageFee != null ? formatFromFiat(postageFee, currencyCode, fiatOpts) : 'Not recorded'}
      />
      <View style={[styles.txDivider, themed.txDivider]} />
      <TxRow label="Total" value={formatFromFiat(totalPaid, currencyCode, fiatOpts)} bold />
    </View>
  );
}

const styles = StyleSheet.create({
  transactionSection: {
    paddingVertical: Space.sm,
  },
  sectionLabel: {
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.caption.letterSpacing,
    textTransform: 'uppercase',
    marginBottom: Space.sm,
  },
  txDivider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: Space.sm,
  },
});
