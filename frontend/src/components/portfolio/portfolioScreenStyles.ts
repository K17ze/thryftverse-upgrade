import { StyleSheet } from 'react-native';
import { Space, FontFamily, Stroke, Numeric } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { RadiusRoleValue } from '../../theme/surfaceRadiusRules';

/** Screen-level styles for PortfolioScreen — extracted to keep the
 *  orchestrator under the size budget. All colours are applied inline at
 *  the call sites, so this stays a static sheet. */
export const portfolioScreenStyles = StyleSheet.create({
  listContent: {
    paddingHorizontal: Space.md,
  },
  // ── Partial-failure warning banner ──
  // Inline warning when some asset fetches failed. Does not replace the
  // positions list — sits above it as an additional advisory.
  partialBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  partialBannerText: {
    flex: 1,
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: FontFamily.regular,
    letterSpacing: TypographyV2.body.letterSpacing,
  },
  // ── Portfolio summary — the one dominant panel above the fold ──
  // Per AGENTS.md §4 surface budget: one dominant non-media panel is allowed.
  // Calm financial presentation: flat canvas, hairline border, generous padding.
  // 24pt section spacing after the card (Space.lg).
  summaryCard: {
    paddingVertical: Space.md,
    paddingHorizontal: Space.xs,
    gap: Space.sm,
    marginBottom: Space.lg,
  },
  // Label uses captionElevated per Design.md financial UI spec — quiet,
  // professional, not competing with the value below.
  summaryLabel: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.regular,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
  summaryValue: {
    fontSize: Numeric.priceLarge.size,
    lineHeight: Numeric.priceLarge.lineHeight,
    fontFamily: FontFamily.bold,
    letterSpacing: Numeric.priceLarge.letterSpacing,
    fontVariant: ['tabular-nums'] as ['tabular-nums'],
  },
  // ── 4-tile summary stats — total return / unrealised / realised / distrib.
  // Per Design.md: 12-16pt between data rows. Each stat has Space.sm (8px)
  // horizontal padding for breathing room. Labels use metaElevated (11/14/600)
  // for quiet hierarchy that doesn't compete with the numeric values.
  // Values use Numeric.priceList (20/24/700) with tabular-nums for stable
  // column alignment — per spec 11_COOWN: "Monetary and unit quantities
  // never change width erratically."
  // ── P&L flat rows — replaced 4-tile grid ──
  pnlRows: {
    marginTop: Space.sm },
  pnlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Space.sm + 2,
    borderBottomWidth: StyleSheet.hairlineWidth },
  pnlLabel: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: TypographyV2.body.fontFamily },
  // ── Allocation card — calm, professional breakdown ──
  // Per spec 11_COOWN: 24pt between sections. Hairline separator, no card
  // chrome — flat canvas with spacing communicates relationship.
  allocationCard: {
    paddingVertical: Space.lg,
    gap: Space.sm,
    marginBottom: Space.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  // ── Portfolio tab toggle — calm, professional segment control ──
  // Per Design.md: 2-3px underline indicator in colors.brand/textPrimary.
  // Tab text uses bodyEmphasis (15/21/600) for clear hierarchy.
  portfolioTabRow: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: Space.lg,
    marginTop: Space.lg,
  },
  portfolioTab: {
    paddingVertical: Space.sm + 2,
    paddingHorizontal: Space.md,
    borderBottomWidth: Stroke.emphasis,
    borderBottomColor: 'transparent',
    marginRight: Space.sm,
  },
  portfolioTabText: {
    fontSize: TypographyV2.bodyStrong.size,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
    fontFamily: FontFamily.regular,
    letterSpacing: TypographyV2.bodyStrong.letterSpacing,
  },
  // ── Position insight (calm replacement for gamification cards) ──
  // ── Position insight — calm, factual summary ──
  // 24pt section spacing. Hairline separator, no card chrome.
  // Per spec 11_COOWN: "Remove any gamified elements."
  insightCard: {
    marginBottom: Space.lg,
    overflow: 'hidden',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  insightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.md,
    paddingHorizontal: Space.md,
  },
  // Insight label uses captionElevated for quiet readability.
  insightLabel: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.regular,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
  insightTitle: {
    flex: 1,
    fontSize: TypographyV2.body.size,
    fontFamily: FontFamily.medium,
    letterSpacing: TypographyV2.body.letterSpacing,
    minWidth: 0,
  },
  // Allocation title uses subtitle (17/24/600) — clear section header per
  // Design.md type scale. Subtitle uses captionElevated for quiet metadata.
  allocationTitle: {
    fontSize: TypographyV2.sectionTitle.size,
    lineHeight: TypographyV2.sectionTitle.lineHeight,
    fontFamily: FontFamily.semibold,
    letterSpacing: TypographyV2.sectionTitle.letterSpacing,
  },
  allocationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Space.xs,
  },
  // Allocation subtitle uses captionElevated for quiet metadata.
  allocationSubtitle: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.regular,
    letterSpacing: TypographyV2.meta.letterSpacing,
    marginTop: Space.xs / 2,
    marginBottom: Space.xs,
  },
  // Issuer section — 24pt between groups per spec.
  issuerSection: {
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: Space.lg,
    paddingTop: Space.lg,
  },
  // ── Allocation bars — 12-16pt between data rows per spec ──
  // Bar labels use captionElevated for quiet readability. Bar percentage
  // values use tabular-nums for stable alignment.
  barsContainer: {
    gap: Space.md,
  },
  barItem: {
    gap: Space.xs,
  },
  barHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  barLabel: {
    flex: 1,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.regular,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
  barPct: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.semibold,
    fontVariant: ['tabular-nums'] as ['tabular-nums'],
  },
  barTrack: {
    height: Space.xs,
    borderRadius: RadiusRoleValue.compactControl,
    overflow: 'hidden',
  },
  barFill: {
    height: Space.xs,
    borderRadius: RadiusRoleValue.compactControl,
  },
  sectionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Space.sm,
  },
  sectionActions: {
    flexDirection: 'row',
    gap: Space.md,
  },
  // ── Realised returns — calm income surface ──
  // 24pt section spacing. Hairline separator, no card chrome.
  realisedCard: {
    paddingVertical: Space.lg,
    marginBottom: Space.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  realisedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  realisedIcon: {
    width: Space.xl + Space.xs,
    height: Space.xl + Space.xs,
    borderRadius: RadiusRoleValue.pillAvatar,
    alignItems: 'center',
    justifyContent: 'center',
  },
  realisedHeaderText: {
    flex: 1,
    gap: Space.xs / 2,
  },
  realisedLabel: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.regular,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
  realisedCaption: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.regular,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
  realisedAmount: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: FontFamily.bold,
    fontVariant: ['tabular-nums'] as ['tabular-nums'],
  },
  // ── Watchlist row — calm navigation, 24pt section spacing ──
  watchlistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.lg,
    marginBottom: Space.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  watchlistIcon: {
    width: Space.xl + Space.xs,
    height: Space.xl + Space.xs,
    borderRadius: RadiusRoleValue.pillAvatar,
    alignItems: 'center',
    justifyContent: 'center',
  },
  watchlistBody: {
    flex: 1,
    gap: Space.xs / 2,
  },
  watchlistTitle: {
    fontSize: TypographyV2.bodyStrong.size,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
    fontFamily: FontFamily.semibold,
    letterSpacing: TypographyV2.bodyStrong.letterSpacing,
  },
  watchlistSub: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.regular,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
  // Section title uses subtitle (17/24/600) — clear section header.
  // Section links use captionElevated for quiet, professional navigation.
  sectionTitle: {
    fontSize: TypographyV2.sectionTitle.size,
    lineHeight: TypographyV2.sectionTitle.lineHeight,
    fontFamily: FontFamily.semibold,
    letterSpacing: TypographyV2.sectionTitle.letterSpacing,
  },
  sectionLink: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.semibold,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
  // ── Rights card — calm, professional, 24pt section spacing ──
  rightsCard: {
    paddingVertical: Space.lg,
    gap: Space.sm,
    marginBottom: Space.xl,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rightsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  rightsTitle: {
    fontSize: TypographyV2.bodyStrong.size,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
    fontFamily: FontFamily.semibold,
    letterSpacing: TypographyV2.bodyStrong.letterSpacing,
  },
  rightsList: {
    gap: Space.xs,
  },
  rightsItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  rightsText: {
    flex: 1,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight + 2,
    fontFamily: FontFamily.regular,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
  // ── Today's change row — tabular numerics for stable alignment ──
  // Per spec 11_COOWN: "Monetary and unit quantities never change width
  // erratically." All numeric values use tabular-nums.
  todayChangeRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Space.xs,
    flexWrap: 'wrap',
  },
  todayChangeValue: {
    fontSize: TypographyV2.bodyStrong.size,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
    fontFamily: FontFamily.semibold,
    letterSpacing: TypographyV2.bodyStrong.letterSpacing,
    fontVariant: ['tabular-nums'] as ['tabular-nums'],
  },
  todayChangePct: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: FontFamily.medium,
    letterSpacing: TypographyV2.body.letterSpacing,
    fontVariant: ['tabular-nums'] as ['tabular-nums'],
  },
  todayChangeTime: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.regular,
    letterSpacing: TypographyV2.meta.letterSpacing,
    fontVariant: ['tabular-nums'] as ['tabular-nums'],
  },
  // ── Data quality text — flat, no chrome ──
  dataQualityText: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.regular,
    letterSpacing: TypographyV2.meta.letterSpacing,
    fontVariant: ['tabular-nums'] as ['tabular-nums'],
  },
});
