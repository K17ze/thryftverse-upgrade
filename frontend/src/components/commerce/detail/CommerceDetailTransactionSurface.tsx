import React from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { useAppTheme } from '../../../theme/ThemeContext';
import { Space } from '../../../theme/designTokens';
import { TypographyV2 } from '../../../theme/typography.v2';
import type { CommerceDetailFamily } from './types';

/**
 * Family transaction composition — one coherent market/action module
 * near the top of the page.
 *
 * Per spec 02:
 *   - Direct: price + protection + availability.
 *   - Auction: current bid + countdown + reserve + viewer state.
 *   - Co-Own: last trade + top of book + market mode + trade eligibility.
 *
 * Per spec 05 §1 (family-aware transaction variants):
 *   - Direct: near-flat, minimal radius, limited surface contrast.
 *     Price often remains in identity; no unnecessary card when there
 *     is no complex transaction state.
 *   - Auction: stronger numeric composition, current bid dominant,
 *     countdown integrated, reserve/viewer state secondary, controlled
 *     urgency.
 *   - Co-Own: structured market grid, tabular bid/ask, precise status
 *     row, no crypto visual gimmicks.
 *
 * The composition stays flat on the page canvas. Hairlines and spacing,
 * rather than a generic rounded panel, express the relationships between
 * price, market depth and status. Family screens populate it via children
 * plus the structured props so the visual grammar stays shared.
 */
export interface CommerceDetailTransactionSurfaceProps {
  /** Optional dominant value (current bid / last trade / price). */
  primaryValue?: string;
  /** Optional label for the dominant value (e.g. "Current bid"). */
  primaryLabel?: string;
  /** Optional secondary value line (e.g. "Minimum next bid £45"). */
  secondaryValue?: string;
  secondaryLabel?: string;
  /** Optional compact status row rendered at the bottom of the surface
   * (e.g. reserve status, market mode, availability). */
  statusRow?: React.ReactNode;
  /** Optional viewer-state line (e.g. "You're leading" / "5 units owned"). */
  viewerState?: React.ReactNode;
  /** Family-authored content sharing the primary value's optical axis. */
  headlineAside?: React.ReactNode;
  /** Family-specific children (countdown, top-of-book rows, etc.). */
  children?: React.ReactNode;
  /** When true, the surface uses the elevated surface fill. Useful for
   * dark-mode parity on critical state. */
  elevated?: boolean;
  /** Family variant — controls rhythm and numeric composition weight.
   * Defaults to `direct` for backward compatibility. */
  family?: CommerceDetailFamily;
  /** Removes page margins when the parent owns the full-bleed chapter. */
  flush?: boolean;
  /** Optional family surface colour; geometry remains flat/full-width. */
  surfaceColor?: string;
}

export function CommerceDetailTransactionSurface({
  primaryValue,
  primaryLabel,
  secondaryValue,
  secondaryLabel,
  statusRow,
  viewerState,
  headlineAside,
  children,
  elevated = false,
  family = 'direct',
  flush = false,
  surfaceColor }: CommerceDetailTransactionSurfaceProps) {
  const { colors } = useAppTheme();

  // Per spec 05 §1: family-aware composition.
  //   - direct: quiet price rhythm.
  //   - auction: stronger numeric weight.
  //   - co_own: structured market grid.
  const familyContainerStyle =
    family === 'direct'
      ? styles.containerDirect
      : family === 'auction'
        ? styles.containerAuction
        : styles.containerCoOwn;

  const primaryContent = (primaryLabel || primaryValue) ? (
    <View style={[styles.primaryRow, family === 'co_own' && styles.primaryRowCoOwn]}>
      {primaryLabel ? (
        <Text style={[styles.label, { color: colors.textSecondary }]} numberOfLines={1}>
          {primaryLabel}
        </Text>
      ) : null}
      {primaryValue ? (
        <Text
          style={[
            styles.primaryValue,
            family === 'auction' && styles.primaryValueAuction,
            family === 'co_own' && styles.primaryValueCoOwn,
            { color: colors.textPrimary },
          ]}
          accessibilityRole="text"
          adjustsFontSizeToFit
          minimumFontScale={0.78}
          numberOfLines={1}
        >
          {primaryValue}
        </Text>
      ) : null}
    </View>
  ) : null;

  const secondaryContent = (secondaryLabel || secondaryValue) ? (
    <View style={[styles.secondaryRow, family === 'auction' && styles.secondaryRowAuction]}>
      {secondaryLabel ? (
        <Text style={[styles.secondaryLabel, { color: colors.textSecondary }]} numberOfLines={1}>
          {secondaryLabel}
        </Text>
      ) : null}
      {secondaryValue ? (
        <Text style={[styles.secondaryValue, { color: colors.textPrimary }]} numberOfLines={1}>
          {secondaryValue}
        </Text>
      ) : null}
    </View>
  ) : null;

  return (
    <View
      style={[
        styles.container,
        flush && styles.containerFlush,
        familyContainerStyle,
        {
          backgroundColor: surfaceColor
            ?? (elevated
              ? colors.surfaceElevated
              : colors.background) },
      ]}
      accessibilityRole="summary"
    >
      {family === 'auction' && (headlineAside || secondaryContent) ? (
        <View style={styles.auctionHeadline}>
          {primaryContent}
          {headlineAside ? <View style={styles.auctionHeadlineAside}>{headlineAside}</View> : secondaryContent}
        </View>
      ) : (
        <>
          {primaryContent}
          {secondaryContent}
        </>
      )}

      {children}

      {viewerState ? (
        <View style={[styles.viewerStateRow, { borderTopColor: colors.borderSubtle }]}>
          {viewerState}
        </View>
      ) : null}

      {statusRow ? (
        <View
          style={[styles.statusRow, { borderTopColor: colors.borderSubtle }]}
        >
          {statusRow}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: Space.md,
    marginTop: Space.md,
    paddingHorizontal: 0 },
  containerFlush: {
    marginHorizontal: 0,
    paddingHorizontal: Space.md },
  // Direct uses a quiet, near-flat price rhythm.
  containerDirect: {
    paddingHorizontal: 0,
    paddingVertical: Space.md,
    borderWidth: 0 },
  // Auction gives the current bid breathing room without introducing
  // another visual surface.
  containerAuction: {
    paddingTop: Space.md,
    paddingBottom: Space.sm },
  // Co-Own uses a structured market grid on the same page canvas.
  containerCoOwn: {
    paddingTop: Space.md,
    paddingBottom: Space.sm },
  // Primary row: label sits quietly above the dominant value. The
  // value is the hero of this surface — it does not compete with the
  // label for horizontal space. The gap creates clear hierarchy.
  primaryRow: {
    flexDirection: 'column',
    gap: Space.xs + 2 },
  primaryRowCoOwn: {
    gap: Space.xs + 2 },
  label: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
    textTransform: 'none' },
  primaryValue: {
    fontSize: TypographyV2.priceHero.size,
    lineHeight: TypographyV2.priceHero.lineHeight,
    fontFamily: TypographyV2.priceHero.fontFamily,
    letterSpacing: TypographyV2.priceHero.letterSpacing,
    fontVariant: ['tabular-nums'] },
  primaryValueAuction: {
    fontSize: TypographyV2.display.size + 2,
    lineHeight: TypographyV2.display.lineHeight + 2,
    letterSpacing: -0.8 },
  primaryValueCoOwn: {
    fontSize: TypographyV2.display.size,
    lineHeight: TypographyV2.display.lineHeight,
    letterSpacing: -0.55 },
  auctionHeadline: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: Space.md },
  auctionHeadlineAside: {
    flexShrink: 1,
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
    paddingBottom: Space.xs },
  secondaryRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: Space.sm,
    marginTop: Space.sm,
    flexWrap: 'wrap' },
  secondaryRowAuction: {
    flexDirection: 'column',
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
    marginTop: 0,
    gap: Space.xs,
    flexShrink: 0 },
  secondaryLabel: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: TypographyV2.body.fontFamily },
  secondaryValue: {
    fontSize: TypographyV2.bodyStrong.size,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    fontVariant: ['tabular-nums'] },
  // Viewer state row: separated by a hairline so it reads as a
  // distinct concern from the primary value, but still part of the
  // same surface.
  viewerStateRow: {
    marginTop: Space.md,
    paddingTop: Space.md,
    borderTopWidth: StyleSheet.hairlineWidth },
  statusRow: {
    marginTop: Space.md,
    paddingTop: Space.md,
    borderTopWidth: StyleSheet.hairlineWidth } });
