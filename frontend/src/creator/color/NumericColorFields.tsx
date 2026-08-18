/**
 * NumericColorFields — RGB numeric inputs (0-255) with optional HSL/HSV
 * under an Advanced toggle.
 *
 * Per spec 04_COLOR_SYSTEM_ZERO_GAP §2:
 * - RGB values.
 * - HSL/HSV under Advanced.
 *
 * History semantics (spec §12): commit on valid submit/blur.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  StyleSheet,
  TextInput,
  View,
  Text,
  Pressable,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Space, Radius, Type, Typography, Stroke } from '../../theme/designTokens';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import {
  rgbToHsv,
  rgbToHsl,
  normalize,
} from './ColorMath';
import type { CreatorColor, HSV, HSL } from './ColorTypes';

// ── Props ────────────────────────────────────────────────────────────
interface NumericColorFieldsProps {
  color: CreatorColor;
  onCommit: (color: CreatorColor) => void;
  style?: ViewStyle | ViewStyle[];
}

// ── Single numeric input ─────────────────────────────────────────────
interface NumericInputProps {
  label: string;
  value: number;
  min: number;
  max: number;
  onCommit: (value: number) => void;
  colors: ThemeColors;
}

function NumericInput({
  label,
  value,
  min,
  max,
  onCommit,
  colors,
}: NumericInputProps) {
  const styles = useNumericStyles(colors);
  const inputRef = useRef<TextInput>(null);
  const [displayValue, setDisplayValue] = useState(String(value));
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (!isFocused) {
      setDisplayValue(String(value));
    }
  }, [value, isFocused]);

  const handleChangeText = useCallback((text: string) => {
    // Allow only digits
    const digits = text.replace(/[^0-9]/g, '');
    setDisplayValue(digits);
  }, []);

  const handleCommit = useCallback(() => {
    const parsed = parseInt(displayValue, 10);
    if (isNaN(parsed)) {
      setDisplayValue(String(value));
    } else {
      const clamped = Math.max(min, Math.min(max, parsed));
      onCommit(clamped);
      setDisplayValue(String(clamped));
    }
    setIsFocused(false);
  }, [displayValue, value, min, max, onCommit]);

  return (
    <View style={styles.inputContainer}>
      <Text style={styles.inputLabel}>{label}</Text>
      <TextInput
        ref={inputRef}
        style={styles.input}
        value={displayValue}
        onChangeText={handleChangeText}
        onBlur={handleCommit}
        onFocus={() => setIsFocused(true)}
        onSubmitEditing={() => {
          handleCommit();
          inputRef.current?.blur();
        }}
        keyboardType="number-pad"
        maxLength={3}
        accessibilityLabel={`${label} value, ${value} of ${max}`}
        accessibilityRole="adjustable"
      />
    </View>
  );
}

// ── Component ────────────────────────────────────────────────────────
export function NumericColorFields({
  color,
  onCommit,
  style,
}: NumericColorFieldsProps) {
  const { colors } = useAppTheme();
  const styles = useNumericStyles(colors);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const r255 = Math.round(color.r * 255);
  const g255 = Math.round(color.g * 255);
  const b255 = Math.round(color.b * 255);
  const a255 = Math.round(color.a * 255);

  const hsv = rgbToHsv(color);
  const hsl = rgbToHsl(color);

  const handleR = useCallback((v: number) => {
    onCommit(normalize({ ...color, r: v / 255 }));
  }, [color, onCommit]);

  const handleG = useCallback((v: number) => {
    onCommit(normalize({ ...color, g: v / 255 }));
  }, [color, onCommit]);

  const handleB = useCallback((v: number) => {
    onCommit(normalize({ ...color, b: v / 255 }));
  }, [color, onCommit]);

  const handleA = useCallback((v: number) => {
    onCommit(normalize({ ...color, a: v / 255 }));
  }, [color, onCommit]);

  const handleHueHsv = useCallback((h: number) => {
    const newHsv: HSV = { h, s: hsv.s, v: hsv.v };
    // Convert back to RGB, preserving alpha
    const { h: _h, s, v } = newHsv;
    const c = v * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = v - c;
    let r = 0, g = 0, b = 0;
    const hue = ((h % 360) + 360) % 360;
    if (hue < 60) { r = c; g = x; }
    else if (hue < 120) { r = x; g = c; }
    else if (hue < 180) { g = c; b = x; }
    else if (hue < 240) { g = x; b = c; }
    else if (hue < 300) { r = x; b = c; }
    else { r = c; b = x; }
    onCommit(normalize({ space: 'srgb', r: r + m, g: g + m, b: b + m, a: color.a }));
  }, [hsv, color.a, onCommit]);

  const handleSatHsv = useCallback((s: number) => {
    const newHsv: HSV = { h: hsv.h, s: s / 100, v: hsv.v };
    const { h, s: sv, v } = newHsv;
    const c = v * sv;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = v - c;
    let r = 0, g = 0, b = 0;
    const hue = ((h % 360) + 360) % 360;
    if (hue < 60) { r = c; g = x; }
    else if (hue < 120) { r = x; g = c; }
    else if (hue < 180) { g = c; b = x; }
    else if (hue < 240) { g = x; b = c; }
    else if (hue < 300) { r = x; b = c; }
    else { r = c; b = x; }
    onCommit(normalize({ space: 'srgb', r: r + m, g: g + m, b: b + m, a: color.a }));
  }, [hsv, color.a, onCommit]);

  const handleValHsv = useCallback((v: number) => {
    const newHsv: HSV = { h: hsv.h, s: hsv.s, v: v / 100 };
    const { h, s, v: sv } = newHsv;
    const c = sv * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = sv - c;
    let r = 0, g = 0, b = 0;
    const hue = ((h % 360) + 360) % 360;
    if (hue < 60) { r = c; g = x; }
    else if (hue < 120) { r = x; g = c; }
    else if (hue < 180) { g = c; b = x; }
    else if (hue < 240) { g = x; b = c; }
    else if (hue < 300) { r = x; b = c; }
    else { r = c; b = x; }
    onCommit(normalize({ space: 'srgb', r: r + m, g: g + m, b: b + m, a: color.a }));
  }, [hsv, color.a, onCommit]);

  const handleHueHsl = useCallback((h: number) => {
    const newHsl: HSL = { h, s: hsl.s, l: hsl.l };
    const { h: hue, s, l } = newHsl;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
    const m = l - c / 2;
    let r = 0, g = 0, b = 0;
    const hMod = ((hue % 360) + 360) % 360;
    if (hMod < 60) { r = c; g = x; }
    else if (hMod < 120) { r = x; g = c; }
    else if (hMod < 180) { g = c; b = x; }
    else if (hMod < 240) { g = x; b = c; }
    else if (hMod < 300) { r = x; b = c; }
    else { r = c; b = x; }
    onCommit(normalize({ space: 'srgb', r: r + m, g: g + m, b: b + m, a: color.a }));
  }, [hsl, color.a, onCommit]);

  const handleSatHsl = useCallback((s: number) => {
    const newHsl: HSL = { h: hsl.h, s: s / 100, l: hsl.l };
    const { h, s: sv, l } = newHsl;
    const c = (1 - Math.abs(2 * l - 1)) * sv;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    let r = 0, g = 0, b = 0;
    const hue = ((h % 360) + 360) % 360;
    if (hue < 60) { r = c; g = x; }
    else if (hue < 120) { r = x; g = c; }
    else if (hue < 180) { g = c; b = x; }
    else if (hue < 240) { g = x; b = c; }
    else if (hue < 300) { r = x; b = c; }
    else { r = c; b = x; }
    onCommit(normalize({ space: 'srgb', r: r + m, g: g + m, b: b + m, a: color.a }));
  }, [hsl, color.a, onCommit]);

  const handleLightHsl = useCallback((l: number) => {
    const newHsl: HSL = { h: hsl.h, s: hsl.s, l: l / 100 };
    const { h, s, l: lv } = newHsl;
    const c = (1 - Math.abs(2 * lv - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = lv - c / 2;
    let r = 0, g = 0, b = 0;
    const hue = ((h % 360) + 360) % 360;
    if (hue < 60) { r = c; g = x; }
    else if (hue < 120) { r = x; g = c; }
    else if (hue < 180) { g = c; b = x; }
    else if (hue < 240) { g = x; b = c; }
    else if (hue < 300) { r = x; b = c; }
    else { r = c; b = x; }
    onCommit(normalize({ space: 'srgb', r: r + m, g: g + m, b: b + m, a: color.a }));
  }, [hsl, color.a, onCommit]);

  return (
    <View style={[styles.container, style]}>
      {/* RGB row */}
      <View style={styles.row}>
        <NumericInput label="R" value={r255} min={0} max={255} onCommit={handleR} colors={colors} />
        <NumericInput label="G" value={g255} min={0} max={255} onCommit={handleG} colors={colors} />
        <NumericInput label="B" value={b255} min={0} max={255} onCommit={handleB} colors={colors} />
        <NumericInput label="A" value={a255} min={0} max={255} onCommit={handleA} colors={colors} />
      </View>

      {/* Advanced toggle */}
      <Pressable
        onPress={() => setShowAdvanced((v) => !v)}
        style={styles.advancedToggle}
        accessibilityRole="button"
        accessibilityLabel={showAdvanced ? 'Hide advanced color controls' : 'Show advanced color controls'}
        accessibilityState={{ expanded: showAdvanced }}
        hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
      >
        <Ionicons
          name={showAdvanced ? 'chevron-up-outline' : 'chevron-down-outline'}
          size={16}
          color={colors.textSecondary}
        />
        <Text style={styles.advancedLabel}>Advanced</Text>
      </Pressable>

      {/* Advanced: HSV + HSL */}
      {showAdvanced && (
        <View style={styles.advancedSection}>
          <Text style={styles.sectionLabel}>HSV</Text>
          <View style={styles.row}>
            <NumericInput label="H" value={Math.round(hsv.h)} min={0} max={360} onCommit={handleHueHsv} colors={colors} />
            <NumericInput label="S" value={Math.round(hsv.s * 100)} min={0} max={100} onCommit={handleSatHsv} colors={colors} />
            <NumericInput label="V" value={Math.round(hsv.v * 100)} min={0} max={100} onCommit={handleValHsv} colors={colors} />
          </View>

          <Text style={styles.sectionLabel}>HSL</Text>
          <View style={styles.row}>
            <NumericInput label="H" value={Math.round(hsl.h)} min={0} max={360} onCommit={handleHueHsl} colors={colors} />
            <NumericInput label="S" value={Math.round(hsl.s * 100)} min={0} max={100} onCommit={handleSatHsl} colors={colors} />
            <NumericInput label="L" value={Math.round(hsl.l * 100)} min={0} max={100} onCommit={handleLightHsl} colors={colors} />
          </View>
        </View>
      )}
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────
function useNumericStyles(colors: ThemeColors) {
  return React.useMemo(
    () =>
      StyleSheet.create({
        container: {
          gap: Space.sm,
        },
        row: {
          flexDirection: 'row',
          gap: Space.sm,
        },
        inputContainer: {
          flex: 1,
          gap: Space.xxs,
        },
        inputLabel: {
          fontFamily: Typography.family.semibold,
          fontSize: Type.label.size,
          letterSpacing: Type.label.letterSpacing,
          color: colors.textSecondary,
          textTransform: 'uppercase',
        },
        input: {
          fontFamily: Typography.family.medium,
          fontSize: Type.body.size,
          color: colors.textPrimary,
          borderWidth: Stroke.standard,
          borderColor: colors.border,
          borderRadius: Radius.md,
          paddingHorizontal: Space.sm,
          paddingVertical: Space.sm,
          minHeight: 44,
          textAlign: 'center',
        },
        advancedToggle: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: Space.xs,
          paddingVertical: Space.xs,
          minHeight: 36,
        },
        advancedLabel: {
          fontFamily: Typography.family.medium,
          fontSize: Type.caption.size,
          color: colors.textSecondary,
        },
        advancedSection: {
          gap: Space.sm,
        },
        sectionLabel: {
          fontFamily: Typography.family.semibold,
          fontSize: Type.label.size,
          letterSpacing: Type.label.letterSpacing,
          color: colors.textMuted,
          textTransform: 'uppercase',
        },
      }),
    [colors],
  );
}
