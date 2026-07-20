import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Radius, Type, Typography } from '../../theme/designTokens';
import { CoOwnNumericText } from '../ui/CoOwnNumericText';
import type { CoOwnPositionState } from '../../data/coOwnModels';

export type CoOwnSettlementMode = 'GBP' | 'TVUSD' | 'HYBRID' | 'ONEZE';

/** Supply buckets — the instrument series structure (§01 §3). */
export interface CoOwnSupplyBuckets {
  authorised?: number;
  issued?: number;
  publicFloat?: number;
  sponsorLocked?: number;
  treasury?: number;
}

/**
 * Viewer position state — aligned to the canonical CoOwnPositionState.
 * Kept as an alias for backward compatibility with existing imports.
 */
export type CoOwnViewerPosition = CoOwnPositionState;

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
  /** New: supply buckets (authorised/issued/float/locked/treasury). Optional — fail closed. */
  supply?: CoOwnSupplyBuckets;
  /** New: viewer position state (settled/reserved/pending). Optional — fall back to viewerUnits. */
  viewerPosition?: CoOwnViewerPosition;
  /** New: rights version badge. Optional. */
  rightsVersion?: string;
  /** New: release schedule link for sponsor locked units. Optional. */
  sponsorLockedReleaseNote?: string;
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
  supply,
  viewerPosition,
  rightsVersion,
  sponsorLockedReleaseNote,
}: CoOwnOwnershipPanelProps) {
  const { colors } = useAppTheme();

  const settlementLabel = settlementMode === 'GBP' ? 'GBP'
    : settlementMode === 'TVUSD' ? 'TVUSD'
    : settlementMode === 'ONEZE' ? '1ZE'
    : 'GBP + TVUSD';
  const statusLabel = status === 'open' ? 'Available' : status === 'paused' ? 'Paused' : 'Fully allocated';
  const statusColor = status === 'open' ? colors.success : status === 'paused' ? colors.textSecondary : colors.textMuted;

  // Use viewerPosition if available, fall back to legacy viewerUnits/viewerPct
  const hasViewerPosition = viewerPosition != null;
  const viewerSettled = hasViewerPosition ? viewerPosition!.settled : viewerUnits;
  const viewerReserved = hasViewerPosition ? viewerPosition!.reservedForSale : 0;
  const viewerPendingIn = hasViewerPosition ? viewerPosition!.pendingIn : 0;
  const viewerPendingOut = hasViewerPosition ? viewerPosition!.pendingOut : 0;
  const outstandingDenom = hasViewerPosition ? viewerPosition!.outstandingUnits : totalUnits;
  const computedViewerPct = hasViewerPosition && outstandingDenom > 0
    ? (viewerSettled / outstandingDenom) * 100
    : viewerPct;

  return (
    <View
      style={[styles.root, { backgroundColor: colors.surface, borderColor: colors.border }]}
      accessibilityRole="summary"
      accessibilityLabel={`Ownership panel. ${statusLabel}. ${allocatedPct}% allocated, ${availableUnits} units left. ${viewerSettled > 0 ? `You own ${viewerSettled} settled units, ${computedViewerPct.toFixed(2)}% of ${outstandingDenom.toLocaleString('en-GB')} outstanding.` : ''}${rightsVersion ? ` Rights version ${rightsVersion}.` : ''}`}
    >
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <Text style={[styles.sectionEyebrow, { color: colors.textMuted }]} numberOfLines={1}>
            OWNERSHIP
          </Text>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Your stake</Text>
        </View>
        <View style={styles.headerRight}>
          {rightsVersion && (
            <View style={[styles.rightsBadge, { backgroundColor: colors.surfaceAlt }]}>
              <Text style={[styles.rightsBadgeText, { color: colors.textMuted }]} numberOfLines={1}>
                {rightsVersion}
              </Text>
            </View>
          )}
          <View style={[styles.statusPill, { backgroundColor: statusColor + '22' }]}>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
          </View>
        </View>
      </View>

      <View style={styles.priceBlock}>
        <Text style={[styles.priceLabel, { color: colors.textMuted }]} numberOfLines={1}>Unit price</Text>
        <View style={styles.priceRow}>
          <Text style={[styles.priceValue, { color: colors.textPrimary }]} numberOfLines={1}>{unitPriceLabel}</Text>
          <Text style={[styles.pricePer, { color: colors.textSecondary }]}>per unit</Text>
        </View>
      </View>

      {/* Supply section — new. Falls back to legacy stats grid when not provided. */}
      {supply ? (
        <View style={[styles.supplySection, { borderColor: colors.border }]}>
          <Text style={[styles.supplyHeader, { color: colors.textMuted }]}>Supply</Text>
          <View style={styles.supplyRows}>
            <SupplyRow label="Authorised" value={supply.authorised} colors={colors} />
            <SupplyRow label="Issued" value={supply.issued} colors={colors} />
            <SupplyRow label="Public float" value={supply.publicFloat} colors={colors} />
            <SupplyRow
              label="Sponsor locked"
              value={supply.sponsorLocked}
              colors={colors}
              note={sponsorLockedReleaseNote}
            />
            <SupplyRow label="Treasury" value={supply.treasury} colors={colors} />
          </View>
        </View>
      ) : (
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
      )}

      <View style={styles.allocationBlock}>
        <View style={styles.allocationHeader}>
          <Text style={[styles.allocationLabel, { color: colors.textSecondary }]}>{allocatedPct}% allocated</Text>
          <Text style={[styles.allocationRemaining, { color: colors.textMuted }]}>{availableUnits} units left</Text>
        </View>
        <View style={[styles.allocationBarBg, { backgroundColor: colors.surfaceAlt }]}>
          <View style={[styles.allocationBarFill, { width: `${Math.min(allocatedPct, 100)}%`, backgroundColor: colors.brand }]} />
        </View>
      </View>

      {viewerSettled > 0 || viewerPendingIn > 0 ? (
        <View style={[styles.viewerBlock, { backgroundColor: colors.surfaceAlt }]}>
          <View style={styles.viewerHeader}>
            <Ionicons name="person-circle" size={18} color={colors.brand} />
            <Text style={[styles.viewerTitle, { color: colors.textPrimary }]}>Your position</Text>
          </View>
          {hasViewerPosition ? (
            <View style={styles.viewerPositionGrid}>
              <ViewerStat label="Settled" value={viewerSettled} colors={colors} />
              {viewerReserved > 0 && <ViewerStat label="Reserved for sale" value={viewerReserved} colors={colors} />}
              {viewerPendingIn > 0 && <ViewerStat label="Pending in" value={viewerPendingIn} colors={colors} />}
              {viewerPendingOut > 0 && <ViewerStat label="Pending out" value={viewerPendingOut} colors={colors} />}
              <View style={styles.viewerOwnershipRow}>
                <Text style={[styles.viewerStatLabel, { color: colors.textMuted }]}>Ownership</Text>
                <CoOwnNumericText
                  value={computedViewerPct}
                  unit="pct"
                  size="price"
                  precision={2}
                  align="left"
                />
                <Text style={[styles.viewerDenomLabel, { color: colors.textMuted }]}>
                  of {outstandingDenom.toLocaleString('en-GB')}
                </Text>
              </View>
            </View>
          ) : (
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
          )}
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

/** A supply row — label on left, value on right, optional note. */
function SupplyRow({
  label,
  value,
  colors,
  note,
}: {
  label: string;
  value: number | undefined;
  colors: ReturnType<typeof useAppTheme>['colors'];
  note?: string;
}) {
  return (
    <View style={styles.supplyRow}>
      <Text style={[styles.supplyRowLabel, { color: colors.textSecondary }]}>{label}</Text>
      <View style={styles.supplyRowRight}>
        {note && (
          <Text style={[styles.supplyRowNote, { color: colors.textMuted }]} numberOfLines={1}>
            {note}
          </Text>
        )}
        {value != null ? (
          <CoOwnNumericText
            value={value}
            unit="units"
            size="price"
            align="right"
          />
        ) : (
          <Text style={[styles.supplyRowMissing, { color: colors.textMuted }]}>—</Text>
        )}
      </View>
    </View>
  );
}

/** A viewer position stat. */
function ViewerStat({
  label,
  value,
  colors,
}: {
  label: string;
  value: number;
  colors: ReturnType<typeof useAppTheme>['colors'];
}) {
  return (
    <View style={styles.viewerStatCol}>
      <Text style={[styles.viewerStatLabel, { color: colors.textMuted }]}>{label}</Text>
      <CoOwnNumericText
        value={value}
        unit="units"
        size="price"
        align="left"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Space.md,
    gap: Space.md,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  headerLeft: {
    gap: 2,
    flex: 1,
    minWidth: 0,
  },
  sectionEyebrow: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: 1.0,
    textTransform: 'uppercase',
  },
  sectionTitle: {
    fontSize: Type.title.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: -0.4,
    lineHeight: Type.title.lineHeight,
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
  // ── New styles for supply section ──
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  rightsBadge: {
    paddingHorizontal: Space.sm,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  rightsBadgeText: {
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: Typography.family.medium,
    letterSpacing: Type.meta.letterSpacing,
  },
  supplySection: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: Space.sm,
    gap: Space.xs,
  },
  supplyHeader: {
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.metaElevated.letterSpacing,
    textTransform: 'uppercase',
  },
  supplyRows: {
    gap: Space.xs,
  },
  supplyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 22,
  },
  supplyRowLabel: {
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.body.letterSpacing,
  },
  supplyRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  supplyRowNote: {
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.meta.letterSpacing,
  },
  supplyRowMissing: {
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.semibold,
  },
  // ── New styles for viewer position grid ──
  viewerPositionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.md,
  },
  viewerStatCol: {
    gap: 2,
    minWidth: 80,
  },
  viewerOwnershipRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Space.xs,
    width: '100%',
    paddingTop: Space.xs,
  },
  viewerDenomLabel: {
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.meta.letterSpacing,
  },
});
