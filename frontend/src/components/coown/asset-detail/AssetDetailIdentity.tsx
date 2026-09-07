/**
 * AssetDetailIdentity — collectible-first identity, price, and
 * availability block for the Co-Own asset detail screen.
 *
 * Sits directly below the media stage on clean canvas. Shows:
 *   - Asset identity (eyebrow, title, holder count)
 *   - Dominant price with 24h delta pill
 *   - Allocation progress (initial offering) or market status (secondary)
 *   - Issuer trust row
 *
 * No card surface — flat on canvas with hairline separator.
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
  dominantPriceLabel,
  dominantPriceTimestamp,
  movePct24h,
  isInitialOffering,
  allocatedPct,
  availableUnits,
  reconciliationActive,
  dataStale,
  dataStaleAgeLabel,
  lifecycleState,
  bestBidGbp,
  bestAskGbp,
  issuerUsername,
  issuerTrust,
  currentUserId,
  onPressIssuer,
}: AssetDetailIdentityProps) {
  const { colors } = useAppTheme();

  return (
    <View style={[styles.identity, { borderBottomColor: colors.borderSubtle }]}>
      <CommerceDetailIdentity
        family="co_own"
        density={isVeryCompact ? 'compact' : 'standard'}
        eyebrow={asset.legalVehicleName ?? 'Fractional collectible'}
        title={asset.title}
        interestSignal={asset.holders != null && asset.holders > 0 ? `${asset.holders} holders` : undefined}
      />

      {/* Dominant price block — bold tabular numeral with 24h delta */}
      <View style={styles.priceRow}>
        <Text
          style={[styles.priceValue, { color: colors.textPrimary }]}
          accessibilityRole="text"
          adjustsFontSizeToFit
          minimumFontScale={0.82}
          numberOfLines={1}
          maxFontSizeMultiplier={1.3}
        >
          {formatCoOwnIze(dominantPriceValue)}
        </Text>
        <Text style={[styles.priceUnit, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.4}>
          {dominantPriceLabel === 'Last trade' && dominantPriceTimestamp
            ? `${dominantPriceLabel} · ${dominantPriceTimestamp}`
            : dominantPriceLabel}
        </Text>
        {movePct24h != null && !isInitialOffering && (
          <View style={[
            styles.movePill,
            { backgroundColor: movePct24h >= 0 ? colors.coownUpSubtle : colors.coownDownSubtle },
          ]}>
            <Ionicons
              name={movePct24h >= 0 ? 'trending-up' : 'trending-down'}
              size={12}
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

      {/* Initial offering allocation progress OR secondary market depth status */}
      {isInitialOffering ? (
        <View style={styles.offeringBlock}>
          <View style={[styles.progressBarTrack, { backgroundColor: colors.surfaceAlt }]}>
            <View
              style={[
                styles.progressBarFill,
                {
                  width: `${Math.min(100, Math.max(0, allocatedPct))}%`,
                  backgroundColor: colors.brand,
                },
              ]}
            />
          </View>
          <View style={styles.offeringMetaRow}>
            <Text style={[styles.offeringMetaText, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.4}>
              {allocatedPct}% allocated · {availableUnits} units left
            </Text>
            {asset.safeguarded && asset.safeguardingEvidenceUrl ? (
              <View style={styles.protectedBadge}>
                <Ionicons name="shield-checkmark" size={13} color={colors.success} />
                <Text style={[styles.protectedBadgeText, { color: colors.success }]}>Safeguarded</Text>
              </View>
            ) : null}
          </View>
        </View>
      ) : (
        <View style={styles.availabilityRow}>
          <View style={[styles.availabilityDot, {
            backgroundColor: reconciliationActive
              ? colors.warning
              : dataStale && lifecycleState === 'secondaryTrading'
                ? colors.warning
              : asset.isOpen
                ? colors.success
                : colors.textMuted,
          }]} />
          <Text style={[styles.availabilityText, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.4}>
            {reconciliationActive
              ? 'Orders paused'
              : dataStale && lifecycleState === 'secondaryTrading'
                ? 'Market data stale'
                : asset.isOpen
                  ? 'Market open'
                  : 'Market closed'}
          </Text>
          {bestBidGbp != null && bestAskGbp != null ? (
            <Text style={[styles.spreadText, { color: colors.textMuted }]} maxFontSizeMultiplier={1.4}>
              · {formatCoOwnIze(bestBidGbp)} Bid / {formatCoOwnIze(bestAskGbp)} Ask
            </Text>
          ) : (
            <Text style={[styles.spreadText, { color: colors.textMuted }]} maxFontSizeMultiplier={1.4}>
              · {availableUnits} units available
            </Text>
          )}
          {dataStale && dataStaleAgeLabel ? (
            <Text style={[styles.staleText, { color: colors.warning }]}>
              · stale {dataStaleAgeLabel}
            </Text>
          ) : null}
        </View>
      )}

      {/* Issuer Trust Row — clean compact presentation */}
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
    marginTop: Space.sm,
  },
  priceValue: {
    fontSize: TypographyV2.priceHero.size,
    lineHeight: TypographyV2.priceHero.lineHeight,
    fontFamily: FontFamily.bold,
    letterSpacing: TypographyV2.priceHero.letterSpacing,
    fontVariant: ['tabular-nums'] as ['tabular-nums'],
  },
  priceUnit: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.medium,
    letterSpacing: TypographyV2.meta.letterSpacing,
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
  offeringBlock: {
    marginTop: Space.sm,
  },
  progressBarTrack: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  offeringMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Space.xs,
  },
  offeringMetaText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.medium,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
  protectedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  protectedBadgeText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.semibold,
  },
  availabilityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: Space.sm,
    flexWrap: 'wrap',
  },
  availabilityDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  availabilityText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.medium,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
  spreadText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.regular,
    fontVariant: ['tabular-nums'] as ['tabular-nums'],
  },
  staleText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.medium,
  },
  issuerWrap: {
    marginTop: Space.sm,
  },
});
