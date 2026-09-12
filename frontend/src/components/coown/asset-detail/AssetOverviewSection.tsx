import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Space, FontFamily, PressScale } from '../../../theme/designTokens';
import { TypographyV2 } from '../../../theme/typography.v2';
import { useAppTheme } from '../../../theme/ThemeContext';
import { formatCoOwnIze } from '../../../utils/currency';
import { fetchCoOwnPriceHistory, type MarketCoOwnAsset, type PriceCandle } from '../../../services/marketApi';
import { CoOwnCandleChart, type CoOwnCandleRange, type CoOwnChartType } from '../';
import { CoOwnDossierRibbon } from './CoOwnDossierRibbon';
import type { AssetLifecycleState, CandleDataPoint } from './types';

export interface AssetOverviewSectionProps {
  asset: MarketCoOwnAsset;
  /** Embedded candles from the asset response — valid only for the default
   * one-week view. Other ranges must not silently display a shorter range. */
  candleData: CandleDataPoint[];
  candleRange: CoOwnCandleRange;
  onCandleRangeChange: (range: CoOwnCandleRange) => void;
  /** Active chart type (Line / Candlestick / Area). Optional — when
   * omitted the switcher is hidden and the chart defaults to candle. */
  chartType?: CoOwnChartType;
  onChartTypeChange?: (type: CoOwnChartType) => void;
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
  /** Pillar 2: Opens the unified asset dossier sheet (provenance,
   *  custody, valuation, fees). Replaces the former onOpenDiligence +
   *  onOpenRiskDisclosure inline sections. */
  onOpenDossier: () => void;
  /** Wave A: Opens the asset prospectus sheet (issuer, legal vehicle,
   *  economics, fees, conflicts, key risks, documents). */
  onOpenProspectus?: () => void;
  /** Wave A: Opens the risk disclosure sheet from the risk summary
   *  line under the "What you own" block. */
  onOpenRiskDisclosure?: () => void;
  lifecycleState: AssetLifecycleState;
}

/** Range → server price-history query. All chart ranges map to a
 * supported server interval ('1h' | '4h' | '1d' | '1w'). */
const RANGE_HISTORY_PARAMS: Record<CoOwnCandleRange, { interval: '1h' | '4h' | '1d' | '1w'; limit: number; spanDays: number }> = {
  '1D': { interval: '1h', limit: 48, spanDays: 1 },
  '1W': { interval: '4h', limit: 42, spanDays: 7 },
  '1M': { interval: '1d', limit: 30, spanDays: 30 },
  '3M': { interval: '1d', limit: 90, spanDays: 90 },
  '1Y': { interval: '1w', limit: 52, spanDays: 365 },
  'ALL': { interval: '1w', limit: 52, spanDays: 365 * 5 },
};

/** Compute the explicit from/to window for a range so the server can never
 *  silently return an arbitrary latest-N slice. The window is anchored to
 *  "now" and extends backwards by the range's span. */
function rangeWindow(range: CoOwnCandleRange): { from: string; to: string } {
  const params = RANGE_HISTORY_PARAMS[range];
  const to = new Date();
  const from = new Date(to.getTime() - params.spanDays * 86_400_000);
  return { from: from.toISOString(), to: to.toISOString() };
}

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
  chartType,
  onChartTypeChange,
  showVolume,
  onToggleVolume,
  lastExecutionPriceGbp,
  appraisedValuePerUnitGbp,
  referenceVsAppraisalPct,
  onOpenDossier,
  onOpenProspectus,
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
  // Retry nonce — incrementing this re-triggers the history fetch effect
  // without changing the range. Used by the "Retry price history" button.
  const [retryNonce, setRetryNonce] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    setHistoryLoading(true);
    setHistoryFailed(false);
    // Drop the previous range's candles immediately so the chart never
    // renders stale data under the new range label; the embedded asset
    // candles cover the gap until the fetch resolves.
    setHistoryCandles(null);
    setHistoryRange(null);
    void fetchCoOwnPriceHistory(asset.id, { ...RANGE_HISTORY_PARAMS[candleRange], ...rangeWindow(candleRange) })
      .then(({ candles }) => {
        if (cancelled) return;
        // Distinguish "fetch succeeded with empty" ([]) from "fetch failed"
        // (null). A successful empty response must NOT fall back to embedded
        // candles — the server authoritatively says there is no data.
        setHistoryCandles(toCandlePoints(candles));
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
  }, [asset.id, candleRange, retryNonce]);

  const retryHistory = React.useCallback(() => {
    setRetryNonce((n) => n + 1);
  }, []);

  // Guard the first render after a range change as well as the effect-driven
  // state update; this prevents one frame of the previous range flashing.
  const rangeChangedThisRender = renderedRangeRef.current !== candleRange;
  renderedRangeRef.current = candleRange;
  const chartCandles = (!rangeChangedThisRender && historyRange === candleRange ? historyCandles : null)
    ?? (candleRange === '1W' ? candleData : []);
  const hasChartCandles = chartCandles.length > 0;
  const volumeAvailable = chartCandles.some((c) => c.v > 0);
  // "Saved history" — shown when the 1W fetch failed and the chart fell back
  // to the embedded asset candles. The label is honest: the data is from the
  // asset payload, not a fresh server response.
  const usingSavedHistory = historyFailed && candleRange === '1W' && chartCandles === candleData;

  const appraisalDateLabel = asset.appraisalValuedAt
    ? `Valuation updated ${new Date(asset.appraisalValuedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
    : null;

  // ── Wave A: "What you own" — the legal wrapper stated plainly ──
  // Competitor benchmark (Masterworks, Arrived, Rally): the SPV wrapper
  // is first-scroll content, not buried in a document. The lead line
  // adapts to what the contract actually publishes; when the vehicle
  // is declared 'none' we say so rather than implying a wrapper.
  const vehicleTypeLabel = asset.legalVehicleType === 'spv'
    ? 'SPV'
    : asset.legalVehicleType === 'series_llc'
      ? 'Series LLC'
      : asset.legalVehicleType === 'llc'
        ? 'LLC'
        : asset.legalVehicleType === 'trust'
          ? 'trust'
          : null;
  const ownershipLead = asset.legalVehicleName
    ? `You are buying units of ${asset.legalVehicleName} that owns this asset.`
    : vehicleTypeLabel
      ? `You are buying units in a ${vehicleTypeLabel} that owns this asset.`
      : asset.legalVehicleType === 'none'
        ? 'You are buying units in this asset. No separate legal vehicle has been declared.'
        : 'You are buying units of a single-asset vehicle that owns this asset.';
  const vehicleRowValue = asset.legalVehicleType === 'none'
    ? 'None declared'
    : [asset.legalVehicleName, vehicleTypeLabel, asset.legalVehicleJurisdiction]
        .filter(Boolean)
        .join(' · ') || null;
  const governingLawValue = [
    asset.rights?.governingLaw,
    asset.rights?.jurisdiction,
  ].filter(Boolean).join(' · ') || null;

  return (
    <View style={styles.container}>
      {/* ── 1. Asset Dossier Ribbon — compact chip bar ──
          Pillar 2: replaces the former "Physical Asset & Provenance"
          section (story text, trust facts, condition/custody grid) and
          the "Due diligence & fees" section. One tappable ribbon opens
          the unified dossier sheet. Eliminates ~400px of card clutter. */}
      <CoOwnDossierRibbon asset={asset} onOpenDossier={onOpenDossier} />

      {/* ── 1b. What you own — the legal wrapper, stated plainly.
          First-scroll trust composition: the buyer sees what the unit
          legally is before the chart. Flat rows, hairline separators;
          every row renders only when the contract supplies data. */}
      <View style={[styles.ownBlock, { borderTopColor: colors.borderSubtle }]}>
        <Text style={[styles.ownLead, { color: colors.textPrimary }]} maxFontSizeMultiplier={1.3}>
          {ownershipLead}
        </Text>
        {vehicleRowValue ? (
          <View style={styles.ownRow}>
            <Text style={[styles.ownRowLabel, { color: colors.textMuted }]} maxFontSizeMultiplier={1.3}>
              Legal vehicle
            </Text>
            <Text style={[styles.ownRowValue, { color: colors.textSecondary }]} numberOfLines={2} maxFontSizeMultiplier={1.3}>
              {vehicleRowValue}
            </Text>
          </View>
        ) : null}
        {governingLawValue ? (
          <View style={styles.ownRow}>
            <Text style={[styles.ownRowLabel, { color: colors.textMuted }]} maxFontSizeMultiplier={1.3}>
              Governing law
            </Text>
            <Text style={[styles.ownRowValue, { color: colors.textSecondary }]} numberOfLines={2} maxFontSizeMultiplier={1.3}>
              {governingLawValue}
            </Text>
          </View>
        ) : null}
        {asset.rights && asset.rights.transferable != null ? (
          <View style={styles.ownRow}>
            <Text style={[styles.ownRowLabel, { color: colors.textMuted }]} maxFontSizeMultiplier={1.3}>
              Transferability
            </Text>
            <Text style={[styles.ownRowValue, { color: colors.textSecondary }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
              {asset.rights.transferable ? 'Transferable' : 'Not transferable'}
            </Text>
          </View>
        ) : null}
        {onOpenProspectus ? (
          <Pressable
            onPress={onOpenProspectus}
            hitSlop={8}
            style={({ pressed }) => [styles.ownLink, pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
            accessibilityLabel="Ownership rights and prospectus"
            accessibilityHint="Opens the asset prospectus with issuer, legal vehicle, economics, fees, conflicts and key risks."
          >
            <Text style={[styles.ownLinkText, { color: colors.brand }]} maxFontSizeMultiplier={1.3}>
              Ownership rights & prospectus
            </Text>
            <Ionicons
              name="chevron-forward"
              size={14}
              color={colors.brand}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            />
          </Pressable>
        ) : null}
      </View>

      {/* ── 1c. Risk summary — one honest line, typographically quiet.
          Not a banner card: muted text, hairline top border, small
          warning glyph. Taps through to the full risk disclosure. */}
      {onOpenRiskDisclosure ? (
        <Pressable
          onPress={onOpenRiskDisclosure}
          hitSlop={8}
          style={({ pressed }) => [styles.riskLine, { borderTopColor: colors.borderSubtle }, pressed && { opacity: 0.7 }]}
          accessibilityRole="button"
          accessibilityLabel="Risk warning: you could lose all the money you invest. Open the full risk disclosure."
        >
          <Ionicons
            name="warning-outline"
            size={14}
            color={colors.textMuted}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          />
          <Text style={[styles.riskLineText, { color: colors.textMuted }]} maxFontSizeMultiplier={1.3}>
            You could lose all the money you invest. Units are illiquid and not protected by deposit-guarantee schemes.
          </Text>
        </Pressable>
      ) : (
        <View style={[styles.riskLine, { borderTopColor: colors.borderSubtle }]}>
          <Ionicons
            name="warning-outline"
            size={14}
            color={colors.textMuted}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          />
          <Text style={[styles.riskLineText, { color: colors.textMuted }]} maxFontSizeMultiplier={1.3}>
            You could lose all the money you invest. Units are illiquid and not protected by deposit-guarantee schemes.
          </Text>
        </View>
      )}

      {/* ── 2. Valuation & Price Chart — flat on canvas, no card wrapper ──
          Stock-broker pattern: chart sits directly on the surface with
          hairline-separated metric rows below. No filled card container. */}
      <View style={styles.chartBlock}>
        <View style={styles.chartHeaderRow}>
          <View style={styles.chartHeaderLeft}>
            <Text style={[styles.chartHeading, { color: colors.textPrimary }]}>Price history</Text>
            {referenceVsAppraisalPct != null ? (
              <Text style={[styles.chartSubHeading, { color: colors.textSecondary }]} numberOfLines={1}>
                <Text style={styles.chartSubHeadingStrong}>
                  {`${Math.abs(referenceVsAppraisalPct).toFixed(1)}% `}
                </Text>
                {referenceVsAppraisalPct >= 0 ? 'premium' : 'discount'} to appraisal
                {historyLoading ? ' · loading…' : ''}
              </Text>
            ) : (
              <Text style={[styles.chartSubHeading, { color: colors.textSecondary }]} numberOfLines={1}>
                {historyLoading ? 'Loading price history…' : 'Reference vs appraisal'}
              </Text>
            )}
            {marketDataStale ? (
              <Text style={[styles.chartStaleLine, { color: colors.warning }]} numberOfLines={1}>
                Stale{marketDataAgeLabel ? ` · ${marketDataAgeLabel}` : ''}
              </Text>
            ) : null}
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

        {/* Candle chart — always mounted (F12) so range controls and retry
            survive loading/empty/error states. The chart receives the
            resolved candles (embedded data valid only for 1W) plus the
            state-specific empty copy via emptyStateTitle/emptyStateBody. */}
        <View style={styles.chartWrapper}>
          <CoOwnCandleChart
            candles={chartCandles}
            range={candleRange}
            onRangeChange={onCandleRangeChange}
            chartType={chartType}
            onChartTypeChange={onChartTypeChange}
            showVolume={showVolume && volumeAvailable}
            lastPrice={lastExecutionPriceGbp ?? undefined}
            lastAgeSeconds={lastExecutionAgeSeconds}
            emptyStateTitle={historyLoading
              ? 'Loading price history…'
              : historyFailed
              ? 'Price history unavailable'
              : lifecycleState === 'initialOffering'
                ? 'Primary offering — no trade history'
                : 'No execution history yet'}
            emptyStateBody={historyFailed
              ? 'Could not load price history for this range.'
              : appraisedValuePerUnitGbp != null
                ? `Offering price ${formatCoOwnIze(asset.unitPriceGbp)} benchmarked against appraisal of ${formatCoOwnIze(appraisedValuePerUnitGbp)}.`
                : `Reference price ${formatCoOwnIze(asset.unitPriceGbp)}. No settled trades for this range.`}
          />
        </View>
        {usingSavedHistory && (
          <View style={[styles.savedHistoryRow, { borderTopColor: colors.borderSubtle }]}>
            <Text style={[styles.savedHistoryLabel, { color: colors.textMuted }]}>
              Saved history
            </Text>
            <Pressable
              onPress={retryHistory}
              hitSlop={8}
              style={({ pressed }) => [styles.retryBtn, pressed && { opacity: 0.7 }]}
              accessibilityRole="button"
              accessibilityLabel="Retry price history"
            >
              <Ionicons name="refresh" size={14} color={colors.brand} />
              <Text style={[styles.retryBtnText, { color: colors.brand }]}>Retry</Text>
            </Pressable>
          </View>
        )}
        {historyFailed && !usingSavedHistory && (
          <View style={[styles.savedHistoryRow, { borderTopColor: colors.borderSubtle }]}>
            <Pressable
              onPress={retryHistory}
              hitSlop={8}
              style={({ pressed }) => [styles.retryBtn, pressed && { opacity: 0.7 }]}
              accessibilityRole="button"
              accessibilityLabel="Retry price history"
            >
              <Ionicons name="refresh" size={14} color={colors.brand} />
              <Text style={[styles.retryBtnText, { color: colors.brand }]}>Retry price history</Text>
            </Pressable>
          </View>
        )}

        {/* Flat appraisal metrics — dominant value + supporting caption.
            Broker hierarchy: the appraised number dominates; valuer and
            valuation date ride one quiet caption line instead of competing
            as equal-width cells. */}
        <View style={[styles.valuationDetailRow, { borderTopColor: colors.borderSubtle }]}>
          <View style={styles.valuationPrimary}>
            <Text style={[styles.metaLabel, { color: colors.textMuted }]}>Appraised / unit</Text>
            <Text style={[styles.valuationBigNum, { color: colors.textPrimary }]}>
              {appraisedValuePerUnitGbp != null ? formatCoOwnIze(appraisedValuePerUnitGbp) : '—'}
            </Text>
          </View>
          <View style={styles.valuationMetaCol}>
            <Text style={[styles.valuationMetaLine, { color: colors.textSecondary }]} numberOfLines={1}>
              {asset.appraisalValuer ?? 'Valuer not published'}
            </Text>
            <Text style={[styles.valuationMetaLine, { color: colors.textMuted }]} numberOfLines={1}>
              {appraisalDateLabel ?? 'Valuation date not published'}
            </Text>
          </View>
        </View>
      </View>

      {/* ── 3. Due diligence & fees — now in the dossier sheet ──
          Pillar 2: the former "Due diligence & fees" section (document
          chips, fee rows, risk disclosure row) is consolidated into the
          CoOwnAssetDossierSheet opened via the ribbon above. The chart
          is now the dominant first-viewport content. */}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    // Sections own horizontal padding (CommerceDetailSection paddingHorizontal:
    // Space.md) — no container-level horizontal padding, otherwise content is
    // double-inset. Vertical rhythm: container gap Space.sm + each section's
    // own paddingTop Space.md = 24pt block-to-block.
    paddingTop: Space.sm,
    gap: Space.sm,
  },
  chartBlock: {
    // Flat on canvas — no card fill, no border, no radius.
    // Hairline separators define structure, not containers.
    // Flat View (not a section) so it carries its own horizontal padding to
    // align with the sections' 16pt inset.
    paddingHorizontal: Space.md,
    paddingBottom: Space.xs,
  },
  chartHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: Space.xs,
  },
  chartHeaderLeft: {
    flex: 1,
    marginRight: Space.sm,
  },
  chartHeading: {
    fontSize: TypographyV2.sectionTitle.size,
    fontFamily: FontFamily.bold,
  },
  chartSubHeading: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.regular,
    marginTop: 2,
  },
  chartSubHeadingStrong: {
    fontFamily: FontFamily.semibold,
    fontVariant: ['tabular-nums'],
  },
  chartStaleLine: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.medium,
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
  // Pillar 2: removed assetStoryWrap, assetStoryText, assetStoryLink,
  // assetStoryLinkText, trustFactualLine, trustFactualText,
  // provenanceMetaGrid, provenanceMetaItem, metaVal, documentsStrip,
  // docChip, docChipText, feeBreakdown, unpublishedText — the former
  // provenance/condition/custody/fee sections now live in the
  // CoOwnAssetDossierSheet. metaLabel is retained for the appraisal row.
  metaLabel: {
    fontSize: TypographyV2.label.size,
    lineHeight: TypographyV2.label.lineHeight,
    fontFamily: TypographyV2.label.fontFamily,
    letterSpacing: TypographyV2.label.letterSpacing,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  chartWrapper: {
    marginVertical: Space.xs,
  },
  sparseChartBlock: {
    paddingVertical: Space.md,
    gap: 4,
  },
  sparseChartTitle: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: FontFamily.semibold,
  },
  sparseChartBody: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.regular,
    lineHeight: 18,
    fontVariant: ['tabular-nums'],
  },
  savedHistoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Space.xs,
    marginTop: Space.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  savedHistoryLabel: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.regular,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  retryBtnText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.semibold,
  },
  valuationDetailRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: Space.md,
    marginTop: Space.xs,
    paddingTop: Space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  valuationPrimary: {
    flexShrink: 0,
  },
  valuationMetaCol: {
    flex: 1,
    alignItems: 'flex-end',
    gap: 2,
  },
  valuationMetaLine: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.regular,
  },
  valuationBigNum: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: FontFamily.bold,
    fontVariant: ['tabular-nums'],
  },
  // Wave A — "What you own" + risk summary. Flat on canvas, hairline
  // separators, aligned to the sections' 16pt inset like chartBlock.
  ownBlock: {
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    paddingBottom: Space.xs,
    gap: Space.xs,
  },
  ownLead: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: FontFamily.medium,
    letterSpacing: TypographyV2.body.letterSpacing,
  },
  ownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: Space.md,
    minHeight: 20,
  },
  ownRowLabel: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight + 4,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
    flexShrink: 0,
  },
  ownRowValue: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: TypographyV2.body.fontFamily,
    letterSpacing: TypographyV2.body.letterSpacing,
    textAlign: 'right',
    flex: 1,
  },
  ownLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    minHeight: 44,
    marginTop: 2,
  },
  ownLinkText: {
    fontSize: TypographyV2.body.size,
    fontFamily: FontFamily.semibold,
  },
  riskLine: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.xs,
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    paddingBottom: Space.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    minHeight: 44,
  },
  riskLineText: {
    flex: 1,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight + 4,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
});
