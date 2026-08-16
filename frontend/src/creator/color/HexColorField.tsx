/**
 * HexColorField — TextInput for exact HEX color entry.
 *
 * Per spec 04_COLOR_SYSTEM_ZERO_GAP §2:
 * Accept #RGB, #RRGGBB, #RRGGBBAA.
 * Normalize case, sanitize paste, reject invalid values, and never
 * commit malformed colors.
 *
 * History semantics (spec §12): commit on valid submit/blur.
 * Invalid input is visually indicated but never persisted.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  StyleSheet,
  TextInput,
  View,
  Text,
  TextStyle,
  ViewStyle,
} from 'react-native';
import { Space, Radius, Type, Typography, Stroke } from '../../theme/designTokens';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { sanitizeHexInput, isValidHex, parseHexToColor, colorToHexDisplay } from './ColorParser';
import type { CreatorColor } from './ColorTypes';

// ── Props ────────────────────────────────────────────────────────────
interface HexColorFieldProps {
  /** Current color value */
  color: CreatorColor;
  /** Commit a valid color on submit/blur */
  onCommit: (color: CreatorColor) => void;
  /** Style override for the container */
  style?: ViewStyle | ViewStyle[];
  /** Accessibility label override */
  accessibilityLabel?: string;
}

// ── Component ────────────────────────────────────────────────────────
export function HexColorField({
  color,
  onCommit,
  style,
  accessibilityLabel = 'Hex color value',
}: HexColorFieldProps) {
  const { colors } = useAppTheme();
  const styles = useHexFieldStyles(colors);
  const inputRef = useRef<TextInput>(null);

  // Display value — synced from color prop, edited locally
  const [displayValue, setDisplayValue] = useState(() => colorToHexDisplay(color));
  const [isValid, setIsValid] = useState(true);
  const [isFocused, setIsFocused] = useState(false);

  // Sync display when color changes externally
  useEffect(() => {
    if (!isFocused) {
      setDisplayValue(colorToHexDisplay(color));
      setIsValid(true);
    }
  }, [color, isFocused]);

  const handleChangeText = useCallback((text: string) => {
    // Sanitize: strip non-hex characters, ensure leading #
    const sanitized = sanitizeHexInput(text);
    setDisplayValue(sanitized);
    setIsValid(isValidHex(sanitized));
  }, []);

  const handleCommit = useCallback(() => {
    const parsed = parseHexToColor(displayValue);
    if (parsed) {
      onCommit(parsed);
      setDisplayValue(colorToHexDisplay(parsed));
      setIsValid(true);
    } else {
      // Revert to current color on invalid
      setDisplayValue(colorToHexDisplay(color));
      setIsValid(true);
    }
    setIsFocused(false);
  }, [displayValue, color, onCommit]);

  const handleSubmitEditing = useCallback(() => {
    handleCommit();
    inputRef.current?.blur();
  }, [handleCommit]);

  const handleFocus = useCallback(() => {
    setIsFocused(true);
    // Select all on focus for easy replacement
  }, []);

  return (
    <View style={[styles.container, style]}>
      <Text style={styles.label}>HEX</Text>
      <TextInput
        ref={inputRef}
        style={[
          styles.input,
          !isValid && styles.inputInvalid,
        ]}
        value={displayValue}
        onChangeText={handleChangeText}
        onBlur={handleCommit}
        onFocus={handleFocus}
        onSubmitEditing={handleSubmitEditing}
        placeholder="#RRGGBB"
        placeholderTextColor={colors.textMuted}
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={9}
        keyboardType="ascii-capable"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint="Enter a hex color value like #RRGGBB or #RRGGBBAA"
        accessibilityValue={{
          text: displayValue,
          min: 0,
          max: 1,
          now: isValid ? 1 : 0,
        }}
      />
      {!isValid && (
        <Text style={styles.errorText}>Invalid hex</Text>
      )}
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────
function useHexFieldStyles(colors: ThemeColors) {
  return React.useMemo(
    () =>
      StyleSheet.create({
        container: {
          gap: Space.xs,
        },
        label: {
          fontFamily: Typography.family.semibold,
          fontSize: Type.metaElevated.size,
          letterSpacing: Type.metaElevated.letterSpacing,
          color: colors.textSecondary,
          textTransform: 'uppercase',
        },
        input: {
          fontFamily: Typography.family.medium,
          fontSize: Type.bodyEmphasis.size,
          color: colors.textPrimary,
          borderWidth: Stroke.standard,
          borderColor: colors.border,
          borderRadius: Radius.md,
          paddingHorizontal: Space.sm,
          paddingVertical: Space.sm,
          minHeight: 44,
        },
        inputInvalid: {
          borderColor: colors.danger,
        },
        errorText: {
          fontFamily: Typography.family.regular,
          fontSize: Type.caption.size,
          color: colors.danger,
        },
      }),
    [colors],
  );
}
