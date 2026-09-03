import React from 'react';
import { View, Text, StyleSheet, TextInput, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Control, FontFamily, Stroke } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { RadiusRoleValue } from '../../theme/surfaceRadiusRules';
import { calculatePlatformChargeGbp, sanitizeDecimalInput } from '../../utils/currencyAuthoringFlows';

const AUCTION_DURATIONS = [24, 48, 72, 168];

export interface AuctionFieldsSectionProps {
  currencySymbol: string;
  startingBid: string;
  onStartingBidChange: (text: string) => void;
  reservePrice: string;
  onReservePriceChange: (text: string) => void;
  auctionDurationHours: number;
  onAuctionDurationHoursChange: (hours: number) => void;
  errors: Record<string, string>;
  hasValidStartingBid: boolean;
  numericStartingBid: number;
}

/**
 * Auction-specific fields rendered within the price & condition section:
 * starting bid, reserve price, and duration toggle. Includes a seller
 * proceeds estimate from the starting bid.
 */
function AuctionFieldsSection({
  currencySymbol,
  startingBid,
  onStartingBidChange,
  reservePrice,
  onReservePriceChange,
  auctionDurationHours,
  onAuctionDurationHoursChange,
  errors,
  hasValidStartingBid,
  numericStartingBid }: AuctionFieldsSectionProps) {
  const { colors } = useAppTheme();

  return (
    <>
      <View style={styles.fieldGroup}>
        <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Starting bid</Text>
        <View style={styles.priceInputRow}>
          <Text style={[styles.currencySymbol, { color: colors.textMuted }]}>{currencySymbol}</Text>
          <TextInput
            style={[styles.priceInput, { color: colors.textPrimary }]}
            placeholder="0"
            placeholderTextColor={colors.textMuted}
            keyboardType="decimal-pad"
            returnKeyType="done"
            value={startingBid}
            onChangeText={onStartingBidChange}
            maxLength={8}
          />
        </View>
        {errors.startingBid ? <Text style={[styles.fieldError, { color: colors.danger }]}>{errors.startingBid}</Text> : null}

        {/* ── Seller proceeds estimate (auction) ──
            Per audit 04 P1: "Add seller-proceeds preview beside price."
            For auctions, shows the minimum proceeds from the starting
            bid so sellers understand their floor payout. */}
        {hasValidStartingBid && numericStartingBid > 0 && (
          <View style={styles.proceedsRow}>
            <View style={styles.proceedsLeft}>
              <Ionicons name="wallet-outline" size={16} color={colors.textSecondary} aria-hidden={true} />
              <Text style={[styles.proceedsLabel, { color: colors.textMuted }]}>
                You receive (from starting bid)
              </Text>
            </View>
            <View style={styles.proceedsRight}>
              <Text style={[styles.proceedsAmount, { color: colors.success }]}>
                {currencySymbol}{(numericStartingBid - calculatePlatformChargeGbp(numericStartingBid)).toFixed(2)}
              </Text>
              <Text style={[styles.proceedsFeeHint, { color: colors.textMuted }]}>
                after {currencySymbol}{calculatePlatformChargeGbp(numericStartingBid).toFixed(2)} fee
              </Text>
            </View>
          </View>
        )}

        <View style={[styles.hairline, { backgroundColor: colors.border }]} />
      </View>

      <View style={styles.fieldGroup}>
        <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Reserve price (optional)</Text>
        <View style={styles.priceInputRow}>
          <Text style={[styles.currencySymbol, { color: colors.textMuted }]}>{currencySymbol}</Text>
          <TextInput
            style={[styles.priceInput, { color: colors.textPrimary }]}
            placeholder="0"
            placeholderTextColor={colors.textMuted}
            keyboardType="decimal-pad"
            returnKeyType="done"
            value={reservePrice}
            onChangeText={onReservePriceChange}
            maxLength={8}
          />
        </View>
        <View style={[styles.hairline, { backgroundColor: colors.border }]} />
      </View>

      <View style={styles.fieldGroup}>
        <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Duration</Text>
        <View style={styles.toggleRow}>
          {AUCTION_DURATIONS.map((h) => {
            const active = auctionDurationHours === h;
            return (
              <Pressable
                key={h}
                style={({ pressed }) => [styles.togglePill, { backgroundColor: colors.surface, borderColor: colors.border }, active && styles.togglePillActive, active && { backgroundColor: colors.brand, borderColor: colors.brand }, pressed && { opacity: 0.7 }]}
                onPress={() => onAuctionDurationHoursChange(h)}
                accessibilityRole="button"
                accessibilityLabel={`Set duration to ${h} hours`}
              >
                <Text style={[styles.toggleText, { color: colors.textPrimary }, active && styles.toggleTextActive, active && { color: colors.textInverse }]}>
                  {h < 72 ? `${h}h` : `${h / 24}d`}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <View style={[styles.hairline, { backgroundColor: colors.border }]} />
      </View>
    </>
  );
}

export default AuctionFieldsSection;

const styles = StyleSheet.create({
  fieldGroup: {
    paddingVertical: Space.sm },
  fieldLabel: {
    fontSize: TypographyV2.bodyStrong.size,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
    fontFamily: FontFamily.semibold,
    letterSpacing: TypographyV2.bodyStrong.letterSpacing,
    marginBottom: Space.xs },
  priceInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Space.sm,
    minHeight: Control.hit + Space.sm },
  currencySymbol: {
    fontSize: TypographyV2.priceHero.size,
    fontFamily: FontFamily.bold,
    fontVariant: ['tabular-nums'],
    marginRight: Space.xs + 2 },
  priceInput: {
    fontSize: TypographyV2.priceHero.size,
    fontFamily: FontFamily.bold,
    fontVariant: ['tabular-nums'],
    minWidth: Space.xxl + Space.lg + Space.sm,
    padding: 0 },
  fieldError: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.semibold,
    marginTop: Space.xs },
  hairline: {
    height: StyleSheet.hairlineWidth,
    marginTop: Space.sm },
  proceedsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Space.sm,
    marginTop: Space.xs },
  proceedsLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 1 },
  proceedsLabel: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: FontFamily.medium,
    marginTop: 0 },
  proceedsRight: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Space.xs },
  proceedsAmount: {
    fontSize: TypographyV2.priceList.size,
    lineHeight: TypographyV2.priceList.lineHeight,
    fontFamily: FontFamily.bold,
    fontVariant: ['tabular-nums'] },
  proceedsFeeHint: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.regular,
    marginTop: 0 },
  toggleRow: {
    flexDirection: 'row',
    gap: Space.sm,
    marginTop: Space.xs },
  togglePill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm + 2,
    borderRadius: RadiusRoleValue.mediaThumbnail,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: Control.hit },
  togglePillActive: {},
  toggleText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.medium },
  toggleTextActive: {
    fontFamily: FontFamily.bold } });
