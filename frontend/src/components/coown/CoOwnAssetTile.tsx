import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Radius, Type, Typography } from '../../theme/designTokens';
import { CachedImage } from '../CachedImage';
import { AnimatedPressable } from '../AnimatedPressable';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import type { CoOwnAssetStatus } from './CoOwnFeaturedAsset';

export type CoOwnAssetTileVariant = 'discovery' | 'market';

/** Phase 2: market-variant data for the sortable market row. */
export interface CoOwnMarketTileData {
  /** Ticker symbol (e.g. "MYA-01"). */
  ticker?: string;
  /** Last price label. */
  lastPriceLabel?: string;
  /** Last trade age label (e.g. "3h ago"). */
  lastAgeLabel?: string;
  /** 24h change percentage. */
  change24hPct?: number;
  /** 24h change timestamp. */
  change24hTimestamp?: string;
  /** Spread label. */
  spreadLabel?: string;
  /** Depth ±2% label. */
  depthLabel?: string;
  /** Market mode for status pill. */
  marketMode?: 'continuous' | 'call_auction' | 'rfq' | 'halted' | 'closed';
}

export interface CoOwnAssetTileProps {
  imageUri?: string | null;
  title: string;
  unitPriceLabel: string;
  availableUnits: number;
  totalUnits: number;
  status: CoOwnAssetStatus;
  onPress?: () => void;
  index?: number;
  /** Phase 2: variant — 'discovery' (default, art-directed tile) or 'market' (sortable row). */
  variant?: CoOwnAssetTileVariant;
  /** Phase 2: market-variant data. Only used when variant='market'. */
  marketData?: CoOwnMarketTileData;
}

export function CoOwnAssetTile({
  imageUri,
  title,
  unitPriceLabel,
  availableUnits,
  totalUnits,
  status,
  onPress,
  index = 0,
  variant = 'discovery',
  marketData,
}: CoOwnAssetTileProps) {
  const { colors } = useAppTheme();
  const reducedMotion = useReducedMotion();
  const allocatedPct = totalUnits > 0 ? Math.round(((totalUnits - availableUnits) / totalUnits) * 100) : 0;

  const statusLabel = status === 'open' ? 'Available' : status === 'paused' ? 'Paused' : 'Allocated';
  const statusColor = status === 'open' ? colors.success : status === 'paused' ? colors.textSecondary : colors.textMuted;

  // Market variant — sortable market row
  if (variant === 'market') {
    return (
      <Reanimated.View entering={reducedMotion ? undefined : FadeInDown.delay(Math.min(index, 8) * 30).duration(250)}>
        <AnimatedPressable
          onPress={onPress}
          activeOpacity={0.92}
          accessibilityRole="button"
          accessibilityLabel={`${marketData?.ticker ?? title}, last ${marketData?.lastPriceLabel ?? unitPriceLabel}${marketData?.lastAgeLabel ? `, ${marketData.lastAgeLabel}` : ''}${marketData?.change24hPct != null ? `, ${marketData.change24hPct >= 0 ? 'up' : 'down'} ${Math.abs(marketData.change24hPct).toFixed(1)}%` : ''}${marketData?.spreadLabel ? `, spread ${marketData.spreadLabel}` : ''}`}
        >
          <View style={[styles.marketRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {/* Thumbnail */}
            <View style={styles.marketImageWrap}>
              {imageUri ? (
                <CachedImage uri={imageUri} style={styles.marketImage} contentFit="cover" transition={200} />
              ) : (
                <View style={[styles.marketImage, styles.imageFallback, { backgroundColor: colors.surfaceAlt }]}>
                  <Ionicons name="cube-outline" size={16} color={colors.textMuted} />
                </View>
              )}
            </View>

            {/* Identity + ticker */}
            <View style={styles.marketIdentity}>
              {marketData?.ticker && (
                <Text style={[styles.marketTicker, { color: colors.textMuted }]} numberOfLines={1}>
                  {marketData.ticker}
                </Text>
              )}
              <Text style={[styles.marketTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                {title}
              </Text>
              {/* Status pill */}
              <View style={styles.marketStatusRow}>
                <View style={[styles.marketStatusDot, { backgroundColor: statusColor }]} />
                <Text style={[styles.marketStatusText, { color: colors.textSecondary }]} numberOfLines={1}>
                  {marketData?.marketMode === 'halted' ? 'Halted' : marketData?.marketMode === 'closed' ? 'Closed' : marketData?.marketMode === 'rfq' ? 'RFQ' : marketData?.marketMode === 'call_auction' ? 'Auction' : statusLabel}
                </Text>
              </View>
            </View>

            {/* Price + change */}
            <View style={styles.marketPriceCol}>
              <Text style={[styles.marketPrice, { color: colors.textPrimary }]} numberOfLines={1}>
                {marketData?.lastPriceLabel ?? unitPriceLabel}
              </Text>
              {marketData?.lastAgeLabel && (
                <Text style={[styles.marketAge, { color: colors.textMuted }]} numberOfLines={1}>
                  {marketData.lastAgeLabel}
                </Text>
              )}
              {marketData?.change24hPct != null && (
                <Text
                  style={[
                    styles.marketChange,
                    { color: marketData.change24hPct >= 0 ? colors.success : colors.danger },
                  ]}
                  numberOfLines={1}
                >
                  {marketData.change24hPct >= 0 ? '▲ +' : '▼ '}{marketData.change24hPct.toFixed(1)}%
                </Text>
              )}
            </View>

            {/* Spread + depth */}
            <View style={styles.marketSpreadCol}>
              {marketData?.spreadLabel && (
                <>
                  <Text style={[styles.marketSpreadLabel, { color: colors.textMuted }]} numberOfLines={1}>
                    Spread
                  </Text>
                  <Text style={[styles.marketSpreadValue, { color: colors.textSecondary }]} numberOfLines={1}>
                    {marketData.spreadLabel}
                  </Text>
                </>
              )}
              {marketData?.depthLabel && (
                <Text style={[styles.marketDepth, { color: colors.textMuted }]} numberOfLines={1}>
                  ±2%: {marketData.depthLabel}
                </Text>
              )}
            </View>
          </View>
        </AnimatedPressable>
      </Reanimated.View>
    );
  }

  // Discovery variant — art-directed tile (original)
  return (
    <Reanimated.View entering={reducedMotion ? undefined : FadeInDown.delay(Math.min(index, 8) * 40).duration(300)}>
      <AnimatedPressable
        onPress={onPress}
        activeOpacity={0.92}
        accessibilityRole="button"
        accessibilityLabel={`${title}, ${unitPriceLabel} per unit, ${availableUnits} of ${totalUnits} units available, ${statusLabel}`}
      >
        <View style={styles.imageWrap}>
          {imageUri ? (
            <CachedImage uri={imageUri} style={styles.image} contentFit="cover" transition={250} />
          ) : (
            <View style={[styles.image, styles.imageFallback, { backgroundColor: colors.surfaceAlt }]}>
              <Ionicons name="image-outline" size={28} color={colors.textMuted} />
              <Text style={[styles.imageFallbackText, { color: colors.textMuted }]}>No photo yet</Text>
            </View>
          )}
          <View style={[styles.statusPill, { backgroundColor: colors.background + 'E6' }]}>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <Text style={[styles.statusText, { color: colors.textPrimary }]} numberOfLines={1}>{statusLabel}</Text>
          </View>
        </View>

        <View style={styles.content}>
          <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={2}>{title}</Text>
          <View style={styles.priceRow}>
            <Text style={[styles.unitPrice, { color: colors.textPrimary }]} numberOfLines={1}>{unitPriceLabel}</Text>
            <Text style={[styles.perUnit, { color: colors.textSecondary }]}>/unit</Text>
          </View>
          <View style={[styles.allocationBarBg, { backgroundColor: colors.surfaceAlt }]}>
            <View style={[styles.allocationBarFill, { width: `${Math.min(allocatedPct, 100)}%`, backgroundColor: colors.brand }]} />
          </View>
          <Text style={[styles.allocationText, { color: colors.textMuted }]} numberOfLines={1}>
            {availableUnits} left
          </Text>
        </View>
      </AnimatedPressable>
    </Reanimated.View>
  );
}

const styles = StyleSheet.create({
  imageWrap: {
    width: '100%',
    position: 'relative',
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    aspectRatio: 0.8,
  },
  imageFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.xs,
  },
  imageFallbackText: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.medium,
    letterSpacing: 0.2,
  },
  statusPill: {
    position: 'absolute',
    top: Space.xs,
    left: Space.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.full,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: 0.2,
  },
  content: {
    paddingTop: Space.sm,
    gap: 4,
  },
  title: {
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.semibold,
    lineHeight: 20,
    letterSpacing: -0.2,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 3,
    minWidth: 0,
  },
  unitPrice: {
    fontSize: Type.priceList.size,
    fontFamily: Typography.family.bold,
    letterSpacing: -0.3,
    flexShrink: 1,
    minWidth: 0,
  },
  perUnit: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    flexShrink: 0,
  },
  allocationBarBg: {
    height: 3,
    borderRadius: 1.5,
    overflow: 'hidden',
    marginTop: 4,
  },
  allocationBarFill: {
    height: 3,
    borderRadius: 1.5,
  },
  allocationText: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.regular,
  },
  // ── Phase 2: market variant styles ──
  marketRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm + 2,
  },
  marketImageWrap: {
    borderRadius: Radius.sm,
    overflow: 'hidden',
  },
  marketImage: {
    width: 44,
    height: 44,
    borderRadius: Radius.sm,
  },
  marketIdentity: {
    flex: 1,
    gap: 1,
    minWidth: 0,
  },
  marketTicker: {
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.metaElevated.letterSpacing,
  },
  marketTitle: {
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.body.letterSpacing,
  },
  marketStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  marketStatusDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  marketStatusText: {
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.meta.letterSpacing,
  },
  marketPriceCol: {
    alignItems: 'flex-end',
    gap: 1,
    minWidth: 70,
  },
  marketPrice: {
    fontSize: Type.bodyEmphasis.size,
    lineHeight: Type.bodyEmphasis.lineHeight,
    fontFamily: Typography.family.bold,
    letterSpacing: Type.bodyEmphasis.letterSpacing,
    fontVariant: ['tabular-nums'],
  },
  marketAge: {
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.meta.letterSpacing,
  },
  marketChange: {
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.meta.letterSpacing,
    fontVariant: ['tabular-nums'],
  },
  marketSpreadCol: {
    alignItems: 'flex-end',
    gap: 1,
    minWidth: 60,
  },
  marketSpreadLabel: {
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: Typography.family.medium,
    letterSpacing: Type.meta.letterSpacing,
    textTransform: 'uppercase',
  },
  marketSpreadValue: {
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.body.letterSpacing,
    fontVariant: ['tabular-nums'],
  },
  marketDepth: {
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.meta.letterSpacing,
  },
});
