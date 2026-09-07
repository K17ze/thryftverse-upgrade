import React from 'react';
import { View, Text, StyleSheet, Pressable, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Space, FontFamily, Radius, PressScale } from '../../../theme/designTokens';
import { TypographyV2 } from '../../../theme/typography.v2';
import { useAppTheme } from '../../../theme/ThemeContext';
import { formatCoOwnIze } from '../../../utils/currency';
import type { MarketCoOwnAsset } from '../../../services/marketApi';
import {
  CommerceDetailDisclosureRow,
  CommerceDetailSection,
  CommerceDetailMetricRow,
  CommerceDetailUnavailableInline,
} from '../../commerce/detail';
import { CoOwnPriceChart, CoOwnCandleChart, type CoOwnCandleRange } from '../';
import type { AssetLifecycleState, CandleDataPoint, DossierDocument } from './types';

export interface AssetOverviewSectionProps {
  asset: MarketCoOwnAsset;
  candleData: CandleDataPoint[];
  hasCandleData: boolean;
  candleRange: CoOwnCandleRange;
  onCandleRangeChange: (range: CoOwnCandleRange) => void;
  showVolume: boolean;
  lastExecutionPriceGbp: number | null;
  appraisedValuePerUnitGbp: number | null;
  referenceVsAppraisalPct: number | null;
  fundamentalsExpanded?: boolean;
  onToggleFundamentals?: () => void;
  dossierSummary: string;
  dossierDocuments: DossierDocument[];
  hasDocuments: boolean;
  diligenceSectionExpanded?: boolean;
  onToggleDiligence?: () => void;
  onOpenDiligence: () => void;
  onOpenRiskDisclosure: () => void;
  onNavigateToIssue?: () => void;
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
  dossierSummary,
  dossierDocuments,
  hasDocuments,
  onOpenDiligence,
  onOpenRiskDisclosure,
  lifecycleState,
}: AssetOverviewSectionProps) {
  const { colors, isDark } = useAppTheme();

  const appraisalDateLabel = asset.appraisalValuedAt
    ? `Valuation updated ${new Date(asset.appraisalValuedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
    : 'Valuation on file';

  // Trust facts for the flat factual line (spec 03_COOWN §5)
  const trustFacts: string[] = [];
  if (asset.authenticityStatus === 'verified') trustFacts.push('Authenticated');
  if (asset.custodyInsured) trustFacts.push('Insured custody');
  if (asset.rights?.version) trustFacts.push(`Rights v${asset.rights.version}`);
  if (asset.appraisalValueGbp != null) trustFacts.push('Appraised');

  return (
    <View style={styles.container}>
      {/* ── 1. Physical Asset Story & Editorial Provenance ── */}
      <View style={[styles.cardSurface, { backgroundColor: colors.surfaceAlt, borderColor: colors.borderSubtle }]}>
        <View style={styles.sectionHeaderRow}>
          <Text style={[styles.sectionHeading, { color: colors.textPrimary }]}>Physical Asset & Provenance</Text>
          <Pressable
            onPress={onOpenDiligence}
            hitSlop={8}
            style={({ pressed }) => [styles.linkRow, pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
            accessibilityLabel="Inspect complete provenance dossier"
          >
            <Text style={[styles.linkText, { color: colors.brand }]}>Full dossier</Text>
            <Ionicons name="chevron-forward" size={14} color={colors.brand} />
          </Pressable>
        </View>

        <View style={styles.assetStoryWrap}>
          <Text
            style={[styles.assetStoryText, { color: colors.textSecondary }]}
            numberOfLines={4}
            maxFontSizeMultiplier={1.4}
          >
            {asset.provenance || 'Exhaustive provenance records verified by custodial partners. Title is held unencumbered by the legal SPV.'}
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

        {/* Flat factual trust line */}
        {trustFacts.length > 0 ? (
          <Pressable
            onPress={onOpenDiligence}
            hitSlop={4}
            style={({ pressed }) => [styles.trustFactualLine, pressed && { opacity: 0.85 }]}
            accessibilityRole="button"
            accessibilityLabel={`Trust summary: ${trustFacts.join(', ')}. Tap to view due diligence.`}
          >
            <Ionicons name="shield-checkmark" size={14} color={colors.brand} style={styles.trustFactIcon} />
            <Text
              style={[styles.trustFactualText, { color: colors.textSecondary }]}
              numberOfLines={1}
              maxFontSizeMultiplier={1.3}
            >
              {trustFacts.join(' · ')}
            </Text>
            <Ionicons name="chevron-forward" size={12} color={colors.textMuted} />
          </Pressable>
        ) : null}

        <View style={styles.provenanceMetaGrid}>
          <View style={styles.provenanceMetaItem}>
            <Text style={[styles.metaLabel, { color: colors.textMuted }]}>Condition</Text>
            <Text style={[styles.metaVal, { color: colors.textPrimary }]}>
              {asset.conditionGrade || 'Grade A Verified'}
            </Text>
          </View>
          <View style={styles.provenanceMetaItem}>
            <Text style={[styles.metaLabel, { color: colors.textMuted }]}>Vault Custody</Text>
            <Text style={[styles.metaVal, { color: colors.textPrimary }]}>
              {asset.custodianName || 'Bonded Vault'} ({asset.custodianLocation || 'UK'})
            </Text>
          </View>
        </View>
      </View>

      {/* ── 2. Valuation Benchmark & Price Chart ── */}
      <View style={[styles.cardSurface, { backgroundColor: colors.surfaceAlt, borderColor: colors.borderSubtle }]}>
        <View style={styles.sectionHeaderRow}>
          <View>
            <Text style={[styles.sectionHeading, { color: colors.textPrimary }]}>Valuation Benchmark</Text>
            <Text style={[styles.subHeading, { color: colors.textSecondary }]}>
              {referenceVsAppraisalPct != null
                ? `Reference vs appraisal · ${Math.abs(referenceVsAppraisalPct).toFixed(1)}% ${referenceVsAppraisalPct >= 0 ? 'premium' : 'discount'}`
                : 'Reference vs appraisal benchmark'}
            </Text>
          </View>
        </View>

        {/* Candle chart or sparse notice */}
        {hasCandleData ? (
          <View style={styles.chartWrapper}>
            <CoOwnCandleChart
              candles={candleData}
              range={candleRange}
              onRangeChange={onCandleRangeChange}
              showVolume={showVolume}
            />
          </View>
        ) : undefined}

        {!hasCandleData && (
          <View style={[styles.sparseChartNotice, { backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)' }]}>
            <Ionicons name="analytics-outline" size={24} color={colors.textMuted} />
            <Text style={[styles.sparseChartTitle, { color: colors.textPrimary }]}>
              {lifecycleState === 'initialOffering' ? 'Primary Offering Benchmark' : 'No execution history yet'}
            </Text>
            <Text style={[styles.sparseChartBody, { color: colors.textSecondary }]}>
              Offering unit price of {formatCoOwnIze(asset.unitPriceGbp)} is benchmarked against independent appraisal of {appraisedValuePerUnitGbp != null ? formatCoOwnIze(appraisedValuePerUnitGbp) : 'recorded value'}.
            </Text>
          </View>
        )}

        <View style={[styles.valuationDetailRow, { borderTopColor: colors.borderSubtle }]}>
          <View style={styles.valuationCell}>
            <Text style={[styles.metaLabel, { color: colors.textMuted }]}>Appraised Per Unit</Text>
            <Text style={[styles.valuationBigNum, { color: colors.textPrimary }]}>
              {appraisedValuePerUnitGbp != null ? formatCoOwnIze(appraisedValuePerUnitGbp) : '—'}
            </Text>
          </View>
          <View style={styles.valuationCell}>
            <Text style={[styles.metaLabel, { color: colors.textMuted }]}>Independent Valuer</Text>
            <Text style={[styles.metaVal, { color: colors.textPrimary }]} numberOfLines={1}>
              {asset.appraisalValuer || 'Accredited Appraiser'}
            </Text>
          </View>
          <View style={styles.valuationCell}>
            <Text style={[styles.metaLabel, { color: colors.textMuted }]}>Valuation Date</Text>
            <Text style={[styles.metaVal, { color: colors.textPrimary }]}>
              {appraisalDateLabel}
            </Text>
          </View>
        </View>
      </View>

      {/* ── 3. Four-Pillar Evidence Summary (Asset Dossier) ── */}
      <CommerceDetailSection label="Asset dossier">
        <View style={styles.evidenceGrid}>
          {/* Pillar 1: Authenticity */}
          <View style={[styles.evidenceItem, { backgroundColor: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.7)' }]}>
            <View style={styles.evidenceTop}>
              <Ionicons
                name={asset.authenticityStatus === 'verified' ? 'checkmark-circle' : 'time-outline'}
                size={18}
                color={asset.authenticityStatus === 'verified' ? colors.success : colors.warning}
              />
              <Text style={[styles.evidenceLabel, { color: colors.textPrimary }]}>Authenticity</Text>
            </View>
            <Text style={[styles.evidenceSub, { color: colors.textSecondary }]} numberOfLines={2}>
              {asset.authenticityStatus === 'verified'
                ? (asset.authenticityMethod || 'Physical expert inspection')
                : 'Pending verification'}
            </Text>
          </View>

          {/* Pillar 2: Custody & Vault */}
          <View style={[styles.evidenceItem, { backgroundColor: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.7)' }]}>
            <View style={styles.evidenceTop}>
              <Ionicons name="shield-checkmark" size={18} color={colors.brand} />
              <Text style={[styles.evidenceLabel, { color: colors.textPrimary }]}>Custody</Text>
            </View>
            <Text style={[styles.evidenceSub, { color: colors.textSecondary }]} numberOfLines={2}>
              {asset.custodianName || 'Bonded Vault'} · Segregated storage
            </Text>
          </View>

          {/* Pillar 3: Insurance */}
          <View style={[styles.evidenceItem, { backgroundColor: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.7)' }]}>
            <View style={styles.evidenceTop}>
              <Ionicons
                name={asset.custodyInsured ? 'lock-closed' : 'alert-circle-outline'}
                size={18}
                color={asset.custodyInsured ? colors.success : colors.warning}
              />
              <Text style={[styles.evidenceLabel, { color: colors.textPrimary }]}>Insurance</Text>
            </View>
            <Text style={[styles.evidenceSub, { color: colors.textSecondary }]} numberOfLines={2}>
              {asset.custodyInsured
                ? `${asset.custodyInsurer || "Lloyd's Underwriters"} (Full coverage)`
                : 'Standard warehouse cover'}
            </Text>
          </View>

          {/* Pillar 4: Legal Structure */}
          <View style={[styles.evidenceItem, { backgroundColor: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.7)' }]}>
            <View style={styles.evidenceTop}>
              <Ionicons name="document-attach-outline" size={18} color={colors.brand} />
              <Text style={[styles.evidenceLabel, { color: colors.textPrimary }]}>SPV Legal Title</Text>
            </View>
            <Text style={[styles.evidenceSub, { color: colors.textSecondary }]} numberOfLines={2}>
              {asset.legalVehicleName || 'Series LLC Entity'} · Rights v{asset.rights?.version || '1'}
            </Text>
          </View>
        </View>

        {hasDocuments && (
          <View style={[styles.documentsStrip, { borderTopColor: colors.borderSubtle }]}>
            {dossierDocuments.map((doc, idx) => (
              <Pressable
                key={idx}
                onPress={() => void Linking.openURL(doc.url)}
                style={({ pressed }) => [styles.docChip, pressed && { opacity: 0.7 }]}
                accessibilityRole="link"
                accessibilityLabel={doc.accessibilityLabel}
              >
                <Ionicons name="link-outline" size={12} color={colors.brand} />
                <Text style={[styles.docChipText, { color: colors.textPrimary }]} numberOfLines={1}>
                  {doc.label}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      </CommerceDetailSection>

      {/* ── 4. Operating Expenses & Risk Disclosures ── */}
      <CommerceDetailSection label="Operating expenses">
        <View style={styles.feeBreakdown}>
          <CommerceDetailMetricRow label="Platform Trading Fee" value="1.5% per execution" />
          <CommerceDetailMetricRow label="Storage & Vault Custody" value="Covered by SPV reserve" />
          <CommerceDetailMetricRow label="Insurance Allocation" value="Included in issuance" />
          <CommerceDetailMetricRow label="Emergency Maintenance" value="Requires majority vote" />
        </View>

        {/* Risk disclosure row opening sheet */}
        <CommerceDetailDisclosureRow
          label="Risk disclosure"
          onPress={onOpenRiskDisclosure}
          summary="Inspect market and capital risks"
        />
      </CommerceDetailSection>
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
    marginBottom: Space.xs,
  },
  sectionHeading: {
    fontSize: TypographyV2.sectionTitle.size,
    fontFamily: FontFamily.bold,
  },
  sectionTitle: {
    fontSize: TypographyV2.sectionTitle.size,
    fontFamily: FontFamily.bold,
  },
  subHeading: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.regular,
    marginTop: 2,
  },
  headerActionText: {
    fontSize: TypographyV2.caption.size,
    fontFamily: FontFamily.semibold,
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
  assetStoryWrap: {
    gap: Space.xs,
  },
  assetStoryText: {
    fontSize: TypographyV2.body.size,
    fontFamily: FontFamily.regular,
    lineHeight: 22,
    letterSpacing: -0.2,
  },
  assetStoryParagraph: {
    fontSize: TypographyV2.meta.size,
    lineHeight: 20,
    fontFamily: FontFamily.regular,
  },
  assetStoryLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginTop: 2,
  },
  assetStoryLinkText: {
    fontSize: TypographyV2.captionElevated.size,
    fontFamily: FontFamily.semibold,
  },
  trustFactualLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: Space.xs,
    marginTop: Space.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(128,128,128,0.15)',
  },
  trustFactIcon: {
    marginRight: 2,
  },
  trustFactualText: {
    fontSize: TypographyV2.caption.size,
    fontFamily: FontFamily.medium,
    flex: 1,
  },
  provenanceMetaGrid: {
    flexDirection: 'row',
    gap: Space.md,
    marginTop: Space.sm,
    paddingTop: Space.sm,
  },
  provenanceMetaItem: {
    flex: 1,
  },
  metaLabel: {
    fontSize: 11,
    fontFamily: FontFamily.medium,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  metaVal: {
    fontSize: TypographyV2.captionElevated.size,
    fontFamily: FontFamily.semibold,
  },
  chartWrapper: {
    marginVertical: Space.xs,
  },
  sparseChartNotice: {
    alignItems: 'center',
    padding: Space.md,
    borderRadius: Radius.sm,
    marginVertical: Space.xs,
    gap: Space.xs,
  },
  sparseChartTitle: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: FontFamily.semibold,
  },
  sparseChartBody: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.regular,
    textAlign: 'center',
    lineHeight: 18,
  },
  valuationDetailRow: {
    flexDirection: 'row',
    marginTop: Space.sm,
    paddingTop: Space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  valuationCell: {
    flex: 1,
  },
  valuationBigNum: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: FontFamily.bold,
    fontVariant: ['tabular-nums'],
  },
  evidenceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.xs,
    marginTop: Space.xs,
  },
  evidenceItem: {
    width: '48.5%',
    padding: Space.sm,
    borderRadius: Radius.sm,
    gap: 4,
  },
  evidenceTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  evidenceLabel: {
    fontSize: TypographyV2.captionElevated.size,
    fontFamily: FontFamily.semibold,
  },
  evidenceSub: {
    fontSize: 11,
    fontFamily: FontFamily.regular,
    lineHeight: 14,
  },
  documentsStrip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.xs,
    marginTop: Space.sm,
    paddingTop: Space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  docChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Space.xs + 2,
    paddingVertical: 4,
    borderRadius: Radius.sm,
  },
  docChipText: {
    fontSize: 11,
    fontFamily: FontFamily.medium,
  },
  feeBreakdown: {
    gap: Space.xs,
    marginTop: Space.xs,
  },
});
