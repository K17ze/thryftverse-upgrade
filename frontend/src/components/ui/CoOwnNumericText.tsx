/**
 * CoOwnNumericText — the single tabular-numeral text component for Co-Own.
 *
 * Every 1ZE amount, unit count, percentage, bid/ask size, volume and P&L
 * in Co-Own surfaces renders through this component. It enforces:
 * - Tabular numerals (no horizontal jitter on tick)
 * - True minus sign − (U+2212), not hyphen
 * - Locale-aware grouping for fiat; 1ZE stays canonical
 * - Direction colour + glyph (▲ ▼ −) always paired, never colour alone
 * - Decimal alignment via fixed precision
 *
 * See docs/coown/flagship-exchange-upgrade/02 §2 + 04 §A11.
 */

import React from 'react';
import { Text as RNText, StyleSheet, StyleProp, TextStyle } from 'react-native';
import { Numeric, FontFamily } from '../../theme/designTokens';
import { DIRECTION_COLORS } from '../../constants/colors';
import { useAppTheme } from '../../theme/ThemeContext';

export type CoOwnNumericUnit = '1ZE' | 'units' | 'pct' | 'bps' | string;
export type CoOwnNumericSize = keyof typeof Numeric;
export type CoOwnNumericDirection = 'up' | 'down' | 'flat';

export interface CoOwnNumericTextProps {
  value: number;
  /** Unit suffix: '1ZE', 'units', 'pct', 'bps', or a fiat symbol like '£' */
  unit?: CoOwnNumericUnit;
  /** Decimal places. Default: 2 for 1ZE/pct/bps, 0 for units. */
  precision?: number;
  /** Prefix + / − sign for P&L and spreads. */
  signed?: boolean;
  /** Applies DIRECTION_COLORS + ▲ / ▼ / − glyph. Always paired with colour. */
  direction?: CoOwnNumericDirection;
  /** Text alignment within the component's width. */
  align?: 'left' | 'right';
  /** Numeric style preset. Default: 'price'. */
  size?: CoOwnNumericSize;
  /** Override colour (otherwise uses direction colour or theme textPrimary). */
  color?: string;
  /** Show the unit suffix after the value. Default: true. */
  showUnit?: boolean;
  /** Show the direction glyph before the value. Default: true when direction set. */
  showGlyph?: boolean;
  /** Locale for grouping (fiat only). Default: 'en-GB'. */
  locale?: string;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  accessibilityLabel?: string;
}

/** True minus sign U+2212, not hyphen. */
const MINUS = '\u2212';

/** Direction glyphs — always paired with colour, never colour alone. */
const GLYPH: Record<CoOwnNumericDirection, string> = {
  up: '\u25B2',   // ▲
  down: '\u25BC', // ▼
  flat: '\u2212', // −
};

/** Map direction to DIRECTION_COLORS. */
const DIRECTION_COLOR: Record<CoOwnNumericDirection, string> = {
  up: DIRECTION_COLORS.up,
  down: DIRECTION_COLORS.down,
  flat: DIRECTION_COLORS.flat,
};

/** Default precision per unit. */
function defaultPrecision(unit: CoOwnNumericUnit | undefined): number {
  if (unit === 'units') return 0;
  if (unit === 'pct') return 2;
  if (unit === 'bps') return 1;
  return 2; // 1ZE and fiat default
}

/** Format a number with grouping and fixed precision. */
function formatValue(
  value: number,
  precision: number,
  signed: boolean,
  locale: string,
): string {
  const abs = Math.abs(value);
  const formatted = abs.toLocaleString(locale, {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  });

  if (signed) {
    if (value < 0) return `${MINUS}${formatted}`;
    if (value > 0) return `+${formatted}`;
    return formatted; // 0 has no sign
  }

  if (value < 0) return `${MINUS}${formatted}`;
  return formatted;
}

export const CoOwnNumericText: React.FC<CoOwnNumericTextProps> = ({
  value,
  unit,
  precision,
  signed = false,
  direction,
  align = 'left',
  size = 'price',
  color,
  showUnit = true,
  showGlyph,
  locale = 'en-GB',
  style,
  numberOfLines,
  accessibilityLabel,
}) => {
  const { colors } = useAppTheme();
  const prec = precision ?? defaultPrecision(unit);
  const numericStyle = Numeric[size];

  // Determine text colour
  const resolvedColor = color
    ?? (direction ? DIRECTION_COLOR[direction] : colors.textPrimary);

  // Determine whether to show glyph
  const shouldShowGlyph = showGlyph ?? (direction !== undefined);

  // Build the text content
  const valueStr = formatValue(value, prec, signed, locale);
  const glyph = shouldShowGlyph && direction ? `${GLYPH[direction]} ` : '';
  const unitSuffix = showUnit && unit ? ` ${unit}` : '';
  const text = `${glyph}${valueStr}${unitSuffix}`;

  // Build accessibility label with full words
  const a11yDir = direction === 'up' ? 'up ' : direction === 'down' ? 'down ' : '';
  const a11yLabel = accessibilityLabel ?? `${a11yDir}${valueStr}${unitSuffix}`;

  // Map Numeric weight to FontFamily
  const fontFamilyMap: Record<string, string> = {
    '400': FontFamily.regular,
    '500': FontFamily.medium,
    '600': FontFamily.semibold,
    '700': FontFamily.bold,
    '800': FontFamily.extrabold,
  };

  return (
    <RNText
      style={[
        {
          fontSize: numericStyle.size,
          lineHeight: numericStyle.lineHeight,
          fontFamily: fontFamilyMap[numericStyle.weight] ?? FontFamily.semibold,
          letterSpacing: numericStyle.letterSpacing,
          fontVariant: numericStyle.fontVariant,
          color: resolvedColor,
          textAlign: align,
        },
        style,
      ]}
      numberOfLines={numberOfLines}
      accessibilityLabel={a11yLabel}
      accessible
    >
      {text}
    </RNText>
  );
};

export default CoOwnNumericText;
