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
  /** Embedded candles from the asset response — valid only for the default
   * one-week view. Other ranges must not silently display a shorter range. */
  candleData: CandleDataPoint[];
  candleRange: CoOwnCandleRange;
  onCandleRangeChange: (range: CoOwnCandleRange) => void;
  showVolume: boolean;
  onToggleVolume?: () => void;
  lastExecutionPriceGbp: number | null;
  /** Age of the last settled trade, derived from the backend timestamp. */
  lastExecutionAgeSeconds?: number | null;
  /** Market-source freshness, not response assembly time. */
  marketDataStale?: boolean;
  marketDataAgeLabel?: string;
  appraisedValuePerUnitGbp: number | null;
  referenceVsAppraisalPct: number | null;
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
  dossierDocuments,
  hasDocuments,
  onOpenDiligence,
  onOpenRiskDisclosure,
  lifecycleState,
  lastExecutionAgeSeconds = null,
  marketDataStale = false,
  marketDataAgeLabel,
}: AssetOverviewSectionProps) {
  const { colors } = useAppTheme();

  // ── Ranged price history ──
  // The chart's range chips drive a real fetch. Only the embedded one-week
  // response can stand in for the default range; a failed 1M/1Y/ALL request
  // stays visibly unavailable instead of relabelling seven-day data.
  const [historyCandles, setHistoryCandles] = React.useState<CandleDataPoint[] | null>(null);
  const [historyRange, setHistoryRange] = React.useState<CoOwnCandleRange | null>(null);
  const renderedRangeRef = React.useRef(candleRange);
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
    setHistoryRange(null);
    void fetchCoOwnPriceHistory(asset.id, RANGE_HISTORY_PARAMS[candleRange])
      .then(({ candles }) => {
        if (cancelled) return;
        setHistoryCandles(candles.length > 0 ? toCandlePoints(candles) : null);
        setHistoryRange(candleRange);
        setHistoryFailed(false);
        setHistoryLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setHistoryCandles(null);
        setHistoryRange(candleRange);
        setHistoryFailed(true);
        setHistoryLoading(false);
      });
    return () => { cancelled = true; };
  }, [asset.id, candleRange]);

  // Guard the first render after a range change as well as the effect-driven
  // state update; this prevents one frame of the previous range flashing.
  const rangeChangedThisRender = renderedRangeRef.current !== candleRange;
  renderedRangeRef.current = candleRange;
  const chartCandles = (!rangeChangedThisRender && historyRange === candleRange ? historyCandles : null)
    ?? (candleRange === '1W' ? candleData : []);
  const hasChartCandles = chartCandles.length > 0;
  const volumeAvailable = chartCandles.some((c) => c.v > 0);

  const appraisalDateLabel = asset.appraisalValuedAt
    ? `Valuation updated ${new Date(asset.appraisalValuedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
    : null;

  // Trust facts for the flat factual line (spec 03_COOWN §5)
  const trustFacts: string[] = [];
  if (asset.authenticityStatus === 'verified') trustFacts.push('Authenticated');
  if (asset.custodyInsured) trustFacts.push('Insured custody');
  if (asset.rights?.version) trustFacts.push(`Rights v${asset.rights.version}`);
  if (asset.appraisalValueGbp != null) trustFacts.push('Appraised');
  const hasProvenanceMeta = Boolean(asset.conditionGrade || asset.custodianName || asset.custodianLocation);
  const legalVehicleLabel = asset.legalVehicleName
    ?? (asset.legalVehicleType && asset.legalVehicleType !== 'none'
      ? asset.legalVehicleType.replace('_', ' ').toUpperCase()
      : null);

  return (
    <View style={styles.container}>
      {/* ── 1. Physical Asset Story & Editorial Provenance — flat section ── */}
      <CommerceDetailSection
        label="Physical Asset & Provenance"
        trailing={
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
        }
      >
        <View style={styles.assetStoryWrap}>
          <Text
            style={[styles.assetStoryText, { color: colors.textSecondary }]}
            numberOfLines={4}
            maxFontSizeMultiplier={1.4}
          >
            {asset.provenance ?? 'Provenance has not been published for this asset yet.'}
          </Text>
          <Pressable
            onPress={onOpenDiligence}
            hitSlop={8}
            style={({ pressed }) => [styles.assetStoryLink, pressed && { opacity: 0.85, transform: [{ scale: PressScale.gentle }] }]}
            accessibilityRole="button"
            accessibilityLabel="Read full asset story"
          >
            <Text style={[styles.assetStoryLinkText, { color: colors.brand }]}>
              {asset.provenance ? 'Read the full story' : 'Open due diligence'}
            </Text>
            <Ionicons name="chevron-forward" size={14} color={colors.brand} />
          </Pressable>
        </View>

        {/* Flat factual trust line */}
        {trustFacts.length > 0 ? (
          <Pressable
            onPress={onOpenDiligence}
            hitSlop={4}
            style={({ pressed }) => [styles.trustFactualLine, { borderTopColor: colors.border }, pressed && { opacity: 0.85 }]}
            accessibilityRole="button"
            accessibilityLabel={`Trust summary: ${trustFacts.join(', ')}. Tap to view due diligence.`}
          >
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

        {hasProvenanceMeta ? (
          <View style={[styles.provenanceMetaGrid, { borderTopColor: colors.border }]}>
            {asset.conditionGrade ? (
              <View style={styles.provenanceMetaItem}>
                <Text style={[styles.metaLabel, { color: colors.textMuted }]}>Condition</Text>
                <Text style={[styles.metaVal, { color: colors.textPrimary }]}>{asset.conditionGrade}</Text>
              </View>
            ) : null}
            {(asset.custodianName || asset.custodianLocation) ? (
              <View style={styles.provenanceMetaItem}>
                <Text style={[styles.metaLabel, { color: colors.textMuted }]}>Custody</Text>
                <Text style={[styles.metaVal, { color: colors.textPrimary }]}>
                  {[asset.custodianName, asset.custodianLocation].filter(Boolean).join(' · ')}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </CommerceDetailSection>

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
              {marketDataStale ? ` · market data stale${marketDataAgeLabel ? ` · ${marketDataAgeLabel}` : ''}` : ''}
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
              <Text style={[styles.linkText, { color: showVolume ? colors.brand : colors.textMuted }]}>
                Volume
              </Text>
            </Pressable>
          ) : null}
        </View>

        {/* Candle chart or sparse notice — each range is backed by its own
            server query; non-default failures stay explicitly unavailable. */}
        {hasChartCandles ? (
          <View style={styles.chartWrapper}>
            <CoOwnCandleChart
              candles={chartCandles}
              range={candleRange}
              onRangeChange={onCandleRangeChange}
              showVolume={showVolume && volumeAvailable}
              lastPrice={lastExecutionPriceGbp ?? undefined}
              lastAgeSeconds={lastExecutionAgeSeconds}
            />
          </View>
        ) : (
          <View style={[styles.sparseChartNotice, { backgroundColor: colors.surface }]}>
            <Ionicons name="analytics-outline" size={24} color={colors.textMuted} />
            <Text style={[styles.sparseChartTitle, { color: colors.textPrimary }]}>
              {historyLoading
                ? 'Loading price history…'
                : historyFailed
                ? 'Price history unavailable'
                : lifecycleState === 'initialOffering'
                  ? 'Primary Offering Benchmark'
                  : 'No execution history yet'}
            </Text>
            <Text style={[styles.sparseChartBody, { color: colors.textSecondary }]}>
              {appraisedValuePerUnitGbp != null
                ? `Offering unit price of ${formatCoOwnIze(asset.unitPriceGbp)} is benchmarked against the recorded appraisal of ${formatCoOwnIze(appraisedValuePerUnitGbp)}.`
                : `No settled trades are recorded for this range. The offering reference price is ${formatCoOwnIze(asset.unitPriceGbp)}.`}
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
            {asset.appraisalValuer ? (
              <Text style={[styles.metaVal, { color: colors.textPrimary }]} numberOfLines={1}>
                {asset.appraisalValuer}
              </Text>
            ) : (
              <Text style={[styles.metaVal, { color: colors.textMuted }]} numberOfLines={1}>Not published</Text>
            )}
          </View>
          <View style={styles.valuationCell}>
            <Text style={[styles.metaLabel, { color: colors.textMuted }]}>Valuation Date</Text>
            <Text style={[styles.metaVal, { color: appraisalDateLabel ? colors.textPrimary : colors.textMuted }]}>
              {appraisalDateLabel ?? 'Not published'}
            </Text>
          </View>
        </View>
      </View>

      {/* ── 3. Four-Pillar Evidence Summary (Asset Dossier) ── */}
      <CommerceDetailSection label="Asset dossier">
        <View style={styles.evidenceGrid}>
          {/* Pillar 1: Authenticity — icon carries verification state */}
          {asset.authenticityStatus ? (
            <View style={styles.evidenceItem}>
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
                  ? (asset.authenticityMethod ?? 'Verified')
                  : asset.authenticityStatus === 'pending' ? 'Verification pending' : 'Not verified'}
              </Text>
            </View>
          ) : null}

          {/* Pillar 2: Custody & Vault */}
          {(asset.custodianName || asset.custodianLocation) ? (
            <View style={styles.evidenceItem}>
              <Text style={[styles.evidenceLabel, { color: colors.textPrimary }]}>Custody</Text>
              <Text style={[styles.evidenceSub, { color: colors.textSecondary }]} numberOfLines={2}>
                {[asset.custodianName, asset.custodianLocation].filter(Boolean).join(' · ')}
              </Text>
            </View>
          ) : null}

          {/* Pillar 3: Insurance — icon carries coverage state */}
          {asset.custodyInsured != null ? (
            <View style={styles.evidenceItem}>
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
                  ? (asset.custodyInsurer ? `Insured · ${asset.custodyInsurer}` : 'Insured custody')
                  : 'No insured custody on record'}
              </Text>
            </View>
          ) : null}

          {/* Pillar 4: Legal Structure */}
          {(legalVehicleLabel || asset.rights?.version != null) ? (
            <View style={styles.evidenceItem}>
              <Text style={[styles.evidenceLabel, { color: colors.textPrimary }]}>Legal structure</Text>
              <Text style={[styles.evidenceSub, { color: colors.textSecondary }]} numberOfLines={2}>
                {[legalVehicleLabel, asset.rights?.version != null ? `Rights v${asset.rights.version}` : null]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </View>
          ) : null}
        </View>

        {hasDocuments && (
          <View style={[styles.documentsStrip, { borderTopColor: colors.border }]}>
            {dossierDocuments.map((doc, idx) => (
              <Pressable
                key={idx}
                onPress={() => void Linking.openURL(doc.url)}
                style={({ pressed }) => [styles.docChip, pressed && { opacity: 0.7 }]}
                accessibilityRole="link"
                accessibilityLabel={doc.accessibilityLabel}
              >
                <Text style={[styles.docChipText, { color: colors.brand }]} numberOfLines={1}>
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
          {asset.tradingFeeRate != null ? (
            <CommerceDetailMetricRow
              label="Platform trading fee"
              value={`${(asset.tradingFeeRate * 100).toFixed(2).replace(/\.00$/, '')}% per execution`}
            />
          ) : null}
          {asset.rights?.feeRights ? (
            <CommerceDetailMetricRow label="Rights / operating costs" value={asset.rights.feeRights} />
          ) : null}
          {asset.tradingFeeRate == null && !asset.rights?.feeRights ? (
            <Text style={[styles.unpublishedText, { color: colors.textMuted }]}>Fee schedule not published yet.</Text>
          ) : null}
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
    gap: Space.lg,
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
  subHeading: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.regular,
    marginTop: 2,
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
    borderTopWidth: StyleSheet.hairlineWidth,
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
    gap: Space.sm,
  },
  // Transparent pillar cells — no per-pillar card fill. The 2x2 grid reads
  // through typography and spacing; icons appear only for state.
  evidenceItem: {
    width: '48.5%',
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
  },
  docChipText: {
    fontSize: 11,
    fontFamily: FontFamily.medium,
  },
  feeBreakdown: {
    gap: Space.xs,
    marginTop: Space.xs,
  },
  unpublishedText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.regular,
    lineHeight: TypographyV2.meta.lineHeight,
  },
});
