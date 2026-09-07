import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../../theme/ThemeContext';
import { Space, Radius, FontFamily, PressScale } from '../../../theme/designTokens';
import { TypographyV2 } from '../../../theme/typography.v2';
import { formatCoOwnIze } from '../../../utils/currency';
import type { MarketCoOwnAsset, CoOwnOrderBookEntry } from '../../../services/marketApi';
import type { AssetLifecycleState } from './types';

export interface CoOwnAssetIdentityProps {
  asset: MarketCoOwnAsset;
  lifecycleState: AssetLifecycleState;
  dominantPriceLabel: string;
  dominantPriceValue: number;
  dominantPriceTimestamp: string | null;
  bestBid: CoOwnOrderBookEntry | null;
  bestAsk: CoOwnOrderBookEntry | null;
  spreadGbp: number | null;
  appraisedValuePerUnitGbp: number | null;
  appraisalValuer?: string | null;
  appraisalValuedAt?: string | null;
  availableUnits: number;
  totalUnits: number;
  allocatedPct: number;
  isHolder: boolean;
  yourUnits: number | null;
  viewerPct: number | null;
  reconciliationActive: boolean;
  dataStale: boolean;
  dataStaleAgeLabel?: string;
  onOpenDiligence: () => void;
  onOpenSupply: () => void;
}

export function CoOwnAssetIdentity({
  asset,
  lifecycleState,
  dominantPriceLabel,
  dominantPriceValue,
  dominantPriceTimestamp,
  bestBid,
  bestAsk,
  spreadGbp,
  appraisedValuePerUnitGbp,
  appraisalValuer,
  appraisalValuedAt,
  availableUnits,
  totalUnits,
  allocatedPct,
  isHolder,
  yourUnits,
  viewerPct,
  reconciliationActive,
  dataStale,
  dataStaleAgeLabel,
  onOpenDiligence,
  onOpenSupply,
}: CoOwnAssetIdentityProps) {
  const { colors, isDark } = useAppTheme();

  const appraisalFormattedDate = appraisalValuedAt
    ? new Date(appraisalValuedAt).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
    : null;

  return (
    <View style={[styles.container, { borderBottomColor: colors.borderSubtle }]}>
      {/* ── Line 1: Legal Vehicle & Custody Identity ── */}
      <View style={styles.topContextRow}>
        <View style={[styles.vehiclePill, { backgroundColor: colors.surfaceAlt }]}>
          <Ionicons name="business-outline" size={12} color={colors.brand} />
          <Text style={[styles.vehicleText, { color: colors.textPrimary }]} maxFontSizeMultiplier={1.2}>
            {asset.legalVehicleName || 'SPV Series LLC'}
          </Text>
        </View>

        <View style={styles.lifecyclePill}>
          <View
            style={[
              styles.statusDot,
              {
                backgroundColor: reconciliationActive
                  ? colors.warning
                  : lifecycleState === 'tradingPaused'
                    ? colors.textMuted
                    : colors.success,
              },
            ]}
          />
          <Text style={[styles.lifecycleText, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.2}>
            {lifecycleState === 'initialOffering'
              ? `Offering · ${allocatedPct}% allocated`
              : lifecycleState === 'secondaryTrading'
                ? 'Secondary market'
                : lifecycleState === 'tradingPaused'
                  ? 'Orders paused'
                  : 'Exit underway'}
          </Text>
        </View>
      </View>

      {/* ── Line 2: Asset Title ── */}
      <Text
        style={[styles.assetTitle, { color: colors.textPrimary }]}
        maxFontSizeMultiplier={1.3}
      >
        {asset.title}
      </Text>

      {/* ── Line 3: The Core Ownership Sentence ── */}
      <Pressable
        onPress={onOpenDiligence}
        style={({ pressed }) => [styles.ownershipStatementPressable, pressed && { opacity: 0.85 }]}
        accessibilityRole="button"
        accessibilityLabel="View ownership rights and custody terms"
      >
        <Text style={[styles.ownershipSentence, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.2}>
          1 unit = {(100 / Math.max(1, totalUnits)).toFixed(1)}% beneficial interest · Vaulted in {asset.custodianName || 'Bonded Vault'} · No personal possession
        </Text>
        <Ionicons name="chevron-forward" size={13} color={colors.brand} />
      </Pressable>

      {/* ── Line 4: Dominant Price Hero (ONE authorative number) ── */}
      <View style={styles.priceHeroBlock}>
        <View style={styles.priceRow}>
          <Text
            style={[styles.priceValue, { color: colors.textPrimary }]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.85}
          >
            {formatCoOwnIze(dominantPriceValue)}
          </Text>
          <View style={styles.priceMetaCol}>
            <Text style={[styles.priceLabel, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.2}>
              {dominantPriceLabel === 'Last trade' && dominantPriceTimestamp
                ? `Last trade · ${dominantPriceTimestamp}`
                : dominantPriceLabel}
            </Text>
            <Text style={[styles.unitSublabel, { color: colors.textMuted }]} maxFontSizeMultiplier={1.2}>
              per unit of {totalUnits} total
            </Text>
          </View>
        </View>

        {/* ── Line 5: Four Distinguished Numbers Strip ── */}
        <View style={[styles.marketMetricsStrip, { backgroundColor: colors.surfaceAlt }]}>
          {/* Metric 1: Executable Bid / Ask */}
          <View style={styles.metricCell}>
            <Text style={[styles.metricHeader, { color: colors.textMuted }]}>Bid / Ask</Text>
            <Text style={[styles.metricValue, { color: colors.textPrimary }]} numberOfLines={1}>
              {bestBid?.unitPriceGbp != null && bestAsk?.unitPriceGbp != null
                ? `${formatCoOwnIze(bestBid.unitPriceGbp)} / ${formatCoOwnIze(bestAsk.unitPriceGbp)}`
                : bestBid?.unitPriceGbp != null
                  ? `Bid ${formatCoOwnIze(bestBid.unitPriceGbp)}`
                  : bestAsk?.unitPriceGbp != null
                    ? `Ask ${formatCoOwnIze(bestAsk.unitPriceGbp)}`
                    : 'Sparse'}
            </Text>
            {spreadGbp != null && spreadGbp > 0 ? (
              <Text style={[styles.metricCaption, { color: colors.textMuted }]}>
                Spread {formatCoOwnIze(spreadGbp)}
              </Text>
            ) : null}
          </View>

          <View style={[styles.metricDivider, { backgroundColor: colors.borderSubtle }]} />

          {/* Metric 2: Appraised Value Benchmark */}
          <View style={styles.metricCell}>
            <Text style={[styles.metricHeader, { color: colors.textMuted }]}>Appraised value</Text>
            <Text style={[styles.metricValue, { color: colors.textPrimary }]} numberOfLines={1}>
              {appraisedValuePerUnitGbp != null ? formatCoOwnIze(appraisedValuePerUnitGbp) : 'Pending'}
            </Text>
            <Text style={[styles.metricCaption, { color: colors.textMuted }]} numberOfLines={1}>
              {appraisalFormattedDate ? `${appraisalFormattedDate} valuation` : 'Methodology on file'}
            </Text>
          </View>

          <View style={[styles.metricDivider, { backgroundColor: colors.borderSubtle }]} />

          {/* Metric 3: Availability / Allocation */}
          <Pressable
            onPress={onOpenSupply}
            style={({ pressed }) => [styles.metricCell, pressed && { opacity: 0.8 }]}
            accessibilityRole="button"
            accessibilityLabel="View supply structure details"
          >
            <Text style={[styles.metricHeader, { color: colors.textMuted }]}>
              {lifecycleState === 'initialOffering' ? 'Available' : 'Float'}
            </Text>
            <Text style={[styles.metricValue, { color: colors.brand }]} numberOfLines={1}>
              {availableUnits} / {totalUnits}
            </Text>
            <Text style={[styles.metricCaption, { color: colors.textMuted }]}>
              {allocatedPct}% allocated
            </Text>
          </Pressable>
        </View>
      </View>

      {/* ── Line 6: Your Position Strip (when user owns units) ── */}
      {isHolder && yourUnits != null && yourUnits > 0 ? (
        <View style={[styles.holderPositionBanner, { backgroundColor: isDark ? '#14201A' : '#EDF8F2', borderColor: colors.success }]}>
          <Ionicons name="pie-chart" size={15} color={colors.success} />
          <Text style={[styles.holderPositionText, { color: colors.textPrimary }]} maxFontSizeMultiplier={1.2}>
            You hold <Text style={{ fontFamily: FontFamily.bold }}>{yourUnits} units</Text> ({viewerPct != null ? `${viewerPct}%` : ''})
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Space.md,
    paddingTop: Space.md,
    paddingBottom: Space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  topContextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Space.xs,
  },
  vehiclePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Space.xs + 2,
    paddingVertical: 3,
    borderRadius: Radius.sm,
  },
  vehicleText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.medium,
    lineHeight: TypographyV2.meta.lineHeight,
  },
  lifecyclePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: Radius.full,
  },
  lifecycleText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.medium,
    lineHeight: TypographyV2.meta.lineHeight,
  },
  assetTitle: {
    fontSize: TypographyV2.screenTitle.size,
    lineHeight: TypographyV2.screenTitle.lineHeight,
    fontFamily: FontFamily.bold,
    letterSpacing: TypographyV2.screenTitle.letterSpacing,
    marginTop: 2,
  },
  ownershipStatementPressable: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: Space.xs,
  },
  ownershipSentence: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.regular,
    flex: 1,
  },
  priceHeroBlock: {
    marginTop: Space.md,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Space.sm,
  },
  priceValue: {
    fontSize: TypographyV2.priceHero.size,
    lineHeight: TypographyV2.priceHero.lineHeight,
    fontFamily: FontFamily.bold,
    letterSpacing: TypographyV2.priceHero.letterSpacing,
    fontVariant: ['tabular-nums'],
  },
  priceMetaCol: {
    justifyContent: 'center',
  },
  priceLabel: {
    fontSize: TypographyV2.itemTitle.size,
    fontFamily: FontFamily.semibold,
    lineHeight: TypographyV2.itemTitle.lineHeight,
  },
  unitSublabel: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.regular,
    lineHeight: TypographyV2.meta.lineHeight,
  },
  marketMetricsStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Space.sm,
    paddingVertical: Space.sm,
    paddingHorizontal: Space.sm,
    borderRadius: Radius.md,
  },
  metricCell: {
    flex: 1,
    alignItems: 'center',
  },
  metricDivider: {
    width: StyleSheet.hairlineWidth,
    height: 28,
  },
  metricHeader: {
    fontSize: 10,
    fontFamily: FontFamily.medium,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  metricValue: {
    fontSize: TypographyV2.captionElevated.size,
    fontFamily: FontFamily.semibold,
    lineHeight: TypographyV2.captionElevated.lineHeight,
    fontVariant: ['tabular-nums'],
  },
  metricCaption: {
    fontSize: 10,
    fontFamily: FontFamily.regular,
    marginTop: 1,
  },
  holderPositionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs + 2,
    borderRadius: Radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: Space.sm,
  },
  holderPositionText: {
    fontSize: TypographyV2.caption.size,
    fontFamily: FontFamily.regular,
    lineHeight: TypographyV2.caption.lineHeight,
  },
});
