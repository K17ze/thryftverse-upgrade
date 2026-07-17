/**
 * CoOwnPriceTick — restrained price-tick display.
 *
 * On price change: 120ms subtle background fade using
 * DIRECTION_COLORS.upFill/downFill on the price cell, then clear.
 * No flash, no glow, no digit rotation (source §17.5 — Robinhood's
 * slot-machine tick is deliberately rejected).
 *
 * Direction always paired with ▲/▼/− glyph + sign (accessibility —
 * no colour alone).
 *
 * Reduced motion: price updates in place with no background fade.
 *
 * See docs/coown/flagship-exchange-upgrade/07 §2.4.
 */

import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  FadeIn,
  FadeOut,
} from 'react-native-reanimated';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Radius, Type, Typography } from '../../theme/designTokens';
import { DIRECTION_COLORS } from '../../constants/colors';
import { useReducedMotion } from '../../hooks/useReducedMotion';

export type PriceTickDirection = 'up' | 'down' | 'flat';

export interface CoOwnPriceTickProps {
  /** Current price value. */
  value: number;
  /** Previous price value (to detect change + direction). */
  previousValue?: number;
  /** Label for the price (e.g. "Last", "Bid", "Ask"). */
  label?: string;
  /** Unit label (e.g. "1ZE"). */
  unit?: string;
  /** Age label (e.g. "3h ago"). */
  ageLabel?: string;
  /** Size variant. */
  size?: 'body' | 'subtitle' | 'priceLarge';
  /** Alignment. */
  align?: 'left' | 'right' | 'center';
  /** Show direction glyph (▲/▼/−). Default true. */
  showGlyph?: boolean;
  /** Show sign (+/−) on change. Default false (glyph is enough). */
  showSign?: boolean;
}

const FADE_DURATION = 150;
const FADE_HOLD = 600;

export function CoOwnPriceTick({
  value,
  previousValue,
  label,
  unit,
  ageLabel,
  size = 'body',
  align = 'right',
  showGlyph = true,
  showSign = false,
}: CoOwnPriceTickProps) {
  const { colors } = useAppTheme();
  const reducedMotion = useReducedMotion();

  const fadeOpacity = useSharedValue(0);
  const directionRef = useRef<PriceTickDirection>('flat');

  // Detect change + direction
  const hasChanged = previousValue != null && value !== previousValue;
  const direction: PriceTickDirection = !hasChanged
    ? 'flat'
    : value > (previousValue ?? value)
      ? 'up'
      : 'down';

  useEffect(() => {
    if (!hasChanged || reducedMotion) return;
    directionRef.current = direction;

    // Fade in the background
    fadeOpacity.value = withTiming(1, {
      duration: FADE_DURATION,
      easing: Easing.out(Easing.ease),
    });

    // Fade out after hold
    const timeout = setTimeout(() => {
      fadeOpacity.value = withTiming(0, {
        duration: FADE_DURATION,
        easing: Easing.in(Easing.ease),
      });
    }, FADE_HOLD);

    return () => clearTimeout(timeout);
  }, [hasChanged, direction, reducedMotion, fadeOpacity]);

  const animatedBgStyle = useAnimatedStyle(() => ({
    backgroundColor: directionRef.current === 'up'
      ? DIRECTION_COLORS.upFill
      : directionRef.current === 'down'
        ? DIRECTION_COLORS.downFill
        : 'transparent',
    opacity: fadeOpacity.value,
  }));

  const directionColor = direction === 'up'
    ? colors.success
    : direction === 'down'
      ? colors.danger
      : colors.textSecondary;

  const glyph = direction === 'up' ? '▲' : direction === 'down' ? '▼' : '−';
  const sign = direction === 'up' ? '+' : direction === 'down' ? '−' : '';

  const sizeStyle = size === 'priceLarge'
    ? styles.priceLarge
    : size === 'subtitle'
      ? styles.subtitle
      : styles.body;

  const alignStyle = align === 'center'
    ? styles.center
    : align === 'left'
      ? styles.left
      : styles.right;

  return (
    <View style={[styles.container, alignStyle]}>
      {label && (
        <Text style={[styles.label, { color: colors.textMuted }]} numberOfLines={1}>
          {label}
        </Text>
      )}
      <View style={styles.valueRow}>
        <Reanimated.View style={[styles.tickCell, animatedBgStyle]}>
          <Text
            style={[sizeStyle, { color: colors.textPrimary }]}
            numberOfLines={1}
            accessibilityLabel={`${label ?? 'Price'} ${value.toFixed(2)}${unit ? ` ${unit}` : ''}${hasChanged ? `, ${direction}` : ''}${ageLabel ? `, ${ageLabel}` : ''}`}
          >
            {showSign && hasChanged ? sign : ''}{value.toFixed(2)}
          </Text>
        </Reanimated.View>
        {unit && (
          <Text style={[styles.unit, { color: colors.textMuted }]} numberOfLines={1}>
            {unit}
          </Text>
        )}
        {showGlyph && hasChanged && (
          <Text
            style={[styles.glyph, { color: directionColor }]}
            accessibilityLabel={direction === 'up' ? 'up' : direction === 'down' ? 'down' : 'unchanged'}
          >
            {glyph}
          </Text>
        )}
        {ageLabel && (
          <Text style={[styles.age, { color: colors.textMuted }]} numberOfLines={1}>
            · {ageLabel}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 2,
  },
  left: {
    alignItems: 'flex-start',
  },
  right: {
    alignItems: 'flex-end',
  },
  center: {
    alignItems: 'center',
  },
  label: {
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: Typography.family.medium,
    letterSpacing: Type.metaElevated.letterSpacing,
    textTransform: 'uppercase',
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Space.xs,
  },
  tickCell: {
    borderRadius: Radius.sm,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  body: {
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.body.letterSpacing,
    fontVariant: ['tabular-nums'],
  },
  subtitle: {
    fontSize: Type.subtitle.size,
    lineHeight: Type.subtitle.lineHeight,
    fontFamily: Typography.family.bold,
    letterSpacing: Type.subtitle.letterSpacing,
    fontVariant: ['tabular-nums'],
  },
  priceLarge: {
    fontSize: Type.priceLarge.size,
    lineHeight: Type.priceLarge.lineHeight,
    fontFamily: Typography.family.bold,
    letterSpacing: Type.priceLarge.letterSpacing,
    fontVariant: ['tabular-nums'],
  },
  unit: {
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.meta.letterSpacing,
  },
  glyph: {
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: Typography.family.bold,
  },
  age: {
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.meta.letterSpacing,
  },
});

export default CoOwnPriceTick;
