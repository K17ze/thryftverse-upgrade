/**
 * CoOwnDripToggle — per-asset DRIP (dividend reinvestment) enrollment.
 *
 * Flat on canvas, no card chrome. A row with "Auto-reinvest" on the
 * left and a Switch on the right, a muted description below, the
 * projected next-payout units in success colour when enrolled, and an
 * error line in danger colour when a toggle fails.
 *
 * Anti-AI: one stroke grammar (hairline under the block only when
 * needed by the parent), one type scale, neutral palette with status
 * colour carrying meaning only. 44px hit target on the toggle row.
 */

import React from 'react';
import { View, Text, StyleSheet, Switch } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';

export interface CoOwnDripToggleProps {
  assetId: string;
  enrolled: boolean;
  onToggle: (enrolled: boolean) => void;
  /** Toggle in progress. */
  pending?: boolean;
  /** Last toggle error. */
  error?: string | null;
  /** Projected next reinvestment units (optional). */
  projectedUnits?: number | null;
}

export function CoOwnDripToggle({
  assetId,
  enrolled,
  onToggle,
  pending = false,
  error = null,
  projectedUnits = null,
}: CoOwnDripToggleProps) {
  const { colors } = useAppTheme();

  // assetId is part of the contract for telemetry/wiring on the parent
  // side; it is not rendered here. Reference it so it stays in scope and
  // lint does not flag an unused prop.
  void assetId;

  const showProjection = enrolled && projectedUnits != null && projectedUnits > 0;

  return (
    <View style={styles.root}>
      <View
        style={styles.toggleRow}
        accessibilityLabel={`Auto-reinvest distributions, currently ${enrolled ? 'on' : 'off'}`}
        accessibilityRole="switch"
        accessibilityState={{ checked: enrolled }}
      >
        <View style={styles.labelCol}>
          <Text style={[styles.label, { color: colors.textPrimary }]} numberOfLines={1}>
            Auto-reinvest
          </Text>
          <Text style={[styles.description, { color: colors.textMuted }]} numberOfLines={2}>
            Reinvest distributions into additional units automatically
          </Text>
        </View>
        <Switch
          value={enrolled}
          onValueChange={onToggle}
          disabled={pending}
          trackColor={{ false: colors.surfaceAlt, true: colors.coownUp }}
          thumbColor={colors.background}
          ios_backgroundColor={colors.surfaceAlt}
        />
      </View>

      {showProjection && (
        <Text style={[styles.projection, { color: colors.coownUp }]} numberOfLines={1}>
          Next payout → ~{projectedUnits} units
        </Text>
      )}

      {error ? (
        <View style={styles.errorRow}>
          <Text style={[styles.errorText, { color: colors.danger }]} numberOfLines={2}>
            {error}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: Space.xs,
    paddingTop: Space.sm,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Space.md,
    minHeight: 44,
  },
  labelCol: {
    flex: 1,
    gap: 2,
  },
  label: {
    fontSize: TypographyV2.bodyStrong.size,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    letterSpacing: TypographyV2.bodyStrong.letterSpacing,
  },
  description: {
    fontSize: TypographyV2.caption.size,
    lineHeight: TypographyV2.caption.lineHeight,
    fontFamily: TypographyV2.caption.fontFamily,
    letterSpacing: TypographyV2.caption.letterSpacing,
  },
  projection: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
    fontVariant: ['tabular-nums'],
  },
  errorRow: {
    marginTop: 2,
  },
  errorText: {
    fontSize: TypographyV2.caption.size,
    lineHeight: TypographyV2.caption.lineHeight,
    fontFamily: TypographyV2.caption.fontFamily,
    letterSpacing: TypographyV2.caption.letterSpacing,
  },
});

export default CoOwnDripToggle;
