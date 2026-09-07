import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { TxRow } from './OrderDetailRows';

interface Props {
  subtotal: number;
  platformCharge: number;
  buyerProtectionFee?: number | null;
  postageFee?: number | null;
  totalPaid: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  formatFromFiat: (amount: number, currency?: any, opts?: any) => string;
  fiatOpts: { displayMode: 'fiat' };
}

export function TransactionBreakdown({
  subtotal,
  platformCharge,
  buyerProtectionFee,
  postageFee,
  totalPaid,
  formatFromFiat,
  fiatOpts }: Props) {
  const { colors } = useAppTheme();

  const themed = useMemo(() => ({
    sectionLabel: { color: colors.textMuted },
    txDivider: { backgroundColor: colors.border } }), [colors]);

  return (
    <View style={styles.transactionSection}>
      <Text style={[styles.sectionLabel, themed.sectionLabel]}>Transaction</Text>
      <TxRow label="Item" value={formatFromFiat(subtotal, 'GBP', fiatOpts)} />
      <TxRow label="Platform charge" value={formatFromFiat(platformCharge, 'GBP', fiatOpts)} />
      {buyerProtectionFee != null && buyerProtectionFee !== 0 && buyerProtectionFee !== platformCharge ? (
        <TxRow label="Buyer protection fee" value={formatFromFiat(buyerProtectionFee, 'GBP', fiatOpts)} />
      ) : null}
      <TxRow
        label="Delivery"
        value={postageFee != null ? formatFromFiat(postageFee, 'GBP', fiatOpts) : 'Not recorded'}
      />
      <View style={[styles.txDivider, themed.txDivider]} />
      <TxRow label="Total" value={formatFromFiat(totalPaid, 'GBP', fiatOpts)} bold />
    </View>
  );
}

const styles = StyleSheet.create({
  transactionSection: {
    paddingVertical: Space.sm },
  sectionLabel: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
    textTransform: 'uppercase',
    marginBottom: Space.sm },
  txDivider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: Space.sm } });
