import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useAppTheme } from '../../theme/ThemeContext';
import { useFormattedPrice } from '../../hooks/useFormattedPrice';
import { formatIzeAmount, izeToUsd, formatUsd } from '../../utils/currency';
import { createConvertStyles } from './convertStyles';
import { ConvertSummaryRow } from './ConvertSummaryRow';
import type { ConversionResult } from './convertViewModels';

interface Props {
  result: ConversionResult;
}

// STEP 5: RECEIPT — post-conversion breakdown with the full
// principal/fee/net disclosure from the executed conversion.
export function ConvertReceiptStep({ result }: Props) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createConvertStyles(colors), [colors]);
  const { formatFromFiat } = useFormattedPrice();

  return (
    <View>
      <View style={styles.receiptWrap}>
        <Ionicons name="checkmark-circle" size={56} color={colors.success} style={styles.stepIcon} />
        <Text style={[styles.receiptTitle, { color: colors.textPrimary }]}>
          Conversion complete
        </Text>
        <Text style={[styles.receiptSubtitle, { color: colors.textSecondary }]}>
          Converted {formatIzeAmount(result.izeAmount, 2)} to{' '}
          {formatFromFiat(result.netRedemption, result.fiatCurrency as any, {
            displayMode: 'fiat' })}
        </Text>

        <View style={styles.receiptBlock}>
          <ConvertSummaryRow
            label="Converted"
            value={`${formatIzeAmount(result.izeAmount, 2)} · ${formatUsd(izeToUsd(result.izeAmount))}`}
          />
          <ConvertSummaryRow
            label="Principal"
            value={formatFromFiat(result.principalAmount, result.fiatCurrency as any, {
              displayMode: 'fiat' })}
          />
          <ConvertSummaryRow
            label={`Platform fee (${result.feeBps} bps)`}
            value={`−${formatFromFiat(result.feeAmount, result.fiatCurrency as any, {
              displayMode: 'fiat' })}`}
          />
          <ConvertSummaryRow
            label="You received"
            value={formatFromFiat(result.netRedemption, result.fiatCurrency as any, {
              displayMode: 'fiat' })}
          />
          <ConvertSummaryRow
            label="Currency"
            value={result.fiatCurrency}
          />
          <ConvertSummaryRow
            label="Timestamp"
            value={new Date(result.timestamp).toLocaleString('en-GB', {
              dateStyle: 'medium',
              timeStyle: 'short' })}
            total
          />
        </View>
      </View>
    </View>
  );
}
