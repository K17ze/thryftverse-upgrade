/**
 * LiveLotDock — the commerce dock on the live stage: lot status line (with
 * winner checkout when the viewer won) and the single contained panel with
 * current lot, price, and bid / buy-now actions.
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius, Control, Stroke } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { AnimatedPressable } from '../AnimatedPressable';
import { CachedImage } from '../CachedImage';
import { useFormattedPrice } from '../../hooks/useFormattedPrice';
import { useAppTranslation } from '../../i18n/useAppTranslation';
import type { LiveLot } from '../../services/liveShoppingApi';
import {
  deriveLotStatus,
  isWinningViewer,
  lotStatusColor,
  lotStatusLabel,
  formatClock } from './livestreamUtils';

interface LiveLotDockProps {
  lot: LiveLot;
  bidPending: boolean;
  buyNowPending: boolean;
  settlePending: boolean;
  onOpenDetails: () => void;
  onOpenBidSheet: () => void;
  onBuyNow: () => void;
  onCompleteCheckout: () => void;
}

export function LiveLotDock({
  lot,
  bidPending,
  buyNowPending,
  settlePending,
  onOpenDetails,
  onOpenBidSheet,
  onBuyNow,
  onCompleteCheckout,
}: LiveLotDockProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useAppTranslation('liveStreamViewer');
  const { formatFromFiat, currencySymbol } = useFormattedPrice();

  const derivedLotStatus = deriveLotStatus(lot);
  const isWinner = isWinningViewer(lot);
  const timeRemaining = lot.timeRemaining ?? 0;
  const buyNowPrice = lot.buyNowPrice ?? 0;

  return (
    <>
      {/* Lot status + winner checkout */}
      {derivedLotStatus ? (
        <View style={styles.lotStatusRow}>
          <Text style={[styles.lotStatusText, { color: lotStatusColor(derivedLotStatus, colors) }]}>
            {lotStatusLabel(derivedLotStatus, lot.currentPrice, t)}
          </Text>
          {isWinner ? (
            <AnimatedPressable
              onPress={onCompleteCheckout}
              disabled={settlePending}
              style={[styles.checkoutBtn, { backgroundColor: colors.success }]}
              hapticFeedback="medium"
              accessibilityRole="button"
              accessibilityLabel="Complete checkout for won lot"
              accessibilityState={{ busy: settlePending }}
            >
              {settlePending ? (
                <ActivityIndicator size="small" color={colors.textInverse} />
              ) : (
                <Text style={[styles.checkoutBtnText, { color: colors.textInverse }]}>
                  {t('bid.completeCheckout')}
                </Text>
              )}
            </AnimatedPressable>
          ) : null}
        </View>
      ) : null}

      {/* Lot dock — the single contained panel on this surface */}
      <View style={[styles.lotDock, { backgroundColor: colors.overlay, borderColor: colors.scrimTextTertiary }]}>
        <AnimatedPressable
          onPress={onOpenDetails}
          style={styles.lotDockPress}
          hapticFeedback="light"
          accessibilityRole="button"
          accessibilityLabel={`View ${lot.title} details`}
        >
          {lot.imageUri ? (
            <CachedImage
              uri={lot.imageUri}
              style={styles.lotThumb}
              contentFit="cover"
              accessible={false}
            />
          ) : null}
          <View style={styles.lotInfo}>
            {lot.title ? (
              <Text style={[styles.lotTitle, { color: colors.scrimTextPrimary }]} numberOfLines={1}>
                {lot.title}
              </Text>
            ) : null}
            <View style={styles.lotPriceRow}>
              <Text style={[styles.lotPrice, { color: colors.scrimTextPrimary }]}>
                {formatFromFiat(lot.currentPrice, 'GBP')}
              </Text>
              {lot.bidCount > 0 ? (
                <Text style={[styles.lotMeta, { color: colors.scrimTextSecondary }]}>
                  {lot.bidCount} {t('product.bids')}
                </Text>
              ) : null}
              {timeRemaining > 0 ? (
                <Text
                  style={[
                    styles.lotTimer,
                    { color: timeRemaining <= 10 ? colors.scrimDeltaNegative : colors.scrimTextSecondary },
                  ]}
                >
                  {formatClock(timeRemaining)}
                </Text>
              ) : null}
            </View>
          </View>
        </AnimatedPressable>
        <View style={styles.lotActions}>
          <AnimatedPressable
            onPress={onOpenBidSheet}
            disabled={bidPending}
            style={[styles.bidBtn, { backgroundColor: colors.danger }]}
            hapticFeedback="medium"
            accessibilityRole="button"
            accessibilityLabel={t('bid.placeBid')}
            accessibilityState={{ busy: bidPending }}
          >
            {bidPending ? (
              <ActivityIndicator size="small" color={colors.scrimTextPrimary} />
            ) : (
              <Text style={[styles.bidBtnText, { color: colors.scrimTextPrimary }]}>
                {t('bid.placeBid')}
              </Text>
            )}
          </AnimatedPressable>
          {buyNowPrice > 0 ? (
            <AnimatedPressable
              onPress={onBuyNow}
              disabled={buyNowPending}
              style={[styles.buyNowBtn, { borderColor: colors.scrimTextTertiary }]}
              hapticFeedback="medium"
              accessibilityRole="button"
              accessibilityLabel={`Buy now for ${currencySymbol}${buyNowPrice}`}
              accessibilityState={{ busy: buyNowPending }}
            >
              {buyNowPending ? (
                <ActivityIndicator size="small" color={colors.scrimTextPrimary} />
              ) : (
                <Text style={[styles.buyNowBtnText, { color: colors.scrimTextPrimary }]}>
                  {t('bid.buyNow')} {currencySymbol}{buyNowPrice}
                </Text>
              )}
            </AnimatedPressable>
          ) : null}
        </View>
      </View>
    </>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  // ── Lot status line ──
  lotStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    paddingVertical: Space.xs },
  lotStatusText: {
    fontSize: TypographyV2.label.size,
    fontFamily: TypographyV2.label.fontFamily,
    letterSpacing: TypographyV2.label.letterSpacing },
  checkoutBtn: {
    paddingHorizontal: Space.md,
    minHeight: Control.chrome,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center' },
  checkoutBtnText: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily },
  // ── Lot dock — the one contained panel on this surface ──
  lotDock: {
    marginHorizontal: Space.md,
    marginBottom: Space.xs,
    padding: Space.sm,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: Space.sm },
  lotDockPress: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    minHeight: Control.hit },
  lotThumb: {
    width: Space.xxl,
    height: Space.xxl,
    borderRadius: Radius.md },
  lotInfo: {
    flex: 1,
    gap: Space.xs / 2 },
  lotTitle: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily },
  lotPriceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Space.sm },
  lotPrice: {
    fontSize: TypographyV2.priceList.size,
    lineHeight: TypographyV2.priceList.lineHeight,
    fontFamily: TypographyV2.priceList.fontFamily,
    fontVariant: ['tabular-nums'] },
  lotMeta: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    fontVariant: ['tabular-nums'] },
  lotTimer: {
    fontSize: TypographyV2.numericMeta.size,
    fontFamily: TypographyV2.numericMeta.fontFamily,
    fontVariant: ['tabular-nums'],
    marginLeft: 'auto' },
  lotActions: {
    flexDirection: 'row',
    gap: Space.sm },
  bidBtn: {
    flex: 1,
    minHeight: Control.hit,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center' },
  bidBtnText: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily },
  buyNowBtn: {
    flex: 1,
    minHeight: Control.hit,
    borderRadius: Radius.md,
    borderWidth: Stroke.standard,
    alignItems: 'center',
    justifyContent: 'center' },
  buyNowBtnText: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    fontVariant: ['tabular-nums'] } });
