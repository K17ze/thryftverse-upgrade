import React from 'react';
import { View, Text, StyleSheet, Pressable, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Radius, Type, Typography } from '../../theme/designTokens';
import { CachedImage } from '../CachedImage';
import { useReducedMotion } from '../../hooks/useReducedMotion';

export type CoOwnAssetStatus = 'open' | 'closed' | 'paused';

export interface CoOwnFeaturedAssetProps {
  imageUri?: string | null;
  title: string;
  categoryEyebrow?: string;
  unitPriceLabel: string;
  availableUnits: number;
  totalUnits: number;
  status: CoOwnAssetStatus;
  issuerLabel?: string;
  onPress?: () => void;
  onAction?: () => void;
  actionLabel?: string;
  index?: number;
}

export function CoOwnFeaturedAsset({
  imageUri,
  title,
  categoryEyebrow,
  unitPriceLabel,
  availableUnits,
  totalUnits,
  status,
  issuerLabel,
  onPress,
  onAction,
  actionLabel = 'View item',
  index = 0,
}: CoOwnFeaturedAssetProps) {
  const { colors } = useAppTheme();
  const { width } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const imageHeight = Math.min(width * 0.7, 320);
  const allocatedPct = totalUnits > 0 ? Math.round(((totalUnits - availableUnits) / totalUnits) * 100) : 0;

  const statusLabel = status === 'open' ? 'Available' : status === 'paused' ? 'Paused' : 'Fully allocated';
  const statusColor = status === 'open' ? colors.success : status === 'paused' ? colors.textSecondary : colors.textMuted;

  return (
    <Reanimated.View entering={reducedMotion ? undefined : FadeInDown.delay(Math.min(index, 3) * 60).duration(350)}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${title}, ${unitPriceLabel} per unit, ${availableUnits} of ${totalUnits} units available, ${statusLabel}`}
      >
        <View style={styles.imageWrap}>
          {imageUri ? (
            <CachedImage uri={imageUri} style={[styles.image, { height: imageHeight }]} contentFit="cover" transition={300} />
          ) : (
            <View style={[styles.image, styles.imageFallback, { height: imageHeight, backgroundColor: colors.surfaceAlt }]}>
              <Ionicons name="cube-outline" size={44} color={colors.textMuted} />
            </View>
          )}
          <View style={[styles.statusOverlay, { backgroundColor: statusColor + 'E6' }]}>
            <View style={[styles.statusDot, { backgroundColor: colors.background }]} />
            <Text style={[styles.statusText, { color: colors.background }]}>{statusLabel}</Text>
          </View>
        </View>

        <View style={styles.content}>
          {categoryEyebrow ? (
            <Text style={[styles.eyebrow, { color: colors.textSecondary }]}>{categoryEyebrow}</Text>
          ) : null}
          <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={2}>{title}</Text>

          <View style={styles.priceRow}>
            <Text style={[styles.unitPrice, { color: colors.textPrimary }]}>{unitPriceLabel}</Text>
            <Text style={[styles.perUnit, { color: colors.textSecondary }]}>per unit</Text>
          </View>

          <View style={styles.allocationRow}>
            <View style={[styles.allocationBarBg, { backgroundColor: colors.surfaceAlt }]}>
              <View style={[styles.allocationBarFill, { width: `${Math.min(allocatedPct, 100)}%`, backgroundColor: colors.brand }]} />
            </View>
            <Text style={[styles.allocationText, { color: colors.textSecondary }]}>
              {allocatedPct}% owned · {availableUnits} of {totalUnits} units available
            </Text>
          </View>

          {issuerLabel ? (
            <View style={styles.issuerRow}>
              <Ionicons name="shield-checkmark-outline" size={14} color={colors.textSecondary} />
              <Text style={[styles.issuerText, { color: colors.textSecondary }]} numberOfLines={1}>{issuerLabel}</Text>
            </View>
          ) : null}

          {onAction ? (
            <Pressable
              onPress={(e) => { e.stopPropagation(); onAction(); }}
              style={[styles.actionBtn, { backgroundColor: colors.brand }]}
              accessibilityRole="button"
              accessibilityLabel={actionLabel}
            >
              <Text style={[styles.actionText, { color: colors.background }]}>{actionLabel}</Text>
              <Ionicons name="arrow-forward" size={16} color={colors.background} />
            </Pressable>
          ) : null}
        </View>
      </Pressable>
    </Reanimated.View>
  );
}

const styles = StyleSheet.create({
  imageWrap: {
    width: '100%',
    position: 'relative',
  },
  image: {
    width: '100%',
  },
  imageFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusOverlay: {
    position: 'absolute',
    top: Space.sm,
    left: Space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.full,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  statusText: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: 0.3,
  },
  content: {
    paddingHorizontal: Space.md,
    paddingTop: Space.md,
    paddingBottom: Space.lg,
    gap: Space.xs,
  },
  eyebrow: {
    fontSize: Type.metaElevated.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: Type.display.size,
    fontFamily: Typography.family.bold,
    lineHeight: 36,
    letterSpacing: -0.5,
    marginBottom: Space.xs,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    marginBottom: Space.sm,
  },
  unitPrice: {
    fontSize: Type.priceLarge.size,
    fontFamily: Typography.family.bold,
    letterSpacing: -0.5,
  },
  perUnit: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
  },
  allocationRow: {
    gap: 6,
    marginBottom: Space.sm,
  },
  allocationBarBg: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  allocationBarFill: {
    height: 4,
    borderRadius: 2,
  },
  allocationText: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
  },
  issuerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: Space.sm,
  },
  issuerText: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    flex: 1,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: Space.sm + 2,
    borderRadius: Radius.lg,
    marginTop: Space.xs,
  },
  actionText: {
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.semibold,
  },
});
