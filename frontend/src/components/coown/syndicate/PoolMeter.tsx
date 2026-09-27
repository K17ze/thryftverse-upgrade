import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useAppTheme } from '../../../theme/ThemeContext';
import { Radius, Space } from '../../../theme/designTokens';

/** Funding progress — one thin meter, no chrome. The fill reads against
 * the canvas; the track is a quiet surface tone. */
export function PoolMeter({ pct }: { pct: number }) {
  const { colors } = useAppTheme();
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <View
      style={[styles.track, { backgroundColor: colors.surfaceAlt }]}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped) }}
      accessibilityLabel={`${Math.round(clamped)}% funded`}
    >
      {clamped > 0 ? (
        <View style={[styles.fill, { width: `${clamped}%`, backgroundColor: colors.brand }]} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: Space.xs / 2 + 1,
    borderRadius: Radius.full,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: Radius.full,
  },
});
