import React, { useMemo } from 'react';
import {
  View,
  StyleSheet,
  Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { CachedImage } from '../CachedImage';
import { AnimatedPressable } from '../AnimatedPressable';
import { SupportedCurrencyCode } from '../../constants/currencies';
import { toIze, formatAuctionIze } from '../../utils/currency';
import { resolveAuctionTiming } from '../../hooks/useServerClock';
import {
  resolvePriceLabel,
  resolvePriceText,
  resolveTimeLabel,
  resolveUrgency,
  buildAuctionAccessibilityLabel,
  type AuctionHomeItem } from '../../utils/auctionHomeLogic';
import { resolveStatePresentation } from './sellerAuctionCentreViewModels';
import { Space, Radius, Stroke } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';

// ── Inventory row — horizontal, operations-studio layout ──
export function SellerAuctionRow({
  item,
  clockMs,
  onPress,
  formatFromFiat,
  fxRates,
  currencyCode }: {
  item: AuctionHomeItem;
  clockMs: number;
  onPress: () => void;
  formatFromFiat: (amount: number, currency?: any, opts?: any) => string;
  fxRates: any;
  currencyCode: SupportedCurrencyCode;
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const timing = resolveAuctionTiming(item, clockMs);
  const urgency = resolveUrgency(timing);
  const priceLabel = resolvePriceLabel(item, timing);
  const priceText = resolvePriceText(item, timing, priceLabel, formatFromFiat);
  const timeLabel = resolveTimeLabel(timing);
  const presentation = resolveStatePresentation(item, timing, urgency, timeLabel, colors);

  const amount = item.currentBidGbp > 0 ? item.currentBidGbp : item.startingBidGbp;
  const izeText = amount > 0 ? formatAuctionIze(toIze(amount, currencyCode, fxRates)) : null;
  const localText = priceLabel === 'No bids' ? null : priceText;

  // Value prefix depends on state
  const valuePrefix =
    priceLabel === 'Starting bid' ? 'Starts '
    : priceLabel === 'Final bid' ? 'Final '
    : priceLabel === 'Current bid' ? 'Current '
    : '';

  return (
    <AnimatedPressable
      style={styles.row}
      scaleValue={0.992}
      activeOpacity={0.94}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={buildAuctionAccessibilityLabel(item, timing, priceLabel, priceText)}
    >
      {/* Media — controlled radius, scanable size */}
      <View style={styles.rowImageWrap}>
        {item.imageUrl ? (
          <CachedImage
            uri={item.imageUrl}
            style={styles.rowImage}
            containerStyle={styles.rowImageContainer}
            contentFit="cover"
          />
        ) : (
          <View style={styles.rowImagePlaceholder}>
            <Ionicons name="image-outline" size={22} color={colors.textMuted} />
          </View>
        )}
        {presentation.showLiveDot && <View style={styles.rowLiveDot} />}
      </View>

      {/* Body — identity + operational block */}
      <View style={styles.rowBody}>
        {/* Identity */}
        <View style={styles.rowIdentity}>
          <Text style={styles.rowTitle} numberOfLines={2}>{item.title}</Text>
          <Text style={[styles.rowStateText, { color: presentation.stateColor }]}>
            {presentation.stateLabel}
          </Text>
        </View>
        {item.brand && <Text style={styles.rowBrand} numberOfLines={1}>{item.brand}</Text>}

        {/* Hairline separator — identity → operational */}
        <View style={styles.rowHairline} />

        {/* Operational block — value + leading op + action */}
        <View style={styles.rowOperational}>
          <View style={styles.rowValueCol}>
            <Text style={styles.rowIze} numberOfLines={1}>
              {valuePrefix && <Text style={styles.rowValuePrefix}>{valuePrefix}</Text>}
              {izeText ?? 'No value'}
            </Text>
            {localText && (
              <Text style={styles.rowLocal} numberOfLines={1}>{localText}</Text>
            )}
          </View>
          <View style={styles.rowActionCol}>
            <Text style={styles.rowActionLabel}>{presentation.actionLabel}</Text>
            <Ionicons name="chevron-forward" size={13} color={colors.textMuted} style={styles.rowActionChevron} />
          </View>
        </View>
        <View style={styles.rowLeadingRow}>
          <Text
            style={[styles.rowLeading, { color: presentation.leadingColor }]}
            numberOfLines={1}
          >
            {presentation.leadingLabel}
          </Text>
          {item.bidCount > 0 && presentation.stateLabel !== 'Sold' && (
            <Text style={styles.rowBidCount}>
              {item.bidCount} {item.bidCount === 1 ? 'bid' : 'bids'}
            </Text>
          )}
        </View>
      </View>
    </AnimatedPressable>
  );
}

const ROW_IMAGE_SIZE = 96;

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  // ── Inventory row — horizontal, operations studio ──
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.md,
    paddingVertical: Space.sm,
    paddingHorizontal: Space.md },
  rowImageWrap: {
    position: 'relative',
    borderRadius: Radius.md,
    overflow: 'hidden' },
  rowImageContainer: {
    width: ROW_IMAGE_SIZE,
    height: ROW_IMAGE_SIZE },
  rowImage: {
    width: ROW_IMAGE_SIZE,
    height: ROW_IMAGE_SIZE },
  rowImagePlaceholder: {
    width: ROW_IMAGE_SIZE,
    height: ROW_IMAGE_SIZE,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.md },
  rowLiveDot: {
    position: 'absolute',
    top: Space.xs + 2,
    left: Space.xs + 2,
    width: Space.xs / 2 + 2,
    height: Space.xs / 2 + 2,
    borderRadius: Radius.sm,
    backgroundColor: colors.danger,
    borderWidth: Stroke.emphasis,
    borderColor: colors.background },
  rowBody: {
    flex: 1,
    minHeight: ROW_IMAGE_SIZE,
    justifyContent: 'space-between' },
  rowIdentity: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Space.sm },
  rowTitle: {
    flex: 1,
    fontSize: TypographyV2.bodyStrong.size,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
    color: colors.textPrimary,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    letterSpacing: TypographyV2.bodyStrong.letterSpacing },
  rowStateText: {
    fontSize: TypographyV2.label.size,
    lineHeight: TypographyV2.label.lineHeight,
    fontFamily: TypographyV2.label.fontFamily,
    letterSpacing: TypographyV2.label.letterSpacing,
    paddingTop: Space.xs / 2 + 1 },
  rowBrand: {
    fontSize: TypographyV2.meta.size,
    color: colors.textMuted,
    fontFamily: TypographyV2.meta.fontFamily,
    marginTop: Space.xs / 2 },
  rowHairline: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginVertical: Space.sm - 2 },
  rowOperational: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: Space.sm },
  rowValueCol: {
    flex: 1,
    gap: Space.xs / 4 },
  rowIze: {
    fontSize: TypographyV2.priceList.size,
    lineHeight: TypographyV2.priceList.lineHeight,
    fontFamily: TypographyV2.priceList.fontFamily,
    color: colors.textPrimary,
    fontVariant: ['tabular-nums'],
    letterSpacing: TypographyV2.priceList.letterSpacing },
  rowValuePrefix: {
    fontSize: TypographyV2.label.size,
    lineHeight: TypographyV2.label.lineHeight,
    fontFamily: TypographyV2.label.fontFamily,
    color: colors.textSecondary,
    fontVariant: ['tabular-nums'],
    letterSpacing: TypographyV2.label.letterSpacing },
  rowLocal: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textMuted,
    fontVariant: ['tabular-nums'],
    letterSpacing: TypographyV2.meta.letterSpacing },
  rowActionCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs / 4,
    paddingBottom: Space.xs / 4 },
  rowActionLabel: {
    fontSize: TypographyV2.meta.size,
    color: colors.textSecondary,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: 0.1 },
  rowActionChevron: {
    marginTop: Space.xs / 4 },
  rowLeadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Space.sm,
    marginTop: Space.xs },
  rowLeading: {
    flex: 1,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    fontVariant: ['tabular-nums'],
    letterSpacing: TypographyV2.meta.letterSpacing },
  rowBidCount: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    color: colors.textMuted,
    fontFamily: TypographyV2.meta.fontFamily,
    fontVariant: ['tabular-nums'] } });
}
