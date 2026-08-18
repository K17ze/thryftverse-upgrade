/**
 * ColorPickerPanel — flagship custom HSL color picker for the drawing canvas.
 *
 * Extracted from DrawingCanvas.tsx as part of the modularisation pass.
 * Uses the shared HueSlider and SaturationLightnessSlider primitives from
 * ../shared/ColorSlider.tsx, and shared color utilities from
 * ../shared/colorUtils.ts.
 *
 * Flagship pattern:
 * - Shared slider primitives (Gesture.Pan, worklet-based, spring settle)
 * - Live color preview swatch with hex label (black/white text via luminance)
 * - HSL → hex conversion via shared colorUtils
 * - Apply button to commit the custom colour
 * - Full accessibility (roles, labels, hints)
 */

import React from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Typography, Radius, Space, Stroke } from '../../../theme/designTokens';
import { useAppTheme, type ThemeColors } from '../../../theme/ThemeContext';
import { useHaptic } from '../../../hooks/useHaptic';
import { AnimatedPressable } from '../../AnimatedPressable';
import { HueSlider, SaturationLightnessSlider } from '../shared/ColorSlider';
import { hslToHex, isLightColor, type HSL } from '../shared/colorUtils';

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────
function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    customColorWrap: {
      gap: 12,
      paddingTop: 4,
    },
    customColorHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingBottom: 4,
    },
    customColorTitle: {
      fontSize: 15,
      fontFamily: Typography.family.semibold,
    },
    customColorPreview: {
      height: 56,
      borderRadius: Radius.lg,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: Stroke.standard,
      borderColor: colors.borderSubtle,
    },
    customColorPreviewLabel: {
      fontSize: 14,
      fontFamily: Typography.family.semibold,
    },
    applyCustomBtn: {
      alignSelf: 'center',
      borderRadius: Radius.full,
      paddingHorizontal: 40,
      paddingVertical: 12,
      marginTop: 4,
    },
    applyCustomText: {
      color: colors.textInverse,
      fontSize: 15,
      fontFamily: Typography.family.bold,
    },
    sliderWrap: {
      gap: Space.xs,
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// ColorPickerPanel component
// ─────────────────────────────────────────────────────────────────────────────

export interface ColorPickerPanelProps {
  /** Current HSL values { h: 0-360, s: 0-100, l: 0-100 } */
  hsl: HSL;
  /** Called continuously during slider drag with the new HSL values */
  onHslChange: (hsl: HSL) => void;
  /** Called once when a slider drag ends (for haptic + recent colour push) */
  onHslComplete: () => void;
  /** Called when the back chevron is pressed */
  onBack: () => void;
  /** Called when the Apply button is pressed with the final hex colour */
  onApply: (hex: string) => void;
}

/**
 * Custom HSL colour picker panel with live preview and shared sliders.
 *
 * Renders:
 * - Back chevron + "Custom Color" title
 * - Live colour preview swatch showing the hex value
 * - Hue slider (shared HueSlider, 0-360° rainbow track)
 * - Saturation slider (shared SaturationLightnessSlider, mode='saturation')
 * - Lightness slider (shared SaturationLightnessSlider, mode='lightness')
 * - Apply button
 */
export function ColorPickerPanel({
  hsl,
  onHslChange,
  onHslComplete,
  onBack,
  onApply,
}: ColorPickerPanelProps) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  const customPreviewColor = hslToHex(hsl.h, hsl.s, hsl.l);

  return (
    <View style={styles.customColorWrap}>
      <View style={styles.customColorHeader}>
        <AnimatedPressable
          onPress={() => {
            onBack();
            haptic.light();
          }}
          scaleValue={0.9}
          activeOpacity={0.85}
          hapticFeedback="light"
          accessibilityLabel="Back to preset colors"
          accessibilityRole="button"
        >
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </AnimatedPressable>
        <Text style={[styles.customColorTitle, { color: colors.textPrimary }]}>
          Custom Color
        </Text>
        <View style={{ width: 22 }} />
      </View>

      <View
        style={[styles.customColorPreview, { backgroundColor: customPreviewColor }]}
      >
        <Text
          style={[
            styles.customColorPreviewLabel,
            { color: isLightColor(customPreviewColor) ? '#000' : '#fff' },
          ]}
        >
          {customPreviewColor.toUpperCase()}
        </Text>
      </View>

      <View style={styles.sliderWrap}>
        <HueSlider
          value={hsl.h}
          onValueChange={(v) => onHslChange({ ...hsl, h: v })}
          onDragEnd={onHslComplete}
          accessibilityLabel="Hue slider"
        />

        <SaturationLightnessSlider
          baseColor={hslToHex(hsl.h, 100, 50)}
          value={hsl.s}
          mode="saturation"
          onValueChange={(v) => onHslChange({ ...hsl, s: v })}
          onDragEnd={onHslComplete}
          accessibilityLabel="Saturation slider"
        />

        <SaturationLightnessSlider
          baseColor={hslToHex(hsl.h, hsl.s, 50)}
          value={hsl.l}
          mode="lightness"
          onValueChange={(v) => onHslChange({ ...hsl, l: v })}
          onDragEnd={onHslComplete}
          accessibilityLabel="Lightness slider"
        />
      </View>

      <AnimatedPressable
        style={[styles.applyCustomBtn, { backgroundColor: colors.textPrimary }]}
        onPress={() => onApply(customPreviewColor)}
        scaleValue={0.96}
        activeOpacity={0.85}
        hapticFeedback="light"
        accessibilityLabel="Apply custom color"
        accessibilityRole="button"
      >
        <Text style={styles.applyCustomText}>Apply</Text>
      </AnimatedPressable>
    </View>
  );
}

export default ColorPickerPanel;
