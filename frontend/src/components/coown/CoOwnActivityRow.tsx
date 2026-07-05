import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Radius, Type, Typography } from '../../theme/designTokens';
import { CachedImage } from '../CachedImage';

export type CoOwnActivityStatus = 'pending' | 'open' | 'partially_filled' | 'filled' | 'cancelled' | 'rejected' | 'expired';
export type CoOwnActivitySide = 'buy' | 'sell';

export interface CoOwnActivityRowProps {
  imageUri?: string | null;
  title: string;
  side: CoOwnActivitySide;
  units: number;
  unitPriceLabel: string;
  amountLabel: string;
  status: CoOwnActivityStatus;
  timestamp: string;
  onPress?: () => void;
  index?: number;
}

const STATUS_LABELS: Record<CoOwnActivityStatus, { label: string; color: 'success' | 'textSecondary' | 'danger' }> = {
  pending: { label: 'Pending', color: 'textSecondary' },
  open: { label: 'Open', color: 'success' },
  partially_filled: { label: 'Partial', color: 'success' },
  filled: { label: 'Filled', color: 'success' },
  cancelled: { label: 'Cancelled', color: 'textSecondary' },
  rejected: { label: 'Rejected', color: 'danger' },
  expired: { label: 'Expired', color: 'textSecondary' },
};

export function CoOwnActivityRow({
  imageUri,
  title,
  side,
  units,
  unitPriceLabel,
  amountLabel,
  status,
  timestamp,
  onPress,
  index = 0,
}: CoOwnActivityRowProps) {
  const { colors } = useAppTheme();
  const statusCfg = STATUS_LABELS[status];
  const statusColor = statusCfg.color === 'success' ? colors.success : statusCfg.color === 'danger' ? colors.danger : colors.textSecondary;
  const isBuy = side === 'buy';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.root, { backgroundColor: colors.background, opacity: pressed ? 0.7 : 1 }]}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${isBuy ? 'bought' : 'sold'} ${units} units, ${amountLabel}, ${statusCfg.label}, ${timestamp}`}
    >
      <View style={styles.imageWrap}>
        {imageUri ? (
          <CachedImage uri={imageUri} style={styles.image} contentFit="cover" transition={200} />
        ) : (
          <View style={[styles.image, styles.imageFallback, { backgroundColor: colors.surfaceAlt }]}>
            <Ionicons name="cube-outline" size={18} color={colors.textMuted} />
          </View>
        )}
      </View>

      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>{title}</Text>
          <Text style={[styles.amount, { color: colors.textPrimary }]}>{amountLabel}</Text>
        </View>
        <View style={styles.metaRow}>
          <View style={[styles.sidePill, { backgroundColor: isBuy ? colors.success + '18' : colors.danger + '18' }]}>
            <Text style={[styles.sideText, { color: isBuy ? colors.success : colors.danger }]}>
              {isBuy ? 'BUY' : 'SELL'}
            </Text>
          </View>
          <Text style={[styles.unitsText, { color: colors.textSecondary }]}>
            {units} units × {unitPriceLabel}
          </Text>
        </View>
        <View style={styles.footerRow}>
          <View style={[styles.statusPill, { backgroundColor: statusColor + '18' }]}>
            <Text style={[styles.statusText, { color: statusColor }]}>{statusCfg.label}</Text>
          </View>
          <Text style={[styles.timestamp, { color: colors.textMuted }]}>{timestamp}</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    gap: Space.md,
    paddingVertical: Space.sm + 2,
    paddingHorizontal: Space.md,
  },
  imageWrap: {
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  image: {
    width: 52,
    height: 52,
  },
  imageFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    gap: 4,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Space.sm,
  },
  title: {
    flex: 1,
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: -0.2,
  },
  amount: {
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.bold,
    letterSpacing: -0.2,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  sidePill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: Radius.full,
  },
  sideText: {
    fontSize: 10,
    fontFamily: Typography.family.bold,
    letterSpacing: 0.4,
  },
  unitsText: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  statusPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: Radius.full,
  },
  statusText: {
    fontSize: 10,
    fontFamily: Typography.family.semibold,
    letterSpacing: 0.3,
  },
  timestamp: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.regular,
  },
});
