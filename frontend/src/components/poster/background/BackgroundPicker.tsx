/** BackgroundPicker — flagship background colour / gradient picker. Split from the original 920-line file. Uses shared colorUtils, ColorSlider, and GradientRing. */

import React from 'react';
import { View, StyleSheet, Text, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withDelay,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';

import { Typography, Radius, Space, Stroke } from '../../../theme/designTokens';
import { AnimatedPressable } from '../../AnimatedPressable';
import { useAppTheme } from '../../../theme/ThemeContext';
import { useHaptic } from '../../../hooks/useHaptic';
import { useReducedMotion } from '../../../hooks/useReducedMotion';
import { useMotionConfig } from '../../../hooks/useMotionConfig';

import { hslToHex, hexToHsl, isLightColor } from '../shared/colorUtils';
import { HueSlider, SaturationLightnessSlider } from '../shared/ColorSlider';
import { GradientRing } from '../shared/GradientRing';
import { GRADIENTS, GradientPresetCard } from './GradientPresets';

// ── Props ────────────────────────────────────────────────────────────

export interface BackgroundPickerProps {
  visible: boolean;
  currentColor: string | null;
  onSelect: (color: string | null) => void;
  onClose: () => void;
}

// ── Preset solid colours ─────────────────────────────────────────────

const HUE_PRESETS = [
  '#1a1a2e', '#16213e', '#0f3460', '#7B0E1E', '#9A6B7A',
  '#C9A46A', '#06489A', '#215634', '#6B3245', '#8A6A3F',
  '#1C5631', '#0A0A0A', '#4A7AC4', '#5F1616',
  '#222f3e', '#576574', '#8395a7', '#c8d6e5', '#dfe6e9',
  '#ffffff', '#000000',
];

// ── Constants ────────────────────────────────────────────────────────

const SWATCH_SIZE = 38;

// ── ColorSwatch — staggered entrance + GradientRing for active ───────

interface ColorSwatchProps {
  color: string;
  isActive: boolean;
  index: number;
  reducedMotion: boolean;
  onSelect: (color: string) => void;
}

const ColorSwatch = React.memo(function ColorSwatch({
  color,
  isActive,
  index,
  reducedMotion,
  onSelect,
}: ColorSwatchProps) {
  const haptic = useHaptic();
  const { spring, stagger } = useMotionConfig();

  // Per-swatch staggered entrance: scale 0.8->1.0 with spring
  const entrance = useSharedValue(reducedMotion ? 1 : 0);
  React.useEffect(() => {
    if (reducedMotion) {
      entrance.value = 1;
    } else {
      entrance.value = withDelay(
        index * stagger.fast,
        withSpring(1, spring.entrance),
      );
    }
  }, [index, reducedMotion, stagger.fast, spring.entrance, entrance]);

  const entranceStyle = useAnimatedStyle(() => {
    'worklet';
    const scale = interpolate(entrance.value, [0, 1], [0.8, 1], Extrapolation.CLAMP);
    const opacity = interpolate(entrance.value, [0, 1], [0, 1], Extrapolation.CLAMP);
    return { transform: [{ scale }], opacity };
  });

  const handlePress = React.useCallback(() => {
    haptic.selection();
    onSelect(color);
  }, [haptic, onSelect, color]);

  const isTransparent = color === 'transparent';

  return (
    <Reanimated.View style={entranceStyle}>
      <GradientRing
        isActive={isActive}
        size={SWATCH_SIZE}
        borderRadius={SWATCH_SIZE / 2}
        strokeWidth={2}
      >
        <AnimatedPressable
          style={[swatchStyles.colorOrb, isTransparent && swatchStyles.transparentOrb, { backgroundColor: isTransparent ? undefined : color }]}
          onPress={handlePress}
          scaleValue={0.9}
          activeOpacity={0.85}
          hapticFeedback="selection"
          accessibilityLabel={`Background color ${color}`}
          accessibilityHint={`Sets the background to ${color}`}
          accessibilityRole="button"
          accessibilityState={{ selected: isActive }}
        >
          {isActive && (
            <Ionicons
              name="checkmark"
              size={14}
              color={isLightColor(color) ? '#000' : '#fff'}
            />
          )}
        </AnimatedPressable>
      </GradientRing>
    </Reanimated.View>
  );
});

// ── Main BackgroundPicker ────────────────────────────────────────────

export default function BackgroundPicker({ visible, currentColor, onSelect, onClose }: BackgroundPickerProps) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const reducedMotion = useReducedMotion();
  const { isEnabled, spring } = useMotionConfig();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const [showCustom, setShowCustom] = React.useState(false);
  const [hsl, setHsl] = React.useState(() => hexToHsl(currentColor ?? '#9b0202'));

  React.useEffect(() => {
    if (showCustom) {
      setHsl(hexToHsl(currentColor ?? '#9b0202'));
    }
  }, [showCustom, currentColor]);

  const handleSelect = React.useCallback((color: string | null) => {
    haptic.selection();
    onSelect(color);
  }, [haptic, onSelect]);

  const handleHslChange = React.useCallback((newHsl: { h: number; s: number; l: number }) => {
    setHsl(newHsl);
    const hex = hslToHex(newHsl.h, newHsl.s, newHsl.l);
    onSelect(hex);
  }, [onSelect]);

  const customPreviewColor = hslToHex(hsl.h, hsl.s, hsl.l);

  if (!visible) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="auto">
      <AnimatedPressable
        style={styles.backdrop}
        onPress={onClose}
        activeOpacity={1}
        hapticFeedback="light"
        accessibilityLabel="Close background picker"
        accessibilityRole="button"
      />

      <View style={styles.panel}>
        <View style={styles.handleRow}>
          <View style={styles.handle} />
        </View>

        <Text style={styles.title}>Background</Text>

        {!showCustom ? (
          <>
            <Text style={styles.sectionLabel}>Solid Colors</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.colorRow}
              accessibilityRole="list"
              accessibilityLabel="Solid background colors"
            >
              {/* No-background (transparent) swatch */}
              <ColorSwatch
                color="transparent"
                isActive={!currentColor}
                index={0}
                reducedMotion={reducedMotion}
                onSelect={() => handleSelect(null)}
              />
              {HUE_PRESETS.map((color, i) => (
                <ColorSwatch
                  key={color}
                  color={color}
                  isActive={currentColor === color}
                  index={i + 1}
                  reducedMotion={reducedMotion}
                  onSelect={handleSelect}
                />
              ))}
              {/* Add custom color button */}
              <AnimatedPressable
                style={[swatchStyles.colorOrb, swatchStyles.addColorOrb, { backgroundColor: colors.glassBg, borderColor: colors.borderSubtle }]}
                onPress={() => {
                  setShowCustom(true);
                  haptic.selection();
                }}
                scaleValue={0.9}
                activeOpacity={0.85}
                hapticFeedback="selection"
                accessibilityLabel="Custom color picker"
                accessibilityHint="Opens HSL sliders to pick a custom color"
                accessibilityRole="button"
              >
                <Ionicons name="add" size={18} color={colors.textPrimary} />
              </AnimatedPressable>
            </ScrollView>

            <Text style={styles.sectionLabel}>Gradients</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.gradientRow}
              accessibilityRole="list"
              accessibilityLabel="Gradient backgrounds"
            >
              {GRADIENTS.map((g, i) => (
                <GradientPresetCard
                  key={g.label}
                  gradient={g}
                  isActive={currentColor === g.colors[0]}
                  index={i}
                  reducedMotion={reducedMotion}
                  onSelect={handleSelect}
                />
              ))}
            </ScrollView>
          </>
        ) : (
          <View style={styles.customWrap}>
            <View style={styles.customHeader}>
              <AnimatedPressable
                onPress={() => {
                  setShowCustom(false);
                  haptic.light();
                }}
                scaleValue={0.9}
                activeOpacity={0.85}
                hapticFeedback="light"
                accessibilityLabel="Back to presets"
                accessibilityRole="button"
              >
                <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
              </AnimatedPressable>
              <Text style={styles.customTitle}>Custom Color</Text>
              <View style={{ width: 22 }} />
            </View>

            <View
              style={[styles.customPreview, { backgroundColor: customPreviewColor }]}
            >
              <Text
                style={[
                  styles.customPreviewLabel,
                  { color: isLightColor(customPreviewColor) ? '#000' : '#fff' },
                ]}
              >
                {customPreviewColor.toUpperCase()}
              </Text>
            </View>

            {/* Hue slider — shared HueSlider with label wrapper */}
            <View style={styles.sliderWrap}>
              <Text style={styles.sliderLabel}>Hue</Text>
              <HueSlider
                value={hsl.h}
                onValueChange={(v) => handleHslChange({ ...hsl, h: v })}
                accessibilityLabel="Hue slider"
              />
            </View>

            {/* Saturation slider — shared SaturationLightnessSlider */}
            <View style={styles.sliderWrap}>
              <Text style={styles.sliderLabel}>Saturation</Text>
              <SaturationLightnessSlider
                baseColor={hslToHex(hsl.h, 100, 50)}
                value={hsl.s}
                mode="saturation"
                onValueChange={(v) => handleHslChange({ ...hsl, s: v })}
                accessibilityLabel="Saturation slider"
              />
            </View>

            {/* Lightness slider — shared SaturationLightnessSlider */}
            <View style={styles.sliderWrap}>
              <Text style={styles.sliderLabel}>Lightness</Text>
              <SaturationLightnessSlider
                baseColor={hslToHex(hsl.h, hsl.s, 50)}
                value={hsl.l}
                mode="lightness"
                onValueChange={(v) => handleHslChange({ ...hsl, l: v })}
                accessibilityLabel="Lightness slider"
              />
            </View>

            <AnimatedPressable
              style={styles.applyCustomBtn}
              onPress={() => {
                handleSelect(customPreviewColor);
                setShowCustom(false);
              }}
              scaleValue={0.95}
              activeOpacity={0.9}
              hapticFeedback="selection"
              accessibilityLabel="Apply custom color"
              accessibilityRole="button"
            >
              <Text style={styles.applyCustomText}>Apply</Text>
            </AnimatedPressable>
          </View>
        )}
      </View>
    </View>
  );
}

const swatchStyles = StyleSheet.create({
  colorOrb: {
    width: SWATCH_SIZE, height: SWATCH_SIZE, borderRadius: SWATCH_SIZE / 2,
    borderWidth: Stroke.standard, borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center', justifyContent: 'center',
  },
  transparentOrb: { backgroundColor: 'transparent' },
  addColorOrb: { borderWidth: Stroke.standard },
});

function createStyles(colors: any) {
  return StyleSheet.create({
    backdrop: {
      ...StyleSheet.absoluteFill,
      backgroundColor: colors.overlay,
    },
    panel: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: colors.surface,
      borderTopLeftRadius: Radius.xxl,
      borderTopRightRadius: Radius.xxl,
      paddingHorizontal: Space.md,
      paddingBottom: Space.xl,
      paddingTop: Space.sm,
      gap: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.glassBorder,
    },
    handleRow: {
      alignItems: 'center',
      paddingBottom: Space.sm,
    },
    handle: {
      width: 36,
      height: 4,
      borderRadius: Radius.full,
      backgroundColor: colors.borderSubtle,
    },
    title: {
      fontSize: 18,
      fontFamily: Typography.family.bold,
      color: colors.textPrimary,
      textAlign: 'center',
      marginBottom: 4,
    },
    sectionLabel: {
      fontSize: 12,
      fontFamily: Typography.family.semibold,
      color: colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      marginTop: 4,
    },
    colorRow: {
      flexDirection: 'row',
      gap: 10,
      paddingBottom: Space.sm,
      paddingTop: 4,
    },
    gradientRow: {
      flexDirection: 'row',
      gap: 10,
      paddingBottom: Space.sm,
      paddingTop: 4,
    },
    customWrap: {
      gap: 14,
      paddingTop: 4,
    },
    customHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingBottom: 4,
    },
    customTitle: {
      fontSize: 16,
      fontFamily: Typography.family.semibold,
      color: colors.textPrimary,
    },
    customPreview: {
      height: 64,
      borderRadius: Radius.lg,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: Stroke.standard,
      borderColor: colors.borderSubtle,
    },
    customPreviewLabel: {
      fontSize: 14,
      fontFamily: Typography.family.semibold,
    },
    sliderWrap: {
      gap: 6,
    },
    sliderLabel: {
      fontSize: 12,
      fontFamily: Typography.family.medium,
      color: colors.textSecondary,
    },
    applyCustomBtn: {
      alignSelf: 'center',
      backgroundColor: colors.brand,
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
  });
}
