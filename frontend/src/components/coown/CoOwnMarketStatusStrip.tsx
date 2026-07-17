/**
 * CoOwnMarketStatusStrip — the single source of truth for market
 * microstructure state on AssetDetail + Trade.
 *
 * One row, height ExchangeLayout.statusStripHeight. Dot from MARKET_COLORS,
 * label, countdown (factual, not gamified), disclosure version chip.
 * States are distinguishable by shape + label + dot, not colour alone.
 *
 * See docs/coown/flagship-exchange-upgrade/04 §A1 + 03 §2.4.
 */

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Radius, Type, Typography, ExchangeLayout } from '../../theme/designTokens';
import { MARKET_COLORS, type CoOwnMarketMode } from '../../constants/colors';

export interface CoOwnMarketStatusStripProps {
  mode: CoOwnMarketMode;
  sessionLabel: string;
  countdownSeconds?: number | null;
  haltReason?: string;
  nextSessionAt?: string;
  disclosureVersion?: string;
  onOpenRights?: () => void;
}

/** Format countdown seconds as "Hh Mm" or "Mm Ss" — factual, not gamified. */
function formatCountdown(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/** Human-readable mode label. */
const MODE_LABEL: Record<CoOwnMarketMode, string> = {
  continuous: 'Continuous',
  call_auction: 'Call auction',
  rfq: 'RFQ',
  halted: 'Halted',
  closed: 'Closed',
};

export function CoOwnMarketStatusStrip({
  mode,
  sessionLabel,
  countdownSeconds,
  haltReason,
  nextSessionAt,
  disclosureVersion,
  onOpenRights,
}: CoOwnMarketStatusStripProps) {
  const { colors } = useAppTheme();
  const marketColor = MARKET_COLORS[mode === 'call_auction' ? 'auction' : mode];
  const [remaining, setRemaining] = useState(countdownSeconds ?? null);

  // Tick countdown once per second — factual, no pulse animation.
  useEffect(() => {
    if (countdownSeconds == null || countdownSeconds <= 0) {
      setRemaining(null);
      return;
    }
    setRemaining(countdownSeconds);
    const interval = setInterval(() => {
      setRemaining((prev) => {
        if (prev == null || prev <= 1) {
          clearInterval(interval);
          return null;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [countdownSeconds]);

  // Build the subtitle based on mode
  let subtitle = sessionLabel;
  if (mode === 'halted' && haltReason) {
    subtitle = haltReason;
  } else if (mode === 'closed' && nextSessionAt) {
    subtitle = `Next session ${nextSessionAt}`;
  }

  // Diamond shape for auction/rfq, circle for others
  const isDiamond = marketColor.shape === 'diamond';

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.surface, borderBottomColor: colors.border },
      ]}
      accessibilityRole="header"
      accessibilityLabel={`${MODE_LABEL[mode]} market. ${subtitle}${remaining != null ? `. ${formatCountdown(remaining)} remaining` : ''}`}
    >
      {/* Status dot — shape differentiator for accessibility */}
      <View
        style={[
          styles.dot,
          isDiamond ? styles.dotDiamond : styles.dotCircle,
          { backgroundColor: marketColor.dot },
        ]}
      />

      {/* Mode label */}
      <Text style={[styles.modeLabel, { color: colors.textPrimary }]}>
        {MODE_LABEL[mode]}
      </Text>

      {/* Separator */}
      <Text style={[styles.separator, { color: colors.textMuted }]}>·</Text>

      {/* Session info */}
      <Text
        style={[styles.sessionLabel, { color: colors.textSecondary }]}
        numberOfLines={1}
      >
        {subtitle}
      </Text>

      {/* Countdown — factual, right-aligned */}
      {remaining != null && remaining > 0 && (
        <Text style={[styles.countdown, { color: colors.textSecondary }]}>
          {formatCountdown(remaining)}
        </Text>
      )}

      {/* Disclosure version chip — tap to open rights sheet */}
      {disclosureVersion && (
        <PressableChip
          label={disclosureVersion}
          onPress={onOpenRights}
          colors={colors}
        />
      )}
    </View>
  );
}

/** Small tappable chip for the disclosure version. */
function PressableChip({
  label,
  onPress,
  colors,
}: {
  label: string;
  onPress?: () => void;
  colors: ReturnType<typeof useAppTheme>['colors'];
}) {
  if (!onPress) {
    return (
      <View style={[styles.chip, { backgroundColor: colors.surfaceAlt }]}>
        <Text style={[styles.chipText, { color: colors.textMuted }]} numberOfLines={1}>
          {label}
        </Text>
      </View>
    );
  }

  return (
    <Pressable
      style={[styles.chip, { backgroundColor: colors.surfaceAlt }]}
      accessibilityRole="button"
      accessibilityLabel={`Rights version ${label}. Tap to view.`}
      onPress={onPress}
    >
      <Text style={[styles.chipText, { color: colors.textSecondary }]} numberOfLines={1}>
        {label}
      </Text>
      <Ionicons name="chevron-forward" size={10} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    height: ExchangeLayout.statusStripHeight,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.md,
    gap: Space.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  dot: {
    width: 8,
    height: 8,
  },
  dotCircle: {
    borderRadius: 4,
  },
  dotDiamond: {
    transform: [{ rotate: '45deg' }],
  },
  modeLabel: {
    fontSize: Type.metaElevated.size,
    lineHeight: Type.metaElevated.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.metaElevated.letterSpacing,
  },
  separator: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.regular,
  },
  sessionLabel: {
    flex: 1,
    fontSize: Type.meta.size,
    lineHeight: Type.metaElevated.lineHeight,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.meta.letterSpacing,
  },
  countdown: {
    fontSize: Type.meta.size,
    lineHeight: Type.metaElevated.lineHeight,
    fontFamily: Typography.family.medium,
    fontVariant: ['tabular-nums'],
    letterSpacing: 0,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: Space.sm,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  chipText: {
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: Typography.family.medium,
    letterSpacing: Type.meta.letterSpacing,
  },
});

export default CoOwnMarketStatusStrip;
