import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, FontFamily, Stroke, Elevation } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { RadiusRoleValue } from '../../theme/surfaceRadiusRules';
import { PulsingDot } from './PulsingDot';
import { haptics } from '../../utils/haptics';

interface Props {
  /** Formatted line-item labels for the compact summary rows. */
  itemLabel: string;
  deliveryLabel: string;
  protectionLabel: string;
  /** Formatted wallet credit — when set, the "Wallet applied" row renders. */
  walletAppliedLabel?: string;
  totalLabel: string;
  onPressSummary: () => void;
  payLabel: string;
  /** !checkoutEligible || isInteractionLocked — drives disabled state and
   *  styling for every CTA in the column. */
  payDisabled: boolean;
  isSubmitting: boolean;
  /** Whether a digital wallet (Apple Pay / Google Pay) is available as a
   *  one-tap primary CTA. When true the card button renders secondary. */
  walletAvailable: boolean;
  /** Platform-gated wallet CTAs (capability-allowed and not submitting). */
  showApplePay: boolean;
  showGooglePay: boolean;
  onPay: () => void;
  reducedMotion: boolean;
}

// Sticky compact order summary + Pay footer.
// Pay button column — digital wallet buttons stacked ABOVE the card
// Pay button. Per 2026 UX research: "Reorder the payment list so
// Apple Pay sits above 'Pay with card' — a 15-25% lift in mobile
// checkout completion." The wallet button is the primary one-tap
// biometric CTA; the card button is the secondary fallback.
// The buyer-protection trust narrative is carried by the
// BuyerProtectionStrip above — no duplicate trust line here.
function CheckoutFooterBase({
  itemLabel,
  deliveryLabel,
  protectionLabel,
  walletAppliedLabel,
  totalLabel,
  onPressSummary,
  payLabel,
  payDisabled,
  isSubmitting,
  walletAvailable,
  showApplePay,
  showGooglePay,
  onPay,
  reducedMotion,
}: Props) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={[styles.footer, { paddingBottom: insets.bottom > 0 ? insets.bottom : Space.md }]}>
      {/* Compact cost breakdown — inline above the CTA (2026 checkout UX) */}
      <Pressable
        style={styles.compactSummary}
        onPress={() => { haptics.tap(); onPressSummary(); }}
        accessibilityRole="button"
        accessibilityLabel={`Order summary. Item ${itemLabel}, Delivery ${deliveryLabel}, Buyer protection ${protectionLabel}. Total ${totalLabel}. View full breakdown.`}
        accessibilityHint="Open the full cost breakdown and returns policy"
      >
        <View style={styles.compactSummaryRow}>
          <Text style={styles.compactSummaryLabel} maxFontSizeMultiplier={2}>Item</Text>
          <Text style={styles.compactSummaryVal} maxFontSizeMultiplier={2}>{itemLabel}</Text>
        </View>
        <View style={styles.compactSummaryRow}>
          <Text style={styles.compactSummaryLabel} maxFontSizeMultiplier={2}>Delivery</Text>
          <Text style={styles.compactSummaryVal} maxFontSizeMultiplier={2}>{deliveryLabel}</Text>
        </View>
        <View style={styles.compactSummaryRow}>
          <Text style={styles.compactSummaryLabel} maxFontSizeMultiplier={2}>Buyer protection</Text>
          <Text style={styles.compactSummaryVal} maxFontSizeMultiplier={2}>{protectionLabel}</Text>
        </View>
        {walletAppliedLabel ? (
          <View style={styles.compactSummaryRow}>
            <Text style={styles.compactSummaryLabel} maxFontSizeMultiplier={2}>Wallet applied</Text>
            <Text style={styles.compactSummaryVal} maxFontSizeMultiplier={2}>-{walletAppliedLabel}</Text>
          </View>
        ) : null}
        <View style={styles.compactSummaryDivider} />
        <View style={styles.compactSummaryTotalRow}>
          <View style={styles.compactSummaryTotalLeft}>
            <Text style={styles.compactSummaryTotalLabel} maxFontSizeMultiplier={2}>Total</Text>
            <Text
              style={styles.compactSummaryTotalValue}
              accessibilityLiveRegion="polite"
              accessibilityLabel={`Total ${totalLabel}`}
              maxFontSizeMultiplier={2}
            >
              {totalLabel}
            </Text>
          </View>
          <View style={styles.breakdownChevron}>
            <Text style={styles.breakdownChevronText} maxFontSizeMultiplier={2}>View full breakdown</Text>
            <Ionicons name="chevron-up" size={16} color={colors.textMuted} importantForAccessibility="no" />
          </View>
        </View>
      </Pressable>

      <View style={styles.footerPayRow}>
        {/* Apple Pay as primary CTA on iOS when enabled */}
        {showApplePay && (
          <Pressable
            onPress={() => { haptics.press(); onPay(); }}
            style={({ pressed }) => [
              styles.walletBtn,
              pressed && styles.payBtnPressed,
              payDisabled && styles.payBtnDisabled,
            ]}
            disabled={payDisabled}
            accessibilityRole="button"
            accessibilityLabel={`Pay ${totalLabel} with Apple Pay`}
            accessibilityHint="Complete checkout using Apple Pay"
            accessibilityState={{ disabled: payDisabled }}
          >
            <Ionicons name="logo-apple" size={22} color={colors.textInverse} importantForAccessibility="no" />
            <Text style={styles.walletBtnText} maxFontSizeMultiplier={2}>Pay with Apple Pay</Text>
          </Pressable>
        )}

        {/* Google Pay as primary CTA on Android when enabled */}
        {showGooglePay && (
          <Pressable
            onPress={() => { haptics.press(); onPay(); }}
            style={({ pressed }) => [
              styles.walletBtn,
              pressed && styles.payBtnPressed,
              payDisabled && styles.payBtnDisabled,
            ]}
            disabled={payDisabled}
            accessibilityRole="button"
            accessibilityLabel={`Pay ${totalLabel} with Google Pay`}
            accessibilityHint="Complete checkout using Google Pay"
            accessibilityState={{ disabled: payDisabled }}
          >
            <Ionicons name="logo-google" size={22} color={colors.textInverse} importantForAccessibility="no" />
            <Text style={styles.walletBtnText} maxFontSizeMultiplier={2}>Pay with Google Pay</Text>
          </Pressable>
        )}

        <Pressable
          style={({ pressed }) => [
            styles.payBtn,
            walletAvailable && styles.payBtnSecondary,
            payDisabled && styles.payBtnDisabled,
            pressed && !payDisabled && styles.payBtnPressed,
          ]}
          onPress={() => { haptics.press(); onPay(); }}
          disabled={payDisabled}
          accessibilityRole="button"
          accessibilityLabel={
            walletAvailable
              ? `Pay ${totalLabel} with card`
              : `Pay ${totalLabel}`
          }
          accessibilityHint="Complete your purchase"
          accessibilityState={{
            disabled: payDisabled,
            busy: isSubmitting,
          }}
        >
          {isSubmitting ? (
            <PulsingDot color={colors.textInverse} reducedMotion={reducedMotion} />
          ) : (
            <Ionicons
              name="lock-closed"
              size={16}
              color={walletAvailable ? colors.textPrimary : colors.textInverse}
              importantForAccessibility="no"
            />
          )}
          <Text
            style={[
              styles.payBtnText,
              walletAvailable && styles.payBtnTextSecondary,
            ]}
            maxFontSizeMultiplier={2}
          >
            {payLabel}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const CheckoutFooter = React.memo(CheckoutFooterBase);
CheckoutFooter.displayName = 'CheckoutFooter';
export { CheckoutFooter };

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Space.md,
    paddingTop: Space.sm + 2,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
    ...Elevation.floating,
  },
  compactSummary: {
    paddingVertical: Space.sm,
  },
  compactSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Space.xs + 1,
  },
  compactSummaryLabel: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.regular,
    fontVariant: ['tabular-nums'],
    color: colors.textSecondary,
  },
  compactSummaryVal: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.medium,
    fontVariant: ['tabular-nums'],
    color: colors.textPrimary,
  },
  compactSummaryDivider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: Space.xs + 1,
    backgroundColor: colors.border,
  },
  compactSummaryTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Space.xs,
  },
  compactSummaryTotalLeft: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Space.sm,
  },
  compactSummaryTotalLabel: {
    fontSize: TypographyV2.bodyStrong.size,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
    fontFamily: FontFamily.semibold,
    fontVariant: ['tabular-nums'],
    color: colors.textPrimary,
  },
  compactSummaryTotalValue: {
    fontSize: TypographyV2.priceHero.size,
    lineHeight: TypographyV2.priceHero.lineHeight,
    fontFamily: FontFamily.bold,
    letterSpacing: TypographyV2.priceHero.letterSpacing,
    fontVariant: ['tabular-nums'],
    color: colors.textPrimary,
  },
  breakdownChevron: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  breakdownChevronText: {
    fontSize: TypographyV2.body.size,
    fontFamily: FontFamily.regular,
    color: colors.textMuted,
  },
  footerPayRow: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: Space.sm,
    paddingTop: Space.xs,
  },
  payBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.sm,
    paddingVertical: Space.md + 2,
    paddingHorizontal: Space.lg,
    borderRadius: RadiusRoleValue.pillAvatar,
    minHeight: 56,
    backgroundColor: colors.brand,
  },
  payBtnSecondary: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: Stroke.standard,
    borderColor: colors.border,
  },
  walletBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.xs + 2,
    height: 56,
    borderRadius: RadiusRoleValue.pillAvatar,
    backgroundColor: colors.textPrimary,
  },
  walletBtnText: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: FontFamily.semibold,
    color: colors.textInverse,
  },
  payBtnDisabled: {
    opacity: 0.5,
  },
  payBtnPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.97 }],
  },
  payBtnText: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: FontFamily.semibold,
    fontVariant: ['tabular-nums'],
    color: colors.textInverse,
  },
  payBtnTextSecondary: {
    color: colors.textPrimary,
  },
});
