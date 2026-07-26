import React from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { useAppTheme } from '../../../theme/ThemeContext';
import { Space, Type } from '../../../theme/designTokens';

/**
 * Compact metric row — a label/value pair laid out for tabular numerals.
 *
 * Used for secondary facts (NAV/unit, next distribution, holder count,
 * bid count, shipping speed). Not for the dominant transaction value —
 * that lives in the transaction surface.
 *
 * Per spec 02: missing values use muted copy, not a display-size em
 * dash. Pass `value="Not available"` (or similar) for unavailable
 * facts; pass `muted` to render the value in the muted text colour.
 */
export interface CommerceDetailMetricRowProps {
  label: string;
  value?: string;
  /** When true, the value renders in the muted text colour (used for
   * unavailable facts). */
  muted?: boolean;
  /** Optional trailing glyph (e.g. info icon). */
  trailing?: React.ReactNode;
  /** Optional sub-label under the value (e.g. "per unit"). */
  subLabel?: string;
}

export function CommerceDetailMetricRow({
  label,
  value,
  muted = false,
  trailing,
  subLabel,
}: CommerceDetailMetricRowProps) {
  const { colors } = useAppTheme();

  return (
    <View style={styles.row}>
      <Text
        style={[styles.label, { color: colors.textSecondary }]}
        numberOfLines={1}
      >
        {label}
      </Text>
      <View style={styles.valueCluster}>
        {value ? (
          <Text
            style={[
              styles.value,
              { color: muted ? colors.textMuted : colors.textPrimary },
            ]}
            numberOfLines={1}
          >
            {value}
          </Text>
        ) : null}
        {subLabel ? (
          <Text style={[styles.subLabel, { color: colors.textMuted }]} numberOfLines={1}>
            {subLabel}
          </Text>
        ) : null}
        {trailing}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Space.sm,
    paddingVertical: Space.sm,
  },
  label: {
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
    flexShrink: 1,
  },
  valueCluster: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Space.xs,
    flexShrink: 0,
  },
  value: {
    fontSize: Type.bodyEmphasis.size,
    lineHeight: Type.bodyEmphasis.lineHeight,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  subLabel: {
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
  },
});
