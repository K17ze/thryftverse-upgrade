import React, { useMemo } from 'react';
import {
  View,
  StyleSheet,
  Text } from 'react-native';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { SupportedCurrencyCode } from '../../constants/currencies';
import { toIze, formatAuctionIze } from '../../utils/currency';
import { type SellerStats } from './sellerAuctionCentreViewModels';
import { Space } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';

export function SellerAuctionSummary({
  stats,
  formatFromFiat,
  fxRates,
  currencyCode }: {
  stats: SellerStats;
  formatFromFiat: (amount: number, currency?: any, opts?: any) => string;
  fxRates: any;
  currencyCode: SupportedCurrencyCode;
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const active = stats.live;
  const activeColor = active > 0 ? colors.danger : colors.textPrimary;
  const hasBidContext = stats.totalBids > 0 && stats.highestBid > 0;
  const highestBidIze = hasBidContext
    ? formatAuctionIze(toIze(stats.highestBid, currencyCode, fxRates))
    : null;
  const highestBidLocal = hasBidContext
    ? formatFromFiat(stats.highestBid, 'GBP', { displayMode: 'fiat' })
    : null;

  return (
    <View style={styles.summary}>
      <View style={styles.summaryRow}>
        {/* Primary measure — Active auctions */}
        <View style={styles.summaryPrimary}>
          <Text style={[styles.summaryPrimaryValue, { color: activeColor }]}>{active}</Text>
          <Text style={[styles.summaryPrimaryLabel, { color: active > 0 ? colors.danger : colors.textMuted }]}>
            Active auctions
          </Text>
        </View>
        {/* Vertical hairline divider */}
        <View style={styles.summaryPrimaryDivider} />
        {/* Secondary measures — hairline-divided compact row */}
        <View style={styles.summarySecondary}>
          <View style={styles.summarySecondaryItem}>
            <Text style={styles.summarySecondaryValue}>{stats.scheduled}</Text>
            <Text style={styles.summarySecondaryLabel}>Scheduled</Text>
          </View>
          <View style={styles.summarySecondaryItem}>
            <Text style={styles.summarySecondaryValue}>{stats.sold}</Text>
            <Text style={styles.summarySecondaryLabel}>Sold</Text>
          </View>
          <View style={styles.summarySecondaryItem}>
            <Text style={styles.summarySecondaryValue}>{stats.unsold}</Text>
            <Text style={styles.summarySecondaryLabel}>Unsold</Text>
          </View>
        </View>
      </View>
      {/* Quiet context — total bids + highest bid, only when authoritative */}
      {hasBidContext && (
        <View style={styles.summaryContext}>
          <Text style={styles.summaryContextText}>
            {stats.totalBids} {stats.totalBids === 1 ? 'bid' : 'bids'} · Highest {highestBidIze}
            {highestBidLocal ? ` · ${highestBidLocal}` : ''}
          </Text>
        </View>
      )}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  // ── Seller summary — one integrated surface ──
  summary: {
    paddingHorizontal: Space.md,
    paddingTop: Space.lg,
    paddingBottom: Space.md },
  summaryContext: {
    marginTop: Space.sm,
    paddingTop: Space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md },
  summaryContextText: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    color: colors.textMuted,
    fontFamily: TypographyV2.meta.fontFamily,
    fontVariant: ['tabular-nums'],
    letterSpacing: TypographyV2.meta.letterSpacing },
  summaryPrimary: {
    alignItems: 'flex-start' },
  summaryPrimaryValue: {
    fontSize: TypographyV2.display.size,
    fontFamily: TypographyV2.display.fontFamily,
    letterSpacing: TypographyV2.display.letterSpacing,
    fontVariant: ['tabular-nums'],
    lineHeight: TypographyV2.display.lineHeight },
  summaryPrimaryLabel: {
    fontSize: TypographyV2.label.size,
    lineHeight: TypographyV2.label.lineHeight,
    fontFamily: TypographyV2.label.fontFamily,
    marginTop: Space.xs / 2 + 1,
    letterSpacing: TypographyV2.label.letterSpacing },
  summaryPrimaryDivider: {
    width: StyleSheet.hairlineWidth,
    height: Space.xl + Space.xl + 4,
    backgroundColor: colors.border },
  summarySecondary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between' },
  summarySecondaryItem: {
    alignItems: 'center',
    flex: 1 },
  summarySecondaryValue: {
    fontSize: TypographyV2.priceList.size,
    lineHeight: TypographyV2.priceList.lineHeight,
    fontFamily: TypographyV2.priceList.fontFamily,
    color: colors.textPrimary,
    fontVariant: ['tabular-nums'],
    letterSpacing: TypographyV2.priceList.letterSpacing },
  summarySecondaryLabel: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    color: colors.textMuted,
    fontFamily: TypographyV2.meta.fontFamily,
    marginTop: Space.xs / 2 + 1,
    letterSpacing: TypographyV2.meta.letterSpacing } });
}
