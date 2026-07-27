import React from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { useAppTheme } from '../../../theme/ThemeContext';
import { Space, Radius, Type, Typography } from '../../../theme/designTokens';
import type { CommerceDetailFamily } from './types';

/**
 * Family transaction surface — the one strongly contained module near
 * the top of the page.
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
 * This is the only place a strong card radius is justified near the
 * top of the page. The surface is a single composed block, not several
 * adjacent cards. Family screens populate it via children + the
 * structured props so the visual grammar stays shared.
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
  /** Family-specific children (countdown, top-of-book rows, etc.). */
  children?: React.ReactNode;
  /** When true, the surface uses the elevated surface fill. Useful for
   * dark-mode parity on critical state. */
  elevated?: boolean;
  /** Family variant — controls containment, radius and numeric
   * composition weight. Defaults to `direct` for backward compatibility. */
  family?: CommerceDetailFamily;
}

export function CommerceDetailTransactionSurface({
  primaryValue,
  primaryLabel,
  secondaryValue,
  secondaryLabel,
  statusRow,
  viewerState,
  children,
  elevated = false,
  family = 'direct',
}: CommerceDetailTransactionSurfaceProps) {
  const { colors } = useAppTheme();

  // Per spec 05 §1: family-aware containment.
  //   - direct: near-flat, minimal radius, subtle surface contrast.
  //   - auction: contained, medium radius, stronger numeric weight.
  //   - co_own: contained, medium radius, structured market grid.
  const familyContainerStyle =
    family === 'direct'
      ? styles.containerDirect
      : family === 'auction'
        ? styles.containerAuction
        : styles.containerCoOwn;

  const familyRadius =
    family === 'direct' ? Radius.lg : Radius.xl;

  return (
    <View
      style={[
        styles.container,
        familyContainerStyle,
        {
          backgroundColor: elevated ? colors.surfaceElevated : colors.surface,
          borderRadius: familyRadius,
        },
      ]}
      accessibilityRole="summary"
    >
      {(primaryLabel || primaryValue) && (
        <View style={styles.primaryRow}>
          {primaryLabel ? (
            <Text style={[styles.label, { color: colors.textSecondary }]} numberOfLines={1}>
              {primaryLabel}
            </Text>
          ) : null}
          {primaryValue ? (
            <Text
              style={[styles.primaryValue, { color: colors.textPrimary }]}
              accessibilityRole="text"
            >
              {primaryValue}
            </Text>
          ) : null}
        </View>
      )}

      {(secondaryLabel || secondaryValue) && (
        <View style={styles.secondaryRow}>
          {secondaryLabel ? (
            <Text style={[styles.secondaryLabel, { color: colors.textSecondary }]} numberOfLines={1}>
              {secondaryLabel}
            </Text>
          ) : null}
          {secondaryValue ? (
            <Text
              style={[styles.secondaryValue, { color: colors.textPrimary }]}
              numberOfLines={1}
            >
              {secondaryValue}
            </Text>
          ) : null}
        </View>
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
    marginTop: Space.sm,
    padding: Space.md,
  },
  // Per spec 05 §1: Direct is near-flat — subtle surface contrast and
  // lighter padding so it reads as a quiet confidence block, not a
  // dashboard card.
  containerDirect: {
    padding: Space.sm + 2,
  },
  // Auction has stronger numeric composition — standard padding keeps
  // the current bid dominant with breathing room for the countdown.
  containerAuction: {
    padding: Space.md,
  },
  // Co-Own uses a structured market grid — standard padding with
  // slightly more vertical room for the bid/ask row.
  containerCoOwn: {
    padding: Space.md,
  },
  // Primary row: label sits quietly above the dominant value. The
  // value is the hero of this surface — it does not compete with the
  // label for horizontal space.
  primaryRow: {
    flexDirection: 'column',
    gap: 2,
  },
  label: {
    fontSize: Type.metaElevated.size,
    lineHeight: Type.metaElevated.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.metaElevated.letterSpacing,
    textTransform: 'uppercase',
  },
  primaryValue: {
    fontSize: Type.priceLarge.size,
    lineHeight: Type.priceLarge.lineHeight,
    fontFamily: Typography.family.bold,
    letterSpacing: Type.priceLarge.letterSpacing,
    fontVariant: ['tabular-nums'],
  },
  secondaryRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: Space.sm,
    marginTop: Space.sm,
    flexWrap: 'wrap',
  },
  secondaryLabel: {
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
    fontFamily: Typography.family.regular,
  },
  secondaryValue: {
    fontSize: Type.bodyEmphasis.size,
    lineHeight: Type.bodyEmphasis.lineHeight,
    fontFamily: Typography.family.semibold,
    fontVariant: ['tabular-nums'],
  },
  // Viewer state row: separated by a hairline so it reads as a
  // distinct concern from the primary value, but still part of the
  // same surface.
  viewerStateRow: {
    marginTop: Space.sm,
    paddingTop: Space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  statusRow: {
    marginTop: Space.sm,
    paddingTop: Space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
