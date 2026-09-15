import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
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
  /** Subordinate conversion line under the headline value (local fiat
   *  equivalent in dual-currency mode). Demoted — never headline size. */
  priceEquivalentText?: string | null;
  primaryState: { text: string; color: string } | null;
  reserveStatus: ReserveStatus | 'none';
  subordinateStateText: string | null;
  isLive: boolean;
  viewerState: AuctionViewerState;
  bidCount: number;
  /** Primary-unit text for the "Minimum to lead" row; null when the
   *  backend reports no minimum. */
  minimumNextBidText: string | null;
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
  priceEquivalentText,
  primaryState,
  reserveStatus,
  subordinateStateText,
  isLive,
  viewerState,
  bidCount,
  minimumNextBidText,
}: Props) {
  const { colors } = useAppTheme();

  if (isTerminal) return null;

  return (
    <CommerceDetailTransactionSurface
      family="auction"
      flush
      surfaceColor={colors.surface}
      primaryLabel={priceLabel}
      primaryValue={priceText}
      primaryEquivalent={priceEquivalentText ?? undefined}
      headlineAside={
        primaryState ? (
          <Text
            style={[
              styles.primaryStateSentence,
              { color: primaryState.color },
            ]}
            maxFontSizeMultiplier={2}
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
          maxFontSizeMultiplier={2}
        >
          {subordinateStateText}
        </Text>
      ) : null}
      <View style={[styles.transactionBidActivityRow, { borderTopColor: colors.border }]}>
        <Text style={[styles.transactionBidActivityLabel, { color: colors.textSecondary }]} numberOfLines={1}>
          {isLive ? 'Live bids' : 'Bid activity'}
        </Text>
        <Text style={[styles.transactionBidActivityValue, { color: colors.textPrimary }]} numberOfLines={1}>
          {bidCount} {bidCount === 1 ? 'bid' : 'bids'}
        </Text>
      </View>
      {/* Minimum to lead (outbid) — actionable emphasis inside the
          surface. The dock carries the "Bid again" action. Primary
          unit only — the conversion already rides under the headline. */}
      {isLive && viewerState === 'outbid' && minimumNextBidText != null && (
        <View style={[styles.transactionMinRow, { borderTopColor: colors.border }]}>
          <Text style={[styles.transactionMinLabel, { color: colors.textSecondary }]} numberOfLines={1}>
            Minimum to lead
          </Text>
          <Text
            style={[styles.transactionMinValue, { color: colors.textPrimary }]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
          >
            {minimumNextBidText}
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
    fontSize: TypographyV2.bodyStrong.size,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
    fontFamily: FontFamily.semibold,
    letterSpacing: TypographyV2.bodyStrong.letterSpacing,
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
    gap: Space.sm,
    paddingVertical: Space.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  transactionMinLabel: {
    fontSize: TypographyV2.label.size,
    lineHeight: TypographyV2.label.lineHeight,
    fontFamily: FontFamily.semibold,
    textTransform: 'uppercase',
    letterSpacing: TypographyV2.label.letterSpacing,
    flexShrink: 1,
  },
  transactionMinValue: {
    fontSize: TypographyV2.priceList.size,
    lineHeight: TypographyV2.priceList.lineHeight,
    fontFamily: FontFamily.bold,
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
    flexShrink: 1,
    minWidth: 0,
  },
  transactionStatusRow: {
    gap: Space.xs,
  },
});
