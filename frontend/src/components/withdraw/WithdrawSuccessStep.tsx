import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FlagshipScreen, FlagshipHeader, FlagshipMetricLine, FlagshipFormSection } from '../flagship';
import { AppButton } from '../ui/AppButton';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { useFormattedPrice } from '../../hooks/useFormattedPrice';
import { Space } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import type { WithdrawSuccessData } from './withdrawViewModels';

interface Props {
  successData: WithdrawSuccessData;
  /** Header back + "Done" CTA — both return to the previous screen. */
  onClose: () => void;
}

// Success step — honest "requested" confirmation with reference, amount
// and estimated-arrival disclosure.
export function WithdrawSuccessStep({ successData, onClose }: Props) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const { formatFromFiat } = useFormattedPrice();

  const shortRef = successData.reference.slice(0, 12).toUpperCase();
  const formattedDate = new Date(successData.createdAt).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit' });

  return (
    <FlagshipScreen
      header={
        <FlagshipHeader
          title="Withdraw Balance"
          onBack={onClose}
          backIcon="arrow-back"
        />
      }
      scrollEnabled={false}
      contentStyle={{ paddingHorizontal: 0, paddingTop: 0 }}
      stickyFooter={
        <AppButton
          title="Done"
          onPress={onClose}
          variant="primary"
          style={[styles.primaryBtn]}
          titleStyle={styles.primaryText}
          accessibilityLabel="Close withdrawal confirmation"
          accessibilityHint="Returns to the previous screen"
          hapticFeedback="light"
        />
      }
    >
      <ScrollView
        style={styles.content}
        contentContainerStyle={{ paddingTop: Space.xxl, paddingBottom: Space.xxl }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ alignItems: 'center', paddingHorizontal: Space.md }}>
          <View style={styles.successHeaderRow}>
            <Ionicons name="checkmark-circle" size={24} color={colors.success} />
            <Text style={[styles.successTitle, { color: colors.textPrimary }]}>
              Withdrawal requested
            </Text>
          </View>
          <Text style={[styles.successSubtitle, { color: colors.textSecondary }]}>
            {formatFromFiat(successData.amountGbp, 'GBP', { displayMode: 'fiat' })} is on its way
          </Text>
        </View>

        <View>
          <FlagshipFormSection variant="flat" title="Withdrawal details">
            <FlagshipMetricLine label="Reference" value={shortRef} />
            <FlagshipMetricLine label="Amount" value={formatFromFiat(successData.amountGbp, 'GBP', { displayMode: 'fiat' })} separated />
            <FlagshipMetricLine label="Currency" value={successData.payoutCurrency} separated />
            <FlagshipMetricLine label="Requested" value={formattedDate} separated />
            <FlagshipMetricLine label="Estimated arrival" value="1–3 business days" separated />
          </FlagshipFormSection>
        </View>

        <View>
          <View style={styles.flatNote}>
            <Ionicons name="time-outline" size={16} color={colors.textMuted} />
            <Text style={[styles.flatNoteText, { color: colors.textMuted }]}>
              We'll notify you when the payout is processed. You can track the status in your wallet activity.
            </Text>
          </View>
        </View>
      </ScrollView>
    </FlagshipScreen>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  content: { flex: 1 },
  primaryBtn: { backgroundColor: colors.textPrimary, height: Space.xl + Space.xl + 8, borderRadius: Space.lg + 4, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: colors.background, fontSize: TypographyV2.body.size, fontFamily: TypographyV2.body.fontFamily, fontVariant: ['tabular-nums'] },

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

  successHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    marginBottom: Space.md },
  successTitle: {
    fontSize: TypographyV2.screenTitle.size,
    lineHeight: TypographyV2.screenTitle.lineHeight,
    fontFamily: TypographyV2.screenTitle.fontFamily,
    letterSpacing: TypographyV2.screenTitle.letterSpacing,
    marginBottom: Space.xs },
  successSubtitle: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: TypographyV2.body.fontFamily,
    letterSpacing: TypographyV2.body.letterSpacing,
    textAlign: 'center',
    marginBottom: Space.xl },
});
