import React from 'react';
import {
  View,
  Text,
  TextInput,
  ActivityIndicator,
  Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useAppTheme } from '../../theme/ThemeContext';
import { useHaptic } from '../../hooks/useHaptic';
import { useFormattedPrice } from '../../hooks/useFormattedPrice';
import { sanitizeDecimalInput } from '../../utils/currencyAuthoringFlows';
import { formatIzeAmount, izeToUsd, formatUsd } from '../../utils/currency';
import type { ConvertQuotePayload } from '../../services/walletApi';
import { createConvertStyles } from './convertStyles';
import { ConvertSummaryRow } from './ConvertSummaryRow';
import { ConvertRateTimestamp } from './ConvertRateTimestamp';

interface Props {
  availableIze: number;
  amount: string;
  onAmountChange: (value: string) => void;
  izeValue: number;
  usdEquivalent: number;
  exceedsBalance: boolean;
  isFetchingQuote: boolean;
  quoteError: boolean;
  quote: ConvertQuotePayload | null;
  onRetryQuote: () => void;
  rateTimestampLabel: string | null;
  rateExpiryMs: number | null;
  isRateExpired: boolean;
  rateExpiryLabel: string;
  onRefreshRates: () => void;
}

// STEP 1: AMOUNT — available 1ZE hero, decimal amount input and the live
// backend quote breakdown with the rate-validity timestamp.
export function ConvertAmountStep({
  availableIze,
  amount,
  onAmountChange,
  izeValue,
  usdEquivalent,
  exceedsBalance,
  isFetchingQuote,
  quoteError,
  quote,
  onRetryQuote,
  rateTimestampLabel,
  rateExpiryMs,
  isRateExpired,
  rateExpiryLabel,
  onRefreshRates,
}: Props) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createConvertStyles(colors), [colors]);
  const haptic = useHaptic();
  const { formatFromFiat } = useFormattedPrice();

  return (
    <>
      {/* Available 1ZE balance — flat, no card or decorative icon circle */}
      <View style={styles.balanceBlock}>
        <Text style={[styles.heroTitle, { color: colors.textPrimary }]}>
          {formatIzeAmount(availableIze, 2)}
        </Text>
        <Text style={[styles.heroSubtitle, { color: colors.textSecondary }]}>
          Available 1ZE · {formatUsd(izeToUsd(availableIze))} at par
        </Text>
      </View>

      {/* Amount input */}
      <View>
        <View style={styles.amountWrap}>
          <Text style={styles.amountSuffix}>1ZE</Text>
          <TextInput
            style={styles.amountInput}
            value={amount}
            onChangeText={(value) => {
              haptic.selection();
              onAmountChange(sanitizeDecimalInput(value));
            }}
            onFocus={() => haptic.light()}
            keyboardType="decimal-pad"
            autoFocus
            selectionColor={colors.brand}
            placeholder="0.00"
            placeholderTextColor={colors.textMuted}
            accessibilityLabel="Amount in 1ZE"
            accessibilityHint="Enter the 1ZE amount to convert to fiat"
          />
        </View>
        <Text style={styles.availableText}>
          Available: {formatIzeAmount(availableIze, 2)} · {formatUsd(izeToUsd(availableIze))}
        </Text>
        {exceedsBalance ? (
          <Text style={styles.balanceError}>
            Entered amount exceeds available 1ZE balance.
          </Text>
        ) : null}
      </View>

      {/* Live calculation summary -- transparent at-par breakdown */}
      {izeValue > 0 && !exceedsBalance && (
        <View>
          <View style={styles.calcBlock}>
            {isFetchingQuote ? (
              <View style={styles.quoteLoadingRow}>
                <ActivityIndicator size="small" color={colors.textMuted} />
                <Text style={[styles.quoteStatusText, { color: colors.textMuted }]}>
                  Fetching live quote…
                </Text>
              </View>
            ) : quoteError ? (
              <View style={styles.quoteErrorRow}>
                <Ionicons name="alert-circle-outline" size={14} color={colors.danger} />
                <Text style={[styles.quoteStatusText, { color: colors.danger }]}>
                  Couldn't fetch quote.
                </Text>
                <Pressable
                  hitSlop={8}
                  onPress={onRetryQuote}
                  accessibilityRole="button"
                  accessibilityLabel="Retry quote fetch"
                >
                  <Text style={[styles.quoteStatusText, { color: colors.brand }]}>
                    Retry
                  </Text>
                </Pressable>
              </View>
            ) : quote ? (
              <>
                <ConvertSummaryRow
                  label="You convert"
                  value={`${formatIzeAmount(izeValue, 2)} · ${formatUsd(usdEquivalent)}`}
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
              </>
            ) : null}
          </View>
          <ConvertRateTimestamp
            label="Rate as of"
            rateTimestampLabel={rateTimestampLabel}
            rateExpiryMs={rateExpiryMs}
            isRateExpired={isRateExpired}
            rateExpiryLabel={rateExpiryLabel}
            onRefreshRates={onRefreshRates}
          />
        </View>
      )}
    </>
  );
}
