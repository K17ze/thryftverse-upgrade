import React from 'react';
import { View, Text } from 'react-native';

import { useAppTheme } from '../../theme/ThemeContext';
import { useFormattedPrice } from '../../hooks/useFormattedPrice';
import { formatIzeAmount, formatUsd } from '../../utils/currency';
import type { ConvertQuotePayload } from '../../services/walletApi';
import type { SupportedCurrencyCode } from '../../constants/currencies';
import { createConvertStyles } from './convertStyles';
import { ConvertSummaryRow } from './ConvertSummaryRow';
import { ConvertRateTimestamp } from './ConvertRateTimestamp';

interface Props {
  quote: ConvertQuotePayload;
  izeValue: number;
  usdEquivalent: number;
  currencyCode: SupportedCurrencyCode;
  rateTimestampLabel: string | null;
  rateExpiryMs: number | null;
  isRateExpired: boolean;
  rateExpiryLabel: string;
  onRefreshRates: () => void;
}

// STEP 2: REVIEW — full transparent principal/fee/net breakdown for the
// quoted conversion before biometric confirmation.
export function ConvertReviewStep({
  quote,
  izeValue,
  usdEquivalent,
  currencyCode,
  rateTimestampLabel,
  rateExpiryMs,
  isRateExpired,
  rateExpiryLabel,
  onRefreshRates,
}: Props) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createConvertStyles(colors), [colors]);
  const { formatFromFiat } = useFormattedPrice();

  return (
    <View style={styles.reviewBlock}>
      <Text style={[styles.reviewTitle, { color: colors.textPrimary }]}>
        Conversion summary
      </Text>

      <ConvertSummaryRow
        label="You convert"
        value={`${formatIzeAmount(izeValue, 2)} · ${formatUsd(usdEquivalent)}`}
        emphasis
      />
      <ConvertSummaryRow
        label="Principal"
        value={formatFromFiat(quote.principalAmount, 'GBP', { displayMode: 'fiat' })}
      />
      <ConvertSummaryRow
        label={`Platform fee (${quote.feeBps} bps)`}
        value={`−${formatFromFiat(quote.feeAmount, 'GBP', { displayMode: 'fiat' })}`}
      />
      <ConvertSummaryRow
        label="You receive"
        value={formatFromFiat(quote.netFiatAmount, 'GBP', { displayMode: 'fiat' })}
        total
      />

      <Text style={[styles.reviewHint, { color: colors.textMuted }]}>
        1ZE is burned at par (1 1ZE = $1.00 USD) and converted to {currencyCode} at the
        prevailing rate. The fee is a transparent line item — you see exactly what you pay.
      </Text>
      <ConvertRateTimestamp
        label="Reference rate as of"
        rateTimestampLabel={rateTimestampLabel}
        rateExpiryMs={rateExpiryMs}
        isRateExpired={isRateExpired}
        rateExpiryLabel={rateExpiryLabel}
        onRefreshRates={onRefreshRates}
      />
    </View>
  );
}
