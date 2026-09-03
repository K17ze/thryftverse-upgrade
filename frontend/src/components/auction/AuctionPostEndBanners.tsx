import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, FontFamily } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';

interface PaymentDeadlineCountdown {
  text: string;
  isExpired: boolean;
}

interface Props {
  isReserveNotMet: boolean;
  isAwaitingPayment: boolean;
  isPaymentExpired: boolean;
  isSecondChanceOffered: boolean;
  isSeller: boolean;
  viewerState: string;
  isSecondChanceRecipient: boolean;
  paymentDeadlineCountdown: PaymentDeadlineCountdown | null;
}

/**
 * Post-end lifecycle status banners — flat, restrained bars using the
 * same countdownBar geometry. One icon + one line of truthful copy.
 * No decorative chrome. Colour comes from the theme.
 */
export function AuctionPostEndBanners({
  isReserveNotMet,
  isAwaitingPayment,
  isPaymentExpired,
  isSecondChanceOffered,
  isSeller,
  viewerState,
  isSecondChanceRecipient,
  paymentDeadlineCountdown,
}: Props) {
  const { colors } = useAppTheme();

  if (isReserveNotMet) {
    return (
      <View
        style={[styles.countdownBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}
        accessibilityLiveRegion="polite"
        accessibilityLabel="Reserve not met"
      >
        <Ionicons name="information-circle-outline" size={16} color={colors.warning} />
        <Text
          style={[styles.countdownBarText, { color: colors.textPrimary }]}
          numberOfLines={2}
        >
          {isSeller
            ? 'Reserve not met — accept the highest bid or relist'
            : 'Reserve not met — the seller may accept the highest bid'}
        </Text>
      </View>
    );
  }

  if (isAwaitingPayment && viewerState === 'won' && paymentDeadlineCountdown && !paymentDeadlineCountdown.isExpired) {
    const isUrgent = paymentDeadlineCountdown.text.includes('m left') && !paymentDeadlineCountdown.text.includes('h');
    return (
      <View
        style={[
          styles.countdownBar,
          {
            backgroundColor: isUrgent ? colors.danger : colors.surface,
            borderBottomColor: colors.border,
          },
        ]}
        accessibilityLiveRegion="polite"
        accessibilityLabel={`Payment deadline: ${paymentDeadlineCountdown.text}`}
      >
        <Ionicons
          name="time-outline"
          size={16}
          color={isUrgent ? colors.textInverse : colors.warning}
        />
        <Text
          style={[
            styles.countdownBarText,
            {
              color: isUrgent ? colors.textInverse : colors.textPrimary,
              fontVariant: ['tabular-nums'] as any,
            },
          ]}
          numberOfLines={1}
        >
          {`Pay within ${paymentDeadlineCountdown.text}`}
        </Text>
      </View>
    );
  }

  if (isAwaitingPayment && viewerState !== 'won') {
    return (
      <View
        style={[styles.countdownBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}
        accessibilityLiveRegion="polite"
        accessibilityLabel="Awaiting buyer payment"
      >
        <Ionicons name="time-outline" size={16} color={colors.warning} />
        <Text
          style={[styles.countdownBarText, { color: colors.textPrimary }]}
          numberOfLines={1}
        >
          {isSeller ? 'Awaiting buyer payment' : 'Sold · awaiting payment'}
        </Text>
      </View>
    );
  }

  if ((isPaymentExpired || isSecondChanceOffered) && !isSecondChanceRecipient) {
    return (
      <View
        style={[styles.countdownBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}
        accessibilityLiveRegion="polite"
        accessibilityLabel="Payment expired"
      >
        <Ionicons name="information-circle-outline" size={16} color={colors.warning} />
        <Text
          style={[styles.countdownBarText, { color: colors.textPrimary }]}
          numberOfLines={1}
        >
          {isSeller ? 'Payment expired' : 'Payment window closed'}
        </Text>
      </View>
    );
  }

  if ((isPaymentExpired || isSecondChanceOffered) && isSecondChanceRecipient) {
    return (
      <View
        style={[styles.countdownBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}
        accessibilityLiveRegion="polite"
        accessibilityLabel="Second chance available"
      >
        <Ionicons name="gift-outline" size={16} color={colors.warning} />
        <Text
          style={[styles.countdownBarText, { color: colors.textPrimary }]}
          numberOfLines={2}
        >
          {isSecondChanceOffered
            ? 'Second chance offered to you'
            : 'Second chance available'}
          {paymentDeadlineCountdown && !paymentDeadlineCountdown.isExpired
            ? ` · ${paymentDeadlineCountdown.text}`
            : ''}
        </Text>
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  countdownBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  countdownBarText: {
    fontSize: TypographyV2.bodyStrong.size,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
    fontFamily: FontFamily.bold,
    letterSpacing: TypographyV2.bodyStrong.letterSpacing,
    flex: 1,
  },
});
