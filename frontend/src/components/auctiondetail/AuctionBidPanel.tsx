import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { useFormattedPrice } from '../../hooks/useFormattedPrice';
import { Space, FontFamily } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { CommerceDetailTransactionSurface } from '../commerce/detail';
import { ReserveStatusBadge } from '../auction/ReserveStatusBadge';
import type { AuctionViewerState } from '../../services/marketApi';
import type { DetailPriceLabel, ReserveStatus } from '../../utils/auctionDetailLogic';

interface Props {
  isTerminal: boolean;
  priceLabel: DetailPriceLabel;
  priceText: string;
  primaryState: { text: string; color: string } | null;
  reserveStatus: ReserveStatus | 'none';
  subordinateStateText: string | null;
  isLive: boolean;
  viewerState: AuctionViewerState;
  bidCount: number;
  minimumNextBidGbp: number;
}

/**
 * Zone C — auction transaction surface.
 *
 * One primary state sentence above the fold. The countdown, viewer
 * signals, and reserve status demote to subordinate metadata so only
 * one state element has primary visual weight. Reserve status is
 * factual only — no persuasive gap copy. Urgency chrome is reduced:
 * the countdown owns the single accent colour, applied only at
 * meaningful thresholds.
 */
export function AuctionBidPanel({
  isTerminal,
  priceLabel,
  priceText,
  primaryState,
  reserveStatus,
  subordinateStateText,
  isLive,
  viewerState,
  bidCount,
  minimumNextBidGbp,
}: Props) {
  const { colors } = useAppTheme();
  const { formatFromFiat } = useFormattedPrice();

  if (isTerminal) return null;

  return (
    <CommerceDetailTransactionSurface
      family="auction"
      flush
      surfaceColor={colors.surface}
      primaryLabel={priceLabel}
      primaryValue={priceText}
      headlineAside={
        primaryState ? (
          <Text
            style={[
              styles.primaryStateSentence,
              { color: primaryState.color },
            ]}
            numberOfLines={1}
            accessibilityLiveRegion="polite"
          >
            {primaryState.text}
          </Text>
        ) : undefined
      }
      statusRow={reserveStatus !== 'none' ? (
        <View style={styles.transactionStatusRow}>
          <ReserveStatusBadge status={reserveStatus} />
        </View>
      ) : undefined}
    >
      {/* Subordinate metadata — countdown demotes here when the
          viewer-state sentence dominates so only one state element
          has primary visual weight. */}
      {subordinateStateText ? (
        <Text
          style={[styles.subordinateMetadata, { color: colors.textSecondary }]}
          numberOfLines={1}
        >
          {subordinateStateText}
        </Text>
      ) : null}
      <View style={[styles.transactionBidActivityRow, { borderTopColor: colors.border }]}>
        <Text style={[styles.transactionBidActivityLabel, { color: colors.textSecondary }]}>
          {isLive ? 'Live bids' : 'Bid activity'}
        </Text>
        <Text style={[styles.transactionBidActivityValue, { color: colors.textPrimary }]}>
          {bidCount} {bidCount === 1 ? 'bid' : 'bids'}
        </Text>
      </View>
      {/* Minimum to lead (outbid) — actionable emphasis inside the
          surface. The dock carries the "Bid again" action. */}
      {isLive && viewerState === 'outbid' && minimumNextBidGbp > 0 && (
        <View style={[styles.transactionMinRow, { borderTopColor: colors.border }]}>
          <Text style={[styles.transactionMinLabel, { color: colors.textSecondary }]}>
            Minimum to lead
          </Text>
          <Text style={[styles.transactionMinValue, { color: colors.textPrimary }]}>
            {formatFromFiat(minimumNextBidGbp, 'GBP')}
          </Text>
        </View>
      )}
    </CommerceDetailTransactionSurface>
  );
}

const styles = StyleSheet.create({
  // ── Transaction surface internal rows ──
  // Primary state sentence — one dominant line in the headline aside.
  // Uses tabular numerals so per-second countdown updates don't cause
  // layout shift. Color is applied inline from the primaryState memo
  // so only one accent communicates urgency.
  primaryStateSentence: {
    fontSize: TypographyV2.priceList.size,
    lineHeight: TypographyV2.priceList.lineHeight,
    fontFamily: FontFamily.bold,
    letterSpacing: TypographyV2.priceList.letterSpacing,
    fontVariant: ['tabular-nums'],
  },
  // Subordinate metadata — countdown demotes here when the viewer-state
  // sentence dominates. Kept small and neutral so it never competes
  // with the primary state sentence.
  subordinateMetadata: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: FontFamily.regular,
    fontVariant: ['tabular-nums'],
    marginTop: Space.sm,
  },
  transactionBidActivityRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: Space.sm,
    marginTop: Space.md,
    paddingTop: Space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  transactionBidActivityLabel: {
    fontSize: TypographyV2.label.size,
    lineHeight: TypographyV2.label.lineHeight,
    fontFamily: FontFamily.semibold,
    letterSpacing: TypographyV2.label.letterSpacing,
    textTransform: 'uppercase',
  },
  transactionBidActivityValue: {
    fontSize: TypographyV2.priceList.size,
    lineHeight: TypographyV2.priceList.lineHeight,
    fontFamily: FontFamily.bold,
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
  },
  transactionMinRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingVertical: Space.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  transactionMinLabel: {
    fontSize: TypographyV2.label.size,
    lineHeight: TypographyV2.label.lineHeight,
    fontFamily: FontFamily.semibold,
    textTransform: 'uppercase',
    letterSpacing: TypographyV2.label.letterSpacing,
  },
  transactionMinValue: {
    fontSize: TypographyV2.priceList.size,
    lineHeight: TypographyV2.priceList.lineHeight,
    fontFamily: FontFamily.bold,
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
  },
  transactionStatusRow: {
    gap: Space.xs,
  },
});
