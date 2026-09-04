import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Radius } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { AnimatedPressable } from '../AnimatedPressable';
import { useFormattedPrice } from '../../hooks/useFormattedPrice';

interface CoOwnShareSectionProps {
  assetId: string;
  totalUnits: number;
  availableUnits: number;
  unitPriceGbp: number;
  isOpen: boolean;
  issuerName: string | null;
  onPressBuyShares: () => void;
  onPressViewDetail: () => void;
}

/**
 * Co-Own share section rendered inside the listing detail screen when a
 * listing has been syndicated into a co-own asset.
 *
 * Shows:
 *  - Price per share (unit price)
 *  - Available shares out of total
 *  - Allocation progress bar
 *  - "Buy Shares" primary CTA → navigates to Trade screen
 *  - "View asset detail" secondary link → navigates to AssetDetail
 *
 * Composition follows AGENTS.md §4: flat canvas, one dominant panel,
 * hairline separators, no card-on-card, no decorative chrome.
 */
export function CoOwnShareSection({
  assetId: _assetId,
  totalUnits,
  availableUnits,
  unitPriceGbp,
  isOpen,
  issuerName,
  onPressBuyShares,
  onPressViewDetail,
}: CoOwnShareSectionProps) {
  const { colors } = useAppTheme();
  const { formatFromFiat, currencyCode } = useFormattedPrice();
  const unitPriceFormatted = formatFromFiat(unitPriceGbp, currencyCode, { displayMode: 'fiat' });

  const allocatedUnits = totalUnits - availableUnits;
  const allocatedPct = totalUnits > 0 ? Math.round((allocatedUnits / totalUnits) * 100) : 0;
  const availablePct = totalUnits > 0 ? 100 - allocatedPct : 0;

  if (!isOpen) {
    return (
      <View style={styles.container}>
        <View style={styles.headerRow}>
          <Ionicons name="people-outline" size={18} color={colors.textMuted} aria-hidden={true} />
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
            Co-Own
          </Text>
        </View>
        <Text style={[styles.closedText, { color: colors.textSecondary }]}>
          Share trading is currently closed for this item.
        </Text>
        <AnimatedPressable
          onPress={onPressViewDetail}
          activeOpacity={0.7}
          scaleValue={0.98}
          hapticFeedback="light"
          accessibilityRole="button"
          accessibilityLabel="View co-own asset detail"
        >
          <Text style={[styles.viewDetailLink, { color: colors.brand }]}>
            View asset detail
          </Text>
        </AnimatedPressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.headerRow}>
        <Ionicons name="people-outline" size={18} color={colors.brand} aria-hidden={true} />
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
          Co-Own — Buy Shares
        </Text>
      </View>

      {/* Per-share price + available count */}
      <View style={styles.priceRow}>
        <View>
          <Text style={[styles.priceLabel, { color: colors.textMuted }]}>
            Price per share
          </Text>
          <Text style={[styles.priceValue, { color: colors.textPrimary }]}>
            {unitPriceFormatted}
          </Text>
        </View>
        <View style={styles.availableWrap}>
          <Text style={[styles.availableValue, { color: colors.textPrimary }]}>
            {availableUnits}
          </Text>
          <Text style={[styles.availableLabel, { color: colors.textMuted }]}>
            of {totalUnits} available
          </Text>
        </View>
      </View>

      {/* Allocation bar */}
      <View style={[styles.allocationBar, { backgroundColor: colors.border }]}>
        <View
          style={[
            styles.allocationFilled,
            {
              width: `${allocatedPct}%`,
              backgroundColor: colors.brand,
            },
          ]}
        />
      </View>
      <View style={styles.allocationLegend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.brand }]} />
          <Text style={[styles.legendText, { color: colors.textMuted }]}>
            {allocatedPct}% held
          </Text>
        </View>
        <Text style={[styles.legendText, { color: colors.textMuted }]}>
          {availablePct}% available
        </Text>
      </View>

      {/* Issuer */}
      {issuerName ? (
        <Text style={[styles.issuerText, { color: colors.textSecondary }]}>
          Issued by {issuerName}
        </Text>
      ) : null}

      {/* CTAs */}
      <AnimatedPressable
        onPress={onPressBuyShares}
        activeOpacity={0.85}
        scaleValue={0.97}
        hapticFeedback="medium"
        style={[styles.buyButton, { backgroundColor: colors.brand }]}
        accessibilityRole="button"
        accessibilityLabel="Buy shares of this item"
        accessibilityHint="Open the trade screen to purchase co-own shares"
      >
        <Ionicons name="trending-up-outline" size={18} color={colors.textInverse} aria-hidden={true} />
        <Text style={[styles.buyButtonText, { color: colors.textInverse }]}>
          Buy Shares
        </Text>
      </AnimatedPressable>

      <Pressable
        onPress={onPressViewDetail}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="View full co-own asset detail"
      >
        <Text style={[styles.viewDetailLink, { color: colors.brand }]}>
          View asset detail
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.md,
    gap: Space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  headerTitle: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
    letterSpacing: TypographyV2.bodyStrong.letterSpacing,
  },
  closedText: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    lineHeight: TypographyV2.body.lineHeight,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  priceLabel: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
  priceValue: {
    fontSize: TypographyV2.priceList.size,
    fontFamily: TypographyV2.priceList.fontFamily,
    lineHeight: TypographyV2.priceList.lineHeight,
    letterSpacing: TypographyV2.priceList.letterSpacing,
  },
  availableWrap: {
    alignItems: 'flex-end',
  },
  availableValue: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
  },
  availableLabel: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
  allocationBar: {
    height: 4,
    borderRadius: Radius.full,
    overflow: 'hidden',
  },
  allocationFilled: {
    height: '100%',
    borderRadius: Radius.full,
  },
  allocationLegend: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 6,
    height: 6,
    borderRadius: Radius.full,
  },
  legendText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
  issuerText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
  buyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.xs,
    borderRadius: Radius.md,
    paddingVertical: Space.sm + 2,
    minHeight: 48,
  },
  buyButtonText: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    letterSpacing: TypographyV2.bodyStrong.letterSpacing,
  },
  viewDetailLink: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
    textAlign: 'center',
    paddingVertical: Space.xs,
  },
});
