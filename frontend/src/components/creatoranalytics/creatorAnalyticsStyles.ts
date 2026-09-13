import { StyleSheet } from 'react-native';
import type { ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius, FontFamily, Numeric } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';

// Shared stylesheet for the creator analytics dashboard screen and every
// extracted section component — mirrors the original monolith's styles so
// each section renders identically.
export function createCreatorAnalyticsStyles(colors: ThemeColors) {
  return StyleSheet.create({
    scrollContent: {
      paddingHorizontal: Space.md,
      paddingTop: Space.sm,
      paddingBottom: Space.xl },
    bannerWrap: {
      paddingHorizontal: Space.md,
      paddingTop: Space.sm },
    // ── Period selector: hairline tabs ──
    periodRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm + Space.xs },
    periodTab: {
      alignItems: 'center',
      paddingVertical: Space.xs,
      paddingHorizontal: Space.xxs },
    periodTabText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: FontFamily.semibold,
      letterSpacing: 0.3 },
    periodTabIndicator: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      height: 2,
      borderRadius: 1 },
    // ── Freshness ──
    freshnessRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingVertical: Space.xs },
    freshnessDot: {
      width: 6,
      height: 6,
      borderRadius: Radius.full },
    freshnessText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: FontFamily.medium },
    freshnessWatermark: {
      fontSize: TypographyV2.meta.size,
      fontFamily: FontFamily.regular },
    // ── Hero ──
    heroWrap: {
      paddingTop: Space.md,
      paddingBottom: Space.sm },
    heroMediaWrap: {
      position: 'relative',
      height: 140,
      borderRadius: Radius.md,
      overflow: 'hidden' },
    heroMedia: {
      width: '100%',
      height: 140 },
    heroOverlay: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      padding: Space.md },
    heroLabel: {
      fontSize: TypographyV2.meta.size,
      fontFamily: FontFamily.medium,
      letterSpacing: TypographyV2.meta.letterSpacing,
      color: colors.scrimTextSecondary },
    heroRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: Space.sm,
      marginTop: Space.xs },
    heroValue: {
      ...Numeric.priceList,
      fontSize: TypographyV2.priceHero.size,
      lineHeight: TypographyV2.priceHero.lineHeight,
      letterSpacing: TypographyV2.priceHero.letterSpacing,
      fontFamily: FontFamily.bold,
      color: colors.scrimTextPrimary,
      fontVariant: ['tabular-nums'] },
    heroDelta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs - 2,
      paddingHorizontal: Space.xs + 1,
      paddingVertical: Space.xs - 1,
      borderRadius: Radius.full },
    heroDeltaText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: FontFamily.semibold,
      letterSpacing: 0.2,
      color: colors.scrimTextPrimary },
    // ── Inline delta on hero (no pill chrome) ──
    heroDeltaInline: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2 },
    heroDeltaInlineText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: FontFamily.semibold,
      color: colors.scrimTextPrimary,
      fontVariant: ['tabular-nums'] },
    // ── Comparison context ──
    comparisonContext: {
      fontSize: TypographyV2.meta.size,
      fontFamily: FontFamily.regular,
      paddingVertical: Space.xs },
    // ── Suppressed dimensions ──
    suppressedCallout: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingVertical: Space.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      marginTop: Space.xs },
    suppressedText: {
      flex: 1,
      fontSize: TypographyV2.meta.size,
      fontFamily: FontFamily.regular },
    // ── Metrics ──
    metricsSection: {
      marginTop: Space.sm },
    // ── Partial error ──
    partialBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs + 1,
      paddingHorizontal: Space.sm + Space.xs,
      paddingVertical: Space.sm,
      borderRadius: Radius.sm,
      marginTop: Space.md },
    partialText: {
      flex: 1,
      fontSize: TypographyV2.meta.size,
      fontFamily: FontFamily.medium,
      lineHeight: TypographyV2.meta.lineHeight },
    // ── Chart ──
    chartSection: {
      marginTop: Space.lg },
    // ── Content ranking ──
    contentSection: {
      marginTop: Space.lg },
    contentRowPress: {
      marginLeft: -Space.xs },
    sectionLabel: {
      fontSize: TypographyV2.meta.size,
      fontFamily: FontFamily.medium,
      letterSpacing: TypographyV2.meta.letterSpacing,
      marginBottom: Space.sm },
    // ── Earnings ──
    earningsSection: {
      marginTop: Space.xl },
    payoutButton: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: Space.sm + 2,
      borderRadius: Radius.sm,
      marginTop: Space.md,
      minHeight: 48 },
    payoutButtonText: {
      fontSize: TypographyV2.body.size,
      fontFamily: FontFamily.semibold,
      color: colors.textInverse },
    payoutErrorText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: FontFamily.regular,
      marginTop: Space.xs },
    earningsEntries: {
      marginTop: Space.lg },
    entriesLabel: {
      fontSize: TypographyV2.meta.size,
      fontFamily: FontFamily.medium,
      marginBottom: Space.sm },
    entryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: Space.sm,
      borderBottomWidth: StyleSheet.hairlineWidth },
    entryInfo: {
      flex: 1,
      gap: Space.xxs },
    entryType: {
      fontSize: TypographyV2.body.size,
      fontFamily: FontFamily.semibold,
      letterSpacing: TypographyV2.body.letterSpacing },
    entryDesc: {
      fontSize: TypographyV2.meta.size,
      fontFamily: FontFamily.regular },
    entryAmount: {
      ...Numeric.numericMeta,
      fontSize: TypographyV2.body.size,
      fontFamily: FontFamily.semibold },
    // ── Footer ──
    footer: {
      marginTop: Space.xl,
      gap: Space.xxs },
    footerText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: FontFamily.regular } });
}

export function createContentRowStyles(colors: ThemeColors) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      paddingVertical: Space.sm + 2,
      borderBottomWidth: StyleSheet.hairlineWidth },
    rank: {
      fontSize: TypographyV2.meta.size,
      fontFamily: FontFamily.semibold,
      width: 20,
      textAlign: 'center',
      ...Numeric.numericMeta },
    thumbWrap: {
      width: 48,
      height: 48 },
    thumb: {
      width: 48,
      height: 48,
      borderRadius: Radius.sm },
    thumbFallback: {
      alignItems: 'center',
      justifyContent: 'center' },
    info: {
      flex: 1,
      gap: Space.xs - 1 },
    title: {
      fontSize: TypographyV2.body.size,
      fontFamily: FontFamily.semibold,
      letterSpacing: TypographyV2.body.letterSpacing },
    meta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs },
    metaText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: FontFamily.regular,
      letterSpacing: TypographyV2.meta.letterSpacing,
      fontVariant: ['tabular-nums'] },
    metaDot: {
      fontSize: TypographyV2.meta.size - 1 } });
}

export function createSkeletonStyles(colors: ThemeColors) {
  return StyleSheet.create({
    skelMetricRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: Space.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border },
    skelContentRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      paddingVertical: Space.sm + 2 },
    skelContentInfo: {
      flex: 1 } });
}
