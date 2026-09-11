import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Space, FontFamily, Radius, Stroke } from '../../../theme/designTokens';
import { TypographyV2 } from '../../../theme/typography.v2';
import { useAppTheme } from '../../../theme/ThemeContext';
import { formatCoOwnIze } from '../../../utils/currency';
import type { CoOwnCorporateAction, CoOwnDistribution, MarketCoOwnAsset } from '../../../services/marketApi';
import { CoOwnCorporateActionRow, type CoOwnCorporateActionStatus, type CoOwnCorporateActionType } from '../';
import { CoOwnFeeSchedule, type CoOwnFeeScheduleEntry } from '../CoOwnFeeSchedule';
import { CoOwnDripToggle } from '../CoOwnDripToggle';
import { CoOwnDistributionCalendar, type CoOwnDistributionCalendarEntry } from '../CoOwnDistributionCalendar';
import { CommerceDetailDisclosureRow, CommerceDetailMetricRow } from '../../commerce/detail';
import { formatDayMonth, corporateActionAmountLabel } from './corporateActionHelpers';

export interface AssetOwnershipSectionProps {
  isHolder: boolean;
  yourUnits: number | null;
  viewerPct: number | null;
  reservedUnits?: number | null;
  sellableUnits?: number | null;
  holdingsLoading?: boolean;
  /** Current market value of the holder's position (units × unit price).
   * Robinhood-pattern position hero; null when price or units unknown. */
  positionValueGbp: number | null;
  /** Which price the mark uses — always labelled so the mark can never
   * be mistaken for estimated sale proceeds. */
  positionMarkBasis?: 'last trade' | 'reference price';
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
  /** ISO date when the position lockup / holding period ends. */
  lockupEndDate?: string | null;
  /** Active buyout offer price (GBP major). */
  activeBuyoutOfferPriceGbp?: number | null;
  /** Active buyout offer premium/discount vs last mark (percentage). */
  activeBuyoutOfferPremiumPct?: number | null;
  /** Active buyout offer expiry (ISO date). */
  activeBuyoutOfferExpiry?: string | null;
  /** Wave 10/11: Structured fee schedule (management / performance /
   * platform / sourcing). Undefined when the parent does not forward
   * the asset's feeSchedule — the disclosure is omitted (truthful
   * absence). Null when published but empty. */
  feeSchedule?: MarketCoOwnAsset['feeSchedule'];
  /** Distribution calendar entries (upcoming + recent). Undefined when
   * the parent does not supply a history list — the disclosure is
   * omitted. Empty array = no distributions scheduled. */
  distributionCalendarEntries?: CoOwnDistributionCalendarEntry[];
  /** DRIP (dividend reinvestment) support + enrollment. The toggle is
   * only rendered when the asset supports DRIP and the viewer holds
   * units. Undefined dripSupported = not supported (hidden). */
  dripSupported?: boolean;
  dripEnrolled?: boolean;
  onToggleDrip?: (enrolled: boolean) => void;
  dripPending?: boolean;
  dripError?: string | null;
  dripProjectedUnits?: number | null;
  /** Asset id — required by the CoOwnDripToggle contract for telemetry. */
  assetId?: string;
}

const ACTION_TYPE_MAP: Record<string, CoOwnCorporateActionType> = {
  distribution: 'distribution', operating_cost: 'operating_cost',
  new_issuance: 'new_issuance', split: 'split', consolidation: 'consolidation',
  buyback: 'buyback', compulsory_buyout: 'compulsory_buyout',
  revaluation: 'revaluation', insurance_proceeds: 'insurance_proceeds',
  liquidation: 'liquidation', vote: 'vote', governance: 'vote', exit: 'liquidation',
};

const ACTION_STATUS_MAP: Record<string, CoOwnCorporateActionStatus> = {
  announced: 'pending', open: 'pending', executing: 'effective',
  executed: 'effective', settled: 'completed', cancelled: 'cancelled',
};

export function AssetOwnershipSection({
  isHolder, yourUnits, viewerPct, reservedUnits, sellableUnits, holdingsLoading = false,
  positionValueGbp, positionMarkBasis = 'reference price',
  avgEntryPriceGbp, unrealizedPnlGbp, unrealizedPnlPct,
  yourSegmentPct, otherHoldersSegmentPct, availableSegmentPct,
  availableUnits, totalUnits, holderCount, onOpenRights, rights,
  lastDistribution, lastDistributionAmount, lastDistributionDate, lastDistributionPerUnit,
  onNavigateToDistributionHistory, distributionsFailed, distributionsLoading = false,
  corporateActions, corporateActionsFailed, corporateActionsLoading = false,
  onNavigateToCorporateAction, onOpenBuyout, lockupEndDate,
  activeBuyoutOfferPriceGbp, activeBuyoutOfferPremiumPct, activeBuyoutOfferExpiry,
  feeSchedule, distributionCalendarEntries,
  dripSupported, dripEnrolled, onToggleDrip, dripPending, dripError, dripProjectedUnits,
  assetId,
}: AssetOwnershipSectionProps) {
  const { colors } = useAppTheme();
  const [allocationExpanded, setAllocationExpanded] = useState(false);
  const [eventsExpanded, setEventsExpanded] = useState(false);
  const [feesExpanded, setFeesExpanded] = useState(false);
  const [calendarExpanded, setCalendarExpanded] = useState(false);
  const lockupMs = lockupEndDate ? new Date(lockupEndDate).getTime() : NaN;
  const lockupActive = Number.isFinite(lockupMs) && lockupMs > Date.now();
  const expiryMs = activeBuyoutOfferExpiry ? new Date(activeBuyoutOfferExpiry).getTime() : NaN;
  // The caller supplies an active offer; an invalid/elapsed explicit expiry
  // cannot confirm that it is still actionable.
  const hasActiveBuyout = activeBuyoutOfferPriceGbp != null
    && Number.isFinite(activeBuyoutOfferPriceGbp) && activeBuyoutOfferPriceGbp > 0
    && (!activeBuyoutOfferExpiry || (Number.isFinite(expiryMs) && expiryMs > Date.now()));
  const pnlPositive = unrealizedPnlGbp != null && unrealizedPnlGbp > 0;
  const pnlNegative = unrealizedPnlGbp != null && unrealizedPnlGbp < 0;
  const pnlColor = !pnlPositive && !pnlNegative ? colors.textMuted
    : pnlPositive ? colors.coownUp : colors.coownDown;
  const pnlBg = !pnlPositive && !pnlNegative ? undefined
    : pnlPositive ? colors.coownUpSubtle : colors.coownDownSubtle;
  const activeEvents = (corporateActions ?? []).filter(action =>
    ['open', 'announced', 'executing'].includes(action.status));
  const pastEvents = (corporateActions ?? []).filter(action =>
    !['open', 'announced', 'executing'].includes(action.status));
  const displayEvents = eventsExpanded ? [...activeEvents, ...pastEvents] : activeEvents;
  const showEvents = corporateActionsLoading || corporateActionsFailed
    || (corporateActions?.length ?? 0) > 0;
  const owned = isHolder && yourUnits != null && yourUnits > 0;
  const unitsLabel = (units: number) => `${units.toLocaleString('en-GB')} ${units === 1 ? 'unit' : 'units'}`;
  const lockupLabel = lockupActive
    ? `Locked until ${new Date(lockupMs).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
    : 'Lockup ended';
  // ── Ownership bar segments ──
  const hasOwnershipSegments = yourSegmentPct > 0
    || otherHoldersSegmentPct > 0 || availableSegmentPct > 0;
  // ── Distribution hero status chip ──
  const distStatus = lastDistribution?.status ?? '';
  const distSettled = distStatus === 'settled' || distStatus === 'paid';
  const distChipBg = distSettled ? colors.successSubtle : colors.warningSubtle;
  const distChipColor = distSettled ? colors.success : colors.warning;
  const distChipLabel = distSettled ? 'Settled'
    : distStatus === 'scheduled' ? 'Scheduled' : 'Pending';
  // ── Per-unit yield on reference price ──
  // Derived from the position mark (market value / units) so the yield
  // is always truthful and requires no extra prop wiring.
  const perUnitReference = owned && positionValueGbp != null
    && yourUnits != null && yourUnits > 0
    ? positionValueGbp / yourUnits : null;
  const distributionYieldPct = perUnitReference != null
    && perUnitReference > 0 && lastDistributionPerUnit != null
    ? (lastDistributionPerUnit / perUnitReference) * 100 : null;

  // ── Fee schedule entries (Wave 10/11) ──
  // Map the asset's structured feeSchedule into the row contract the
  // CoOwnFeeSchedule component expects. Only fees with a non-null value
  // are included; when every fee is null the entries array is empty and
  // the component renders its truthful "No fees disclosed" state.
  const feeEntries: CoOwnFeeScheduleEntry[] = feeSchedule ? (
    [
      feeSchedule.managementFeePct != null
        ? { label: 'Management fee', ratePct: feeSchedule.managementFeePct, isRecurring: true }
        : null,
      feeSchedule.performanceFeePct != null
        ? { label: 'Performance fee', ratePct: feeSchedule.performanceFeePct }
        : null,
      feeSchedule.platformFeePct != null
        ? { label: 'Platform fee', ratePct: feeSchedule.platformFeePct, isRecurring: true }
        : null,
      feeSchedule.sourcingFeeGbp != null
        ? { label: 'Sourcing fee', fixedGbp: feeSchedule.sourcingFeeGbp }
        : null,
    ] as (CoOwnFeeScheduleEntry | null)[]
  ).filter((e): e is CoOwnFeeScheduleEntry => e != null) : [];
  // Show the disclosure only when the parent forwards feeSchedule data.
  // Absence of the prop = absence of the section (truthful).
  const showFeeSchedule = feeSchedule !== undefined;
  const feeScheduleEmpty = feeEntries.length === 0;

  // ── DRIP toggle visibility ──
  // Only holders with units see the reinvestment toggle, and only when
  // the asset supports DRIP and a toggle handler is wired.
  const showDripToggle = owned
    && dripSupported === true
    && typeof onToggleDrip === 'function';

  // ── Distribution calendar visibility ──
  // Show the disclosure only when the parent supplies calendar entries.
  const showCalendar = distributionCalendarEntries !== undefined;

  return (
    <View style={styles.container}>
      {/* 1 ─ Position hero — the dominant panel above the fold. */}
      <View style={styles.section}>
        <Text accessibilityRole="header" style={[styles.heading, { color: colors.textPrimary }]}>
          {owned ? 'Your position' : 'Ownership'}
        </Text>
        {owned ? (
          <>
            <View style={styles.positionRow}>
              <Text style={[styles.positionValue, { color: colors.textPrimary }]}>
                {positionValueGbp != null ? formatCoOwnIze(positionValueGbp) : 'Value unavailable'}
              </Text>
              {unrealizedPnlGbp != null ? (
                <View style={[styles.pnlBadge, { backgroundColor: pnlBg }]}>
                  <Text style={[styles.pnlBadgeText, { color: pnlColor }]}>
                    {pnlPositive ? '+' : pnlNegative ? '−' : ''}{formatCoOwnIze(Math.abs(unrealizedPnlGbp))}
                    {unrealizedPnlPct != null
                      ? ` · ${unrealizedPnlPct > 0 ? '+' : unrealizedPnlPct < 0 ? '−' : ''}${Math.abs(unrealizedPnlPct).toFixed(1)}%`
                      : ''}
                  </Text>
                </View>
              ) : null}
            </View>
            <Text style={[styles.body, { color: colors.textSecondary }]}>
              {unitsLabel(yourUnits)}{viewerPct != null ? ` · ${viewerPct}% of asset` : ''}
            </Text>
            <Text style={[styles.caption, { color: colors.textMuted }]}>
              Indicative value at {positionMarkBasis}
            </Text>
            {/* Cost basis | Market value — two aligned columns, Robinhood-style.
                Replaces the stacked single-row layout so the two figures
                read as a comparison rather than two unrelated metric rows. */}
            <View style={[styles.costMarketRow, { borderTopColor: colors.borderSubtle }]}>
              <View style={styles.costMarketCol}>
                <Text style={[styles.costMarketLabel, { color: colors.textSecondary }]}>
                  Cost basis
                </Text>
                <Text style={[styles.costMarketValue, { color: colors.textPrimary }]}>
                  {avgEntryPriceGbp != null ? formatCoOwnIze(avgEntryPriceGbp * yourUnits) : 'Unavailable'}
                </Text>
              </View>
              <View style={[styles.costMarketDivider, { backgroundColor: colors.borderSubtle }]} />
              <View style={styles.costMarketCol}>
                <Text style={[styles.costMarketLabel, { color: colors.textSecondary }]}>
                  Market value
                </Text>
                <Text style={[styles.costMarketValue, { color: colors.textPrimary }]}>
                  {positionValueGbp != null ? formatCoOwnIze(positionValueGbp) : 'Unavailable'}
                </Text>
              </View>
            </View>
            {sellableUnits != null ? (
              <CommerceDetailMetricRow label="Unreserved units" value={unitsLabel(sellableUnits)}
                subLabel="Subject to transfer terms" />
            ) : null}
            {reservedUnits != null && reservedUnits > 0 ? (
              <CommerceDetailMetricRow label="Reserved in orders" value={unitsLabel(reservedUnits)} />
            ) : null}
          </>
        ) : (
          <Text style={[styles.body, { color: colors.textSecondary }]} accessibilityLiveRegion="polite">
            {holdingsLoading ? 'Loading your position…'
              : yourUnits == null ? 'Your position is unavailable.'
                : yourUnits === 0 ? 'You do not own units in this asset.' : 'Your position is unavailable.'}
          </Text>
        )}
        <CommerceDetailMetricRow label="Available to buy"
          value={`${availableUnits.toLocaleString('en-GB')} of ${totalUnits.toLocaleString('en-GB')} units`} />
        {/* Stacked ownership bar — always visible breakdown of the asset
            supply. Replaces the collapsed disclosure as the primary
            ownership visualization. The disclosure below retains the
            numeric details (holder count, allocated units, avg entry). */}
        {hasOwnershipSegments ? (
          <View style={styles.ownershipBarBlock}>
            <View style={[styles.ownershipBar, { backgroundColor: colors.borderSubtle }]}>
              {yourSegmentPct > 0 ? (
                <View style={[styles.ownershipSegment, { flex: yourSegmentPct, backgroundColor: colors.coownUpSubtle }]} />
              ) : null}
              {otherHoldersSegmentPct > 0 ? (
                <View style={[styles.ownershipSegment, { flex: otherHoldersSegmentPct, backgroundColor: colors.surfaceAlt }]} />
              ) : null}
              {availableSegmentPct > 0 ? (
                <View style={[styles.ownershipSegment, { flex: availableSegmentPct, backgroundColor: colors.borderSubtle }]} />
              ) : null}
            </View>
            <View style={styles.ownershipLabels}>
              <View style={styles.ownershipLabelItem}>
                <View style={[styles.ownershipDot, { backgroundColor: colors.coownUpSubtle }]} />
                <Text style={[styles.caption, { color: colors.textSecondary }]}>
                  You {yourSegmentPct}%
                </Text>
              </View>
              <Text style={[styles.caption, { color: colors.textMuted }]}>·</Text>
              <View style={styles.ownershipLabelItem}>
                <View style={[styles.ownershipDot, { backgroundColor: colors.surfaceAlt }]} />
                <Text style={[styles.caption, { color: colors.textSecondary }]}>
                  Others {otherHoldersSegmentPct}%
                </Text>
              </View>
              <Text style={[styles.caption, { color: colors.textMuted }]}>·</Text>
              <View style={styles.ownershipLabelItem}>
                <View style={[styles.ownershipDot, { backgroundColor: colors.borderSubtle }]} />
                <Text style={[styles.caption, { color: colors.textSecondary }]}>
                  Available {availableSegmentPct}%
                </Text>
              </View>
            </View>
          </View>
        ) : (
          <Text style={[styles.caption, { color: colors.textMuted }]}>
            Ownership breakdown unavailable
          </Text>
        )}
        <Pressable onPress={() => setAllocationExpanded(value => !value)}
          accessibilityRole="button" accessibilityState={{ expanded: allocationExpanded }}
          accessibilityLabel="Ownership breakdown"
          style={({ pressed }) => [styles.disclosure, { borderTopColor: colors.borderSubtle }, pressed && styles.pressed]}>
          <Text style={[styles.body, styles.flex, { color: colors.textPrimary }]}>Ownership breakdown</Text>
          <Ionicons name={allocationExpanded ? 'chevron-up' : 'chevron-down'} size={20} color={colors.textMuted} />
        </Pressable>
        {allocationExpanded ? (
          <View>
            {holderCount != null ? (
              <CommerceDetailMetricRow label="Co-owners" value={holderCount.toLocaleString('en-GB')} />
            ) : null}
            <CommerceDetailMetricRow label="Allocated units"
              value={Math.max(0, totalUnits - availableUnits).toLocaleString('en-GB')} />
            {avgEntryPriceGbp != null && owned ? (
              <CommerceDetailMetricRow label="Average entry per unit" value={formatCoOwnIze(avgEntryPriceGbp)} />
            ) : null}
          </View>
        ) : null}
      </View>

      {/* 2 ─ Buyout offer CTA — a time-sensitive action, separated from
            the passive corporate-action event log. */}
      {hasActiveBuyout ? (
        <View style={[styles.section, styles.separated, { borderTopColor: colors.borderSubtle }]}>
          <Text accessibilityRole="header" style={[styles.heading, { color: colors.textPrimary }]}>
            Buyout offer
          </Text>
          <Pressable onPress={onOpenBuyout} accessibilityRole="button"
            accessibilityLabel="Review active buyout offer"
            style={({ pressed }) => [
              styles.offer,
              { backgroundColor: colors.warningSubtle, borderColor: colors.borderSubtle },
              pressed && styles.pressed,
            ]}>
            <View style={styles.offerBody}>
              <Text style={[styles.offerValue, { color: colors.textPrimary }]}>
                {formatCoOwnIze(activeBuyoutOfferPriceGbp!)}
              </Text>
              {activeBuyoutOfferPremiumPct != null && Number.isFinite(activeBuyoutOfferPremiumPct) ? (
                <Text style={[styles.caption, { color: colors.textSecondary }]}>
                  {Math.abs(activeBuyoutOfferPremiumPct).toFixed(1)}% {activeBuyoutOfferPremiumPct >= 0 ? 'above' : 'below'} last mark
                </Text>
              ) : null}
              {Number.isFinite(expiryMs) ? (
                <Text style={[styles.caption, { color: colors.warning }]}>
                  Expires {formatDayMonth(activeBuyoutOfferExpiry!)}
                </Text>
              ) : null}
            </View>
            <View style={styles.offerCta}>
              <Text style={[styles.offerCtaText, { color: colors.textPrimary }]}>Review</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </View>
          </Pressable>
        </View>
      ) : null}

      {/* 3 ─ Events — corporate actions as a progressive-disclosure log.
            Buyout offers are intentionally excluded (they own block 2). */}
      {showEvents ? (
        <View style={[styles.section, styles.separated, { borderTopColor: colors.borderSubtle }]}>
          <Text accessibilityRole="header" style={[styles.heading, { color: colors.textPrimary }]}>
            Ownership events
          </Text>
          {corporateActionsFailed ? (
            <Text accessibilityLiveRegion="polite" style={[styles.body, { color: colors.textMuted }]}>
              Events could not be refreshed.
            </Text>
          ) : null}
          {corporateActionsLoading && !corporateActions?.length ? (
            <Text accessibilityLiveRegion="polite" style={[styles.body, { color: colors.textMuted }]}>
              Loading events…
            </Text>
          ) : null}
          {displayEvents.map(action => {
            const rowType = ACTION_TYPE_MAP[action.actionType];
            const rowStatus = ACTION_STATUS_MAP[action.status];
            const dateSource = action.payableDate ?? action.recordDate ?? action.exDate ?? action.createdAt;
            if (!rowType || !rowStatus) {
              return <CommerceDetailDisclosureRow key={action.id} label={action.title}
                leadingIcon="document-text-outline"
                onPress={() => onNavigateToCorporateAction(action)} />;
            }
            return (
              <CoOwnCorporateActionRow key={action.id} type={rowType} status={rowStatus}
                dateLabel={Number.isFinite(new Date(dateSource).getTime()) ? formatDayMonth(dateSource) : 'Date unavailable'}
                effectLabel={action.title} amountLabel={corporateActionAmountLabel(action)}
                onPress={() => onNavigateToCorporateAction(action)} />
            );
          })}
          {pastEvents.length > 0 ? (
            <Pressable onPress={() => setEventsExpanded(value => !value)}
              accessibilityRole="button" accessibilityState={{ expanded: eventsExpanded }}
              style={({ pressed }) => [styles.disclosure, { borderTopColor: colors.borderSubtle }, pressed && styles.pressed]}>
              <Text style={[styles.body, styles.flex, { color: colors.textPrimary }]}>
                {eventsExpanded ? 'Hide past events' : `Past events (${pastEvents.length})`}
              </Text>
              <Ionicons name={eventsExpanded ? 'chevron-up' : 'chevron-down'} size={20} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {/* 4 ─ Rights & transfers — grouped into Transfers, Rights, Exit.
            The lockup restriction is surfaced as a prominent status chip. */}
      <View style={[styles.section, styles.separated, { borderTopColor: colors.borderSubtle }]}>
        <Text accessibilityRole="header" style={[styles.heading, { color: colors.textPrimary }]}>
          Rights & transfers
        </Text>
        <CommerceDetailMetricRow
          label="Transfers"
          value={typeof rights?.transferable === 'boolean'
            ? rights.transferable ? 'Permitted under agreement' : 'Not transferable'
            : 'Not published'}
          muted={typeof rights?.transferable !== 'boolean'}
          trailing={Number.isFinite(lockupMs) ? (
            <View style={[styles.lockupChip, { backgroundColor: lockupActive ? colors.warningSubtle : colors.surfaceAlt }]}>
              <Text style={[styles.lockupChipText, { color: lockupActive ? colors.warning : colors.textMuted }]}>
                {lockupLabel}
              </Text>
            </View>
          ) : undefined}
        />
        <CommerceDetailDisclosureRow label="Full rights agreement" onPress={onOpenRights} />
        {showFeeSchedule ? (
          <>
            <Pressable onPress={() => setFeesExpanded(value => !value)}
              accessibilityRole="button" accessibilityState={{ expanded: feesExpanded }}
              accessibilityLabel="Fee schedule"
              style={({ pressed }) => [styles.disclosure, { borderTopColor: colors.borderSubtle }, pressed && styles.pressed]}>
              <Text style={[styles.body, styles.flex, { color: colors.textPrimary }]}>Fee schedule</Text>
              <Ionicons name={feesExpanded ? 'chevron-up' : 'chevron-down'} size={20} color={colors.textMuted} />
            </Pressable>
            {feesExpanded ? (
              <CoOwnFeeSchedule fees={feeEntries} isEmpty={feeScheduleEmpty} />
            ) : null}
          </>
        ) : null}
        {!hasActiveBuyout ? (
          <CommerceDetailDisclosureRow label="Buyout offers" onPress={onOpenBuyout} />
        ) : null}
      </View>

      {/* 5 ─ Distributions — last distribution as a hero, history behind a
            disclosure. Clear empty / loading / error states. */}
      <View style={[styles.section, styles.separated, { borderTopColor: colors.borderSubtle }]}>
        <Text accessibilityRole="header" style={[styles.heading, { color: colors.textPrimary }]}>
          Distributions
        </Text>
        {lastDistribution ? (
          <>
            <View style={styles.distributionHeroRow}>
              <Text style={[styles.distributionValue, { color: colors.textPrimary }]}>
                {lastDistributionPerUnit != null ? `${formatCoOwnIze(lastDistributionPerUnit)} per unit` : 'Amount unavailable'}
              </Text>
              <View style={[styles.distChip, { backgroundColor: distChipBg }]}>
                <Text style={[styles.distChipText, { color: distChipColor }]}>
                  {distChipLabel}
                </Text>
              </View>
            </View>
            <Text style={[styles.caption, { color: colors.textSecondary }]}>
              {[lastDistribution.status.replace(/_/g, ' '), lastDistributionDate].filter(Boolean).join(' · ')}
            </Text>
            {distributionYieldPct != null ? (
              <Text style={[styles.caption, { color: colors.textSecondary }]}>
                {distributionYieldPct.toFixed(1)}% yield on reference
              </Text>
            ) : null}
            {lastDistributionAmount != null ? (
              <Text style={[styles.caption, { color: colors.textMuted }]}>
                {formatCoOwnIze(lastDistributionAmount)} total distribution
              </Text>
            ) : null}
          </>
        ) : (
          <Text style={[styles.body, { color: colors.textMuted }]} accessibilityLiveRegion="polite">
            {distributionsLoading ? 'Loading distributions…'
              : distributionsFailed ? 'Distribution history unavailable.' : 'No distributions yet.'}
          </Text>
        )}
        {lastDistribution && distributionsFailed ? (
          <Text style={[styles.caption, { color: colors.textMuted }]}>Could not refresh distributions.</Text>
        ) : null}
        {showDripToggle ? (
          <View style={[styles.dripBlock, { borderTopColor: colors.borderSubtle }]}>
            <CoOwnDripToggle
              assetId={assetId ?? ''}
              enrolled={dripEnrolled === true}
              onToggle={onToggleDrip!}
              pending={dripPending}
              error={dripError}
              projectedUnits={dripProjectedUnits}
            />
          </View>
        ) : null}
        <CommerceDetailDisclosureRow label="Distribution history" onPress={onNavigateToDistributionHistory} />
        {showCalendar ? (
          <>
            <Pressable onPress={() => setCalendarExpanded(value => !value)}
              accessibilityRole="button" accessibilityState={{ expanded: calendarExpanded }}
              accessibilityLabel="Distribution calendar"
              style={({ pressed }) => [styles.disclosure, { borderTopColor: colors.borderSubtle }, pressed && styles.pressed]}>
              <Text style={[styles.body, styles.flex, { color: colors.textPrimary }]}>Distribution calendar</Text>
              <Ionicons name={calendarExpanded ? 'chevron-up' : 'chevron-down'} size={20} color={colors.textMuted} />
            </Pressable>
            {calendarExpanded ? (
              <CoOwnDistributionCalendar
                entries={distributionCalendarEntries ?? []}
                userUnits={owned && yourUnits != null && yourUnits > 0 ? yourUnits : undefined}
              />
            ) : null}
          </>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: Space.md, paddingVertical: Space.md, gap: Space.sm },
  section: { gap: Space.xs },
  separated: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: Space.md },
  heading: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: FontFamily.semibold,
    marginBottom: Space.xs,
  },
  body: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: FontFamily.regular,
  },
  caption: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.regular,
  },
  // ── Position hero ──
  positionRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    gap: Space.sm,
  },
  positionValue: {
    fontSize: TypographyV2.priceList.size,
    lineHeight: TypographyV2.priceList.lineHeight,
    fontFamily: FontFamily.bold,
    fontVariant: ['tabular-nums'],
  },
  pnlBadge: {
    borderRadius: Radius.md,
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs,
  },
  pnlBadgeText: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: FontFamily.semibold,
    fontVariant: ['tabular-nums'],
  },
  // ── Cost basis | Market value two-column ──
  costMarketRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: Space.sm,
    marginTop: Space.sm,
  },
  costMarketCol: { flex: 1, gap: Space.xs },
  costMarketLabel: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.medium,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
  costMarketValue: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: FontFamily.semibold,
    fontVariant: ['tabular-nums'],
  },
  costMarketDivider: { width: StyleSheet.hairlineWidth, marginHorizontal: Space.md },
  // ── Stacked ownership bar ──
  ownershipBarBlock: { gap: Space.sm, paddingVertical: Space.xs },
  ownershipBar: {
    height: 8,
    flexDirection: 'row',
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  ownershipSegment: { height: 8 },
  ownershipLabels: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: Space.xs },
  ownershipLabelItem: { flexDirection: 'row', alignItems: 'center', gap: Space.xs },
  ownershipDot: { width: 8, height: 8, borderRadius: Radius.full },
  // ── Buyout offer CTA ──
  offer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingVertical: Space.sm,
    paddingHorizontal: Space.md,
    borderRadius: Radius.md,
    borderWidth: Stroke.standard,
    minHeight: 56,
  },
  offerBody: { flex: 1, gap: Space.xs },
  offerValue: {
    fontSize: TypographyV2.priceList.size,
    lineHeight: TypographyV2.priceList.lineHeight,
    fontFamily: FontFamily.bold,
    fontVariant: ['tabular-nums'],
  },
  offerCta: { flexDirection: 'row', alignItems: 'center', gap: Space.xs },
  offerCtaText: {
    fontSize: TypographyV2.bodyStrong.size,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
    fontFamily: FontFamily.semibold,
  },
  // ── Rights & transfers ──
  lockupChip: {
    borderRadius: Radius.md,
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs,
  },
  lockupChipText: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.semibold,
    fontVariant: ['tabular-nums'],
  },
  // ── Distributions hero ──
  distributionHeroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Space.sm,
  },
  distributionValue: {
    fontSize: TypographyV2.priceList.size,
    lineHeight: TypographyV2.priceList.lineHeight,
    fontFamily: FontFamily.bold,
    fontVariant: ['tabular-nums'],
  },
  distChip: {
    borderRadius: Radius.md,
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs,
  },
  distChipText: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.semibold,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
  // ── DRIP toggle block ──
  dripBlock: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Space.xs,
  },
  // ── Shared ──
  disclosure: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    minHeight: 48,
    paddingVertical: Space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  flex: { flex: 1, gap: Space.xs },
  pressed: { opacity: 0.85 },
});
