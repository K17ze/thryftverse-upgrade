import React from 'react';
import { View, Text, StyleSheet, Pressable, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Space, FontFamily, Radius, PressScale } from '../../../theme/designTokens';
import { TypographyV2 } from '../../../theme/typography.v2';
import { useAppTheme } from '../../../theme/ThemeContext';
import { formatCoOwnIze } from '../../../utils/currency';
import { fetchCoOwnPriceHistory, type MarketCoOwnAsset, type PriceCandle } from '../../../services/marketApi';
import {
  CommerceDetailDisclosureRow,
  CommerceDetailSection,
  CommerceDetailMetricRow,
} from '../../commerce/detail';
import { CoOwnCandleChart, type CoOwnCandleRange } from '../';
import type { AssetLifecycleState, CandleDataPoint, DossierDocument } from './types';

export interface AssetOverviewSectionProps {
  asset: MarketCoOwnAsset;
  /** Embedded candles from the asset response — the fallback while the
   * ranged history loads, fails, or comes back empty. */
  candleData: CandleDataPoint[];
  candleRange: CoOwnCandleRange;
  onCandleRangeChange: (range: CoOwnCandleRange) => void;
  showVolume: boolean;
  onToggleVolume?: () => void;
  lastExecutionPriceGbp: number | null;
  appraisedValuePerUnitGbp: number | null;
  referenceVsAppraisalPct: number | null;
  dossierSummary: string;
  dossierDocuments: DossierDocument[];
  hasDocuments: boolean;
  onOpenDiligence: () => void;
  onOpenRiskDisclosure: () => void;
  lifecycleState: AssetLifecycleState;
}

/** Range → server price-history query. All chart ranges map to a
 * supported server interval ('1h' | '4h' | '1d' | '1w'). */
const RANGE_HISTORY_PARAMS: Record<CoOwnCandleRange, { interval: '1h' | '4h' | '1d' | '1w'; limit: number }> = {
  '1D': { interval: '1h', limit: 48 },
  '1W': { interval: '4h', limit: 42 },
  '1M': { interval: '1d', limit: 30 },
  '3M': { interval: '1d', limit: 90 },
  '1Y': { interval: '1w', limit: 52 },
  'ALL': { interval: '1w', limit: 52 },
};

/** Minor-unit candles → chart points in GBP. */
function toCandlePoints(candles: PriceCandle[]): CandleDataPoint[] {
  return candles.map((c) => ({
    t: new Date(c.timestamp).getTime(),
    o: c.openGbpMinor / 100,
    h: c.highGbpMinor / 100,
    l: c.lowGbpMinor / 100,
    c: c.closeGbpMinor / 100,
    v: c.volumeUnits,
  }));
}

export function AssetOverviewSection({
  asset,
  candleData,
  candleRange,
  onCandleRangeChange,
  showVolume,
  onToggleVolume,
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

  // ── Ranged price history ──
  // The chart's range chips drive a real fetch. Previous candles stay
  // rendered while the next range loads; on error or an empty result the
  // embedded asset candles remain the fallback — never an empty flash,
  // never fabricated candles.
  const [historyCandles, setHistoryCandles] = React.useState<CandleDataPoint[] | null>(null);
  const [historyLoading, setHistoryLoading] = React.useState(false);
  const [historyFailed, setHistoryFailed] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    setHistoryLoading(true);
    setHistoryFailed(false);
    // Drop the previous range's candles immediately so the chart never
    // renders stale data under the new range label; the embedded asset
    // candles cover the gap until the fetch resolves.
    setHistoryCandles(null);
    void fetchCoOwnPriceHistory(asset.id, RANGE_HISTORY_PARAMS[candleRange])
      .then(({ candles }) => {
        if (cancelled) return;
        setHistoryCandles(candles.length > 0 ? toCandlePoints(candles) : null);
        setHistoryFailed(false);
        setHistoryLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setHistoryCandles(null);
        setHistoryFailed(true);
        setHistoryLoading(false);
      });
    return () => { cancelled = true; };
  }, [asset.id, candleRange]);

  const chartCandles = historyCandles ?? candleData;
  const hasChartCandles = chartCandles.length > 0;
  const volumeAvailable = chartCandles.some((c) => c.v > 0);

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
                ? `Reference vs appraisal · ${Math.abs(referenceVsAppraisalPct).toFixed(1)}% ${referenceVsAppraisalPct >= 0 ? 'premium' : 'discount'}${historyLoading ? ' · loading…' : ''}`
                : historyLoading
                  ? 'Loading price history…'
                  : 'Reference vs appraisal benchmark'}
            </Text>
          </View>
          {hasChartCandles && volumeAvailable && onToggleVolume ? (
            <Pressable
              onPress={onToggleVolume}
              hitSlop={8}
              style={({ pressed }) => [styles.linkRow, pressed && { opacity: 0.7 }]}
              accessibilityRole="button"
              accessibilityLabel={showVolume ? 'Hide volume bars' : 'Show volume bars'}
              accessibilityState={{ selected: showVolume }}
            >
              <Ionicons
                name="bar-chart-outline"
                size={14}
                color={showVolume ? colors.brand : colors.textMuted}
              />
              <Text style={[styles.linkText, { color: showVolume ? colors.brand : colors.textMuted }]}>
                Volume
              </Text>
            </Pressable>
          ) : null}
        </View>

        {/* Candle chart or sparse notice — previous candles stay up while
            the next range loads; embedded candles cover error/empty. */}
        {hasChartCandles ? (
          <View style={styles.chartWrapper}>
            <CoOwnCandleChart
              candles={chartCandles}
              range={candleRange}
              onRangeChange={onCandleRangeChange}
              showVolume={showVolume && volumeAvailable}
              lastPrice={lastExecutionPriceGbp ?? undefined}
            />
          </View>
        ) : (
          <View style={[styles.sparseChartNotice, { backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)' }]}>
            <Ionicons name="analytics-outline" size={24} color={colors.textMuted} />
            <Text style={[styles.sparseChartTitle, { color: colors.textPrimary }]}>
              {historyFailed
                ? 'Price history unavailable'
                : lifecycleState === 'initialOffering'
                  ? 'Primary Offering Benchmark'
                  : 'No execution history yet'}
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
