/**
 * SizePickerPanel — flagship brush size picker for the drawing canvas.
 *
 * Extracted from DrawingCanvas.tsx as part of the modularisation pass.
 * Uses the shared SizeSlider primitive from ../shared/ColorSlider.tsx for
 * the slider track + thumb, while rendering a purpose-built preview dot
 * that preserves the flagship brush-specific visual treatment (neon glow,
 * eraser outline, highlighter/pencil opacity).
 *
 * Flagship pattern:
 * - Shared SizeSlider (Gesture.Pan, worklet-based, spring settle, haptic tick)
 * - Custom preview dot with brush-type-aware styling:
 *   - Neon: glow shadow in the brush colour
 *   - Eraser: transparent fill with outline border
 *   - Highlighter: 0.4 opacity
 *   - Pencil: 0.8 opacity
 * - Live size readout in px
 * - Full accessibility (role, label, value)
 */

import React from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { Radius, Space, Stroke } from '../../../theme/designTokens';
import { useAppTheme, type ThemeColors } from '../../../theme/ThemeContext';
import { SizeSlider } from '../shared/ColorSlider';
import type { BrushType } from '../DrawingCanvas';

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────
function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    sizeSliderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      paddingVertical: 4,
    },
    sizePreview: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.glassBg,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// SizePickerPanel component
// ─────────────────────────────────────────────────────────────────────────────

export interface SizePickerPanelProps {
  /** Current brush size in px (1-50) */
  value: number;
  /** Called continuously during drag with the new size */
  onValueChange: (size: number) => void;
  /** Current brush colour (hex) */
  color: string;
  /** Current brush type — drives preview dot styling */
  brushType: BrushType;
}

/**
 * Brush size picker with a flagship preview dot and shared SizeSlider track.
 *
 * The preview dot is rendered locally (not via the shared SizeSlider's
 * built-in preview) to preserve brush-specific visual treatment:
 * - Neon: outer glow shadow in the brush colour
 * - Eraser: transparent fill with a 1px outline border
 * - Highlighter: 0.4 opacity (multiply blend feel)
 * - Pencil: 0.8 opacity (softer graphite feel)
 * - Marker/Arrow: full opacity
 */
export function SizePickerPanel({
  value,
  onValueChange,
  color,
  brushType,
}: SizePickerPanelProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  // ── Preview dot sizing ──
  const previewSize = Math.max(4, Math.min(value, 40));
  const previewColor = brushType === 'eraser' ? 'transparent' : color;
  const previewOpacity = brushType === 'highlighter' ? 0.4 : brushType === 'pencil' ? 0.8 : 1;

  return (
    <View style={styles.sizeSliderRow}>
      {/* Live preview circle — brush-type-aware styling */}
      <View style={styles.sizePreview} pointerEvents="none">
        <View
          style={{
            width: previewSize,
            height: previewSize,
            borderRadius: previewSize / 2,
            backgroundColor: previewColor,
            borderColor: brushType === 'eraser' ? colors.textPrimary : 'transparent',
            borderWidth: brushType === 'eraser' ? 1 : 0,
            opacity: previewOpacity,
            ...(brushType === 'neon'
              ? {
                  shadowColor: color,
                  shadowOpacity: 0.8,
                  shadowRadius: 6,
                  shadowOffset: { width: 0, height: 0 },
                }
              : null),
          }}
        />
      </View>

      {/* Shared SizeSlider — track + spring thumb + haptic tick */}
      <SizeSlider
        value={value}
        min={1}
        max={50}
        onValueChange={onValueChange}
        showPreview={false}
        showValueLabel
        valueSuffix="px"
        accessibilityLabel="Brush size slider"
      />
    </View>
  );
}

export default SizePickerPanel;
