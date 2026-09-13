import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { useFormattedPrice } from '../../hooks/useFormattedPrice';
import { haptics } from '../../utils/haptics';
import { Space, FontFamily, PressScale } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import {
  CommerceDetailSection,
  CommerceDetailDisclosureRow,
  CommerceDetailUnavailableInline,
} from '../commerce/detail';
import { CategoryEvidence } from '../commerce';
import { resolveEvidenceGroups } from '../../platform/commerce/categoryEvidence';
import { formatBidActivityRow } from '../../utils/auctionDetailLogic';
import type { AuctionBidActivity, AuctionDetail } from '../../services/marketApi';

interface Props {
  auction: AuctionDetail;
  bidActivity: AuctionBidActivity[];
  bidActivityError: boolean;
  isLive: boolean;
  serverNow: string | null;
  onViewAllBids: () => void;
  onShowRules: () => void;
}

/**
 * Zone E — item details, bid activity and auction rules.
 *
 * - Item details (spec 02_AUCTION §5): description, category evidence,
 *   condition and authenticity inside one deliberate section — not
 *   independent unlabelled blocks.
 * - Bid activity (spec 02_AUCTION §3): one compact pattern — section
 *   label, latest bid row, bid count, one "View all bids" action. No
 *   disclosure row AND three-row preview together.
 * - Auction rules (spec 04 §6): disclosure row, not a large card.
 */
export function AuctionDetailInfoSections({
  auction,
  bidActivity,
  bidActivityError,
  isLive,
  serverNow,
  onViewAllBids,
  onShowRules,
}: Props) {
  const { colors } = useAppTheme();
  const { formatFromFiat } = useFormattedPrice();

  return (
    <>
      <CommerceDetailSection label="Item details" divider variant="editorial">
        {auction.description && (
          <View style={styles.descriptionBlock}>
            <Text style={[styles.descriptionText, { color: colors.textPrimary }]}>
              {auction.description}
            </Text>
          </View>
        )}

        {(() => {
          const evidenceGroups = resolveEvidenceGroups({
            category: auction.category,
            brand: auction.brand,
            condition: auction.conditionLabel,
            description: auction.description,
          });
          return evidenceGroups.length > 0 ? (
            <CategoryEvidence groups={evidenceGroups} />
          ) : null;
        })()}

        {auction.conditionLabel && (
          <View style={styles.itemDetailRow}>
            <Text style={[styles.itemDetailLabel, { color: colors.textSecondary }]}>
              Condition
            </Text>
            <Text style={[styles.itemDetailValue, { color: colors.textPrimary }]}>
              {auction.conditionLabel}
            </Text>
          </View>
        )}
      </CommerceDetailSection>

      {(auction.bidCount > 0 || bidActivityError) && (
        <CommerceDetailSection label="Bid activity" divider variant="editorial">
        {bidActivityError ? (
          <CommerceDetailUnavailableInline
            title="Bid activity unavailable"
            body="Pull to refresh and try again."
          />
        ) : auction.bidCount > 0 && bidActivity.length > 0 ? (
          (() => {
            const topBid = formatBidActivityRow(bidActivity[0], 0, formatFromFiat, serverNow);
            return (
              <View style={styles.bidActivityRow} accessibilityLiveRegion="polite">
                <View style={styles.bidActivityLeft}>
                  <Text style={[styles.bidActivityLabel, { color: colors.textSecondary }]} numberOfLines={1}>
                    Leading bid
                  </Text>
                  <Text style={[styles.bidActivityBidder, { color: colors.textPrimary }]} numberOfLines={1}>
                    {topBid.bidderLabel}
                    {topBid.relativeTime ? `  ·  ${topBid.relativeTime}` : ''}
                  </Text>
                </View>
                <Text style={[styles.bidActivityAmount, { color: colors.textPrimary }]}>
                  {topBid.amountText}
                </Text>
              </View>
            );
          })()
        ) : null}
        {!bidActivityError && auction.bidCount > 0 && (
          <Pressable
            style={({ pressed }) => [styles.bidActivityViewAll, pressed && { opacity: 0.85, transform: [{ scale: PressScale.gentle }] }]}
            onPress={() => {
              haptics.selection();
              onViewAllBids();
            }}
            accessibilityRole="button"
            accessibilityLabel={`View all ${auction.bidCount} bids`}
          >
            <Text style={[styles.bidActivityViewAllText, { color: colors.brand }]}>
              {`View all ${auction.bidCount} ${auction.bidCount === 1 ? 'bid' : 'bids'}`}
            </Text>
            <Ionicons name="chevron-forward" size={14} color={colors.brand} />
          </Pressable>
        )}
        </CommerceDetailSection>
      )}

      <CommerceDetailSection label="Auction rules" divider>
        <CommerceDetailDisclosureRow
          label="How bidding works"
          onPress={onShowRules}
          leadingIcon="information-circle-outline"
          accessibilityLabel="View bidding rules"
        />
      </CommerceDetailSection>
    </>
  );
}

const styles = StyleSheet.create({
  // ── Bid activity (consolidated pattern per spec 02_AUCTION §3) ──
  bidActivityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Space.sm,
    paddingVertical: Space.sm,
  },
  bidActivityLeft: {
    flexDirection: 'column',
    gap: Space.xs,
    flexShrink: 1,
  },
  bidActivityLabel: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.medium,
  },
  bidActivityBidder: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: FontFamily.regular,
    fontVariant: ['tabular-nums'],
  },
  bidActivityAmount: {
    fontSize: TypographyV2.priceList.size,
    lineHeight: TypographyV2.priceList.lineHeight,
    fontFamily: FontFamily.bold,
    letterSpacing: TypographyV2.priceList.letterSpacing,
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
  },
  bidActivityViewAll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    paddingVertical: Space.sm,
  },
  bidActivityViewAllText: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: FontFamily.semibold,
  },
  // ── Item details rows (per spec 02_AUCTION §5) ──
  itemDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Space.sm,
    paddingVertical: Space.sm,
  },
  itemDetailLabel: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: FontFamily.regular,
  },
  itemDetailValue: {
    fontSize: TypographyV2.priceList.size,
    lineHeight: TypographyV2.priceList.lineHeight,
    fontFamily: FontFamily.bold,
    fontVariant: ['tabular-nums'],
  },
  descriptionText: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight + 4,
    fontFamily: FontFamily.regular,
  },
  descriptionBlock: {
    paddingHorizontal: Space.md,
    paddingTop: Space.md,
    paddingBottom: Space.sm,
  },
});
