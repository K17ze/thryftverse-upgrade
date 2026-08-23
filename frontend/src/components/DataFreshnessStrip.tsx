import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useAppTheme } from '../theme/ThemeContext';
import { Type, FontFamily, Space, Stroke } from '../theme/designTokens';

/**
 * DataFreshnessStrip — a thin data-freshness indicator for financial surfaces.
 *
 * Shows a coloured dot (green < 60s, amber 60s–5min, red > 5min or offline)
 * alongside a relative timestamp ("Updated 12s ago" / "Updated 3m ago" /
 * "Offline"). An optional "Cached" label appears when `isStale` is true.
 *
 * The relative time re-evaluates every second via a lightweight interval so
 * the label stays accurate without re-rendering the parent.
 */
export interface DataFreshnessStripProps {
  /** Epoch milliseconds of the last data update. `null` when no data yet. */
  lastUpdatedMs: number | null;
  /** True when the device is offline. */
  isOffline: boolean;
  /** True when the displayed data is stale (e.g. cached fallback). Shows "Cached". */
  isStale?: boolean;
  /** Optional label override for the leading text (defaults to "Updated"). */
  label?: string;
}

/** Freshness thresholds in seconds. */
const FRESH_THRESHOLD_S = 60;
const STALE_THRESHOLD_S = 5 * 60;

type FreshnessTier = 'fresh' | 'aging' | 'stale';

function resolveTier(ageSeconds: number): FreshnessTier {
  if (ageSeconds < FRESH_THRESHOLD_S) return 'fresh';
  if (ageSeconds < STALE_THRESHOLD_S) return 'aging';
  return 'stale';
}

function formatRelativeAge(ageSeconds: number): string {
  if (ageSeconds < 60) {
    return `Updated ${Math.max(0, Math.floor(ageSeconds))}s ago`;
  }
  if (ageSeconds < 3600) {
    return `Updated ${Math.floor(ageSeconds / 60)}m ago`;
  }
  if (ageSeconds < 86400) {
    return `Updated ${Math.floor(ageSeconds / 3600)}h ago`;
  }
  return `Updated ${Math.floor(ageSeconds / 86400)}d ago`;
}

export function DataFreshnessStrip({
  lastUpdatedMs,
  isOffline,
  isStale = false,
  label = 'Updated',
}: DataFreshnessStripProps) {
  const { colors } = useAppTheme();
  const [, setTick] = useState(0);

  // Re-render every second so the relative timestamp stays accurate.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const now = Date.now();
  const ageSeconds = lastUpdatedMs != null ? (now - lastUpdatedMs) / 1000 : Infinity;

  const offline = isOffline || lastUpdatedMs == null;
  const tier = offline ? 'stale' : resolveTier(ageSeconds);

  const dotColor = offline
    ? colors.danger
    : tier === 'fresh'
      ? colors.success
      : tier === 'aging'
        ? colors.warning
        : colors.danger;

  const timeText = offline
    ? 'Offline'
    : label === 'Updated'
      ? formatRelativeAge(ageSeconds)
      : `${label} ${formatRelativeAge(ageSeconds).replace('Updated ', '')}`;

  return (
    <View style={[styles.container, { borderBottomColor: colors.border }]}>
      <View style={[styles.dot, { backgroundColor: dotColor }]} />
      <Text style={[styles.text, { color: colors.textSecondary }]} numberOfLines={1}>
        {timeText}
      </Text>
      {isStale && !offline ? (
        <Text style={[styles.cached, { color: colors.textMuted }]} numberOfLines={1}>
          · Cached
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Space.xs,
    paddingHorizontal: Space.md,
    borderBottomWidth: Stroke.hairline,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: Space.xs,
  },
  text: {
    fontFamily: FontFamily.medium,
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontWeight: Type.meta.weight,
    letterSpacing: Type.meta.letterSpacing,
  },
  cached: {
    fontFamily: FontFamily.regular,
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    marginLeft: Space.xxs,
  },
});

export default DataFreshnessStrip;
