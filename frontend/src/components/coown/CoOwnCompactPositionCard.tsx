import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { Radius, Space, Type, Typography } from '../../theme/designTokens';
import { AnimatedPressable } from '../AnimatedPressable';
import { CachedImage } from '../CachedImage';

// Kept for backward compatibility with tests and imports.
export const COOWN_POSITION_CARD_WIDTH = 280;

export interface CoOwnCompactPositionCardProps {
  imageUri?: string | null;
  title: string;
  categoryLabel: string;
  unitPriceLabel: string;
  localReferenceLabel: string;
  unitsOwned: number;
  ownershipPct: number;
  positionValueLabel: string;
  gainLossLabel?: string;
  gainLossPct?: number | null;
  portfolioWeightPct?: number;
  focalPoint?: { x: number; y: number };
  onPress: () => void;
}

/**
 * Flat position row — a single-line holdings row with thumbnail, identity,
 * and right-aligned financials. Not a card; hairline-separated from siblings
 * for a portfolio-table feel (AGENTS.md §4: flat canvas, spacing and hairlines
 * are the default utility structure).
 */
export const CoOwnCompactPositionCard = React.memo(function CoOwnCompactPositionCard({
  imageUri,
  title,
  categoryLabel,
  unitPriceLabel,
  localReferenceLabel,
  unitsOwned,
  ownershipPct,
  positionValueLabel,
  gainLossLabel,
  gainLossPct,
  focalPoint,
  onPress,
}: CoOwnCompactPositionCardProps) {
  const { colors } = useAppTheme();
  const hasGainLoss = gainLossPct != null && Number.isFinite(gainLossPct) && gainLossLabel;
  const gainDirection = (gainLossPct ?? 0) > 0 ? 'up' : (gainLossPct ?? 0) < 0 ? 'down' : 'flat';
  const gainColor = gainDirection === 'up'
    ? colors.coownUp
    : gainDirection === 'down'
      ? colors.coownDown
      : colors.textSecondary;

  return (
    <AnimatedPressable
      onPress={onPress}
      style={styles.row}
      scaleValue={0.99}
      activeOpacity={0.92}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${unitsOwned} units, ${ownershipPct.toFixed(2)} percent ownership, position value ${positionValueLabel}${hasGainLoss ? `, ${gainDirection} ${gainLossLabel}, ${Math.abs(gainLossPct ?? 0).toFixed(2)} percent` : ''}`}
      accessibilityHint="Opens your position"
    >
      {/* Thumbnail — 44pt square, art-directed focal point */}
      <View style={styles.thumbWrap}>
        <CachedImage
          uri={imageUri ?? ''}
          style={styles.thumb}
          contentFit="cover"
          transition={220}
          emptyLabel={categoryLabel}
          emptyIcon="diamond-outline"
          focalPoint={focalPoint}
        />
      </View>

      {/* Identity + meta — left-aligned, two lines */}
      <View style={styles.identity}>
        <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1} maxFontSizeMultiplier={1.25}>
          {title}
        </Text>
        <View style={styles.metaRow}>
          <Text style={[styles.units, { color: colors.textMuted }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
            {unitsOwned} units · {ownershipPct.toFixed(1)}%
          </Text>
          {hasGainLoss ? (
            <View style={styles.gainRow}>
              <Ionicons
                name={gainDirection === 'up' ? 'arrow-up' : gainDirection === 'down' ? 'arrow-down' : 'remove'}
                size={10}
                color={gainColor}
              />
              <Text style={[styles.gainText, { color: gainColor }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
                {gainLossPct! > 0 ? '+' : ''}{gainLossPct!.toFixed(1)}%
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      {/* Right-aligned value — tabular-nums for financial alignment */}
      <View style={styles.valueCol}>
        <Text style={[styles.positionValue, { color: colors.textPrimary }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} maxFontSizeMultiplier={1.2}>
          {positionValueLabel}
        </Text>
        <Text style={[styles.unitPrice, { color: colors.textMuted }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
          {unitPriceLabel}
        </Text>
      </View>
    </AnimatedPressable>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.sm,
    minHeight: 60,
  },
  thumbWrap: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    overflow: 'hidden',
    flexShrink: 0,
  },
  thumb: {
    width: 44,
    height: 44,
  },
  identity: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  title: {
    fontSize: Type.bodyEmphasis.size,
    lineHeight: Type.bodyEmphasis.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: -0.2,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  units: {
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: Typography.family.regular,
    fontVariant: ['tabular-nums'],
    letterSpacing: 0.2,
  },
  gainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 1,
  },
  gainText: {
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: Typography.family.semibold,
    fontVariant: ['tabular-nums'],
  },
  valueCol: {
    alignItems: 'flex-end',
    gap: 1,
    flexShrink: 0,
  },
  positionValue: {
    fontSize: Type.bodyEmphasis.size,
    lineHeight: Type.bodyEmphasis.lineHeight,
    fontFamily: Typography.family.bold,
    fontVariant: ['tabular-nums'],
  },
  unitPrice: {
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: Typography.family.regular,
    fontVariant: ['tabular-nums'],
  },
});
