import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { AnimatedPressable } from '../AnimatedPressable';
import { FlagshipFormSection } from '../flagship';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { useFormattedPrice } from '../../hooks/useFormattedPrice';
import { Space, Radius } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import type { PayoutRequestPayload } from '../../services/walletApi';
import { resolvePayoutStatusConfig, type WithdrawalsLoadState } from './withdrawViewModels';

interface Props {
  withdrawals: PayoutRequestPayload[];
  loadState: WithdrawalsLoadState;
  onRetry: () => void;
}

// Recent withdrawals — honest payout status.
// Flat list, hairline separators, colored dot + text.
// No card-on-card, no decorative pills.
export function WithdrawHistorySection({ withdrawals, loadState, onRetry }: Props) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const { formatFromFiat } = useFormattedPrice();

  return (
    <View>
      <FlagshipFormSection variant="flat" title="Recent withdrawals">
        {loadState === 'loading' && (
          <Text
            style={[styles.withdrawalsStatusText, { color: colors.textMuted }]}
            accessibilityLabel="Loading recent withdrawals"
          >
            Loading…
          </Text>
        )}

        {loadState === 'error' && (
          <AnimatedPressable
            onPress={onRetry}
            accessibilityRole="button"
            accessibilityLabel="Retry loading recent withdrawals"
          >
            <Text style={[styles.withdrawalsStatusText, { color: colors.textSecondary }]}>
              Could not load withdrawals — tap to retry
            </Text>
          </AnimatedPressable>
        )}

        {loadState === 'loaded' && withdrawals.length === 0 && (
          <Text style={[styles.withdrawalsStatusText, { color: colors.textMuted }]}>
            No withdrawals yet
          </Text>
        )}

        {loadState === 'loaded' && withdrawals.length > 0 && (
          <View>
            {withdrawals.map((item, index) => {
              const statusConfig = resolvePayoutStatusConfig(item.status);
              const statusColor = colors[statusConfig.colorKey];
              const isLast = index === withdrawals.length - 1;
              const formattedDate = new Date(item.createdAt).toLocaleDateString('en-GB', {
                day: 'numeric',
                month: 'short',
                year: 'numeric' });
              return (
                <View
                  key={item.id}
                  style={[
                    styles.withdrawalRow,
                    !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
                  ]}
                  accessibilityLabel={`Withdrawal of ${formatFromFiat(item.amountGbp, 'GBP', { displayMode: 'fiat' })}, ${statusConfig.label}, ${formattedDate}`}
                >
                  <View style={styles.withdrawalLeft}>
                    <Text
                      style={[styles.withdrawalAmount, { color: colors.textPrimary }]}
                      numberOfLines={1}
                    >
                      {formatFromFiat(item.amountGbp, 'GBP', { displayMode: 'fiat' })}
                    </Text>
                    <Text style={[styles.withdrawalDate, { color: colors.textMuted }]}>
                      {formattedDate}
                    </Text>
                  </View>
                  <View style={styles.withdrawalRight}>
                    <View style={styles.withdrawalStatusLine}>
                      <View style={[styles.withdrawalDot, { backgroundColor: statusColor }]} />
                      <Text
                        style={[styles.withdrawalStatusLabel, { color: colors.textPrimary }]}
                        numberOfLines={1}
                      >
                        {statusConfig.label}
                      </Text>
                    </View>
                    {statusConfig.subtitle ? (
                      <Text
                        style={[styles.withdrawalStatusSubtitle, { color: colors.textMuted }]}
                        numberOfLines={2}
                      >
                        {statusConfig.subtitle}
                      </Text>
                    ) : null}
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </FlagshipFormSection>
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  withdrawalsStatusText: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
    paddingVertical: Space.sm },
  withdrawalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Space.sm + 2 },
  withdrawalLeft: {
    flex: 1,
    marginRight: Space.sm },
  withdrawalAmount: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    fontVariant: ['tabular-nums'],
    marginBottom: 2 },
  withdrawalDate: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing },
  withdrawalRight: {
    alignItems: 'flex-end',
    maxWidth: '45%' },
  withdrawalStatusLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    marginBottom: 2 },
  withdrawalDot: {
    width: 7,
    height: 7,
    borderRadius: Radius.full },
  withdrawalStatusLabel: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing },
  withdrawalStatusSubtitle: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
    textAlign: 'right' },
});
