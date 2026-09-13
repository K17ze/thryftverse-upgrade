/**
 * LiveBidSheet — quick-bid sheet for the current lot: current bid readout
 * and a fixed increment ladder. Selecting an amount submits the bid and the
 * sheet closes via the bid flow.
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius, Control, Stroke } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { AnimatedPressable } from '../AnimatedPressable';
import { useFormattedPrice } from '../../hooks/useFormattedPrice';
import { useAppTranslation } from '../../i18n/useAppTranslation';
import type { LiveLot } from '../../services/liveShoppingApi';
import { LiveSheetScaffold } from './LiveSheetScaffold';
import { suggestedBidAmounts } from './livestreamUtils';

interface LiveBidSheetProps {
  lot: LiveLot;
  bidPending: boolean;
  onBid: (amount: number) => void;
  onClose: () => void;
}

export function LiveBidSheet({ lot, bidPending, onBid, onClose }: LiveBidSheetProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useAppTranslation('liveStreamViewer');
  const { formatFromFiat, currencySymbol } = useFormattedPrice();

  const suggestedBids = useMemo(() => suggestedBidAmounts(lot.currentPrice), [lot.currentPrice]);

  return (
    <LiveSheetScaffold onClose={onClose} overlayAccessibilityLabel="Close bid sheet">
      <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>{t('bidSheet.title')}</Text>
      <Text style={[styles.sheetFieldLabel, { color: colors.textSecondary, textAlign: 'center' }]}>
        {t('bidSheet.currentBid')}
      </Text>
      <Text style={[styles.sheetPrice, { color: colors.textPrimary, textAlign: 'center' }]}>
        {formatFromFiat(lot.currentPrice, 'GBP')}
      </Text>
      <View style={styles.quickBidRow}>
        {suggestedBids.map((amount) => (
          <AnimatedPressable
            key={amount}
            onPress={() => onBid(amount)}
            disabled={bidPending}
            style={[styles.quickBidBtn, { borderColor: colors.border }]}
            hapticFeedback="medium"
            accessibilityRole="button"
            accessibilityLabel={`Bid ${currencySymbol}${amount}`}
            accessibilityState={{ busy: bidPending }}
          >
            <Text style={[styles.quickBidText, { color: colors.textPrimary }]}>
              {formatFromFiat(amount, 'GBP')}
            </Text>
          </AnimatedPressable>
        ))}
      </View>
      <AnimatedPressable
        onPress={onClose}
        style={styles.sheetCloseBtn}
        hapticFeedback="light"
        accessibilityRole="button"
        accessibilityLabel={t('bidSheet.cancel')}
      >
        <Text style={[styles.sheetCloseText, { color: colors.textSecondary }]}>{t('bidSheet.cancel')}</Text>
      </AnimatedPressable>
    </LiveSheetScaffold>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  sheetTitle: {
    fontSize: TypographyV2.sectionTitle.size,
    lineHeight: TypographyV2.sectionTitle.lineHeight,
    fontFamily: TypographyV2.sectionTitle.fontFamily,
    letterSpacing: TypographyV2.sectionTitle.letterSpacing,
    textAlign: 'center' },
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
  quickBidRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.sm,
    justifyContent: 'center' },
  quickBidBtn: {
    paddingHorizontal: Space.lg,
    minHeight: Control.hit,
    borderRadius: Radius.md,
    borderWidth: Stroke.standard,
    minWidth: Space.xxl * 2,
    alignItems: 'center',
    justifyContent: 'center' },
  quickBidText: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    fontVariant: ['tabular-nums'] },
  sheetCloseBtn: {
    minHeight: Control.hit,
    alignItems: 'center',
    justifyContent: 'center' },
  sheetCloseText: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily } });
