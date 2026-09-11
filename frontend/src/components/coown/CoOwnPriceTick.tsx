/**
 * CoOwnPriceTick — restrained price-tick display.
 *
 * On price change: 120ms subtle background fade using
 * DIRECTION-style theme fills (coownUpSubtle/coownDownSubtle) on the
 * price cell, then clear.
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
} from 'react-native-reanimated';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Radius } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
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
  /**
   * Caps the maximum font scale factor.  Critical price values should
   * leave this unset so the price wraps to two lines at large text sizes
   * rather than truncating (U62).
   */
  maxFontSizeMultiplier?: number;
}

const FADE_DURATION = 150;
const FADE_HOLD = 600;

/**
 * Shared tick-flash engine — a restrained 150ms background fade in the
 * direction fill after a price change, held 600ms, then cleared.
 * Reduced motion: no flash. Used by CoOwnPriceTick and by live quote
 * surfaces (top-of-book strip) that need the same tick language.
 */
export function usePriceTickFlash(
  value: number | null,
  previousValue: number | null | undefined,
): { flashStyle: ReturnType<typeof useAnimatedStyle>; direction: PriceTickDirection; hasChanged: boolean } {
  const { colors } = useAppTheme();
  const reducedMotion = useReducedMotion();
  const fadeOpacity = useSharedValue(0);
  // Shared values (not refs) — the animated style worklet reads these on
  // the UI thread. Refs passed into a worklet get serialized once and then
  // every render-time `.current` write triggers the Worklets
  // "tried to modify key `current`" warning and desyncs the UI thread copy.
  const directionSV = useSharedValue<PriceTickDirection>('flat');
  const upFillSV = useSharedValue(colors.coownUpSubtle);
  const downFillSV = useSharedValue(colors.coownDownSubtle);

  const hasChanged = previousValue != null && value != null && value !== previousValue;
  const direction: PriceTickDirection = !hasChanged
    ? 'flat'
    : (value as number) > (previousValue as number)
      ? 'up'
      : 'down';

  // Theme-resolved fills — the flash background must track the active
  // theme so dark mode never draws a dark fill on a dark canvas (F28).
  // Synced in an effect, never during render.
  useEffect(() => {
    upFillSV.value = colors.coownUpSubtle;
    downFillSV.value = colors.coownDownSubtle;
  }, [colors.coownUpSubtle, colors.coownDownSubtle, upFillSV, downFillSV]);

  useEffect(() => {
    if (!hasChanged || reducedMotion) return;
    directionSV.value = direction;

    fadeOpacity.value = withTiming(1, {
      duration: FADE_DURATION,
      easing: Easing.out(Easing.ease),
    });

    const timeout = setTimeout(() => {
      fadeOpacity.value = withTiming(0, {
        duration: FADE_DURATION,
        easing: Easing.in(Easing.ease),
      });
    }, FADE_HOLD);

    return () => clearTimeout(timeout);
  }, [hasChanged, direction, reducedMotion, fadeOpacity, directionSV, upFillSV, downFillSV]);

  const flashStyle = useAnimatedStyle(() => ({
    backgroundColor: directionSV.value === 'up'
      ? upFillSV.value
      : directionSV.value === 'down'
        ? downFillSV.value
        : 'transparent',
    opacity: fadeOpacity.value,
  }));

  return { flashStyle, direction, hasChanged };
}

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
  maxFontSizeMultiplier,
}: CoOwnPriceTickProps) {
  const { colors } = useAppTheme();

  const { flashStyle, direction, hasChanged } = usePriceTickFlash(value, previousValue);

  const directionColor = direction === 'up'
    ? colors.coownUp
    : direction === 'down'
      ? colors.coownDown
      : colors.textSecondary;

  const glyph = direction === 'up' ? '▲' : direction === 'down' ? '▼' : '▬';
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
        <Text style={[styles.label, { color: colors.textMuted }]} numberOfLines={2}>
          {label}
        </Text>
      )}
      <View style={styles.valueRow}>
        <Reanimated.View style={[styles.tickCell, flashStyle]}>
          <Text
            style={[sizeStyle, { color: colors.textPrimary }]}
            numberOfLines={2}
            maxFontSizeMultiplier={maxFontSizeMultiplier}
            accessibilityLiveRegion="polite"
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
            accessibilityLabel={direction === 'up' ? 'up' : direction === 'down' ? 'down' : 'flat'}
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
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.label.letterSpacing,
    textTransform: 'uppercase',
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    gap: Space.xs,
  },
  tickCell: {
    borderRadius: Radius.sm,
    paddingHorizontal: Space.xs,
    paddingVertical: 1,
  },
  body: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: TypographyV2.body.fontFamily,
    letterSpacing: TypographyV2.body.letterSpacing,
    fontVariant: ['tabular-nums'],
  },
  subtitle: {
    fontSize: TypographyV2.sectionTitle.size,
    lineHeight: TypographyV2.sectionTitle.lineHeight,
    fontFamily: TypographyV2.sectionTitle.fontFamily,
    letterSpacing: TypographyV2.sectionTitle.letterSpacing,
    fontVariant: ['tabular-nums'],
  },
  priceLarge: {
    fontSize: TypographyV2.priceHero.size,
    lineHeight: TypographyV2.priceHero.lineHeight,
    fontFamily: TypographyV2.priceHero.fontFamily,
    letterSpacing: TypographyV2.priceHero.letterSpacing,
    fontVariant: ['tabular-nums'],
  },
  unit: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
  glyph: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
  },
  age: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
});

export default CoOwnPriceTick;
