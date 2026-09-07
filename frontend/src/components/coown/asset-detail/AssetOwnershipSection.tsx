import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Space, FontFamily, Radius } from '../../../theme/designTokens';
import { TypographyV2 } from '../../../theme/typography.v2';
import { useAppTheme } from '../../../theme/ThemeContext';
import { formatCoOwnIze } from '../../../utils/currency';
import type { CoOwnCorporateAction, CoOwnDistribution } from '../../../services/marketApi';
import { CoOwnCorporateActionRow, type CoOwnCorporateActionStatus, type CoOwnCorporateActionType } from '../';
import { CommerceDetailDisclosureRow } from '../../commerce/detail';

export interface AssetOwnershipSectionProps {
  isHolder: boolean;
  yourUnits: number | null;
  viewerPct: number | null;
  avgEntryPriceGbp: number | null;
  unrealizedPnlGbp: number | null;
  unrealizedPnlPct: number | null;
  yourSegmentPct: number;
  otherHoldersSegmentPct: number;
  availableSegmentPct: number;
  availableUnits: number;
  totalUnits: number;
  onOpenRights: () => void;
  lastDistribution: CoOwnDistribution | null;
  lastDistributionAmount: number | null;
  lastDistributionDate: string | null;
  lastDistributionPerUnit: number | null;
  onNavigateToDistributionHistory: () => void;
  /** Latest corporate actions, already limited (null = not loaded / failed → section omitted). */
  corporateActions: CoOwnCorporateAction[] | null;
  onNavigateToCorporateAction: (action: CoOwnCorporateAction) => void;
  onOpenBuyout: () => void;
}

/** Backend action types → row types. Unknown types are skipped, never guessed. */
const ACTION_TYPE_MAP: Record<string, CoOwnCorporateActionType> = {
  distribution: 'distribution',
  operating_cost: 'operating_cost',
  new_issuance: 'new_issuance',
  split: 'split',
  consolidation: 'consolidation',
  buyback: 'buyback',
  compulsory_buyout: 'compulsory_buyout',
  revaluation: 'revaluation',
  insurance_proceeds: 'insurance_proceeds',
  liquidation: 'liquidation',
  vote: 'vote',
  governance: 'vote',
  exit: 'liquidation',
};

const ACTION_STATUS_MAP: Record<string, CoOwnCorporateActionStatus> = {
  announced: 'pending',
  open: 'pending',
  executing: 'effective',
  executed: 'effective',
  settled: 'completed',
  cancelled: 'cancelled',
};

function formatDayMonth(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function corporateActionAmountLabel(action: CoOwnCorporateAction): string | undefined {
  if (action.perUnitValueGbpMinor == null) return undefined;
  const major = action.perUnitValueGbpMinor / 100;
  return `${major >= 0 ? '+' : ''}${formatCoOwnIze(major)}`;
}

export function AssetOwnershipSection({
  isHolder,
  yourUnits,
  viewerPct,
  avgEntryPriceGbp,
  unrealizedPnlGbp,
  unrealizedPnlPct,
  yourSegmentPct,
  otherHoldersSegmentPct,
  availableSegmentPct,
  availableUnits,
  totalUnits,
  onOpenRights,
  lastDistribution,
  lastDistributionAmount,
  lastDistributionDate,
  lastDistributionPerUnit,
  onNavigateToDistributionHistory,
  corporateActions,
  onNavigateToCorporateAction,
  onOpenBuyout,
}: AssetOwnershipSectionProps) {
  const { colors } = useAppTheme();

  const isUp = unrealizedPnlGbp != null && unrealizedPnlGbp >= 0;
  // Financial direction token pair — coownUp/coownDown are the documented
  // tokens for position P/L (ThemeContext), not success/warning.
  const pnlColor = isUp ? colors.coownUp : colors.coownDown;

  return (
    <View style={styles.container}>
      {/* ── 1. Your Position Card (when user owns units) ── */}
      {isHolder && yourUnits != null && yourUnits > 0 ? (
        <View style={[styles.cardSurface, { backgroundColor: colors.successSubtle, borderColor: colors.success }]}>
          <View style={styles.sectionHeaderRow}>
            <View style={styles.positionTitleGroup}>
              <Ionicons name="pie-chart" size={18} color={colors.success} />
              <Text style={[styles.sectionHeading, { color: colors.textPrimary }]}>Your Ownership Position</Text>
            </View>
            <View style={[styles.shareBadge, { backgroundColor: colors.surfaceAlt }]}>
              <Text style={[styles.shareBadgeText, { color: colors.brand }]}>
                {viewerPct != null ? `${viewerPct}% of asset` : ''}
              </Text>
            </View>
          </View>

          <View style={styles.positionMetricsGrid}>
            <View style={styles.positionMetricCol}>
              <Text style={[styles.metaLabel, { color: colors.textMuted }]}>Units Owned</Text>
              <Text style={[styles.positionBigValue, { color: colors.textPrimary }]}>{yourUnits}</Text>
            </View>

            <View style={styles.positionMetricCol}>
              <Text style={[styles.metaLabel, { color: colors.textMuted }]}>Cost Basis</Text>
              <Text style={[styles.positionBigValue, { color: colors.textPrimary }]}>
                {avgEntryPriceGbp != null ? formatCoOwnIze(avgEntryPriceGbp * yourUnits) : '—'}
              </Text>
            </View>

            <View style={styles.positionMetricCol}>
              <Text style={[styles.metaLabel, { color: colors.textMuted }]}>Unrealized P&L</Text>
              <Text style={[styles.positionBigValue, { color: pnlColor }]}>
                {unrealizedPnlGbp != null ? `${isUp ? '+' : ''}${formatCoOwnIze(unrealizedPnlGbp)}` : '—'}
              </Text>
              {unrealizedPnlPct != null ? (
                <Text style={[styles.pnlSubText, { color: pnlColor }]}>
                  {isUp ? '▲' : '▼'} {Math.abs(unrealizedPnlPct).toFixed(1)}%
                </Text>
              ) : null}
            </View>
          </View>
        </View>
      ) : null}

      {/* ── 2. Supply & Capital Structure ── */}
      <View style={[styles.cardSurface, { backgroundColor: colors.surfaceAlt, borderColor: colors.borderSubtle }]}>
        <View style={styles.sectionHeaderRow}>
          <Text style={[styles.sectionHeading, { color: colors.textPrimary }]}>Supply & Capital Structure</Text>
          <Text style={[styles.supplyTotalBadge, { color: colors.textMuted }]}>
            {totalUnits} units total
          </Text>
        </View>

        {/* Proportional horizontal stacked bar */}
        <View style={styles.stackedBarTrack}>
          {yourSegmentPct > 0 ? (
            <View style={[styles.barSegment, { width: `${yourSegmentPct}%`, backgroundColor: colors.brand }]} />
          ) : null}
          {otherHoldersSegmentPct > 0 ? (
            <View style={[styles.barSegment, { width: `${otherHoldersSegmentPct}%`, backgroundColor: colors.textMuted }]} />
          ) : null}
          {availableSegmentPct > 0 ? (
            <View style={[styles.barSegment, { width: `${availableSegmentPct}%`, backgroundColor: colors.success }]} />
          ) : null}
        </View>

        {/* Legend */}
        <View style={styles.barLegendRow}>
          {yourUnits != null && yourUnits > 0 ? (
            <View style={styles.legendItem}>
              <View style={[styles.legendColorBox, { backgroundColor: colors.brand }]} />
              <Text style={[styles.legendText, { color: colors.textSecondary }]}>
                You ({yourUnits})
              </Text>
            </View>
          ) : null}
          <View style={styles.legendItem}>
            <View style={[styles.legendColorBox, { backgroundColor: colors.textMuted }]} />
            <Text style={[styles.legendText, { color: colors.textSecondary }]}>
              Other Co-Owners ({Math.max(0, totalUnits - availableUnits - (yourUnits || 0))})
            </Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendColorBox, { backgroundColor: colors.success }]} />
            <Text style={[styles.legendText, { color: colors.textSecondary }]}>
              Available Float ({availableUnits})
            </Text>
          </View>
        </View>
      </View>

      {/* ── 3. Governance, Decisions & Exit Rules ── */}
      <View style={[styles.cardSurface, { backgroundColor: colors.surfaceAlt, borderColor: colors.borderSubtle }]}>
        <View style={styles.sectionHeaderRow}>
          <Text style={[styles.sectionHeading, { color: colors.textPrimary }]}>Decisions & Exit Rules</Text>
          <Pressable
            onPress={onOpenRights}
            hitSlop={8}
            style={({ pressed }) => [styles.linkRow, pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
            accessibilityLabel="View full rights agreement"
          >
            <Text style={[styles.linkText, { color: colors.brand }]}>Rights agreement</Text>
            <Ionicons name="document-outline" size={14} color={colors.brand} />
          </Pressable>
        </View>

        <View style={styles.rightsBlock}>
          <View style={styles.rightRow}>
            <View style={styles.rightIconCol}>
              <Ionicons name="checkbox-outline" size={16} color={colors.brand} />
            </View>
            <View style={styles.rightInfoCol}>
              <Text style={[styles.rightTitle, { color: colors.textPrimary }]}>Voting & Governance</Text>
              <Text style={[styles.rightDetail, { color: colors.textSecondary }]}>
                1 unit = 1 vote. Voting eligibility snapshots at record date. Majority approval required for major physical maintenance or museum loan decisions.
              </Text>
            </View>
          </View>

          <View style={styles.rightRow}>
            <View style={styles.rightIconCol}>
              <Ionicons name="exit-outline" size={16} color={colors.brand} />
            </View>
            <View style={styles.rightInfoCol}>
              <Text style={[styles.rightTitle, { color: colors.textPrimary }]}>Whole-Asset Buyout & Liquidation</Text>
              <Text style={[styles.rightDetail, { color: colors.textSecondary }]}>
                Third-party acquisition offers require 75% supermajority approval. Net proceeds after legal escrow settle pro-rata directly into co-owners' wallets.
              </Text>
            </View>
          </View>

          <View style={styles.rightRow}>
            <View style={styles.rightIconCol}>
              <Ionicons name="lock-closed-outline" size={16} color={colors.brand} />
            </View>
            <View style={styles.rightInfoCol}>
              <Text style={[styles.rightTitle, { color: colors.textPrimary }]}>Physical Possession</Text>
              <Text style={[styles.rightDetail, { color: colors.textSecondary }]}>
                Co-ownership conveys economic and beneficial title. Physical possession remains exclusively with the insured custodian to maintain authenticated provenance.
              </Text>
            </View>
          </View>
        </View>

        <CommerceDetailDisclosureRow
          label="Buyout offers"
          summary="Whole-asset acquisition offers"
          onPress={onOpenBuyout}
          accessibilityLabel="View buyout offers for this asset"
        />
      </View>

      {/* ── 4. Corporate actions & events ──
          Latest lifecycle events as timeline rows. Omitted entirely when
          nothing has been published — no placeholder. */}
      {corporateActions && corporateActions.length > 0 ? (
        <View style={[styles.cardSurface, { backgroundColor: colors.surfaceAlt, borderColor: colors.borderSubtle }]}>
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionHeading, { color: colors.textPrimary }]}>Corporate actions & events</Text>
          </View>
          <View style={styles.actionList}>
            {corporateActions.map((action) => {
              const rowType = ACTION_TYPE_MAP[action.actionType];
              if (!rowType) return null;
              const dateSource = action.payableDate ?? action.recordDate ?? action.exDate ?? action.createdAt;
              return (
                <CoOwnCorporateActionRow
                  key={action.id}
                  type={rowType}
                  status={ACTION_STATUS_MAP[action.status] ?? 'pending'}
                  dateLabel={new Date(dateSource).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  effectLabel={action.description ?? action.title}
                  amountLabel={corporateActionAmountLabel(action)}
                  recordDateLabel={action.recordDate ? `Record date: ${formatDayMonth(action.recordDate)}` : undefined}
                  paymentDateLabel={action.payableDate ? `Payment: ${formatDayMonth(action.payableDate)}` : undefined}
                  onPress={() => onNavigateToCorporateAction(action)}
                />
              );
            })}
          </View>
        </View>
      ) : null}

      {/* ── 5. Distributions & Yield ── */}
      <View style={[styles.cardSurface, { backgroundColor: colors.surfaceAlt, borderColor: colors.borderSubtle }]}>
        <View style={styles.sectionHeaderRow}>
          <Text style={[styles.sectionHeading, { color: colors.textPrimary }]}>Distributions & Yield</Text>
          <Pressable
            onPress={onNavigateToDistributionHistory}
            hitSlop={8}
            style={({ pressed }) => [styles.linkRow, pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
            accessibilityLabel="View distributions history"
          >
            <Text style={[styles.linkText, { color: colors.brand }]}>History</Text>
            <Ionicons name="receipt-outline" size={14} color={colors.brand} />
          </Pressable>
        </View>

        {lastDistribution ? (
          <View style={styles.distributionSummary}>
            <View style={styles.distribTop}>
              <Text style={[styles.distribAmount, { color: colors.textPrimary }]}>
                {lastDistributionAmount != null ? formatCoOwnIze(lastDistributionAmount) : '—'}
              </Text>
              <Text style={[styles.distribDate, { color: colors.textMuted }]}>
                {lastDistributionDate || 'Settled'}
              </Text>
            </View>
            <Text style={[styles.distribPerUnit, { color: colors.textSecondary }]}>
              {lastDistributionPerUnit != null ? `${formatCoOwnIze(lastDistributionPerUnit)} per unit` : 'Recent payout'}
            </Text>
          </View>
        ) : (
          <View style={styles.noDistributionNotice}>
            <Text style={[styles.noDistributionText, { color: colors.textMuted }]}>
              No distributions settled yet. Any commercial yield, exhibition loan proceeds, or sale distributions settle pro-rata.
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Space.md,
    paddingTop: Space.md,
    gap: Space.md,
  },
  cardSurface: {
    borderRadius: Radius.md,
    padding: Space.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Space.sm,
  },
  positionTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  sectionHeading: {
    fontSize: TypographyV2.sectionTitle.size,
    lineHeight: TypographyV2.sectionTitle.lineHeight,
    fontFamily: FontFamily.bold,
  },
  shareBadge: {
    paddingHorizontal: Space.xs + 2,
    paddingVertical: 3,
    borderRadius: Radius.sm,
  },
  shareBadgeText: {
    fontSize: TypographyV2.captionElevated.size,
    fontFamily: FontFamily.semibold,
  },
  positionMetricsGrid: {
    flexDirection: 'row',
    marginTop: Space.xs,
  },
  positionMetricCol: {
    flex: 1,
  },
  metaLabel: {
    fontSize: 11,
    fontFamily: FontFamily.medium,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  positionBigValue: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: FontFamily.bold,
    fontVariant: ['tabular-nums'],
  },
  pnlSubText: {
    fontSize: 11,
    fontFamily: FontFamily.semibold,
    marginTop: 2,
  },
  supplyTotalBadge: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.medium,
  },
  stackedBarTrack: {
    height: 12,
    flexDirection: 'row',
    borderRadius: Radius.full,
    overflow: 'hidden',
    backgroundColor: 'rgba(128,128,128,0.15)',
    marginVertical: Space.sm,
  },
  barSegment: {
    height: '100%',
  },
  barLegendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.md,
    marginTop: Space.xs,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendColorBox: {
    width: 8,
    height: 8,
    borderRadius: Radius.full,
  },
  legendText: {
    fontSize: 11,
    fontFamily: FontFamily.regular,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  linkText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.semibold,
  },
  rightsBlock: {
    gap: Space.sm,
    marginTop: Space.xs,
  },
  actionList: {
    gap: Space.xs,
  },
  rightRow: {
    flexDirection: 'row',
    gap: Space.sm,
    alignItems: 'flex-start',
  },
  rightIconCol: {
    marginTop: 2,
  },
  rightInfoCol: {
    flex: 1,
  },
  rightTitle: {
    fontSize: TypographyV2.captionElevated.size,
    fontFamily: FontFamily.semibold,
    marginBottom: 2,
  },
  rightDetail: {
    fontSize: 12,
    fontFamily: FontFamily.regular,
    lineHeight: 16,
  },
  distributionSummary: {
    marginTop: Space.xs,
  },
  distribTop: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  distribAmount: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: FontFamily.bold,
  },
  distribDate: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.regular,
  },
  distribPerUnit: {
    fontSize: 12,
    fontFamily: FontFamily.regular,
    marginTop: 2,
  },
  noDistributionNotice: {
    paddingVertical: Space.xs,
  },
  noDistributionText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.regular,
    lineHeight: 18,
  },
});
