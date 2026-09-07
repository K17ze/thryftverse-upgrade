import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Space, FontFamily, PressScale } from '../../../theme/designTokens';
import { TypographyV2 } from '../../../theme/typography.v2';
import { useAppTheme } from '../../../theme/ThemeContext';
import { formatCoOwnIze } from '../../../utils/currency';
import type { MarketCoOwnAsset, CoOwnDistribution } from '../../../services/marketApi';
import {
  CommerceDetailDisclosureRow,
  CommerceDetailSection,
  CommerceDetailMetricRow,
} from '../../commerce/detail';
import { OwnershipStructureBar, HolderPositionSummary } from '../../asset';
import { CANONICAL_RIGHTS_LABELS, type CoOwnRightsRow } from '../';
import type { AssetLifecycleState } from './types';

/**
 * Asset ownership section — your position, supply structure,
 * rights summary, expenses, distributions, and governance.
 *
 * For holders, the orchestrator renders this section before the
 * market section (viewer-aware composition). For non-holders it
 * appears after the market section.
 */
export interface AssetOwnershipSectionProps {
  asset: MarketCoOwnAsset;
  // Position
  isHolder: boolean;
  isIssuer: boolean;
  yourUnits: number | null;
  viewerPct: number | null;
  avgEntryPriceGbp: number | null;
  unrealizedPnlGbp: number | null;
  unrealizedPnlPct: number | null;
  // Supply structure
  yourSegmentPct: number;
  otherHoldersSegmentPct: number;
  availableSegmentPct: number;
  allocatedPct: number;
  availableUnits: number;
  totalUnits: number;
  // Rights
  rightsRows: CoOwnRightsRow[];
  hasIncompleteRights: boolean;
  onOpenRights: () => void;
  // Distributions
  lastDistribution: CoOwnDistribution | null;
  lastDistributionAmount: number | null;
  lastDistributionDate: string | null;
  lastDistributionPerUnit: number | null;
  onNavigateToDistributionHistory: () => void;
  // Expenses
  feePct: number;
  // Lifecycle
  lifecycleState: AssetLifecycleState;
}

export function AssetOwnershipSection({
  asset,
  isHolder,
  yourUnits,
  viewerPct,
  avgEntryPriceGbp,
  unrealizedPnlGbp,
  unrealizedPnlPct,
  yourSegmentPct,
  otherHoldersSegmentPct,
  availableSegmentPct,
  allocatedPct,
  availableUnits,
  totalUnits,
  rightsRows,
  hasIncompleteRights,
  onOpenRights,
  lastDistribution,
  lastDistributionAmount,
  lastDistributionDate,
  lastDistributionPerUnit,
  onNavigateToDistributionHistory,
  feePct,
  lifecycleState,
}: AssetOwnershipSectionProps) {
  const { colors } = useAppTheme();

  return (
    <>
      {/* ── Your position ── */}
      {isHolder && yourUnits != null && viewerPct != null ? (
        <HolderPositionSummary
          yourUnits={yourUnits}
          viewerPct={viewerPct}
          avgEntryPriceGbp={avgEntryPriceGbp}
          unrealizedPnlGbp={unrealizedPnlGbp}
          unrealizedPnlPct={unrealizedPnlPct}
        />
      ) : null}

      {/* ── Rights / distributions quick summary ── */}
      {isHolder ? (
        <Pressable
          onPress={onOpenRights}
          hitSlop={4}
          style={({ pressed }) => [styles.trustFactualLine, pressed && { opacity: 0.85, transform: [{ scale: PressScale.gentle }] }]}
          accessibilityRole="button"
          accessibilityLabel={
            lastDistributionAmount != null && lastDistributionDate != null
              ? `Last distribution ${formatCoOwnIze(lastDistributionAmount)} on ${lastDistributionDate}. Review rights.`
              : 'Voting rights and distributions. Review rights.'
          }
        >
          <Text style={[styles.trustFactualText, { color: colors.textSecondary }]} numberOfLines={1}>
            {lastDistributionAmount != null && lastDistributionDate != null
              ? `Last distribution ${formatCoOwnIze(lastDistributionAmount)} · ${lastDistributionDate}`
              : `Voting rights · Next distribution`}
          </Text>
          <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
        </Pressable>
      ) : null}

      {/* ── Supply structure ── */}
      {allocatedPct > 0 && (
        <View style={styles.supplyWrap}>
          <OwnershipStructureBar
            yourSegmentPct={yourSegmentPct}
            otherHoldersSegmentPct={otherHoldersSegmentPct}
            availableSegmentPct={availableSegmentPct}
            isHolder={isHolder}
            holderCount={asset.holders}
          />
        </View>
      )}

      {/* ═══ Ownership & rights chapter ═══ */}
      <CommerceDetailDisclosureRow
        label="Ownership & rights"
        summary={hasIncompleteRights ? 'Pending' : undefined}
        onPress={onOpenRights}
        leadingIcon="document-text-outline"
        accessibilityLabel="Review ownership and rights"
      />
      <CommerceDetailSection label="Ownership & rights" variant="continuation">
        {/* Rights version + transferable */}
        <CommerceDetailMetricRow
          label="Rights version"
          value={asset.rights?.version ? `v${asset.rights.version}` : 'Not published'}
          muted={!asset.rights?.version}
        />
        <CommerceDetailMetricRow
          label="Transferable"
          value={asset.rights ? (asset.rights.transferable ? 'Yes' : 'No') : 'To be confirmed'}
          muted={!asset.rights}
        />
        <CommerceDetailDisclosureRow
          label="Rights"
          count={CANONICAL_RIGHTS_LABELS.length}
          summary={hasIncompleteRights ? 'Pending' : undefined}
          onPress={onOpenRights}
          leadingIcon="document-text-outline"
          accessibilityLabel="Review rights"
        />

        {/* ── Governance / voting ── */}
        <View style={styles.dossierSubHeader}>
          <Text style={[styles.dossierSubHeaderText, { color: colors.textMuted }]}>
            Governance / voting
          </Text>
        </View>
        <CommerceDetailMetricRow
          label="Voting rights"
          value={asset.rights?.votingRights ?? 'To be confirmed'}
          muted={!asset.rights?.votingRights}
        />
        <CommerceDetailMetricRow
          label="Exit & proceeds"
          value={asset.rights?.exitRights ?? 'To be confirmed'}
          muted={!asset.rights?.exitRights}
        />

        {/* ── Expenses ── */}
        <View style={styles.dossierSubHeader}>
          <Text style={[styles.dossierSubHeaderText, { color: colors.textMuted }]}>
            Expenses
          </Text>
        </View>
        <CommerceDetailMetricRow
          label="Trading fee"
          value={`${feePct}%`}
        />
        <CommerceDetailMetricRow
          label="Operating costs"
          value={asset.rights?.feeRights ?? 'To be confirmed'}
          muted={!asset.rights?.feeRights}
        />

        {/* ── Distributions ── */}
        <View style={styles.dossierSubHeader}>
          <Text style={[styles.dossierSubHeaderText, { color: colors.textMuted }]}>
            Distributions
          </Text>
        </View>
        <CommerceDetailMetricRow
          label="Next distribution"
          value={asset.rights?.economicRights ?? 'Not scheduled'}
          muted={!asset.rights?.economicRights}
        />
        {lastDistribution != null && lastDistributionAmount != null ? (
          <>
            <CommerceDetailMetricRow
              label="Last distribution"
              value={formatCoOwnIze(lastDistributionAmount)}
            />
            {lastDistributionDate != null && (
              <CommerceDetailMetricRow
                label="Last distribution date"
                value={lastDistributionDate}
              />
            )}
            {lastDistributionPerUnit != null && (
              <CommerceDetailMetricRow
                label="Per unit"
                value={formatCoOwnIze(lastDistributionPerUnit)}
              />
            )}
            {lastDistribution.distributionType && (
              <CommerceDetailMetricRow
                label="Type"
                value={lastDistribution.distributionType}
                muted
              />
            )}
            <Pressable
              onPress={onNavigateToDistributionHistory}
              hitSlop={8}
              style={({ pressed }) => [styles.assetStoryLink, pressed && { opacity: 0.85, transform: [{ scale: PressScale.gentle }] }]}
              accessibilityRole="button"
              accessibilityLabel="View full distribution history"
            >
              <Text style={[styles.assetStoryLinkText, { color: colors.brand }]}>
                Distribution history
              </Text>
              <Ionicons name="chevron-forward" size={14} color={colors.brand} />
            </Pressable>
          </>
        ) : null}
      </CommerceDetailSection>
    </>
  );
}

const styles = StyleSheet.create({
  trustFactualLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingVertical: Space.md,
    gap: Space.xs,
  },
  trustFactualText: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: FontFamily.medium,
    letterSpacing: TypographyV2.body.letterSpacing,
  },
  supplyWrap: {
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    paddingBottom: Space.sm,
  },
  dossierSubHeader: {
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: Space.md,
    paddingTop: Space.md,
  },
  dossierSubHeaderText: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.semibold,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
  assetStoryLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingVertical: Space.xs,
  },
  assetStoryLinkText: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.semibold,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
});
