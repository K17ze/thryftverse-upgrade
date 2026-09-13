import React, { useMemo } from 'react';
import { View, Text } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { FlagshipMetricLine } from '../flagship';
import { AnimatedPressable } from '../AnimatedPressable';
import type { EarningsSummary } from '../../services/creatorAnalyticsApi';
import type { SupportedCurrencyCode } from '../../constants/currencies';
import { createCreatorAnalyticsStyles } from './creatorAnalyticsStyles';
import { entryTypeLabel, formatMoney } from './creatorAnalyticsFormat';

// ── Earnings — flat ledger, not a dashboard card ────────────────────
export function CreatorAnalyticsEarnings({
  earnings,
  currencyCode,
  isPayoutLoading,
  payoutError,
  onPayout }: {
  earnings: EarningsSummary | null;
  currencyCode: SupportedCurrencyCode;
  isPayoutLoading: boolean;
  payoutError: string | null;
  onPayout: () => void;
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createCreatorAnalyticsStyles(colors), [colors]);
  if (!earnings) return null;
  return (
    <View style={styles.earningsSection}>
      <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
        Earnings
      </Text>

      {/* Available balance — the dominant figure */}
      <FlagshipMetricLine
        label="Available"
        value={formatMoney(earnings.available.amountMinor, currencyCode)}
        emphasis
        separated
      />
      <FlagshipMetricLine
        label="Estimated"
        value={formatMoney(earnings.estimated.amountMinor, currencyCode)}
        separated
      />
      <FlagshipMetricLine
        label="Finalized"
        value={formatMoney(earnings.finalized.amountMinor, currencyCode)}
        separated
      />
      <FlagshipMetricLine
        label="Paid"
        value={formatMoney(earnings.paid.amountMinor, currencyCode)}
        separated
      />

      {/* Payout action — only if there's available balance */}
      {earnings.available.amountMinor > 0 && (
        <>
          <AnimatedPressable
            onPress={onPayout}
            style={[styles.payoutButton, { backgroundColor: colors.brand }]}
            hapticFeedback="light"
            scaleValue={0.97}
            disabled={isPayoutLoading}
            accessibilityRole="button"
            accessibilityLabel="Request payout"
          >
            <Text style={styles.payoutButtonText}>
              {isPayoutLoading ? 'Processing…' : 'Request payout'}
            </Text>
          </AnimatedPressable>
          {payoutError ? (
            <Text style={[styles.payoutErrorText, { color: colors.danger }]}>
              {payoutError}
            </Text>
          ) : null}
        </>
      )}

      {/* Recent entries — last 5 */}
      {earnings.recentEntries.length > 0 && (
        <View style={styles.earningsEntries}>
          <Text style={[styles.entriesLabel, { color: colors.textMuted }]}>
            Recent
          </Text>
          {earnings.recentEntries.slice(0, 5).map((entry) => (
            <View
              key={entry.id}
              style={[styles.entryRow, { borderBottomColor: colors.border }]}
            >
              <View style={styles.entryInfo}>
                <Text style={[styles.entryType, { color: colors.textPrimary }]}>
                  {entryTypeLabel(entry.entryType)}
                </Text>
                {entry.description && (
                  <Text style={[styles.entryDesc, { color: colors.textMuted }]} numberOfLines={1}>
                    {entry.description}
                  </Text>
                )}
              </View>
              <Text
                style={[
                  styles.entryAmount,
                  { color: entry.amountMinor < 0 ? colors.danger : colors.textPrimary },
                ]}
              >
                {formatMoney(entry.amountMinor, currencyCode)}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
