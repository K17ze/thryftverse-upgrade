import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Radius, Type, Typography } from '../../theme/designTokens';
import { CachedImage } from '../CachedImage';
import { useReducedMotion } from '../../hooks/useReducedMotion';

export type CoOwnPositionStatus = 'open' | 'closed' | 'paused';

export interface CoOwnPositionCardProps {
  imageUri?: string | null;
  title: string;
  unitsOwned: number;
  totalUnits: number;
  ownershipPct: number;
  currentValueLabel: string;
  avgEntryLabel?: string;
  unrealizedLabel?: string;
  realizedLabel?: string;
  status: CoOwnPositionStatus;
  sellable: boolean;
  onPress?: () => void;
  onBuyMore?: () => void;
  onSell?: () => void;
  index?: number;
}

export function CoOwnPositionCard({
  imageUri,
  title,
  unitsOwned,
  totalUnits,
  ownershipPct,
  currentValueLabel,
  avgEntryLabel,
  unrealizedLabel,
  realizedLabel,
  status,
  sellable,
  onPress,
  onBuyMore,
  onSell,
  index = 0,
}: CoOwnPositionCardProps) {
  const { colors } = useAppTheme();
  const reducedMotion = useReducedMotion();

  const statusLabel = status === 'open' ? 'Active' : status === 'paused' ? 'Paused' : 'Closed';
  const statusColor = status === 'open' ? colors.success : status === 'paused' ? colors.textSecondary : colors.textMuted;

  return (
    <Reanimated.View entering={reducedMotion ? undefined : FadeInDown.delay(Math.min(index, 8) * 40).duration(300)}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${title}, you own ${unitsOwned} of ${totalUnits} units, ${ownershipPct}% ownership, current value ${currentValueLabel}, ${statusLabel}`}
      >
        <View style={[styles.root, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.mediaRow}>
            <View style={styles.imageWrap}>
              {imageUri ? (
                <CachedImage uri={imageUri} style={styles.image} contentFit="cover" transition={250} />
              ) : (
                <View style={[styles.image, styles.imageFallback, { backgroundColor: colors.surfaceAlt }]}>
                  <Ionicons name="cube-outline" size={24} color={colors.textMuted} />
                </View>
              )}
            </View>

            <View style={styles.identity}>
              <View style={styles.statusRow}>
                <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
                <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
              </View>
              <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={2}>{title}</Text>
              <Text style={[styles.ownership, { color: colors.textSecondary }]}>
                {unitsOwned} of {totalUnits} units · {ownershipPct}%
              </Text>
            </View>
          </View>

          <View style={[styles.valueRow, { borderColor: colors.border }]}>
            <View style={styles.valueItem}>
              <Text style={[styles.valueLabel, { color: colors.textMuted }]}>Current value</Text>
              <Text style={[styles.valueAmount, { color: colors.textPrimary }]}>{currentValueLabel}</Text>
            </View>
            {avgEntryLabel ? (
              <View style={styles.valueItem}>
                <Text style={[styles.valueLabel, { color: colors.textMuted }]}>Avg entry</Text>
                <Text style={[styles.valueAmount, { color: colors.textSecondary }]}>{avgEntryLabel}</Text>
              </View>
            ) : null}
            {unrealizedLabel ? (
              <View style={styles.valueItem}>
                <Text style={[styles.valueLabel, { color: colors.textMuted }]}>Unrealised</Text>
                <Text style={[styles.valueAmount, { color: colors.textSecondary }]}>{unrealizedLabel}</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.ownershipBar}>
            <View style={[styles.ownershipBarBg, { backgroundColor: colors.surfaceAlt }]}>
              <View style={[styles.ownershipBarFill, { width: `${Math.min(ownershipPct, 100)}%`, backgroundColor: colors.brand }]} />
            </View>
          </View>

          <View style={styles.actionRow}>
            {onBuyMore ? (
              <Pressable
                onPress={(e) => { e.stopPropagation(); onBuyMore(); }}
                style={[styles.buyBtn, { backgroundColor: colors.brand }]}
                accessibilityRole="button"
                accessibilityLabel={`Buy more units of ${title}`}
              >
                <Text style={[styles.buyBtnText, { color: colors.background }]}>Buy more</Text>
              </Pressable>
            ) : null}
            {onSell ? (
              <Pressable
                onPress={(e) => { e.stopPropagation(); onSell(); }}
                style={[styles.sellBtn, { borderColor: colors.border, opacity: sellable ? 1 : 0.4 }]}
                disabled={!sellable}
                accessibilityRole="button"
                accessibilityLabel={sellable ? `Sell units of ${title}` : `Sell unavailable for ${title}`}
              >
                <Text style={[styles.sellBtnText, { color: colors.textPrimary }]}>Sell</Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={(e) => { e.stopPropagation(); onPress?.(); }}
              style={styles.detailBtn}
              accessibilityRole="button"
              accessibilityLabel={`View ${title} details`}
            >
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </Pressable>
          </View>
        </View>
      </Pressable>
    </Reanimated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    borderRadius: Radius.lg,
    borderWidth: 0.5,
    padding: Space.md,
    gap: Space.sm,
  },
  mediaRow: {
    flexDirection: 'row',
    gap: Space.md,
  },
  imageWrap: {
    width: 72,
    height: 72,
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  image: {
    width: 72,
    height: 72,
  },
  imageFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  identity: {
    flex: 1,
    gap: 4,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  statusText: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: 0.2,
  },
  title: {
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.semibold,
    lineHeight: 20,
    letterSpacing: -0.2,
  },
  ownership: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
  },
  valueRow: {
    flexDirection: 'row',
    gap: Space.md,
    paddingTop: Space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  valueItem: {
    flex: 1,
    gap: 2,
  },
  valueLabel: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.medium,
    letterSpacing: 0.2,
    textTransform: 'uppercase',
  },
  valueAmount: {
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: -0.2,
  },
  ownershipBar: {
    gap: 0,
  },
  ownershipBarBg: {
    height: 3,
    borderRadius: 1.5,
    overflow: 'hidden',
  },
  ownershipBarFill: {
    height: 3,
    borderRadius: 1.5,
  },
  actionRow: {
    flexDirection: 'row',
    gap: Space.sm,
    alignItems: 'center',
  },
  buyBtn: {
    flex: 1,
    paddingVertical: Space.sm,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buyBtnText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
  },
  sellBtn: {
    flex: 1,
    paddingVertical: Space.sm,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  sellBtnText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
  },
  detailBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
