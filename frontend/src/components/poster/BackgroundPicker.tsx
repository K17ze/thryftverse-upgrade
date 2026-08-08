import React from 'react';
import {
  View,
  StyleSheet,
  Text,
  ScrollView,
  Pressable,
  PanResponder,
  GestureResponderEvent,
  PanResponderGestureState,
  LayoutChangeEvent,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import { Typography, Radius, Space, Stroke } from '../../theme/designTokens';
import { Motion } from '../../theme/motionTokens';
import { AnimatedPressable } from '../AnimatedPressable';
import { useAppTheme } from '../../theme/ThemeContext';
import { useHaptic } from '../../hooks/useHaptic';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useMotionConfig } from '../../hooks/useMotionConfig';

interface BackgroundPickerProps {
  visible: boolean;
  currentColor: string | null;
  onSelect: (color: string | null) => void;
  onClose: () => void;
}

const GRADIENTS = [
  { label: 'Bronze', colors: ['#8A6A3F', '#C9A46A'] },
  { label: 'Ocean', colors: ['#06489A', '#4A7AC4'] },
  { label: 'Berry', colors: ['#6B3245', '#9A6B7A'] },
  { label: 'Midnight', colors: ['#1a1a2e', '#16213e'] },
  { label: 'Coral', colors: ['#7B0E1E', '#9A6B7A'] },
  { label: 'Forest', colors: ['#1C5631', '#215634'] },
];

const HUE_PRESETS = [
  '#1a1a2e', '#16213e', '#0f3460', '#7B0E1E', '#9A6B7A',
  '#C9A46A', '#06489A', '#215634', '#6B3245', '#8A6A3F',
  '#1C5631', '#0A0A0A', '#4A7AC4', '#5F1616',
  '#222f3e', '#576574', '#8395a7', '#c8d6e5', '#dfe6e9',
  '#ffffff', '#000000',
];

function isLightColor(hex: string): boolean {
  if (!hex || hex.startsWith('rgba')) return false;
  let c = hex.replace('#', '');
  if (c.length === 3) {
    c = c.split('').map((x) => x + x).join('');
  }
  const r = parseInt(c.substring(0, 2), 16) || 0;
  const g = parseInt(c.substring(2, 4), 16) || 0;
  const b = parseInt(c.substring(4, 6), 16) || 0;
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6;
}

function hslToHex(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360;
  s = Math.max(0, Math.min(1, s / 100));
  l = Math.max(0, Math.min(1, l / 100));
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; b = 0; }
  else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; }
  else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = x; g = 0; b = c; }
  else { r = c; g = 0; b = x; }
  const toHex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  if (!hex || !hex.startsWith('#')) return { h: 0, s: 0, l: 50 };
  let c = hex.replace('#', '');
  if (c.length === 3) {
    c = c.split('').map((x) => x + x).join('');
  }
  const r = (parseInt(c.substring(0, 2), 16) || 0) / 255;
  const g = (parseInt(c.substring(2, 4), 16) || 0) / 255;
  const b = (parseInt(c.substring(4, 6), 16) || 0) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) * 60; break;
      case g: h = ((b - r) / d + 2) * 60; break;
      case b: h = ((r - g) / d + 4) * 60; break;
    }
  }
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
}

const HUE_TRACK_HEIGHT = 36;
const SLIDER_HEIGHT = 28;

function ColorSlider({
  label,
  trackStyle,
  value,
  maxValue,
  onValueChange,
  onComplete,
  reducedMotion,
  colors,
  styles,
  trackChildren,
}: {
  label: string;
  trackStyle: ViewStyle;
  value: number;
  maxValue: number;
  onValueChange: (v: number) => void;
  onComplete?: () => void;
  reducedMotion: boolean;
  colors: any;
  styles: ReturnType<typeof createStyles>;
  trackChildren?: React.ReactNode;
}) {
  const [width, setWidth] = React.useState(0);
  const thumbPos = useSharedValue(0);

  React.useEffect(() => {
    if (width > 0) {
      thumbPos.value = withTiming((value / maxValue) * width, {
        duration: reducedMotion ? 0 : Motion.duration.fast,
      });
    }
  }, [value, maxValue, width, reducedMotion]);

  const handleLayout = (e: LayoutChangeEvent) => {
    setWidth(e.nativeEvent.layout.width);
  };

  const updateFromPosition = (x: number) => {
    if (width <= 0) return;
    const ratio = Math.max(0, Math.min(1, x / width));
    onValueChange(Math.round(ratio * maxValue));
  };

  const panResponder = React.useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt: GestureResponderEvent) => {
        updateFromPosition(evt.nativeEvent.locationX);
      },
      onPanResponderMove: (_evt: GestureResponderEvent, gesture: PanResponderGestureState) => {
        updateFromPosition(gesture.moveX);
      },
      onPanResponderRelease: () => {
        onComplete?.();
      },
    })
  ).current;

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: thumbPos.value }],
  }));

  return (
    <View style={styles.sliderWrap}>
      <Text style={styles.sliderLabel}>{label}</Text>
      <View
        style={[styles.sliderTrack, trackStyle]}
        onLayout={handleLayout}
        {...panResponder.panHandlers}
      >
        {trackChildren}
        <Reanimated.View style={[styles.sliderThumb, thumbStyle]} />
      </View>
    </View>
  );
}

const HUE_SEGMENTS = 12;
function HueTrack() {
  const segments = [];
  for (let i = 0; i < HUE_SEGMENTS; i++) {
    const h = (i / HUE_SEGMENTS) * 360;
    segments.push(
      <View
        key={i}
        style={{
          flex: 1,
          backgroundColor: hslToHex(h, 100, 50),
        }}
      />
    );
  }
  return (
    <View style={{ flexDirection: 'row', position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }}>
      {segments}
    </View>
  );
}

export default function BackgroundPicker({ visible, currentColor, onSelect, onClose }: BackgroundPickerProps) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const reducedMotion = useReducedMotion();
  const { isEnabled } = useMotionConfig();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const [showCustom, setShowCustom] = React.useState(false);
  const [hsl, setHsl] = React.useState(() => hexToHsl(currentColor ?? '#9b0202'));

  const bgColorShared = useSharedValue(currentColor ?? 'transparent');
  const [displayColor, setDisplayColor] = React.useState(currentColor ?? 'transparent');

  React.useEffect(() => {
    if (currentColor) {
      bgColorShared.value = withTiming(currentColor, {
        duration: isEnabled ? Motion.duration.normal : 0,
      });
      setDisplayColor(currentColor);
    } else {
      setDisplayColor('transparent');
    }
  }, [currentColor, bgColorShared, isEnabled]);

  React.useEffect(() => {
    if (showCustom) {
      setHsl(hexToHsl(currentColor ?? '#9b0202'));
    }
  }, [showCustom, currentColor]);

  const handleSelect = (color: string | null) => {
    haptic.selection();
    onSelect(color);
  };

  const handleHslChange = (newHsl: { h: number; s: number; l: number }) => {
    setHsl(newHsl);
    const hex = hslToHex(newHsl.h, newHsl.s, newHsl.l);
    onSelect(hex);
  };

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
              <AnimatedPressable
                style={[styles.colorOrb, { backgroundColor: 'transparent', borderColor: colors.borderSubtle }]}
                onPress={() => handleSelect(null)}
                scaleValue={0.9}
                activeOpacity={0.85}
                hapticFeedback="selection"
                accessibilityLabel="No background color"
                accessibilityHint="Clears the background color"
                accessibilityRole="button"
                accessibilityState={{ selected: !currentColor }}
              >
                {!currentColor && <Ionicons name="checkmark" size={14} color={colors.textPrimary} />}
                {currentColor && <Ionicons name="close" size={14} color={colors.textSecondary} />}
              </AnimatedPressable>
              {HUE_PRESETS.map((color) => (
                <AnimatedPressable
                  key={color}
                  style={[
                    styles.colorOrb,
                    { backgroundColor: color },
                    currentColor === color && styles.colorOrbActive,
                  ]}
                  onPress={() => handleSelect(color)}
                  scaleValue={0.9}
                  activeOpacity={0.85}
                  hapticFeedback="selection"
                  accessibilityLabel={`Background color ${color}`}
                  accessibilityHint={`Sets the background to ${color}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: currentColor === color }}
                >
                  {currentColor === color && (
                    <Ionicons
                      name="checkmark"
                      size={14}
                      color={isLightColor(color) ? '#000' : '#fff'}
                    />
                  )}
                </AnimatedPressable>
              ))}
              <Pressable
                style={[styles.colorOrb, styles.addColorOrb]}
                onPress={() => {
                  setShowCustom(true);
                  haptic.selection();
                }}
                hitSlop={8}
                accessibilityLabel="Custom color picker"
                accessibilityHint="Opens HSL sliders to pick a custom color"
                accessibilityRole="button"
              >
                <Ionicons name="add" size={18} color={colors.textPrimary} />
              </Pressable>
            </ScrollView>

            <Text style={styles.sectionLabel}>Gradients</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.gradientRow}
              accessibilityRole="list"
              accessibilityLabel="Gradient backgrounds"
            >
              {GRADIENTS.map((g) => (
                <AnimatedPressable
                  key={g.label}
                  style={[styles.gradientCard, { backgroundColor: g.colors[0] }]}
                  onPress={() => handleSelect(g.colors[0])}
                  scaleValue={0.94}
                  activeOpacity={0.85}
                  hapticFeedback="selection"
                  accessibilityLabel={`${g.label} gradient`}
                  accessibilityHint={`Applies the ${g.label.toLowerCase()} gradient background`}
                  accessibilityRole="button"
                >
                  <View style={[styles.gradientHalf, { backgroundColor: g.colors[1] }]} />
                  <Text style={styles.gradientLabel}>{g.label}</Text>
                </AnimatedPressable>
              ))}
            </ScrollView>
          </>
        ) : (
          <View style={styles.customWrap}>
            <View style={styles.customHeader}>
              <Pressable
                onPress={() => {
                  setShowCustom(false);
                  haptic.light();
                }}
                hitSlop={8}
                accessibilityLabel="Back to presets"
                accessibilityRole="button"
              >
                <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
              </Pressable>
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

            <ColorSlider
              label="Hue"
              trackStyle={{ backgroundColor: 'transparent', overflow: 'hidden' }}
              value={hsl.h}
              maxValue={360}
              onValueChange={(v) => handleHslChange({ ...hsl, h: v })}
              reducedMotion={reducedMotion}
              colors={colors}
              styles={styles}
              trackChildren={<HueTrack />}
            />

            <View style={styles.sliderWrap}>
              <Text style={styles.sliderLabel}>Saturation</Text>
              <SaturationLightnessSlider
                baseColor={hslToHex(hsl.h, 100, 50)}
                value={hsl.s}
                onValueChange={(v) => handleHslChange({ ...hsl, s: v })}
                reducedMotion={reducedMotion}
                colors={colors}
                styles={styles}
                mode="saturation"
              />
            </View>

            <View style={styles.sliderWrap}>
              <Text style={styles.sliderLabel}>Lightness</Text>
              <SaturationLightnessSlider
                baseColor={hslToHex(hsl.h, hsl.s, 50)}
                value={hsl.l}
                onValueChange={(v) => handleHslChange({ ...hsl, l: v })}
                reducedMotion={reducedMotion}
                colors={colors}
                styles={styles}
                mode="lightness"
              />
            </View>

            <Pressable
              style={styles.applyCustomBtn}
              onPress={() => {
                handleSelect(customPreviewColor);
                setShowCustom(false);
              }}
              accessibilityLabel="Apply custom color"
              accessibilityRole="button"
            >
              <Text style={styles.applyCustomText}>Apply</Text>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

function SaturationLightnessSlider({
  baseColor,
  value,
  onValueChange,
  reducedMotion,
  colors,
  styles,
  mode,
}: {
  baseColor: string;
  value: number;
  onValueChange: (v: number) => void;
  reducedMotion: boolean;
  colors: any;
  styles: ReturnType<typeof createStyles>;
  mode: 'saturation' | 'lightness';
}) {
  const [width, setWidth] = React.useState(0);
  const thumbPos = useSharedValue(0);

  React.useEffect(() => {
    if (width > 0) {
      thumbPos.value = withTiming((value / 100) * width, {
        duration: reducedMotion ? 0 : Motion.duration.fast,
      });
    }
  }, [value, width, reducedMotion]);

  const handleLayout = (e: LayoutChangeEvent) => {
    setWidth(e.nativeEvent.layout.width);
  };

  const updateFromPosition = (x: number) => {
    if (width <= 0) return;
    const ratio = Math.max(0, Math.min(1, x / width));
    onValueChange(Math.round(ratio * 100));
  };

  const panResponder = React.useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt: GestureResponderEvent) => {
        updateFromPosition(evt.nativeEvent.locationX);
      },
      onPanResponderMove: (_evt: GestureResponderEvent, gesture: PanResponderGestureState) => {
        updateFromPosition(gesture.moveX);
      },
    })
  ).current;

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: thumbPos.value }],
  }));

  const gradientStyle: ViewStyle = {
    backgroundColor: 'transparent',
    overflow: 'hidden',
  };

  const SEGMENTS = 12;
  const segments: React.ReactNode[] = [];
  for (let i = 0; i < SEGMENTS; i++) {
    const ratio = i / (SEGMENTS - 1);
    let color = baseColor;
    if (mode === 'saturation') {
      color = hslToHex(
        hexToHsl(baseColor).h,
        Math.round(ratio * 100),
        50
      );
    } else {
      color = hslToHex(
        hexToHsl(baseColor).h,
        hexToHsl(baseColor).s,
        Math.round(ratio * 100)
      );
    }
    segments.push(
      <View key={i} style={{ flex: 1, backgroundColor: color }} />
    );
  }

  return (
    <View
      style={[styles.sliderTrack, styles.slSliderTrack, gradientStyle]}
      onLayout={handleLayout}
      {...panResponder.panHandlers}
    >
      <View style={{ flexDirection: 'row', position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }}>
        {segments}
      </View>
      <Reanimated.View style={[styles.sliderThumb, thumbStyle]} />
    </View>
  );
}

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
    paddingBottom: 32,
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
    borderRadius: 2,
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
  colorOrb: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: Stroke.standard,
    borderColor: colors.borderSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorOrbActive: {
    borderWidth: Stroke.emphasis,
    borderColor: colors.textPrimary,
  },
  addColorOrb: {
    backgroundColor: colors.glassBg,
    borderColor: colors.borderSubtle,
  },
  gradientRow: {
    flexDirection: 'row',
    gap: 10,
    paddingBottom: Space.sm,
    paddingTop: 4,
  },
  gradientCard: {
    width: 64,
    height: 64,
    borderRadius: Radius.md,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: Stroke.standard,
    borderColor: colors.borderSubtle,
  },
  gradientHalf: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '50%',
  },
  gradientLabel: {
    fontSize: 10,
    fontFamily: Typography.family.bold,
    color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 4,
    zIndex: 2,
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
  sliderTrack: {
    height: SLIDER_HEIGHT,
    borderRadius: Radius.sm,
    justifyContent: 'center',
    overflow: 'visible',
  },
  slSliderTrack: {
    overflow: 'hidden',
  },
  sliderThumb: {
    position: 'absolute',
    top: -2,
    left: -8,
    width: 16,
    height: SLIDER_HEIGHT + 4,
    borderRadius: Radius.full,
    backgroundColor: '#fff',
    borderWidth: Stroke.standard,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 2,
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
