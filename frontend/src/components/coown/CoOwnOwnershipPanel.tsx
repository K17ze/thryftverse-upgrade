import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Radius, Type, Typography } from '../../theme/designTokens';

export type CoOwnSettlementMode = 'GBP' | 'TVUSD' | 'HYBRID';

export interface CoOwnOwnershipPanelProps {
  unitPriceLabel: string;
  totalUnits: number;
  availableUnits: number;
  allocatedPct: number;
  viewerUnits: number;
  viewerPct: number;
  settlementMode: CoOwnSettlementMode;
  feePct: number;
  holderCount: number;
  status: 'open' | 'closed' | 'paused';
}

export function CoOwnOwnershipPanel({
  unitPriceLabel,
  totalUnits,
  availableUnits,
  allocatedPct,
  viewerUnits,
  viewerPct,
  settlementMode,
  feePct,
  holderCount,
  status,
}: CoOwnOwnershipPanelProps) {
  const { colors } = useAppTheme();

  const settlementLabel = settlementMode === 'GBP' ? 'GBP' : settlementMode === 'TVUSD' ? 'TVUSD' : 'GBP + TVUSD';
  const statusLabel = status === 'open' ? 'Available' : status === 'paused' ? 'Paused' : 'Fully allocated';
  const statusColor = status === 'open' ? colors.success : status === 'paused' ? colors.textSecondary : colors.textMuted;

  return (
    <View style={[styles.root, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.headerRow}>
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Ownership</Text>
        <View style={[styles.statusPill, { backgroundColor: statusColor + '22' }]}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
        </View>
      </View>

      <View style={styles.priceBlock}>
        <Text style={[styles.priceLabel, { color: colors.textMuted }]} numberOfLines={1}>Unit price</Text>
        <View style={styles.priceRow}>
          <Text style={[styles.priceValue, { color: colors.textPrimary }]} numberOfLines={1}>{unitPriceLabel}</Text>
          <Text style={[styles.pricePer, { color: colors.textSecondary }]}>per unit</Text>
        </View>
      </View>

      <View style={[styles.statsGrid, { borderColor: colors.border }]}>
        <View style={styles.statItem}>
          <Text style={[styles.statLabel, { color: colors.textMuted }]}>Total units</Text>
          <Text style={[styles.statValue, { color: colors.textPrimary }]}>{totalUnits}</Text>
        </View>
        <View style={[styles.statItem, { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.border }]}>
          <Text style={[styles.statLabel, { color: colors.textMuted }]}>Available</Text>
          <Text style={[styles.statValue, { color: colors.textPrimary }]}>{availableUnits}</Text>
        </View>
        <View style={[styles.statItem, { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.border }]}>
          <Text style={[styles.statLabel, { color: colors.textMuted }]}>Holders</Text>
          <Text style={[styles.statValue, { color: colors.textPrimary }]}>{holderCount}</Text>
        </View>
      </View>

      <View style={styles.allocationBlock}>
        <View style={styles.allocationHeader}>
          <Text style={[styles.allocationLabel, { color: colors.textSecondary }]}>{allocatedPct}% allocated</Text>
          <Text style={[styles.allocationRemaining, { color: colors.textMuted }]}>{availableUnits} units left</Text>
        </View>
        <View style={[styles.allocationBarBg, { backgroundColor: colors.surfaceAlt }]}>
          <View style={[styles.allocationBarFill, { width: `${Math.min(allocatedPct, 100)}%`, backgroundColor: colors.brand }]} />
        </View>
      </View>

      {viewerUnits > 0 ? (
        <View style={[styles.viewerBlock, { backgroundColor: colors.surfaceAlt }]}>
          <View style={styles.viewerHeader}>
            <Ionicons name="person-circle" size={18} color={colors.brand} />
            <Text style={[styles.viewerTitle, { color: colors.textPrimary }]}>Your position</Text>
          </View>
          <View style={styles.viewerStats}>
            <View style={styles.viewerStat}>
              <Text style={[styles.viewerStatLabel, { color: colors.textMuted }]}>Units</Text>
              <Text style={[styles.viewerStatValue, { color: colors.textPrimary }]}>{viewerUnits}</Text>
            </View>
            <View style={styles.viewerStat}>
              <Text style={[styles.viewerStatLabel, { color: colors.textMuted }]}>Ownership</Text>
              <Text style={[styles.viewerStatValue, { color: colors.textPrimary }]}>{viewerPct}%</Text>
            </View>
          </View>
        </View>
      ) : null}

      <View style={[styles.footerRow, { borderColor: colors.border }]}>
        <View style={styles.footerItem}>
          <Ionicons name="card-outline" size={14} color={colors.textMuted} />
          <Text style={[styles.footerText, { color: colors.textSecondary }]}>{settlementLabel}</Text>
        </View>
        <View style={styles.footerItem}>
          <Ionicons name="pricetag-outline" size={14} color={colors.textMuted} />
          <Text style={[styles.footerText, { color: colors.textSecondary }]}>{feePct}% fee</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    borderRadius: Radius.lg,
    borderWidth: 0.5,
    padding: Space.md,
    gap: Space.md,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: Type.subtitle.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: -0.3,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
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
    letterSpacing: 0.2,
  },
  priceBlock: {
    gap: 4,
  },
  priceLabel: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.medium,
    letterSpacing: 0.2,
    textTransform: 'uppercase',
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  priceValue: {
    fontSize: Type.priceLarge.size,
    fontFamily: Typography.family.bold,
    letterSpacing: -0.5,
  },
  pricePer: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
  },
  statsGrid: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: Space.sm,
  },
  statItem: {
    flex: 1,
    paddingHorizontal: Space.xs,
    alignItems: 'center',
    gap: 4,
  },
  statLabel: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.medium,
    letterSpacing: 0.2,
    textTransform: 'uppercase',
  },
  statValue: {
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.bold,
  },
  allocationBlock: {
    gap: 6,
  },
  allocationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  allocationLabel: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.medium,
  },
  allocationRemaining: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
  },
  allocationBarBg: {
    height: 5,
    borderRadius: 2.5,
    overflow: 'hidden',
  },
  allocationBarFill: {
    height: 5,
    borderRadius: 2.5,
  },
  viewerBlock: {
    borderRadius: Radius.md,
    padding: Space.sm + 2,
    gap: Space.sm,
  },
  viewerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  viewerTitle: {
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.semibold,
  },
  viewerStats: {
    flexDirection: 'row',
    gap: Space.lg,
  },
  viewerStat: {
    gap: 2,
  },
  viewerStatLabel: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.regular,
  },
  viewerStatValue: {
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.bold,
  },
  footerRow: {
    flexDirection: 'row',
    gap: Space.md,
    paddingTop: Space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  footerText: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
  },
});
