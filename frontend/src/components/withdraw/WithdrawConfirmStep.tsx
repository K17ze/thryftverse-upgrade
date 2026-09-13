import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FlagshipScreen, FlagshipHeader, FlagshipMetricLine, FlagshipFormSection } from '../flagship';
import { AppButton } from '../ui/AppButton';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';

interface Props {
  /** Formatted GBP withdrawal amount — drives the Amount / You receive
   *  lines and the confirm CTA's accessibility label. */
  amountLabel: string;
  /** Formatted fee line (currently zero-fee). */
  feeLabel: string;
  destinationLabel: string;
  /** "Reference rate as of …" disclosure, or null when not applicable. */
  rateTimestampLabel: string | null;
  isWithdrawing: boolean;
  onConfirm: () => void;
  onBack: () => void;
}

// Confirmation step — full withdrawal summary with fee disclosure,
// destination and the irreversible-action note before submission.
export function WithdrawConfirmStep({
  amountLabel,
  feeLabel,
  destinationLabel,
  rateTimestampLabel,
  isWithdrawing,
  onConfirm,
  onBack,
}: Props) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  return (
    <FlagshipScreen
      header={
        <FlagshipHeader
          title="Confirm withdrawal"
          onBack={onBack}
          backIcon="arrow-back"
        />
      }
      scrollEnabled={false}
      contentStyle={{ paddingHorizontal: 0, paddingTop: 0 }}
      stickyFooter={
        <>
          <AppButton
            title={isWithdrawing ? 'Processing...' : 'Confirm withdrawal'}
            onPress={onConfirm}
            disabled={isWithdrawing}
            loading={isWithdrawing}
            variant="primary"
            style={[styles.primaryBtn, isWithdrawing && styles.primaryBtnDisabled]}
            titleStyle={styles.primaryText}
            accessibilityLabel={
              isWithdrawing
                ? 'Processing withdrawal'
                : `Confirm withdrawal of ${amountLabel}`
            }
            accessibilityHint="Submits your withdrawal request"
          />
          <AppButton
            title="Back to edit"
            onPress={onBack}
            variant="secondary"
            style={[styles.secondaryBtn, { marginTop: Space.sm }]}
            accessibilityLabel="Back to edit amount"
            accessibilityHint="Returns to the withdrawal form"
            hapticFeedback="light"
          />
        </>
      }
    >
      <ScrollView
        style={styles.content}
        contentContainerStyle={{ paddingTop: Space.lg, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        <View>
          <FlagshipFormSection variant="flat" title="Withdrawal summary">
            <FlagshipMetricLine label="Amount" value={amountLabel} />
            <FlagshipMetricLine label="Fee" value={feeLabel} separated />
            <FlagshipMetricLine label="You receive" value={amountLabel} emphasis separated />
            <FlagshipMetricLine label="Destination" value={destinationLabel} separated />
            <FlagshipMetricLine label="Estimated arrival" value="1–3 business days" separated />
          </FlagshipFormSection>
        </View>

        <View>
          <View style={styles.flatNote}>
            <Ionicons name="lock-closed" size={16} color={colors.textMuted} />
            <Text style={[styles.flatNoteText, { color: colors.textMuted }]}>
              Withdrawals are processed from completed sale proceeds. This action cannot be undone.
            </Text>
          </View>
          {rateTimestampLabel && (
            <View style={styles.rateTimestampRow}>
              <Ionicons name="time-outline" size={12} color={colors.textMuted} />
              <Text style={[styles.rateTimestampText, { color: colors.textMuted }]}>
                {rateTimestampLabel}
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    </FlagshipScreen>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  content: { flex: 1 },
  primaryBtn: { backgroundColor: colors.textPrimary, height: Space.xl + Space.xl + 8, borderRadius: Space.lg + 4, alignItems: 'center', justifyContent: 'center' },
  primaryBtnDisabled: { opacity: 0.45 },
  primaryText: { color: colors.background, fontSize: TypographyV2.body.size, fontFamily: TypographyV2.body.fontFamily, fontVariant: ['tabular-nums'] },
  secondaryBtn: {
    height: Space.xl + 8,
    borderRadius: Space.lg + 4,
    alignItems: 'center',
    justifyContent: 'center' },

  // ── Flat note — no border, no radius ──
  flatNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    marginTop: Space.md },
  flatNoteText: {
    flex: 1,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight + 2,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing },
  rateTimestampRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    marginTop: Space.sm },
  rateTimestampText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing },
});
