import { StyleSheet } from 'react-native';
import type { ThemeColors } from '../../../theme/ThemeContext';
import { Space, Radius, Control, Elevation, FontFamily } from '../../../theme/designTokens';
import { TypographyV2 } from '../../../theme/typography.v2';

export function createAnalyticsStyles(colors: ThemeColors) {
  return StyleSheet.create({
    scrollContent: {
      paddingHorizontal: Space.md,
      paddingBottom: Space.xxl,
    },
    clearScopeButton: {
      paddingHorizontal: Space.sm,
      paddingVertical: Space.xs,
    },
    clearScopeText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
    },
    partialBanner: {
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    partialBannerText: {
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
    },

    // ── Period segmented control (iOS-style) ──
    periodSegmentControl: {
      flexDirection: 'row',
      backgroundColor: colors.surfaceAlt,
      borderRadius: Radius.full,
      padding: 2,
      marginTop: Space.sm,
    },
    periodSegmentOption: {
      flex: 1,
      height: Control.chrome,
      borderRadius: Radius.full,
      alignItems: 'center',
      justifyContent: 'center',
    },
    periodSegmentOptionActive: {
      backgroundColor: colors.surfaceElevated,
    },
    periodSegmentText: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
    },
    periodSegmentTextActive: {
      fontFamily: TypographyV2.bodyStrong.fontFamily,
    },
    periodRowSkeleton: {
      flexDirection: 'row',
      gap: Space.lg,
      paddingVertical: Space.sm,
    },

    // ── Flat Hero Metric ──
    heroMetricWrap: {
      marginTop: Space.lg,
      marginBottom: Space.sm,
    },
    heroMetricLabel: {
      fontSize: TypographyV2.meta.size,
      fontFamily: FontFamily.medium,
      letterSpacing: TypographyV2.meta.letterSpacing,
    },
    heroMetricRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: Space.sm,
      marginTop: Space.xs,
    },
    heroMetricValue: {
      fontSize: TypographyV2.priceHero.size,
      lineHeight: TypographyV2.priceHero.lineHeight,
      fontFamily: FontFamily.bold,
      fontVariant: ['tabular-nums'],
    },
    heroDeltaPill: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: Space.xs + 1,
      paddingVertical: Space.xs - 1,
      borderRadius: Radius.sm,
    },
    heroDeltaText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: FontFamily.semibold,
      fontVariant: ['tabular-nums'],
    },
    heroSparkline: {
      alignSelf: 'flex-end',
      marginLeft: 'auto',
    },
    heroMetricSub: {
      fontSize: TypographyV2.caption.size,
      fontFamily: FontFamily.regular,
      marginTop: Space.xxs,
    },

    // ── Dimension selector tabs ──
    dimensionTabRow: {
      flexDirection: 'row',
      gap: Space.lg,
      paddingVertical: Space.sm,
      marginTop: Space.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    dimensionTab: {
      alignItems: 'center',
      paddingVertical: Space.xs - 2,
      minHeight: Control.hit,
      justifyContent: 'center',
    },
    dimensionTabText: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
    },
    dimensionTabTextActive: {
      fontFamily: TypographyV2.bodyStrong.fontFamily,
    },
    dimensionTabIndicator: {
      height: 2,
      width: '100%',
      marginTop: Space.xxs,
      borderRadius: Radius.sm,
    },

    // ── Flat metrics section ──
    metricsSection: {
      marginTop: Space.sm,
    },

    // ── Chart Section ──
    chartSection: {
      marginTop: Space.lg,
      marginBottom: Space.md,
    },
    chartToolbar: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: Space.xs,
    },
    chartTitleBlock: {
      flex: 1,
    },
    chartActiveTitle: {
      fontSize: TypographyV2.sectionTitle.size,
      fontFamily: TypographyV2.sectionTitle.fontFamily,
    },
    chartPeakSubtitle: {
      fontSize: TypographyV2.caption.size,
      fontFamily: TypographyV2.caption.fontFamily,
      marginTop: 2,
    },
    chartViewToggle: {
      flexDirection: 'row',
      borderRadius: Radius.md,
      padding: 2,
      marginLeft: Space.sm,
    },
    chartViewToggleBtn: {
      paddingHorizontal: Space.sm,
      paddingVertical: Space.xs,
      minHeight: Control.hit,
      justifyContent: 'center',
      borderRadius: Radius.sm,
    },
    chartViewToggleBtnActive: {
      ...Elevation.subtle,
    },
    chartWrapper: {
      height: 230,
      marginTop: Space.xs,
    },
    chartLegend: {
      flexDirection: 'row',
      gap: Space.md,
      marginTop: Space.xs,
      paddingHorizontal: Space.xs,
    },
    legendItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs - 2,
    },
    legendDot: {
      width: 8,
      height: 8,
      borderRadius: Radius.sm,
    },
    legendText: {
      fontSize: TypographyV2.caption.size,
      fontFamily: TypographyV2.caption.fontFamily,
    },
    chartEmpty: {
      height: 140,
      justifyContent: 'center',
      alignItems: 'center',
      gap: Space.sm,
      marginTop: Space.xs,
    },
    chartEmptyText: {
      fontSize: TypographyV2.caption.size,
      fontFamily: TypographyV2.caption.fontFamily,
    },

    // ── Section Titles ──
    sectionHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      marginBottom: Space.sm,
    },
    sectionTitle: {
      fontSize: TypographyV2.sectionTitle.size,
      fontFamily: TypographyV2.sectionTitle.fontFamily,
    },
    sectionSubtitleMuted: {
      fontSize: TypographyV2.caption.size,
      fontFamily: TypographyV2.caption.fontFamily,
    },

    // ── Conversion Funnel (flat rows) ──
    funnelSection: {
      marginTop: Space.lg,
    },
    funnelList: {
      marginTop: Space.xs,
    },
    bottleneckCard: {
      marginTop: Space.md,
      padding: Space.sm + 2,
      borderRadius: Radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      gap: Space.xs - 2,
    },
    bottleneckHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    bottleneckTitle: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      flex: 1,
    },
    bottleneckDrop: {
      fontSize: TypographyV2.meta.size,
      fontFamily: FontFamily.bold,
      fontVariant: ['tabular-nums'],
    },
    bottleneckRec: {
      fontSize: TypographyV2.caption.size,
      fontFamily: TypographyV2.caption.fontFamily,
      lineHeight: TypographyV2.caption.lineHeight,
    },
    benchmarkRow: {
      marginTop: Space.sm,
      paddingVertical: Space.xs,
    },
    benchmarkLabel: {
      fontSize: TypographyV2.caption.size,
      fontFamily: TypographyV2.caption.fontFamily,
    },

    // ── Category Mix ──
    categorySection: {
      marginTop: Space.xl,
    },
    categoryBarTrack: {
      height: 8,
      borderRadius: Radius.sm,
      overflow: 'hidden',
      flexDirection: 'row',
      marginBottom: Space.md,
    },
    categoryGrid: {
      gap: Space.sm,
    },
    categoryRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    categoryLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      flex: 1,
    },
    categoryDot: {
      width: 8,
      height: 8,
      borderRadius: Radius.sm,
    },
    categoryName: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
    },
    categoryRight: {
      alignItems: 'flex-end',
    },
    categoryCount: {
      fontSize: TypographyV2.caption.size,
      fontFamily: TypographyV2.caption.fontFamily,
    },
    categoryValue: {
      fontSize: TypographyV2.bodyStrong.size,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      fontVariant: ['tabular-nums'],
    },

    // ── KPI Rows ──
    kpiList: {
      marginTop: Space.xl,
    },
    kpiRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: Space.sm + 2,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    kpiLabel: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
    },
    kpiValue: {
      fontSize: TypographyV2.bodyStrong.size,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      fontVariant: ['tabular-nums'],
    },

    // ── Top Listings ──
    topListingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      paddingVertical: Space.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    topListingRankBadge: {
      width: 24,
      alignItems: 'center',
    },
    topListingRankText: {
      fontSize: TypographyV2.caption.size,
      fontFamily: TypographyV2.caption.fontFamily,
    },
    topListingThumb: {
      width: 48,
      height: 48,
      borderRadius: Radius.sm,
      overflow: 'hidden',
    },
    topListingThumbImage: {
      width: '100%',
      height: '100%',
    },
    topListingThumbPlaceholder: {
      flex: 1,
    },
    topListingInfo: {
      flex: 1,
      gap: Space.xs - 2,
    },
    topListingRowTitle: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
    },
    topListingRowMeta: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      fontVariant: ['tabular-nums'],
    },
    topListingRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
    },
    topListingRowPrice: {
      fontSize: TypographyV2.bodyStrong.size,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      fontVariant: ['tabular-nums'],
    },

    // ── Needs Attention ──
    attentionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: Space.sm,
      paddingVertical: Space.sm + 2,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    attentionContentPressable: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      flex: 1,
    },
    attentionImageWrap: {
      width: 42,
      height: 42,
      borderRadius: Radius.sm,
      overflow: 'hidden',
    },
    attentionImage: {
      width: '100%',
      height: '100%',
    },
    attentionImagePlaceholder: {
      flex: 1,
    },
    attentionInfo: {
      flex: 1,
      gap: Space.xs - 2,
    },
    attentionTitle: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
    },
    attentionIssue: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
    },
    adjustPriceButton: {
      paddingHorizontal: Space.sm + 2,
      paddingVertical: Space.xs,
      borderRadius: Radius.md,
      borderWidth: 1,
      minHeight: Control.hit,
      justifyContent: 'center',
    },
    adjustPriceButtonText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
    },

    // ── Product Rail ──
    productRailWrap: {
      marginTop: Space.xl,
      paddingVertical: Space.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    productRailHeader: {
      fontSize: TypographyV2.caption.size,
      fontFamily: TypographyV2.caption.fontFamily,
      marginBottom: Space.sm,
    },
    productRail: {
      gap: Space.xs,
      flexDirection: 'row',
      alignItems: 'center',
    },
    productChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingHorizontal: Space.sm + 2,
      paddingVertical: Space.xs + 2,
      minHeight: Control.hit,
      justifyContent: 'center',
      borderRadius: Radius.md,
      borderWidth: StyleSheet.hairlineWidth,
    },
    productChipActive: {
      borderWidth: 1,
    },
    productChipThumb: {
      width: 18,
      height: 18,
      borderRadius: Radius.md,
    },
    productChipText: {
      fontSize: TypographyV2.caption.size,
      fontFamily: TypographyV2.caption.fontFamily,
      maxWidth: 120,
    },
    productChipTextActive: {
      fontFamily: TypographyV2.bodyStrong.fontFamily,
    },

    // ── Listing View Styles ──
    productAnalyticsContainer: {
      paddingTop: Space.md,
    },
    productHero: {
      flexDirection: 'row',
      gap: Space.md,
      alignItems: 'center',
    },
    productHeroMedia: {
      width: 76,
      height: 76,
      borderRadius: Radius.sm,
      overflow: 'hidden',
    },
    productHeroImage: {
      width: '100%',
      height: '100%',
    },
    productHeroDetails: {
      flex: 1,
      gap: 2,
    },
    productHeroStatusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      marginBottom: 2,
    },
    statusPill: {
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: Radius.sm,
    },
    statusText: {
      fontSize: TypographyV2.label.size,
      fontFamily: TypographyV2.label.fontFamily,
      letterSpacing: TypographyV2.label.letterSpacing,
    },
    marketDaysText: {
      fontSize: TypographyV2.caption.size,
      fontFamily: FontFamily.regular,
    },
    productHeroTitle: {
      fontSize: TypographyV2.itemTitle.size,
      fontFamily: TypographyV2.itemTitle.fontFamily,
    },
    productHeroPrice: {
      fontSize: TypographyV2.sectionTitle.size,
      fontFamily: TypographyV2.sectionTitle.fontFamily,
      fontVariant: ['tabular-nums'],
    },
    productHeroMeta: {
      fontSize: TypographyV2.caption.size,
      fontFamily: TypographyV2.caption.fontFamily,
    },
    productActionRow: {
      flexDirection: 'row',
      gap: Space.lg,
      marginTop: Space.md,
      paddingBottom: Space.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    productActionLink: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingVertical: Space.xs,
    },
    productActionText: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
    },
    listingErrorState: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: Space.md,
      gap: Space.md,
    },
    listingErrorText: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      flexShrink: 1,
    },
    listingErrorRetry: {
      paddingVertical: Space.xs,
      paddingHorizontal: Space.md,
      borderWidth: 1,
      borderRadius: Radius.md,
    },
    listingErrorRetryText: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
    },
    productStatsStrip: {
      flexDirection: 'row',
      paddingVertical: Space.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    productStatItem: {
      flex: 1,
      alignItems: 'center',
    },
    productStatLabel: {
      fontSize: TypographyV2.caption.size,
      fontFamily: TypographyV2.caption.fontFamily,
      marginBottom: 4,
    },
    productStatValue: {
      fontSize: TypographyV2.sectionTitle.size,
      fontFamily: TypographyV2.sectionTitle.fontFamily,
      fontVariant: ['tabular-nums'],
    },
    productStatDivider: {
      width: 1,
      alignSelf: 'stretch',
      marginVertical: Space.xs,
    },

    // ── Spectrum Slider ──
    comparablesSection: {
      marginTop: Space.lg,
      paddingVertical: Space.sm,
    },
    comparablesHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    spectrumPill: {
      paddingHorizontal: Space.sm,
      paddingVertical: 2,
      borderRadius: Radius.sm,
    },
    spectrumPillText: {
      fontSize: TypographyV2.caption.size,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
    },
    spectrumSubtitle: {
      fontSize: TypographyV2.caption.size,
      fontFamily: TypographyV2.caption.fontFamily,
      marginBottom: Space.lg,
    },
    spectrumBarContainer: {
      position: 'relative',
      height: 36,
      justifyContent: 'center',
      marginBottom: Space.md,
    },
    spectrumTrack: {
      height: 6,
      borderRadius: Radius.sm,
      position: 'relative',
    },
    spectrumMedianMarker: {
      position: 'absolute',
      width: 2,
      height: 12,
      top: -3,
      borderRadius: 1,
    },
    spectrumPinContainer: {
      position: 'absolute',
      top: 0,
      alignItems: 'center',
      transform: [{ translateX: -24 }],
    },
    spectrumPinBadge: {
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: Radius.sm,
    },
    spectrumPinText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      fontVariant: ['tabular-nums'],
    },
    spectrumPinPoint: {
      width: 0,
      height: 0,
      borderLeftWidth: 4,
      borderRightWidth: 4,
      borderTopWidth: 4,
      borderLeftColor: 'transparent',
      borderRightColor: 'transparent',
    },
    comparablesValuesRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'baseline',
    },
    compValueItem: {
      alignItems: 'flex-start',
    },
    compValueLabel: {
      fontSize: TypographyV2.caption.size,
      fontFamily: TypographyV2.caption.fontFamily,
      marginBottom: 2,
    },
    compValueNumber: {
      fontSize: TypographyV2.bodyStrong.size,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      fontVariant: ['tabular-nums'],
    },

    // ── Price History ──
    priceHistorySection: {
      marginTop: Space.lg,
    },
    priceHistoryList: {
      marginTop: Space.xs,
      gap: Space.xs,
    },
    priceHistoryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingVertical: Space.xs,
    },
    priceHistoryText: {
      flex: 1,
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      fontVariant: ['tabular-nums'],
    },
    priceHistoryDate: {
      fontSize: TypographyV2.caption.size,
      fontFamily: TypographyV2.caption.fontFamily,
    },

    // ── Quick Reprice & Velocity (Mercari Smart Pricing Model) ──
    quickRepriceSection: {
      marginTop: Space.lg,
      padding: Space.md,
      borderRadius: Radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      backgroundColor: colors.surfaceElevated,
      gap: Space.sm,
    },
    quickRepriceTitle: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
    },
    quickRepriceRow: {
      flexDirection: 'row',
      gap: Space.sm,
    },
    quickRepriceButton: {
      flex: 1,
      minHeight: Control.hit,
      borderRadius: Radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      backgroundColor: colors.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: Space.xs,
      paddingVertical: Space.xs + 2,
    },
    quickRepriceButtonText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
    },
    quickRepriceSubtext: {
      fontSize: TypographyV2.caption.size,
      fontFamily: TypographyV2.caption.fontFamily,
      fontVariant: ['tabular-nums'],
    },
    quickRepriceStrategy: {
      fontSize: 11,
      fontFamily: TypographyV2.caption.fontFamily,
      marginBottom: 2,
    },
    velocityTag: {
      paddingHorizontal: Space.xs + 2,
      paddingVertical: Space.xs - 2,
      borderRadius: Radius.sm,
    },
    velocityTagText: {
      fontSize: TypographyV2.caption.size,
      fontFamily: FontFamily.semibold,
    },
    intentCallout: {
      padding: Space.sm + 2,
      borderRadius: Radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      marginTop: Space.md,
    },
    intentCalloutText: {
      flex: 1,
      fontSize: TypographyV2.caption.size,
      fontFamily: TypographyV2.caption.fontFamily,
      lineHeight: 16,
    },

    // ── Skeleton ──
    skeletonBlock: {
      backgroundColor: colors.surfaceAlt,
      borderRadius: Radius.sm,
    },
    skeletonKpiRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: Space.sm + 2,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
  });
}
