import React, { useMemo } from 'react';
import { View, Text } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { FlagshipMetricLine } from '../flagship';
import { AnimatedPressable } from '../AnimatedPressable';
import type { EarningsSummary } from '../../services/creatorAnalyticsApi';
import type { SupportedCurrencyCode } from '../../constants/currencies';
import { createCreatorAnalyticsStyles } from './creatorAnalyticsStyles';
import { entryTypeLabel, formatMoney } from './creatorAnalyticsFormat';
import { CURRENCIES, DEFAULT_CURRENCY_CODE } from '../../constants/currencies';

// ── Earnings — flat ledger, not a dashboard card ────────────────────
export function CreatorAnalyticsEarnings({
  earnings,
  isPayoutLoading,
  isOffline,
  payoutError,
  onPayout }: {
  earnings: EarningsSummary | null;
  isPayoutLoading: boolean;
  isOffline: boolean;
  payoutError: string | null;
  onPayout: () => void;
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createCreatorAnalyticsStyles(colors), [colors]);
  // The ledger's own currency is authoritative — formatting minor units
  // with the user's display currency would print the wrong symbol when
  // they differ (earnings are not converted).
  const ledgerCurrency =
    earnings && earnings.currency in CURRENCIES
      ? (earnings.currency as SupportedCurrencyCode)
      : DEFAULT_CURRENCY_CODE;
  if (!earnings) return null;
  return (
    <View style={styles.earningsSection}>
      <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
        Earnings
      </Text>

      {/* Available balance — the dominant figure */}
      <FlagshipMetricLine
        label="Available"
        value={formatMoney(earnings.available.amountMinor, ledgerCurrency)}
        emphasis
        separated
      />
      <FlagshipMetricLine
        label="Estimated"
        value={formatMoney(earnings.estimated.amountMinor, ledgerCurrency)}
        separated
      />
      <FlagshipMetricLine
        label="Finalized"
        value={formatMoney(earnings.finalized.amountMinor, ledgerCurrency)}
        separated
      />
      {/* Held — money parked in an in-flight bank payout. Without this line
          Available silently drops to zero after a payout request. */}
      {earnings.held.amountMinor > 0 && (
        <FlagshipMetricLine
          label="Processing"
          value={formatMoney(earnings.held.amountMinor, ledgerCurrency)}
          separated
        />
      )}
      <FlagshipMetricLine
        label="Paid"
        value={formatMoney(earnings.paid.amountMinor, ledgerCurrency)}
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
            disabled={isPayoutLoading || isOffline}
            accessibilityRole="button"
            accessibilityLabel="Request payout"
            accessibilityState={{ disabled: isPayoutLoading || isOffline }}
          >
            <Text style={styles.payoutButtonText}>
              {isPayoutLoading ? 'Processing…' : 'Request payout'}
            </Text>
          </AnimatedPressable>
          {payoutError ? (
            <Text style={[styles.payoutErrorText, { color: colors.dangerText }]}>
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
                  {(entry.status === 'held' || entry.status === 'reversed' || entry.status === 'pending') && (
                    <Text style={{ color: colors.textMuted }}>
                      {entry.status === 'held' ? ' · Processing' : entry.status === 'pending' ? ' · Pending' : ' · Reversed'}
                    </Text>
                  )}
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
                  { color: entry.amountMinor < 0 ? colors.dangerText : colors.textPrimary },
                ]}
              >
                {formatMoney(entry.amountMinor, ledgerCurrency)}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
