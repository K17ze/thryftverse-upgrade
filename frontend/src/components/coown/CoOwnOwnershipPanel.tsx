import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Radius } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { CoOwnNumericText } from '../ui/CoOwnNumericText';
import type { CoOwnPositionState } from '../../data/coOwnModels';

export type CoOwnSettlementMode = 'ONEZE';

/** Supply buckets — the instrument series structure (§01 §3). */
export interface CoOwnSupplyBuckets {
  // Per spec 03_COOWN §6: nullable to support "do not infer treasury,
  // authorised, issued, public float or sponsor locked from available
  // units". The frontend must not fabricate these values.
  authorised?: number | null;
  issued?: number | null;
  publicFloat?: number | null;
  sponsorLocked?: number | null;
  treasury?: number | null;
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
  viewerUnits: number | null;
  viewerPct: number | null;
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

  const settlementLabel = '1ZE';
  const statusLabel = status === 'open' ? 'Available' : status === 'paused' ? 'Paused' : 'Fully allocated';
  const statusColor = status === 'open' ? colors.success : status === 'paused' ? colors.textSecondary : colors.textMuted;

  // Use viewerPosition if available, fall back to legacy viewerUnits/viewerPct
  const hasViewerPosition = viewerPosition != null;
  const viewerDataAvailable = hasViewerPosition || (viewerUnits != null && viewerPct != null);
  const viewerSettled = hasViewerPosition ? viewerPosition!.settled : viewerUnits ?? 0;
  const viewerReserved = hasViewerPosition ? viewerPosition!.reservedForSale : 0;
  const viewerPendingIn = hasViewerPosition ? viewerPosition!.pendingIn : 0;
  const viewerPendingOut = hasViewerPosition ? viewerPosition!.pendingOut : 0;
  const outstandingDenom = hasViewerPosition ? viewerPosition!.outstandingUnits : totalUnits;
  const computedViewerPct = hasViewerPosition && outstandingDenom > 0
    ? (viewerSettled / outstandingDenom) * 100
    : viewerPct ?? 0;

  return (
    <View
      style={[styles.root, { backgroundColor: colors.surface, borderColor: colors.border }]}
      accessibilityRole="summary"
      accessibilityLabel={`Ownership panel. ${statusLabel}. ${allocatedPct}% allocated, ${availableUnits} units left. ${!viewerDataAvailable ? 'Your position is unavailable.' : viewerSettled > 0 ? `You own ${viewerSettled} settled units, ${computedViewerPct.toFixed(2)}% of ${outstandingDenom.toLocaleString('en-GB')} outstanding.` : ''}${rightsVersion ? ` Rights version ${rightsVersion}.` : ''}`}
    >
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
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

      {!viewerDataAvailable ? (
        <View style={[styles.viewerBlock, { backgroundColor: colors.surfaceAlt }]}>
          <View style={styles.viewerHeader}>
            <Ionicons name="alert-circle-outline" size={18} color={colors.textMuted} />
            <Text style={[styles.viewerTitle, { color: colors.textSecondary }]}>
              Your position is unavailable
            </Text>
          </View>
        </View>
      ) : viewerSettled > 0 || viewerPendingIn > 0 ? (
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
                <Text style={[styles.viewerStatValue, { color: colors.textPrimary }]}>{viewerUnits ?? 0}</Text>
              </View>
              <View style={styles.viewerStat}>
                <Text style={[styles.viewerStatLabel, { color: colors.textMuted }]}>Ownership</Text>
                <Text style={[styles.viewerStatValue, { color: colors.textPrimary }]}>{viewerPct ?? 0}%</Text>
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
          <Ionicons name="cash-outline" size={14} color={colors.textMuted} />
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
  value: number | null | undefined;
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
  sectionTitle: {
    fontSize: TypographyV2.screenTitle.size,
    fontFamily: TypographyV2.screenTitle.fontFamily,
    letterSpacing: -0.4,
    lineHeight: TypographyV2.screenTitle.lineHeight,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs,
    borderRadius: Radius.full,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: Radius.sm,
  },
  statusText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: 0.2,
  },
  priceBlock: {
    gap: 4,
  },
  priceLabel: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: 0.2,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  priceValue: {
    fontSize: TypographyV2.priceHero.size,
    fontFamily: TypographyV2.priceHero.fontFamily,
    letterSpacing: -0.5,
    fontVariant: ['tabular-nums'] as ['tabular-nums'],
  },
  pricePer: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
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
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: 0.2,
  },
  statValue: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    fontVariant: ['tabular-nums'] as ['tabular-nums'],
  },
  allocationBlock: {
    gap: 6,
  },
  allocationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  allocationLabel: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    fontVariant: ['tabular-nums'] as ['tabular-nums'],
  },
  allocationRemaining: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    fontVariant: ['tabular-nums'] as ['tabular-nums'],
  },
  allocationBarBg: {
    height: 5,
    borderRadius: Radius.full,
    overflow: 'hidden',
  },
  allocationBarFill: {
    height: 5,
    borderRadius: Radius.full,
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
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
  },
  viewerStats: {
    flexDirection: 'row',
    gap: Space.lg,
  },
  viewerStat: {
    gap: 2,
  },
  viewerStatLabel: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
  },
  viewerStatValue: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    fontVariant: ['tabular-nums'] as ['tabular-nums'],
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
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
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
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
  supplySection: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: Space.sm,
    gap: Space.xs,
  },
  supplyHeader: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.label.letterSpacing,
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
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: TypographyV2.body.fontFamily,
    letterSpacing: TypographyV2.body.letterSpacing,
  },
  supplyRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  supplyRowNote: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
  supplyRowMissing: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
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
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
});
