import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Space, FontFamily, Radius } from '../../../theme/designTokens';
import { TypographyV2 } from '../../../theme/typography.v2';
import { useAppTheme } from '../../../theme/ThemeContext';
import { formatCoOwnIze } from '../../../utils/currency';
import type { CoOwnCorporateAction, CoOwnDistribution, MarketCoOwnAsset } from '../../../services/marketApi';
import { CoOwnCorporateActionRow, type CoOwnCorporateActionStatus, type CoOwnCorporateActionType } from '../';
import { CommerceDetailDisclosureRow, CommerceDetailSection } from '../../commerce/detail';
import { formatDayMonth, corporateActionAmountLabel } from './corporateActionHelpers';

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
  /** Total distinct holder count from the asset contract. */
  holderCount?: number | null;
  onOpenRights: () => void;
  /** Versioned, backend-published rights document. */
  rights?: MarketCoOwnAsset['rights'];
  lastDistribution: CoOwnDistribution | null;
  lastDistributionAmount: number | null;
  lastDistributionDate: string | null;
  lastDistributionPerUnit: number | null;
  onNavigateToDistributionHistory: () => void;
  /** True when the distributions fetch failed — quiet inline line instead of rows. */
  distributionsFailed?: boolean;
  /** True while the distributions fetch is in flight — quiet loading line. */
  distributionsLoading?: boolean;
  /** Latest corporate actions, already limited (null = not loaded / failed). */
  corporateActions: CoOwnCorporateAction[] | null;
  /** True when the corporate actions fetch failed — events block shows a quiet unavailable line. */
  corporateActionsFailed?: boolean;
  /** True while the corporate actions fetch is in flight. */
  corporateActionsLoading?: boolean;
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
  holderCount,
  onOpenRights,
  rights,
  lastDistribution,
  lastDistributionAmount,
  lastDistributionDate,
  lastDistributionPerUnit,
  onNavigateToDistributionHistory,
  distributionsFailed,
  distributionsLoading = false,
  corporateActions,
  corporateActionsFailed,
  corporateActionsLoading = false,
  onNavigateToCorporateAction,
  onOpenBuyout,
}: AssetOwnershipSectionProps) {
  const { colors } = useAppTheme();

  const isUp = unrealizedPnlGbp != null && unrealizedPnlGbp >= 0;
  // Financial direction token pair — coownUp/coownDown are the documented
  // tokens for position P/L (ThemeContext), not success/warning.
  const pnlColor = isUp ? colors.coownUp : colors.coownDown;
  const publishedRights = [
    { label: 'Economic rights', detail: rights?.economicRights },
    { label: 'Voting & governance', detail: rights?.votingRights },
    { label: 'Exit & proceeds', detail: rights?.exitRights },
    { label: 'Operating costs', detail: rights?.feeRights },
  ].filter((row): row is { label: string; detail: string } => Boolean(row.detail));

  return (
    <View style={styles.container}>
      {/* ── 1. Your Position — flat metric row, no tinted card ──
          Stock-broker pattern: position metrics sit directly on canvas
          with hairline separators, like Robinhood's "Your position" row. */}
      {isHolder && yourUnits != null && yourUnits > 0 ? (
        <View style={[styles.positionBlock, { borderTopColor: colors.border }]}>
          <View style={styles.positionHeaderRow}>
            <Text style={[styles.positionHeading, { color: colors.textPrimary }]}>Your position</Text>
            {viewerPct != null ? (
              <Text style={[styles.positionPct, { color: colors.textSecondary }]}>
                {viewerPct}% of asset
              </Text>
            ) : null}
          </View>

          <View style={styles.positionMetricsRow}>
            <View style={styles.positionMetricCol}>
              <Text style={[styles.metaLabel, { color: colors.textMuted }]}>Units</Text>
              <Text style={[styles.positionBigValue, { color: colors.textPrimary }]}>{yourUnits}</Text>
            </View>
            <View style={[styles.positionMetricCol, { borderLeftColor: colors.borderSubtle }]}>
              <Text style={[styles.metaLabel, { color: colors.textMuted }]}>Cost basis</Text>
              <Text style={[styles.positionBigValue, { color: colors.textPrimary }]}>
                {avgEntryPriceGbp != null ? formatCoOwnIze(avgEntryPriceGbp * yourUnits) : '—'}
              </Text>
            </View>
            <View style={[styles.positionPnlCol, { borderLeftColor: colors.borderSubtle }]}>
              <Text style={[styles.metaLabel, { color: colors.textMuted }]}>Unrealized P&L</Text>
              <Text style={[styles.positionPnlValue, { color: pnlColor }]}>
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

      {/* ── 2. Supply & Capital Structure — flat strip, no filled card ──
          Thin progress bar + legend directly on canvas. Hairline-separated
          from the position block above. */}
      <View style={[styles.supplyBlock, { borderTopColor: colors.border }]}>
        <View style={styles.supplyHeaderRow}>
          <Text style={[styles.supplyHeading, { color: colors.textPrimary }]}>Capital structure</Text>
          <Text style={[styles.supplyTotalBadge, { color: colors.textMuted }]}>
            {totalUnits} units
          </Text>
        </View>

        {/* Proportional horizontal stacked bar */}
        <View style={[styles.stackedBarTrack, { backgroundColor: colors.border }]}>
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
              Other co-owners ({Math.max(0, totalUnits - availableUnits - (yourUnits || 0))})
            </Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendColorBox, { backgroundColor: colors.success }]} />
            <Text style={[styles.legendText, { color: colors.textSecondary }]}>
              Available ({availableUnits})
            </Text>
          </View>
        </View>

        {/* Holder count context — factual transparency line */}
        {holderCount != null ? (
          <Text style={[styles.holderCountLine, { color: colors.textMuted }]}>
            {holderCount} {holderCount === 1 ? 'co-owner' : 'co-owners'} · {Math.round((1 - availableSegmentPct / 100) * 100)}% allocated
          </Text>
        ) : null}
      </View>

      {/* ── 3. Governance, Decisions & Exit Rules — flat section ── */}
      <CommerceDetailSection
        label="Decisions & Exit Rules"
        trailing={
          <Pressable
            onPress={onOpenRights}
            hitSlop={8}
            style={({ pressed }) => [styles.linkRow, pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
            accessibilityLabel="View full rights agreement"
          >
            <Text style={[styles.linkText, { color: colors.brand }]}>Rights agreement</Text>
            <Ionicons name="chevron-forward" size={14} color={colors.brand} />
          </Pressable>
        }
      >
        {publishedRights.length > 0 ? (
          <View>
            {publishedRights.map((row, index) => (
              <View
                key={row.label}
                style={[styles.rightRow, index > 0 && styles.rightRowSeparated, index > 0 && { borderTopColor: colors.border }]}
              >
                <Text style={[styles.rightTitle, { color: colors.textPrimary }]}>{row.label}</Text>
                <Text style={[styles.rightDetail, { color: colors.textSecondary }]}>{row.detail}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={[styles.noDistributionText, { color: colors.textMuted }]}>Rights details not published yet.</Text>
        )}

        <CommerceDetailDisclosureRow
          label="Buyout offers"
          summary="Whole-asset acquisition offers"
          onPress={onOpenBuyout}
          accessibilityLabel="View buyout offers for this asset"
        />
      </CommerceDetailSection>

      {/* ── 4. Corporate actions & events ──
          Latest lifecycle events as timeline rows. Omitted when nothing
          has been published; a failed fetch keeps the block with a
          quiet unavailable line. */}
      {(corporateActions?.length || corporateActionsFailed || corporateActionsLoading) ? (
        <CommerceDetailSection label="Corporate actions & events">
          {corporateActions && corporateActions.length > 0 ? (
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
          ) : corporateActionsLoading ? (
            <Text style={[styles.noDistributionText, { color: colors.textMuted }]}>Loading events…</Text>
          ) : (
            <Text style={[styles.noDistributionText, { color: colors.textMuted }]}>Events unavailable</Text>
          )}
        </CommerceDetailSection>
      ) : null}

      {/* ── 5. Distributions & Yield — flat section ── */}
      <CommerceDetailSection
        label="Distributions & Yield"
        trailing={
          <Pressable
            onPress={onNavigateToDistributionHistory}
            hitSlop={8}
            style={({ pressed }) => [styles.linkRow, pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
            accessibilityLabel="View distributions history"
          >
            <Text style={[styles.linkText, { color: colors.brand }]}>History</Text>
            <Ionicons name="chevron-forward" size={14} color={colors.brand} />
          </Pressable>
        }
      >
        {lastDistribution ? (
          <View style={styles.distributionSummary}>
            {/* Per-unit payout dominates — it is what each unit received.
                Total pool and settled date ride as the supporting line. */}
            <View style={styles.distribTop}>
              <Text style={[styles.distribAmount, { color: colors.textPrimary }]}>
                {lastDistributionPerUnit != null ? formatCoOwnIze(lastDistributionPerUnit) : '—'}
              </Text>
              <Text style={[styles.distribDate, { color: colors.textMuted }]}>
                {lastDistributionDate || 'Settled'}
              </Text>
            </View>
            <Text style={[styles.distribPerUnit, { color: colors.textSecondary }]}>
              {lastDistributionPerUnit != null
                ? `per unit${lastDistributionAmount != null ? ` · ${formatCoOwnIze(lastDistributionAmount)} total pool` : ''}`
                : 'Most recent payout'}
            </Text>
          </View>
        ) : distributionsLoading ? (
          <View style={styles.noDistributionNotice}>
            <Text style={[styles.noDistributionText, { color: colors.textMuted }]}>
              Loading distributions…
            </Text>
          </View>
        ) : distributionsFailed ? (
          <View style={styles.noDistributionNotice}>
            <Text style={[styles.noDistributionText, { color: colors.textMuted }]}>
              Distribution history unavailable
            </Text>
          </View>
        ) : (
          <View style={styles.noDistributionNotice}>
            <Text style={[styles.noDistributionText, { color: colors.textMuted }]}>
              No distributions settled yet.
            </Text>
          </View>
        )}
      </CommerceDetailSection>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Space.md,
    paddingTop: Space.md,
    gap: Space.lg,
  },
  // ── Flat position block — no card fill, hairline top border ──
  positionBlock: {
    paddingTop: Space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  positionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: Space.sm,
  },
  positionHeading: {
    fontSize: TypographyV2.sectionTitle.size,
    lineHeight: TypographyV2.sectionTitle.lineHeight,
    fontFamily: FontFamily.bold,
  },
  positionPct: {
    fontSize: TypographyV2.captionElevated.size,
    fontFamily: FontFamily.medium,
  },
  positionMetricsRow: {
    flexDirection: 'row',
  },
  positionMetricCol: {
    flex: 1,
    paddingLeft: Space.sm,
  },
  positionPnlCol: {
    flex: 1.4,
    paddingLeft: Space.sm,
  },
  metaLabel: {
    fontSize: TypographyV2.label.size,
    lineHeight: TypographyV2.label.lineHeight,
    fontFamily: TypographyV2.label.fontFamily,
    letterSpacing: TypographyV2.label.letterSpacing,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  positionBigValue: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: FontFamily.bold,
    fontVariant: ['tabular-nums'],
  },
  positionPnlValue: {
    fontSize: TypographyV2.priceList.size,
    lineHeight: TypographyV2.priceList.lineHeight,
    fontFamily: FontFamily.bold,
    fontVariant: ['tabular-nums'],
  },
  pnlSubText: {
    fontSize: TypographyV2.caption.size,
    fontFamily: FontFamily.semibold,
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
  // ── Flat supply block — no card fill, hairline top border ──
  supplyBlock: {
    paddingTop: Space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  supplyHeaderRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: Space.xs,
  },
  supplyHeading: {
    fontSize: TypographyV2.sectionTitle.size,
    lineHeight: TypographyV2.sectionTitle.lineHeight,
    fontFamily: FontFamily.bold,
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
  holderCountLine: {
    fontSize: 11,
    fontFamily: FontFamily.medium,
    marginTop: Space.xs,
    fontVariant: ['tabular-nums'],
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
  actionList: {
    gap: Space.xs,
  },
  // Flat rule rows — hairline-separated directly on the canvas, no icons.
  rightRow: {
    paddingVertical: Space.sm,
  },
  rightRowSeparated: {
    borderTopWidth: StyleSheet.hairlineWidth,
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
    fontVariant: ['tabular-nums'],
  },
  distribDate: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.regular,
  },
  distribPerUnit: {
    fontSize: 12,
    fontFamily: FontFamily.regular,
    marginTop: 2,
    fontVariant: ['tabular-nums'],
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
