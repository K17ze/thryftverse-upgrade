/**
 * BrushPicker — flagship brush type selector for the drawing canvas.
 *
 * Extracted from DrawingCanvas.tsx as part of the modularisation pass.
 * Renders a horizontally scrollable row of 6 brush type pills (marker,
 * highlighter, neon, pencil, arrow, eraser) with spring-animated selection
 * state and haptic feedback on press.
 *
 * Flagship pattern:
 * - AnimatedPressable for scale + opacity press feedback
 * - Haptic feedback on every selection
 * - Full accessibility (role, label, state)
 * - Theme tokens for all colours
 */

import React from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Typography, Radius, Space } from '../../../theme/designTokens';
import { TypographyV2 } from '../../../theme/typography.v2';
import { useAppTheme, type ThemeColors } from '../../../theme/ThemeContext';
import { AnimatedPressable } from '../../AnimatedPressable';
import type { BrushType } from '../DrawingCanvas';

// ─────────────────────────────────────────────────────────────────────────────
// Brush type options — 6 flagship brushes
// ─────────────────────────────────────────────────────────────────────────────
export const BRUSH_TYPE_OPTIONS: {
  key: BrushType;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { key: 'marker', label: 'Marker', icon: 'brush-outline' },
  { key: 'highlighter', label: 'Highlight', icon: 'color-fill-outline' },
  { key: 'neon', label: 'Neon', icon: 'bulb-outline' },
  { key: 'pencil', label: 'Pencil', icon: 'create-outline' },
  { key: 'arrow', label: 'Arrow', icon: 'arrow-forward-outline' },
  { key: 'eraser', label: 'Eraser', icon: 'backspace-outline' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────
function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    brushTypeRow: {
      flexDirection: 'row',
      gap: Space.sm,
      paddingBottom: 2,
    },
    brushTypePill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: Radius.full,
      backgroundColor: colors.glassBg,
    },
    brushTypePillActive: {
      backgroundColor: colors.surfaceAlt,
    },
    brushTypeText: {
      color: colors.textSecondary,
      fontSize: 13,
      fontFamily: Typography.family.medium,
    },
    brushTypeTextActive: {
      color: colors.textPrimary,
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// BrushPicker component
// ─────────────────────────────────────────────────────────────────────────────

export interface BrushPickerProps {
  /** Currently selected brush type */
  brushType: BrushType;
  /** Called when a brush type is selected */
  onSelect: (type: BrushType) => void;
}

/**
 * Horizontally scrollable brush type selector with 6 flagship brushes.
 * Each pill shows an icon + label, with animated selection state.
 */
export function BrushPicker({ brushType, onSelect }: BrushPickerProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.brushTypeRow}
      accessibilityRole="list"
      accessibilityLabel="Brush types"
    >
      {BRUSH_TYPE_OPTIONS.map((b) => (
        <AnimatedPressable
          key={b.key}
          style={[styles.brushTypePill, brushType === b.key && styles.brushTypePillActive]}
          onPress={() => onSelect(b.key)}
          scaleValue={0.92}
          activeOpacity={0.85}
          hapticFeedback="light"
          accessibilityLabel={`${b.label} brush`}
          accessibilityRole="button"
          accessibilityState={{ selected: brushType === b.key }}
        >
          <Ionicons
            name={b.icon}
            size={16}
            color={brushType === b.key ? colors.textPrimary : colors.textSecondary}
          />
          <Text
            style={[
              styles.brushTypeText,
              brushType === b.key && styles.brushTypeTextActive,
            ]}
          >
            {b.label}
          </Text>
        </AnimatedPressable>
      ))}
    </ScrollView>
  );
}

export default BrushPicker;
