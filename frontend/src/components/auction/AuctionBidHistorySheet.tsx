import React from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { BottomSheet } from '../BottomSheet';
import { Headline, Meta } from '../ui/Text';
import { Space, FontFamily } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { RadiusRoleValue } from '../../theme/surfaceRadiusRules';
import {
  formatBidActivityRow,
  type BidActivityDisplayRow,
} from '../../utils/auctionDetailLogic';
import type { AuctionBidActivity } from '../../services/marketApi';

interface Props {
  visible: boolean;
  onDismiss: () => void;
  bidActivity: AuctionBidActivity[];
  bidActivityError: boolean;
  bidCount: number;
  serverNow: string | null;
  formatFromFiat: (amount: number, currency?: any, opts?: any) => string;
  onRetry: () => void;
}

/**
 * Bid history bottom sheet — compact flat rows per 2026 Apple HIG.
 * No card container; hairline-separated rows on the sheet surface.
 * The top bid gets a subtle tint.
 */
export function AuctionBidHistorySheet({
  visible,
  onDismiss,
  bidActivity,
  bidActivityError,
  bidCount,
  serverNow,
  formatFromFiat,
  onRetry,
}: Props) {
  const { colors } = useAppTheme();

  return (
    <BottomSheet
      visible={visible}
      onDismiss={onDismiss}
      snapPoint={0.6}
    >
      <View style={styles.sheetHeader}>
        <Headline style={styles.sheetTitle}>Bid history</Headline>
        {bidCount > 0 && (
          <Meta style={[styles.sheetSubtitle, { color: colors.textMuted }]}>{bidCount} bids</Meta>
        )}
      </View>

      {bidActivityError && (
        <View style={[styles.subSectionError, { backgroundColor: colors.surfaceAlt }]}>
          <Text style={[styles.subSectionErrorText, { color: colors.textMuted }]}>Couldn't load bid history</Text>
          <Pressable
            onPress={onRetry}
            style={({ pressed }) => pressed && { opacity: 0.5 }}
            accessibilityRole="button"
            accessibilityLabel="Retry loading bid history"
          >
            <Text style={[styles.retryText, { color: colors.brand }]}>Retry</Text>
          </Pressable>
        </View>
      )}

      {!bidActivityError && bidActivity.length === 0 && (
        <Text style={[styles.noBidsText, { color: colors.textMuted }]}>No bids placed yet.</Text>
      )}

      {!bidActivityError && bidActivity.length > 0 && (
        <ScrollView style={styles.sheetScroll} showsVerticalScrollIndicator={false}>
          <View style={styles.bidList}>
            {bidActivity.map((bid, index) => {
              const row: BidActivityDisplayRow = formatBidActivityRow(bid, index, formatFromFiat, serverNow);
              return (
                <View
                  key={bid.id}
                  style={[styles.bidRow, { borderBottomColor: colors.border }, row.isTopBid && { backgroundColor: `${colors.success}08` }]}
                >
                  <View style={styles.bidRowLeft}>
                    {row.isViewer && (
                      <View style={[styles.viewerBadge, { backgroundColor: colors.brand }]}>
                        <Text style={[styles.viewerBadgeText, { color: colors.textInverse }]}>YOU</Text>
                      </View>
                    )}
                    <View style={styles.bidRowInfo}>
                      <View style={styles.bidRowNameLine}>
                        <Text style={[styles.bidderName, { color: colors.textSecondary }]}>{row.bidderLabel}</Text>
                        {row.isTopBid && (
                          <Text style={[styles.topBidLabel, { color: colors.success }]}>Top bid</Text>
                        )}
                      </View>
                      {row.relativeTime && (
                        <Text style={[styles.bidRelativeTime, { color: colors.textMuted }]}>{row.relativeTime}</Text>
                      )}
                    </View>
                  </View>
                  <View style={styles.bidRowRight}>
                    <Text style={[styles.bidAmount, { color: colors.textPrimary }]}>{row.amountText}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        </ScrollView>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingBottom: Space.md,
  },
  sheetTitle: {
    fontSize: TypographyV2.sectionTitle.size,
    lineHeight: TypographyV2.sectionTitle.lineHeight,
    fontFamily: FontFamily.bold,
    letterSpacing: TypographyV2.sectionTitle.letterSpacing,
  },
  sheetSubtitle: {},
  sheetScroll: {
    flex: 1,
  },
  bidList: {},
  bidRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingVertical: Space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  bidRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    flex: 1,
  },
  viewerBadge: {
    borderRadius: RadiusRoleValue.compactControl,
    paddingHorizontal: Space.xs + 2,
    paddingVertical: Space.xs / 2,
  },
  viewerBadgeText: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.bold,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
  bidderName: {
    fontSize: TypographyV2.bodyStrong.size,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
    fontFamily: FontFamily.semibold,
  },
  bidRowInfo: {
    flexDirection: 'column',
    gap: Space.xs,
  },
  bidRowNameLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  bidRelativeTime: {
    fontSize: TypographyV2.label.size,
    lineHeight: TypographyV2.label.lineHeight,
    fontFamily: FontFamily.regular,
    fontVariant: ['tabular-nums'],
  },
  bidRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
  },
  bidAmount: {
    fontSize: TypographyV2.bodyStrong.size,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
    fontFamily: FontFamily.bold,
    fontVariant: ['tabular-nums'],
  },
  topBidLabel: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.semibold,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
  noBidsText: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: FontFamily.regular,
  },
  subSectionError: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderRadius: RadiusRoleValue.mediaThumbnail,
  },
  subSectionErrorText: {},
  retryText: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: FontFamily.semibold,
  },
});
