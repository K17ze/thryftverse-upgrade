import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { Radius, Space, Type, Typography } from '../../theme/designTokens';
import { AnimatedPressable } from '../AnimatedPressable';
import { CachedImage } from '../CachedImage';

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
  portfolioWeightPct,
  focalPoint,
  onPress,
}: CoOwnCompactPositionCardProps) {
  const { colors } = useAppTheme();
  const hasGainLoss = gainLossPct != null && Number.isFinite(gainLossPct) && gainLossLabel;
  const gainDirection = (gainLossPct ?? 0) > 0 ? 'up' : (gainLossPct ?? 0) < 0 ? 'down' : 'flat';
  const gainColor = gainDirection === 'up'
    ? colors.success
    : gainDirection === 'down'
      ? colors.danger
      : colors.textSecondary;
  const progress = Math.min(100, Math.max(0, portfolioWeightPct ?? ownershipPct));

  return (
    <AnimatedPressable
      onPress={onPress}
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
      scaleValue={0.985}
      activeOpacity={0.94}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${unitsOwned} units, ${ownershipPct.toFixed(2)} percent ownership, position value ${positionValueLabel}${portfolioWeightPct != null ? `, ${portfolioWeightPct.toFixed(1)} percent of portfolio` : ''}${hasGainLoss ? `, ${gainDirection} ${gainLossLabel}, ${Math.abs(gainLossPct ?? 0).toFixed(2)} percent` : ''}`}
      accessibilityHint="Opens your position"
    >
      <View style={styles.topRow}>
        <View style={styles.imageWrap}>
          <CachedImage
            uri={imageUri ?? ''}
            style={styles.image}
            contentFit="cover"
            transition={220}
            emptyLabel={categoryLabel}
            emptyIcon="diamond-outline"
            focalPoint={focalPoint}
          />
        </View>
        <View style={styles.identity}>
          <Text style={[styles.category, { color: colors.textMuted }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>{categoryLabel}</Text>
          <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={2} maxFontSizeMultiplier={1.25}>{title}</Text>
          <View style={styles.unitPriceRow}>
            <Text style={[styles.unitPrice, { color: colors.textPrimary }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.86} maxFontSizeMultiplier={1.25}>{unitPriceLabel}</Text>
            <Text style={[styles.localReference, { color: colors.textMuted }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.86} maxFontSizeMultiplier={1.25}>{localReferenceLabel}</Text>
          </View>
        </View>
      </View>

      <View style={[styles.metricsRow, { borderTopColor: colors.border }]}> 
        <View style={styles.metric}>
          <Text style={[styles.metricLabel, { color: colors.textMuted }]} maxFontSizeMultiplier={1.3}>Units</Text>
          <Text style={[styles.metricValue, { color: colors.textPrimary }]} numberOfLines={1} maxFontSizeMultiplier={1.25}>{unitsOwned}</Text>
        </View>
        <View style={styles.metric}>
          <Text style={[styles.metricLabel, { color: colors.textMuted }]} maxFontSizeMultiplier={1.3}>Ownership</Text>
          <Text style={[styles.metricValue, { color: colors.textPrimary }]} numberOfLines={1} maxFontSizeMultiplier={1.25}>{ownershipPct.toFixed(2)}%</Text>
        </View>
        <View style={[styles.metric, styles.valueMetric]}>
          <Text style={[styles.metricLabel, { color: colors.textMuted }]} maxFontSizeMultiplier={1.3}>Value</Text>
          <Text style={[styles.positionValue, { color: colors.textPrimary }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.78} maxFontSizeMultiplier={1.25}>{positionValueLabel}</Text>
        </View>
      </View>

      <View style={styles.footerRow}>
        <View style={styles.performanceWrap}>
          <View style={styles.performanceMetaRow}>
            {hasGainLoss ? (
              <View style={styles.performanceRow}>
                <Ionicons
                  name={gainDirection === 'up' ? 'arrow-up' : gainDirection === 'down' ? 'arrow-down' : 'remove'}
                  size={12}
                  color={gainColor}
                />
                <Text style={[styles.performanceText, { color: gainColor }]} numberOfLines={1} maxFontSizeMultiplier={1.25}>
                  {gainLossLabel} · {gainLossPct! > 0 ? '+' : ''}{gainLossPct!.toFixed(2)}%
                </Text>
              </View>
            ) : (
              <Text style={[styles.performanceText, { color: colors.textMuted }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>Performance unavailable</Text>
            )}
            <Text style={[styles.progressContext, { color: colors.textMuted }]} numberOfLines={1} maxFontSizeMultiplier={1.2}>
              {progress.toFixed(1)}%
            </Text>
          </View>
          <View style={[styles.progressTrack, { backgroundColor: colors.surfaceAlt }]}> 
            <View style={[styles.progressFill, { width: `${progress}%`, backgroundColor: colors.textSecondary }]} />
          </View>
        </View>
        <View
          style={[styles.viewAffordance, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Ionicons name="arrow-forward" size={15} color={colors.textSecondary} />
        </View>
      </View>
    </AnimatedPressable>
  );
});

const styles = StyleSheet.create({
  card: {
    width: COOWN_POSITION_CARD_WIDTH,
    minHeight: 168,
    borderRadius: Radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Space.md,
    gap: Space.sm,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  imageWrap: {
    width: 60,
    height: 60,
    borderRadius: Radius.md,
    overflow: 'hidden',
    flexShrink: 0,
  },
  image: {
    width: 60,
    height: 60,
  },
  identity: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  category: {
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: Type.bodyEmphasis.size,
    lineHeight: 19,
    fontFamily: Typography.family.semibold,
    letterSpacing: -0.2,
  },
  unitPriceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 5,
    minWidth: 0,
  },
  unitPrice: {
    fontSize: Type.captionElevated.size,
    lineHeight: Type.captionElevated.lineHeight,
    fontFamily: Typography.family.semibold,
    fontVariant: ['tabular-nums'],
    flexShrink: 0,
  },
  localReference: {
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: Typography.family.regular,
    fontVariant: ['tabular-nums'],
    flexShrink: 1,
  },
  metricsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.sm,
    paddingTop: Space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  metric: {
    minWidth: 48,
    gap: 1,
  },
  valueMetric: {
    flex: 1,
    alignItems: 'flex-end',
    minWidth: 0,
  },
  metricLabel: {
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: Typography.family.medium,
  },
  metricValue: {
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
    fontFamily: Typography.family.semibold,
    fontVariant: ['tabular-nums'],
  },
  positionValue: {
    maxWidth: '100%',
    fontSize: Type.bodyEmphasis.size,
    lineHeight: Type.bodyEmphasis.lineHeight,
    fontFamily: Typography.family.bold,
    fontVariant: ['tabular-nums'],
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: Space.sm,
  },
  performanceWrap: {
    flex: 1,
    gap: 5,
    minWidth: 0,
  },
  performanceMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Space.xs,
  },
  performanceRow: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  performanceText: {
    flexShrink: 1,
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: Typography.family.semibold,
    fontVariant: ['tabular-nums'],
  },
  progressContext: {
    flexShrink: 0,
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: Typography.family.medium,
    fontVariant: ['tabular-nums'],
  },
  progressTrack: {
    height: 2,
    borderRadius: 1,
    overflow: 'hidden',
  },
  progressFill: {
    height: 2,
    borderRadius: 1,
  },
  viewAffordance: {
    width: 32,
    height: 32,
    borderRadius: Radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
});
