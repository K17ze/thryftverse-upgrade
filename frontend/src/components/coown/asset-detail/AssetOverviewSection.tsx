import React from 'react';
import { View, Text, StyleSheet, Pressable, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Space, FontFamily, PressScale } from '../../../theme/designTokens';
import { TypographyV2 } from '../../../theme/typography.v2';
import { useAppTheme } from '../../../theme/ThemeContext';
import { formatCoOwnIze } from '../../../utils/currency';
import { useFormattedPrice } from '../../../hooks/useFormattedPrice';
import type { MarketCoOwnAsset } from '../../../services/marketApi';
import {
  CommerceDetailDisclosureRow,
  CommerceDetailSection,
  CommerceDetailMetricRow,
  CommerceDetailUnavailableInline,
} from '../../commerce/detail';
import { CoOwnPriceChart, CoOwnCandleChart, type CoOwnCandleRange } from '../';
import type { AssetLifecycleState, CandleDataPoint, DossierDocument } from './types';

/**
 * Asset overview section — asset story, compact price history,
 * important evidence, and latest material update.
 *
 * Rendered as a progressive-disclosure chapter. The orchestrator
 * passes all derived data; this component is purely presentational.
 */
export interface AssetOverviewSectionProps {
  asset: MarketCoOwnAsset;
  // Price history
  candleData: CandleDataPoint[];
  hasCandleData: boolean;
  candleRange: CoOwnCandleRange;
  onCandleRangeChange: (range: CoOwnCandleRange) => void;
  showVolume: boolean;
  lastExecutionPriceGbp: number | null;
  // Valuation (important evidence)
  appraisedValuePerUnitGbp: number | null;
  referenceVsAppraisalPct: number | null;
  fundamentalsExpanded: boolean;
  onToggleFundamentals: () => void;
  // Dossier
  dossierSummary: string;
  dossierDocuments: DossierDocument[];
  hasDocuments: boolean;
  diligenceSectionExpanded: boolean;
  onToggleDiligence: () => void;
  // Navigation
  onOpenDiligence: () => void;
  onOpenRiskDisclosure: () => void;
  onNavigateToIssue: () => void;
  // Lifecycle
  lifecycleState: AssetLifecycleState;
}

export function AssetOverviewSection({
  asset,
  candleData,
  hasCandleData,
  candleRange,
  onCandleRangeChange,
  showVolume,
  lastExecutionPriceGbp,
  appraisedValuePerUnitGbp,
  referenceVsAppraisalPct,
  fundamentalsExpanded,
  onToggleFundamentals,
  dossierSummary,
  dossierDocuments,
  hasDocuments,
  diligenceSectionExpanded,
  onToggleDiligence,
  onOpenDiligence,
  onOpenRiskDisclosure,
  lifecycleState,
}: AssetOverviewSectionProps) {
  const { colors } = useAppTheme();
  const { formatFromFiat } = useFormattedPrice();

  const valuationUpdatedLabel = asset.appraisalValuedAt
    ? `Valuation updated ${new Date(asset.appraisalValuedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
    : null;

  // Trust facts — flat factual line tapping into the dossier.
  const trustFacts: string[] = [];
  if (asset.authenticityStatus === 'verified') trustFacts.push('Authenticated');
  if (asset.custodyInsured) trustFacts.push('Insured custody');
  if (asset.rights?.version) trustFacts.push(`Rights v${asset.rights.version}`);
  if (asset.appraisalValueGbp != null) trustFacts.push('Appraised');

  return (
    <>
      {/* ── Asset story — quiet editorial paragraph ── */}
      {asset.provenance ? (
        <View style={styles.assetStoryWrap}>
          <Text
            style={[styles.assetStoryText, { color: colors.textSecondary }]}
            numberOfLines={3}
            maxFontSizeMultiplier={2}
          >
            {asset.provenance}
          </Text>
          <Pressable
            onPress={onOpenDiligence}
            hitSlop={8}
            style={({ pressed }) => [styles.assetStoryLink, pressed && { opacity: 0.85, transform: [{ scale: PressScale.gentle }] }]}
            accessibilityRole="button"
            accessibilityLabel="Read full asset story"
          >
            <Text style={[styles.assetStoryLinkText, { color: colors.brand }]}>
              Read the full story
            </Text>
            <Ionicons name="chevron-forward" size={14} color={colors.brand} />
          </Pressable>
        </View>
      ) : null}

      {/* Trust — flat factual line */}
      {trustFacts.length > 0 ? (
        <Pressable
          onPress={() => onToggleDiligence()}
          hitSlop={4}
          style={({ pressed }) => [styles.trustFactualLine, pressed && { opacity: 0.85, transform: [{ scale: PressScale.gentle }] }]}
          accessibilityRole="button"
          accessibilityLabel={`Trust facts: ${trustFacts.join(', ')}. View asset dossier.`}
        >
          <Text style={[styles.trustFactualText, { color: colors.textSecondary }]}>
            {trustFacts.join(' · ')}
          </Text>
          <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
        </Pressable>
      ) : null}

      {/* ── Compact price history ── */}
      <CoOwnPriceChart
        assetId={asset.id}
        unitPriceGbp={asset.unitPriceGbp}
        marketMovePct24h={asset.marketMovePct24h ?? null}
        volume24hGbp={asset.volume24hGbp ?? null}
        lastAgeSeconds={undefined}
        change24hTimestamp={undefined}
        candleChart={
          hasCandleData ? (
            <CoOwnCandleChart
              candles={candleData}
              range={candleRange}
              onRangeChange={onCandleRangeChange}
              showVolume={showVolume}
              lastPrice={lastExecutionPriceGbp ?? undefined}
              lastAgeSeconds={undefined}
            />
          ) : undefined
        }
      />

      {/* ═══ Asset dossier — evidence, valuation, documents, custody,
          insurance, risks, audit trail ═══ */}
      <CommerceDetailDisclosureRow
        label={diligenceSectionExpanded ? 'Hide asset dossier' : 'Asset dossier'}
        summary={dossierSummary || undefined}
        onPress={onToggleDiligence}
        leadingIcon="document-text-outline"
        accessibilityLabel="Toggle asset dossier"
      />
      {diligenceSectionExpanded ? (
        <CommerceDetailSection label="Asset dossier" variant="continuation">
          {/* Stale market mark — inside the relevant chapter */}
          {asset.staleMarkDays != null && asset.staleMarkDays > 7 && (
            <CommerceDetailMetricRow
              label="Market activity"
              value={`Pricing may be stale · ${asset.staleMarkDays}d since last market event`}
              muted
            />
          )}

          {/* ── Valuation ── */}
          <View style={styles.dossierSubHeader}>
            <Text style={[styles.dossierSubHeaderText, { color: colors.textMuted }]}>
              Valuation
            </Text>
          </View>
          <CommerceDetailDisclosureRow
            label={fundamentalsExpanded ? 'Hide valuation' : 'Valuation'}
            summary={
              appraisedValuePerUnitGbp != null
                ? `${formatFromFiat(appraisedValuePerUnitGbp, 'GBP')} / unit`
                : 'Reporting'
            }
            onPress={onToggleFundamentals}
            leadingIcon="analytics-outline"
          />
          {fundamentalsExpanded ? (
            <View style={[styles.valuationStack, { borderTopColor: colors.border }]}>
              <View style={styles.valuationRow}>
                <Text style={[styles.valuationLabel, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.4}>
                  Appraised value / unit
                </Text>
                <Text style={[styles.valuationValue, { color: colors.textPrimary }]} maxFontSizeMultiplier={1.4}>
                  {appraisedValuePerUnitGbp != null ? formatFromFiat(appraisedValuePerUnitGbp, 'GBP') : 'Not available'}
                </Text>
              </View>
              <View style={styles.valuationRow}>
                <Text style={[styles.valuationLabel, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.4}>
                  Reference vs appraisal
                </Text>
                <Text style={[styles.valuationValue, { color: colors.textPrimary }]} maxFontSizeMultiplier={1.4}>
                  {referenceVsAppraisalPct != null
                    ? `${referenceVsAppraisalPct >= 0 ? '+' : ''}${referenceVsAppraisalPct.toFixed(1)}%`
                    : 'Not available'}
                </Text>
              </View>
              <View style={styles.valuationRow}>
                <Text style={[styles.valuationLabel, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.4}>
                  Total appraisal
                </Text>
                <Text style={[styles.valuationValue, { color: colors.textPrimary }]} maxFontSizeMultiplier={1.4}>
                  {asset.appraisalValueGbp != null ? formatFromFiat(asset.appraisalValueGbp, 'GBP') : 'Not available'}
                </Text>
              </View>
              <View style={styles.valuationRow}>
                <Text style={[styles.valuationLabel, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.4}>
                  {valuationUpdatedLabel ?? 'Valuation updated'}
                </Text>
                <Text style={[styles.valuationValue, { color: colors.textPrimary }]} maxFontSizeMultiplier={1.4}>
                  {asset.appraisalValuer ?? 'Independent appraisal'}
                </Text>
              </View>
            </View>
          ) : null}

          {/* ── Documents ── */}
          {hasDocuments ? (
            <View style={styles.dossierSubHeader}>
              <Text style={[styles.dossierSubHeaderText, { color: colors.textMuted }]}>
                Documents
              </Text>
            </View>
          ) : null}
          {hasDocuments
            ? dossierDocuments.map((doc) => (
                <CommerceDetailDisclosureRow
                  key={doc.label}
                  label={doc.label}
                  onPress={() => { void Linking.openURL(doc.url); }}
                  leadingIcon="document-text-outline"
                  accessibilityLabel={doc.accessibilityLabel}
                />
              ))
            : null}

          {/* ── Custody / storage ── */}
          <View style={styles.dossierSubHeader}>
            <Text style={[styles.dossierSubHeaderText, { color: colors.textMuted }]}>
              Custody / storage
            </Text>
          </View>
          <CommerceDetailMetricRow
            label="Custodian"
            value={asset.custodianName ?? 'Not disclosed'}
            muted={!asset.custodianName}
          />
          <CommerceDetailMetricRow
            label="Location"
            value={asset.custodianLocation ?? 'Not disclosed'}
            muted={!asset.custodianLocation}
          />

          {/* ── Insurance ── */}
          <View style={styles.dossierSubHeader}>
            <Text style={[styles.dossierSubHeaderText, { color: colors.textMuted }]}>
              Insurance
            </Text>
          </View>
          <CommerceDetailMetricRow
            label="Insured"
            value={asset.custodyInsured ? 'Yes' : 'Not insured'}
            muted={!asset.custodyInsured}
          />
          {asset.custodyPolicyRef ? (
            <CommerceDetailMetricRow label="Policy ref" value={asset.custodyPolicyRef} />
          ) : null}

          {/* ── Risks ── */}
          <View style={styles.dossierSubHeader}>
            <Text style={[styles.dossierSubHeaderText, { color: colors.textMuted }]}>
              Risks
            </Text>
          </View>
          <CommerceDetailDisclosureRow
            label="Risk disclosure"
            onPress={onOpenRiskDisclosure}
            leadingIcon="warning-outline"
            accessibilityLabel="View risks"
          />

          {/* ── Audit trail ── */}
          <View style={styles.dossierSubHeader}>
            <Text style={[styles.dossierSubHeaderText, { color: colors.textMuted }]}>
              Audit trail
            </Text>
          </View>
          <CommerceDetailDisclosureRow
            label="Full due diligence"
            summary="Provenance · authentication · audit"
            onPress={onOpenDiligence}
            leadingIcon="document-text-outline"
            accessibilityLabel="View full due diligence"
          />
        </CommerceDetailSection>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  assetStoryWrap: {
    paddingHorizontal: Space.md,
    paddingTop: Space.md,
    paddingBottom: Space.sm,
    gap: Space.xs,
  },
  assetStoryText: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: FontFamily.regular,
    letterSpacing: TypographyV2.body.letterSpacing,
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
  valuationStack: {
    marginTop: Space.lg,
    paddingTop: Space.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: Space.md,
  },
  valuationRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: Space.sm,
  },
  valuationLabel: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.regular,
    letterSpacing: TypographyV2.meta.letterSpacing,
    flexShrink: 0,
  },
  valuationValue: {
    fontSize: TypographyV2.bodyStrong.size,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
    fontFamily: FontFamily.semibold,
    letterSpacing: TypographyV2.bodyStrong.letterSpacing,
    fontVariant: ['tabular-nums'] as ['tabular-nums'],
    textAlign: 'right',
    flexShrink: 1,
  },
});
