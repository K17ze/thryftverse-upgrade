/**
 * AssetDetailIdentity — compact collectible-first identity for the
 * Co-Own asset detail screen.
 *
 * Sits directly below the media stage on clean canvas. The first
 * viewport must reach the chart, so the identity block is compressed
 * to four rows:
 *   1. Asset title — dominant, via the family="co_own" identity
 *      primitive (structural consistency across commerce surfaces).
 *   2. One-unit price — priceList bold tabular-nums, with a truthful
 *      basis label and a 24h delta pill inline.
 *   3. A single compact context line — condition · units,
 *      middot-separated.
 *   4. Issuer trust row — compact, tappable.
 *
 * Market state (open/closed/paused) and live availability live in the
 * dock and overview sections — they are not repeated here. No Co-Own
 * family badge (redundant inside Co-Own). No card surface — flat on
 * canvas with a hairline separator.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CommerceDetailIdentity, CommerceDetailSellerRow } from '../../commerce/detail';
import { useAppTheme } from '../../../theme/ThemeContext';
import { Space, Radius, FontFamily } from '../../../theme/designTokens';
import { TypographyV2 } from '../../../theme/typography.v2';
import { formatCoOwnIze } from '../../../utils/currency';
import type { MarketCoOwnAsset } from '../../../services/marketApi';
import type { SellerTrustSummary } from '../../../platform/product';
import type { AssetLifecycleState } from './types';

export interface AssetDetailIdentityProps {
  asset: MarketCoOwnAsset;
  isVeryCompact: boolean;
  dominantPriceValue: number;
  dominantPriceLabel: string;
  dominantPriceTimestamp: string | null | undefined;
  movePct24h: number | null;
  isInitialOffering: boolean;
  allocatedPct: number;
  availableUnits: number;
  reconciliationActive: boolean;
  dataStale: boolean;
  dataStaleAgeLabel: string | null | undefined;
  lifecycleState: AssetLifecycleState;
  bestBidGbp: number | null;
  bestAskGbp: number | null;
  issuerUsername: string;
  issuerTrust: SellerTrustSummary | null | undefined;
  currentUserId?: string;
  onPressIssuer: () => void;
}

export function AssetDetailIdentity({
  asset,
  isVeryCompact,
  dominantPriceValue,
  movePct24h,
  isInitialOffering,
  issuerUsername,
  issuerTrust,
  onPressIssuer,
}: AssetDetailIdentityProps) {
  const { colors } = useAppTheme();

  // ── Price basis (U09 + U11) ──
  // The identity header must not silently present a reference price as
  // the latest trade. Derive the basis directly from the asset snapshot
  // so the label is always truthful, regardless of what the orchestrator
  // passes as dominantPriceLabel. When a settled last execution exists,
  // label it "Last trade" with its timestamp; otherwise label the unit
  // price as "Reference" (or "Offering" during primary offering).
  const marketSnapshot = asset.marketSnapshot ?? null;
  const lastExecutionPriceGbp = marketSnapshot?.lastExecutionPriceGbp ?? null;
  const hasSettledTrade = lastExecutionPriceGbp != null;
  const priceBasis: string = isInitialOffering
    ? 'Offering'
    : hasSettledTrade
      ? 'Last trade'
      : 'Reference';
  const lastTradeTimestamp = hasSettledTrade && !isInitialOffering && marketSnapshot?.lastExecutionAt
    ? new Date(marketSnapshot.lastExecutionAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    : null;

  // ── Compact context line ──
  // Collapse category/condition and total unit count into one
  // middot-separated line. Market state and live availability live in
  // the dock / overview — not repeated here. The issuer is shown in its
  // own compact trust row below, so it is not duplicated in this line.
  const contextLabel = asset.conditionGrade ?? asset.legalVehicleName ?? null;
  const showUnits = asset.totalUnits > 0;
  const unitsLabel = `${asset.totalUnits.toLocaleString('en-GB')} units`;
  const hasContextLine = !!contextLabel || showUnits;

  return (
    <View style={[styles.identity, { borderBottomColor: colors.borderSubtle }]}>
      <CommerceDetailIdentity
        family="co_own"
        density={isVeryCompact ? 'compact' : 'standard'}
        title={asset.title}
      />

      {/* Dominant one-unit price — priceList bold tabular-nums with a
          truthful basis label and 24h delta pill inline. The price,
          basis, and pill reflow in a flexWrap row so long values wrap
          instead of truncating. */}
      <View style={styles.priceRow}>
        <Text
          style={[styles.priceValue, { color: colors.textPrimary }]}
          accessibilityRole="text"
          adjustsFontSizeToFit
          minimumFontScale={0.7}
          numberOfLines={1}
          maxFontSizeMultiplier={1.3}
        >
          {formatCoOwnIze(dominantPriceValue)}
        </Text>
        <Text
          style={[styles.priceUnit, { color: colors.textSecondary }]}
          maxFontSizeMultiplier={1.4}
          numberOfLines={1}
        >
          {priceBasis === 'Last trade' && lastTradeTimestamp
            ? `${priceBasis} · ${lastTradeTimestamp}`
            : priceBasis}
        </Text>
        {movePct24h != null && !isInitialOffering && (
          <View style={[
            styles.movePill,
            { backgroundColor: movePct24h >= 0 ? colors.coownUpSubtle : colors.coownDownSubtle },
          ]}
            accessibilityLabel={`24 hour change ${movePct24h >= 0 ? 'up' : 'down'} ${Math.abs(movePct24h).toFixed(1)} percent`}
            accessibilityRole="text"
          >
            <Ionicons
              name={movePct24h >= 0 ? 'trending-up' : 'trending-down'}
              size={14}
              color={movePct24h >= 0 ? colors.coownUp : colors.coownDown}
            />
            <Text style={[
              styles.movePillText,
              { color: movePct24h >= 0 ? colors.coownUp : colors.coownDown },
            ]}>
              {`${movePct24h >= 0 ? '+' : ''}${movePct24h.toFixed(1)}%`}
            </Text>
          </View>
        )}
      </View>

      {/* Compact context line — condition · units. One row replaces the
          former eyebrow context line, allocation progress block, and
          availability/market-state row. */}
      {hasContextLine && (
        <Text
          style={[styles.contextLine, { color: colors.textSecondary }]}
          numberOfLines={1}
          maxFontSizeMultiplier={1.4}
        >
          {contextLabel ? (
            <Text style={styles.contextSegment}>{contextLabel}</Text>
          ) : null}
          {contextLabel && showUnits ? ' · ' : null}
          {showUnits ? (
            <Text style={[styles.contextSegment, styles.contextUnits]}>
              {unitsLabel}
            </Text>
          ) : null}
        </Text>
      )}

      {/* Issuer trust row — compact, tappable. The issuer lives here
          (not in the context line) so verification and rating stay
          visible without consuming the former multi-line block. */}
      <View style={styles.issuerWrap}>
        <CommerceDetailSellerRow
          roleLabel="Issuer"
          institutional
          variant="compact"
          avatarUri={asset.issuer?.avatar ?? undefined}
          name={issuerUsername}
          verified={asset.issuerVerification?.tier === 'id' || asset.issuerVerification?.tier === 'seller'}
          ratingLine={
            asset.issuerVerification?.tier === 'seller'
              ? 'Trusted Seller'
              : asset.issuerVerification?.tier === 'id'
                ? 'ID Verified'
                : asset.issuerVerification?.tier === 'email'
                  ? 'Email verified'
                  : undefined
          }
          locationLine={issuerTrust?.location ?? asset.issuer?.location ?? undefined}
          statsLine={
            issuerTrust
              ? [
                  issuerTrust.completedSales != null ? `${issuerTrust.completedSales} sales` : null,
                  issuerTrust.rating != null ? `${issuerTrust.rating.toFixed(1)}★` : null,
                ].filter(Boolean).join(' · ') || undefined
              : undefined
          }
          onPress={onPressIssuer}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  identity: {
    paddingHorizontal: Space.md,
    paddingTop: Space.md,
    paddingBottom: Space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    gap: Space.xs,
    marginTop: Space.xs,
  },
  priceValue: {
    fontSize: TypographyV2.priceList.size,
    lineHeight: TypographyV2.priceList.lineHeight,
    fontFamily: TypographyV2.priceList.fontFamily,
    letterSpacing: TypographyV2.priceList.letterSpacing,
    fontVariant: ['tabular-nums'] as ['tabular-nums'],
    // Allow the price to shrink so the basis label can claim space in
    // the flex row when the price is long.
    flexShrink: 1,
  },
  priceUnit: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.medium,
    letterSpacing: TypographyV2.meta.letterSpacing,
    flexShrink: 1,
  },
  movePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: Space.xs + 1,
    paddingVertical: 2,
    borderRadius: Radius.full,
  },
  movePillText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.semibold,
    fontVariant: ['tabular-nums'] as ['tabular-nums'],
  },
  contextLine: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
    marginTop: Space.xs,
  },
  contextSegment: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
  },
  contextUnits: {
    fontVariant: ['tabular-nums'] as ['tabular-nums'],
  },
  issuerWrap: {
    marginTop: Space.xs,
  },
});
