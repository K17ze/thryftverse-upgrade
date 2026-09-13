/**
 * LiveItemSheet — item detail sheet for the current lot: media, title,
 * current bid, time remaining, and the place-bid / buy-now actions.
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius, Control, Stroke } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { AnimatedPressable } from '../AnimatedPressable';
import { CachedImage } from '../CachedImage';
import { AppIcon } from '../common/AppIcon';
import { IconSize } from '../../theme/iconTokens';
import { useFormattedPrice } from '../../hooks/useFormattedPrice';
import { useAppTranslation } from '../../i18n/useAppTranslation';
import type { LiveLot } from '../../services/liveShoppingApi';
import { LiveSheetScaffold } from './LiveSheetScaffold';
import { formatClock } from './livestreamUtils';

interface LiveItemSheetProps {
  lot: LiveLot;
  buyNowPending: boolean;
  onClose: () => void;
  /** Close this sheet and open the bid sheet. */
  onPlaceBid: () => void;
  /** Close this sheet and run buy-now. */
  onBuyNow: () => void;
}

export function LiveItemSheet({ lot, buyNowPending, onClose, onPlaceBid, onBuyNow }: LiveItemSheetProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useAppTranslation('liveStreamViewer');
  const { formatFromFiat, currencySymbol } = useFormattedPrice();

  const timeRemaining = lot.timeRemaining ?? 0;
  const buyNowPrice = lot.buyNowPrice ?? 0;

  return (
    <LiveSheetScaffold onClose={onClose} overlayAccessibilityLabel="Close item details">
      {lot.imageUri ? (
        <CachedImage
          uri={lot.imageUri}
          style={styles.sheetImage}
          contentFit="cover"
          accessible={false}
        />
      ) : null}
      {lot.title ? (
        <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>{lot.title}</Text>
      ) : null}
      <View style={styles.sheetPriceRow}>
        <View>
          <Text style={[styles.sheetFieldLabel, { color: colors.textSecondary }]}>
            {t('bidSheet.currentBid')}
          </Text>
          <Text style={[styles.sheetPrice, { color: colors.textPrimary }]}>
            {formatFromFiat(lot.currentPrice, 'GBP')}
          </Text>
        </View>
        {lot.bidCount > 0 ? (
          <View style={styles.sheetBidCount}>
            <AppIcon name="auction" size={IconSize.xs} color="textSecondary" accessible={false} />
            <Text style={[styles.sheetBidCountText, { color: colors.textSecondary }]}>
              {lot.bidCount} {t('product.bids')}
            </Text>
          </View>
        ) : null}
      </View>
      {timeRemaining > 0 ? (
        <View style={styles.sheetTimeRow}>
          <AppIcon
            name="clock"
            size={IconSize.xs}
            color={timeRemaining <= 10 ? 'danger' : 'textSecondary'}
            accessible={false}
          />
          <Text
            style={[
              styles.sheetTimeText,
              { color: timeRemaining <= 10 ? colors.danger : colors.textSecondary },
            ]}
          >
            {formatClock(timeRemaining)}
          </Text>
        </View>
      ) : null}
      <View style={styles.sheetActions}>
        <AnimatedPressable
          onPress={onPlaceBid}
          style={[styles.sheetPrimaryBtn, { backgroundColor: colors.danger }]}
          hapticFeedback="medium"
          accessibilityRole="button"
          accessibilityLabel={t('bid.placeBid')}
        >
          <Text style={[styles.sheetPrimaryBtnText, { color: colors.scrimTextPrimary }]}>
            {t('bid.placeBid')}
          </Text>
        </AnimatedPressable>
        {buyNowPrice > 0 ? (
          <AnimatedPressable
            onPress={onBuyNow}
            disabled={buyNowPending}
            style={[styles.sheetSecondaryBtn, { borderColor: colors.border }]}
            hapticFeedback="medium"
            accessibilityRole="button"
            accessibilityLabel={`Buy now for ${currencySymbol}${buyNowPrice}`}
            accessibilityState={{ busy: buyNowPending }}
          >
            {buyNowPending ? (
              <ActivityIndicator size="small" color={colors.textPrimary} />
            ) : (
              <Text style={[styles.sheetSecondaryBtnText, { color: colors.textPrimary }]}>
                {t('bid.buyNowFull')} {currencySymbol}{buyNowPrice}
              </Text>
            )}
          </AnimatedPressable>
        ) : null}
      </View>
      <AnimatedPressable
        onPress={onClose}
        style={styles.sheetCloseBtn}
        hapticFeedback="light"
        accessibilityRole="button"
        accessibilityLabel="Close item details"
      >
        <Text style={[styles.sheetCloseText, { color: colors.textSecondary }]}>{t('bidSheet.close')}</Text>
      </AnimatedPressable>
    </LiveSheetScaffold>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  sheetImage: {
    width: '100%',
    height: Space.xxl * 3,
    borderRadius: Radius.lg },
  sheetTitle: {
    fontSize: TypographyV2.sectionTitle.size,
    lineHeight: TypographyV2.sectionTitle.lineHeight,
    fontFamily: TypographyV2.sectionTitle.fontFamily,
    letterSpacing: TypographyV2.sectionTitle.letterSpacing,
    textAlign: 'center' },
  sheetPriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between' },
  sheetBidCount: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs / 2 },
  sheetBidCountText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    fontVariant: ['tabular-nums'] },
  sheetTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs / 2 },
  sheetTimeText: {
    fontSize: TypographyV2.numericMeta.size,
    fontFamily: TypographyV2.numericMeta.fontFamily,
    fontVariant: ['tabular-nums'] },
  sheetActions: {
    flexDirection: 'row',
    gap: Space.sm },
  sheetFieldLabel: {
    fontSize: TypographyV2.label.size,
    lineHeight: TypographyV2.label.lineHeight,
    fontFamily: TypographyV2.label.fontFamily,
    letterSpacing: TypographyV2.label.letterSpacing },
  sheetPrice: {
    fontSize: TypographyV2.priceHero.size,
    lineHeight: TypographyV2.priceHero.lineHeight,
    fontFamily: TypographyV2.priceHero.fontFamily,
    letterSpacing: TypographyV2.priceHero.letterSpacing,
    fontVariant: ['tabular-nums'] },
  sheetPrimaryBtn: {
    flex: 1,
    minHeight: Control.hit,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center' },
  sheetPrimaryBtnText: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily },
  sheetSecondaryBtn: {
    flex: 1,
    minHeight: Control.hit,
    borderRadius: Radius.lg,
    borderWidth: Stroke.standard,
    alignItems: 'center',
    justifyContent: 'center' },
  sheetSecondaryBtnText: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    fontVariant: ['tabular-nums'] },
  sheetCloseBtn: {
    minHeight: Control.hit,
    alignItems: 'center',
    justifyContent: 'center' },
  sheetCloseText: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily } });
