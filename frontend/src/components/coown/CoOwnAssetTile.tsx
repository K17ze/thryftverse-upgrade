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

export interface CoOwnAssetTileProps {
  imageUri?: string | null;
  title: string;
  unitPriceLabel: string;
  availableUnits: number;
  totalUnits: number;
  status: CoOwnAssetStatus;
  onPress?: () => void;
  index?: number;
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
}: CoOwnAssetTileProps) {
  const { colors } = useAppTheme();
  const reducedMotion = useReducedMotion();
  const allocatedPct = totalUnits > 0 ? Math.round(((totalUnits - availableUnits) / totalUnits) * 100) : 0;

  const statusLabel = status === 'open' ? 'Available' : status === 'paused' ? 'Paused' : 'Allocated';
  const statusColor = status === 'open' ? colors.success : status === 'paused' ? colors.textSecondary : colors.textMuted;

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
});
