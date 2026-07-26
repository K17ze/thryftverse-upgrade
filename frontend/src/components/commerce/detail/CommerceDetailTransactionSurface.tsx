import React from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { useAppTheme } from '../../../theme/ThemeContext';
import { Space, Radius, Type } from '../../../theme/designTokens';

/**
 * Family transaction surface — the one strongly contained module near
 * the top of the page.
 *
 * Per spec 02:
 *   - Direct: price + protection + availability.
 *   - Auction: current bid + countdown + reserve + viewer state.
 *   - Co-Own: last trade + top of book + market mode + trade eligibility.
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
}: CommerceDetailTransactionSurfaceProps) {
  const { colors } = useAppTheme();

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: elevated ? colors.surfaceElevated : colors.surface,
          borderRadius: Radius.xl,
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
        <View style={styles.viewerStateRow}>{viewerState}</View>
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
  primaryRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: Space.sm,
    flexWrap: 'wrap',
  },
  label: {
    fontSize: Type.metaElevated.size,
    lineHeight: Type.metaElevated.lineHeight,
    fontWeight: '600',
    letterSpacing: Type.metaElevated.letterSpacing,
  },
  primaryValue: {
    fontSize: Type.priceLarge.size,
    lineHeight: Type.priceLarge.lineHeight,
    fontWeight: '700',
    letterSpacing: Type.priceLarge.letterSpacing,
    fontVariant: ['tabular-nums'],
  },
  secondaryRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: Space.sm,
    marginTop: Space.xs,
    flexWrap: 'wrap',
  },
  secondaryLabel: {
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
  },
  secondaryValue: {
    fontSize: Type.bodyEmphasis.size,
    lineHeight: Type.bodyEmphasis.lineHeight,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  viewerStateRow: {
    marginTop: Space.sm,
  },
  statusRow: {
    marginTop: Space.sm,
    paddingTop: Space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
