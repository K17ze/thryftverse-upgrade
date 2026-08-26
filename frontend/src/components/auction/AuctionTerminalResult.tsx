import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, FontFamily } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';

interface Props {
  isTerminal: boolean;
  isCancelled: boolean;
  viewerState: string;
  isPaymentConfirmed: boolean;
  isSettled: boolean;
  hasValidWinner: boolean;
  terminalAmountText: string;
  winnerSubtitle: string;
  sellerSaleTitle: string;
  sellerSubtitle: string;
  onDiscoverSimilar: () => void;
}

/**
 * Terminal result module — one compact module, no duplicate title/brand.
 * Spec 04 §7: "Terminal: one result state, one next valid action."
 * The result state lives here; the dock carries the next valid action.
 */
export function AuctionTerminalResult({
  isTerminal,
  isCancelled,
  viewerState,
  isPaymentConfirmed,
  isSettled,
  hasValidWinner,
  terminalAmountText,
  winnerSubtitle,
  sellerSaleTitle,
  sellerSubtitle,
  onDiscoverSimilar,
}: Props) {
  const { colors } = useAppTheme();

  if (isCancelled) {
    return (
      <View style={styles.terminalResultModule}>
        <Text style={[styles.terminalResultTitleLost, { color: colors.textPrimary }]}>Auction cancelled</Text>
        <Text style={[styles.terminalResultNote, { color: colors.textSecondary }]}>
          Cancelled by the seller or platform. Any payment or release status appears in your orders.
        </Text>
      </View>
    );
  }

  if (!isTerminal) return null;

  return (
    <View style={styles.terminalResultModule}>
      {viewerState === 'won' && (
        <>
          <Text
            style={[
              styles.terminalResultTitleWon,
              { color: isPaymentConfirmed || isSettled ? colors.success : colors.warning },
            ]}
          >
            {isPaymentConfirmed || isSettled ? 'You won' : 'Payment required'}
          </Text>
          <Text style={[styles.terminalResultValue, { color: colors.textPrimary }]}>
            {terminalAmountText}
          </Text>
          <Text style={[styles.terminalResultNote, { color: colors.textSecondary }]}>
            {winnerSubtitle}
          </Text>
        </>
      )}
      {viewerState === 'lost' && (
        <>
          <Text style={[styles.terminalResultTitleLost, { color: colors.textPrimary }]}>Auction ended</Text>
          <Text style={[styles.terminalResultNote, { color: colors.textSecondary }]}>
            You didn't win this time
          </Text>
          <Text style={[styles.terminalResultValue, { color: colors.textPrimary }]}>
            {terminalAmountText}
          </Text>
          <Pressable
            style={styles.discoverLinkInline}
            onPress={onDiscoverSimilar}
            accessibilityRole="button"
            accessibilityLabel="Discover similar auctions"
          >
            <Ionicons name="search-outline" size={14} color={colors.brand} />
            <Text style={[styles.discoverLinkInlineText, { color: colors.brand }]}>Discover similar</Text>
            <Ionicons name="chevron-forward" size={12} color={colors.brand} />
          </Pressable>
        </>
      )}
      {viewerState === 'seller' && hasValidWinner && (
        <>
          <Text
            style={[
              styles.terminalResultTitleSold,
              { color: isSettled ? colors.success : isPaymentConfirmed ? colors.brand : colors.warning },
            ]}
          >
            {sellerSaleTitle}
          </Text>
          <Text style={[styles.terminalResultValue, { color: colors.textPrimary }]}>
            {terminalAmountText}
          </Text>
          <Text style={[styles.terminalResultNote, { color: colors.textSecondary }]}>
            {sellerSubtitle}
          </Text>
        </>
      )}
      {viewerState === 'seller' && !hasValidWinner && (
        <Text style={[styles.terminalResultTitleLost, { color: colors.textPrimary }]}>Ended without bids</Text>
      )}
      {viewerState === 'not_participating' && (
        <>
          <Text style={[styles.terminalResultTitleLost, { color: colors.textPrimary }]}>Auction closed</Text>
          <Text style={[styles.terminalResultValue, { color: colors.textPrimary }]}>
            {terminalAmountText}
          </Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  terminalResultModule: {
    marginHorizontal: Space.md,
    marginTop: Space.lg,
    paddingVertical: Space.md,
    gap: Space.sm,
  },
  terminalResultTitleWon: {
    fontSize: TypographyV2.sectionTitle.size,
    lineHeight: TypographyV2.sectionTitle.lineHeight,
    fontFamily: FontFamily.bold,
    letterSpacing: TypographyV2.sectionTitle.letterSpacing,
  },
  terminalResultTitleLost: {
    fontSize: TypographyV2.sectionTitle.size,
    lineHeight: TypographyV2.sectionTitle.lineHeight,
    fontFamily: FontFamily.bold,
    letterSpacing: TypographyV2.sectionTitle.letterSpacing,
  },
  terminalResultTitleSold: {
    fontSize: TypographyV2.sectionTitle.size,
    lineHeight: TypographyV2.sectionTitle.lineHeight,
    fontFamily: FontFamily.bold,
    letterSpacing: TypographyV2.sectionTitle.letterSpacing,
  },
  terminalResultValue: {
    fontSize: TypographyV2.priceHero.size,
    lineHeight: TypographyV2.priceHero.lineHeight,
    fontFamily: FontFamily.bold,
    letterSpacing: TypographyV2.priceHero.letterSpacing,
    fontVariant: ['tabular-nums'],
  },
  terminalResultNote: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: FontFamily.regular,
  },
  discoverLinkInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
    marginTop: Space.sm,
    paddingVertical: Space.xs + 2,
    paddingHorizontal: Space.smMd,
    alignSelf: 'center',
  },
  discoverLinkInlineText: {
    fontFamily: FontFamily.semibold,
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
  },
});
