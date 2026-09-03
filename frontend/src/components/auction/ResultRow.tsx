import React, { memo, useMemo } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { CachedImage } from '../CachedImage';
import { Space, Radius } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import type { AuctionHomeItem } from '../../utils/auctionHomeLogic';
import { AuctionValueLockup } from './AuctionValueLockup';

// ════════════════════════════════════════════════════════════════
// RESULT ROW — compact results ledger
// ════════════════════════════════════════════════════════════════
export const ResultRow = memo(function ResultRow({
  item,
  onPress,
  formatValueLockup }: {
  item: AuctionHomeItem;
  onPress: () => void;
  formatValueLockup: (amountGbp: number) => { izeText: string; localText: string | null };
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const valueLockup = formatValueLockup(item.currentBidGbp || item.startingBidGbp);
  const resultText = item.viewerState === 'won' ? 'Won'
    : item.viewerState === 'lost' ? 'Lost'
    : item.terminalReason === 'cancelled' ? 'Cancelled'
    : item.bidCount === 0 ? 'No bids'
    : 'Sold';
  const resultColor = item.viewerState === 'won' ? colors.success
    : item.viewerState === 'lost' ? colors.danger
    : item.terminalReason === 'cancelled' ? colors.textMuted
    : item.bidCount === 0 ? colors.textMuted
    : colors.textSecondary;
  // Truthful continuation action
  const continuationLabel = item.viewerState === 'won' ? 'Continue'
    : item.viewerState === 'lost' ? 'View'
    : null;
  const a11yLabel = `${item.title}. ${resultText}. ${item.bidCount > 0 ? `${item.bidCount} bids` : 'No bids'}. ${valueLockup.izeText}`;

  return (
    <Pressable
      style={styles.resultRow}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      accessibilityHint="Opens auction details"
    >
      <View style={styles.resultImageWrap}>
        {item.imageUrl ? (
          <CachedImage
            uri={item.imageUrl}
            style={styles.resultImage}
            containerStyle={StyleSheet.absoluteFill}
            contentFit="cover"
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.surface }]} />
        )}
      </View>
      <View style={styles.resultBody}>
        <Text style={styles.resultTitle} numberOfLines={1}>{item.title}</Text>
        <Text style={[styles.resultOutcome, { color: resultColor }]}>{resultText}{item.bidCount > 0 ? ` · ${item.bidCount} bids` : ''}</Text>
        {item.bidCount > 0 ? (
          <AuctionValueLockup
            izeText={valueLockup.izeText}
            localText={valueLockup.localText}
            state="final"
            scale="compact"
          />
        ) : null}
      </View>
      {continuationLabel && (
        <View style={styles.resultActionWrap}>
          <Text style={styles.resultActionLabel}>{continuationLabel}</Text>
          <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
        </View>
      )}
    </Pressable>
  );
});

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    resultRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.md,
      paddingVertical: Space.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border },
    resultImageWrap: {
      width: Space.xxl + Space.xl + Space.xl - 4,
      height: Space.xxl + Space.xl + Space.xl - 4,
      borderRadius: Radius.md,
      overflow: 'hidden',
      backgroundColor: colors.surface },
    resultImage: {
      width: Space.xxl + Space.xl + Space.xl - 4,
      height: Space.xxl + Space.xl + Space.xl - 4 },
    resultBody: {
      flex: 1,
      gap: Space.xs / 2 },
    resultTitle: {
      fontSize: TypographyV2.bodyStrong.size,
      lineHeight: TypographyV2.bodyStrong.lineHeight,
      fontWeight: '600',
      color: colors.textPrimary,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      letterSpacing: TypographyV2.bodyStrong.letterSpacing },
    resultOutcome: {
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      fontWeight: '600',
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: TypographyV2.meta.letterSpacing,
      fontVariant: ['tabular-nums'] },
    resultActionWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs / 2 },
    resultActionLabel: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textMuted,
      letterSpacing: TypographyV2.meta.letterSpacing } });
}
