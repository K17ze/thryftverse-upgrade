/**
 * BackgroundSheet — bottom sheet for picking the Look canvas background.
 *
 * Supports four background types per the composition schema
 * (CreatorBackgroundSchema):
 *   - Solid: neutral color swatches + custom color picker
 *   - Gradient: 6 preset gradient swatches (value + secondaryValue)
 *   - Blurred: blurred version of the first selected media layer's image,
 *     with a blur-radius slider (0–50)
 *   - Image: placeholder for future media-library integration
 *
 * The sheet maintains a local draft of the background. Each control
 * mutates the draft in real time (AGENTS.md §11). Confirm commits the
 * draft to the document via onConfirm; Cancel discards and closes.
 *
 * Uses SheetContainer from ../CreatorAnimations for consistent motion
 * and chrome. Uses design tokens, useAppTheme, and useHaptic throughout.
 */
import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput,
  LayoutChangeEvent,
  GestureResponderEvent,
  PanResponder,
  PanResponderGestureState,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Space, Radius, Type, Typography, FontFamily, Control, Stroke } from '../../theme/designTokens';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { SheetContainer, PressScale } from '../CreatorAnimations';
import { useHaptic } from '../../hooks/useHaptic';
import type { CreatorBackground, CreatorLayer } from '../composition';

// ── Presets ───────────────────────────────────────────────────────────
// These are user-facing canvas background values — intentionally hardcoded
// literals (not theme tokens) because they persist as canvas background
// values and must remain stable across light/dark mode.

const SOLID_SWATCHES: { label: string; value: string }[] = [
  { label: 'White', value: '#ffffff' },
  { label: 'Black', value: '#000000' },
  { label: 'Dark', value: '#1a1a1a' },
  { label: 'Light', value: '#f5f5f5' },
  { label: 'Silver', value: '#e8e8e8' },
];

const GRADIENT_PRESETS: { label: string; value: string; secondaryValue: string }[] = [
  { label: 'Dark to Light', value: '#1a1a1a', secondaryValue: '#f5f5f5' },
  { label: 'Warm', value: '#2d1b0e', secondaryValue: '#C9A46A' },
  { label: 'Cool', value: '#0a1929', secondaryValue: '#4A90D9' },
  { label: 'Neutral', value: '#e8e8e8', secondaryValue: '#f5f5f5' },
  { label: 'Sunset', value: '#9b0202', secondaryValue: '#F5D547' },
  { label: 'Ocean', value: '#06489A', secondaryValue: '#215634' },
];

type BgType = CreatorBackground['type'];

const TYPE_CHIPS: { id: BgType; label: string; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
  { id: 'color', label: 'Solid', icon: 'square-outline' },
  { id: 'gradient', label: 'Gradient', icon: 'color-wand-outline' },
  { id: 'blur', label: 'Blurred', icon: 'aperture-outline' },
  { id: 'image', label: 'Image', icon: 'images-outline' },
];

// ── Props ─────────────────────────────────────────────────────────────

export interface BackgroundSheetProps {
  visible: boolean;
  currentBackground: CreatorBackground;
  /** Media layers on the current page — used for the Blurred preview. */
  mediaLayers: CreatorLayer[];
  onConfirm: (bg: CreatorBackground) => void;
  onClose: () => void;
}

// ── Component ─────────────────────────────────────────────────────────

export function BackgroundSheet({
  visible,
  currentBackground,
  mediaLayers,
  onConfirm,
  onClose,
}: BackgroundSheetProps) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  // Local draft — synced from currentBackground each time the sheet opens.
  const [draft, setDraft] = useState<CreatorBackground>(currentBackground);
  const [customColor, setCustomColor] = useState('#1a1a1a');

  useEffect(() => {
    if (visible) {
      setDraft(currentBackground);
      setCustomColor(currentBackground.value || '#1a1a1a');
    }
  }, [visible, currentBackground]);

  // First media layer for the Blurred preview.
  const firstMediaLayer = useMemo(
    () => mediaLayers.find((l) => l.type === 'media') ?? null,
    [mediaLayers],
  );
  const blurPreviewUri = firstMediaLayer?.type === 'media' ? firstMediaLayer.payload.mediaUri : '';

  // ── Type chip selection ────────────────────────────────────────────
  const handleTypeSelect = useCallback((type: BgType) => {
    haptic.selection();
    setDraft((prev) => {
      const next: CreatorBackground = { ...prev, type };
      // When switching to blur, seed blurAssetId/blurRadius if available.
      if (type === 'blur') {
        if (!next.blurAssetId && firstMediaLayer) {
          next.blurAssetId = firstMediaLayer.id;
        }
        if (next.blurRadius == null) {
          next.blurRadius = 20;
        }
      }
      return next;
    });
  }, [haptic, firstMediaLayer]);

  // ── Solid color selection ──────────────────────────────────────────
  const handleSolidSelect = useCallback((value: string) => {
    haptic.selection();
    setDraft((prev) => ({ ...prev, type: 'color', value, secondaryValue: undefined }));
  }, [haptic]);

  const handleCustomColorChange = useCallback((value: string) => {
    setCustomColor(value);
    setDraft((prev) => ({ ...prev, type: 'color', value }));
  }, []);

  // ── Gradient selection ─────────────────────────────────────────────
  const handleGradientSelect = useCallback((value: string, secondaryValue: string) => {
    haptic.selection();
    setDraft((prev) => ({ ...prev, type: 'gradient', value, secondaryValue }));
  }, [haptic]);

  // ── Blur radius slider ─────────────────────────────────────────────
  const handleBlurRadiusChange = useCallback((radius: number) => {
    const clamped = Math.max(0, Math.min(50, Math.round(radius)));
    setDraft((prev) => ({ ...prev, type: 'blur', blurRadius: clamped }));
  }, []);

  // ── Confirm / Cancel ───────────────────────────────────────────────
  const handleConfirm = useCallback(() => {
    haptic.medium();
    onConfirm(draft);
  }, [draft, onConfirm, haptic]);

  const handleCancel = useCallback(() => {
    haptic.light();
    onClose();
  }, [onClose, haptic]);

  // ── Derived: is a solid swatch active? ─────────────────────────────
  const activeSolidValue = draft.type === 'color' ? draft.value : null;
  const activeGradientKey = draft.type === 'gradient'
    ? `${draft.value}|${draft.secondaryValue ?? ''}`
    : null;
  const blurRadius = draft.type === 'blur' ? (draft.blurRadius ?? 20) : 20;

  return (
    <SheetContainer visible={visible} onClose={handleCancel} maxHeight={0.8}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Background</Text>
        <PressScale
          onPress={handleCancel}
          style={styles.closeBtn}
          accessibilityLabel="Close background picker"
          accessibilityHint="Discards changes and closes the background picker"
        >
          <Ionicons name="close" size={22} color={colors.textSecondary} />
        </PressScale>
      </View>

      {/* Type chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipScroll}
        contentContainerStyle={styles.chipScrollContent}
      >
        {TYPE_CHIPS.map((chip) => {
          const isActive = draft.type === chip.id;
          const isImageDisabled = chip.id === 'image';
          return (
            <PressScale
              key={chip.id}
              onPress={() => handleTypeSelect(chip.id)}
              style={[
                styles.chip,
                {
                  backgroundColor: isActive ? colors.brandSubtle : 'transparent',
                  borderColor: isActive ? colors.brand : colors.border,
                },
              ]}
              accessibilityLabel={`${chip.label} background type${isActive ? ', selected' : ''}`}
              accessibilityRole="button"
              accessibilityState={{ disabled: isImageDisabled }}
              disabled={isImageDisabled && !isActive}
            >
              <Ionicons
                name={chip.icon}
                size={16}
                color={isActive ? colors.brand : colors.textSecondary}
              />
              <Text
                style={[
                  styles.chipLabel,
                  { color: isActive ? colors.brand : colors.textSecondary },
                ]}
              >
                {chip.label}
              </Text>
            </PressScale>
          );
        })}
      </ScrollView>

      {/* Section body */}
      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Solid ── */}
        {draft.type === 'color' && (
          <View>
            <Text style={styles.sectionLabel}>Neutral colours</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.swatchRow}
            >
              {SOLID_SWATCHES.map((sw) => {
                const isActive = activeSolidValue === sw.value;
                return (
                  <Pressable
                    key={sw.value}
                    onPress={() => handleSolidSelect(sw.value)}
                    style={styles.swatchWrap}
                    accessibilityLabel={`${sw.label} background${isActive ? ', selected' : ''}`}
                    accessibilityRole="button"
                  >
                    <View
                      style={[
                        styles.swatch,
                        { borderColor: isActive ? colors.brand : colors.border },
                      ]}
                    >
                      <View style={[styles.swatchFill, { backgroundColor: sw.value }]} />
                      {isActive && (
                        <View style={styles.swatchCheck}>
                          <Ionicons
                            name="checkmark"
                            size={14}
                            color={sw.value === '#ffffff' || sw.value === '#f5f5f5' || sw.value === '#e8e8e8' ? '#000' : '#fff'}
                          />
                        </View>
                      )}
                    </View>
                    <Text
                      style={[
                        styles.swatchLabel,
                        { color: isActive ? colors.brand : colors.textSecondary },
                      ]}
                      numberOfLines={1}
                    >
                      {sw.label}
                    </Text>
                  </Pressable>
                );
              })}
              {/* Custom color picker */}
              <View style={styles.swatchWrap}>
                <View
                  style={[
                    styles.swatch,
                    {
                      borderColor: activeSolidValue === customColor && !SOLID_SWATCHES.some((s) => s.value === customColor)
                        ? colors.brand
                        : colors.border,
                    },
                  ]}
                >
                  <View style={[styles.swatchFill, { backgroundColor: customColor }]} />
                </View>
                <TextInput
                  style={[styles.colorInput, { color: colors.textPrimary, borderColor: colors.border }]}
                  value={customColor}
                  onChangeText={handleCustomColorChange}
                  placeholder="#000000"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  accessibilityLabel="Custom background colour"
                  accessibilityHint="Enter a hex colour value for the canvas background"
                />
              </View>
            </ScrollView>
          </View>
        )}

        {/* ── Gradient ── */}
        {draft.type === 'gradient' && (
          <View>
            <Text style={styles.sectionLabel}>Gradients</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.swatchRow}
            >
              {GRADIENT_PRESETS.map((g) => {
                const key = `${g.value}|${g.secondaryValue}`;
                const isActive = activeGradientKey === key;
                return (
                  <Pressable
                    key={g.label}
                    onPress={() => handleGradientSelect(g.value, g.secondaryValue)}
                    style={styles.swatchWrap}
                    accessibilityLabel={`${g.label} gradient${isActive ? ', selected' : ''}`}
                    accessibilityRole="button"
                  >
                    <View
                      style={[
                        styles.swatch,
                        { borderColor: isActive ? colors.brand : colors.border },
                      ]}
                    >
                      <LinearGradient
                        colors={[g.value, g.secondaryValue]}
                        style={styles.swatchFill}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 0, y: 1 }}
                      />
                      {isActive && (
                        <View style={styles.swatchCheck}>
                          <Ionicons name="checkmark" size={14} color="#fff" />
                        </View>
                      )}
                    </View>
                    <Text
                      style={[
                        styles.swatchLabel,
                        { color: isActive ? colors.brand : colors.textSecondary },
                      ]}
                      numberOfLines={1}
                    >
                      {g.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* ── Blurred ── */}
        {draft.type === 'blur' && (
          <View>
            <Text style={styles.sectionLabel}>Blurred photo</Text>
            {blurPreviewUri ? (
              <View style={styles.blurPreviewWrap}>
                <Image
                  source={{ uri: blurPreviewUri }}
                  style={styles.blurPreview}
                  contentFit="cover"
                  blurRadius={blurRadius}
                  cachePolicy="memory-disk"
                />
                <Text style={[styles.blurHint, { color: colors.textMuted }]}>
                  Blurred version of your first photo
                </Text>
              </View>
            ) : (
              <View style={[styles.blurEmpty, { borderColor: colors.border }]}>
                <Ionicons name="images-outline" size={28} color={colors.textMuted} />
                <Text style={[styles.blurEmptyText, { color: colors.textMuted }]}>
                  Add a photo to the canvas first
                </Text>
              </View>
            )}
            <View style={styles.sliderRow}>
              <View style={styles.sliderHeader}>
                <Text style={[styles.sliderLabel, { color: colors.textPrimary }]}>
                  Blur intensity
                </Text>
                <Text style={[styles.sliderValue, { color: colors.textMuted }]}>
                  {blurRadius}
                </Text>
              </View>
              <BlurSlider
                value={blurRadius}
                min={0}
                max={50}
                trackColor={colors.border}
                fillColor={colors.brand}
                thumbColor={colors.textInverse}
                onChange={handleBlurRadiusChange}
              />
            </View>
          </View>
        )}

        {/* ── Image ── */}
        {draft.type === 'image' && (
          <View style={styles.imageSection}>
            <View style={[styles.imagePlaceholder, { borderColor: colors.border }]}>
              <Ionicons name="images-outline" size={32} color={colors.textMuted} />
              <Text style={[styles.imagePlaceholderText, { color: colors.textSecondary }]}>
                Choose a photo from your library to use as the canvas background.
              </Text>
              <Pressable
                style={[styles.imageBtn, { backgroundColor: colors.brand, opacity: 0.5 }]}
                disabled
                accessibilityLabel="Choose from Photos"
                accessibilityHint="Photo library integration coming soon"
                accessibilityState={{ disabled: true }}
              >
                <Ionicons name="images-outline" size={18} color={colors.textInverse} />
                <Text style={[styles.imageBtnText, { color: colors.textInverse }]}>
                  Choose from Photos
                </Text>
              </Pressable>
              <Text style={[styles.imageNote, { color: colors.textMuted }]}>
                Photo library integration is not yet available
              </Text>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Footer — Confirm / Cancel */}
      <View style={[styles.footer, { borderTopColor: colors.border }]}>
        <PressScale
          onPress={handleCancel}
          style={[styles.footerBtn, styles.footerCancel, { borderColor: colors.border }]}
          accessibilityLabel="Cancel"
          accessibilityHint="Discards background changes and closes the sheet"
        >
          <Text style={[styles.footerCancelText, { color: colors.textSecondary }]}>
            Cancel
          </Text>
        </PressScale>
        <PressScale
          onPress={handleConfirm}
          style={[styles.footerBtn, styles.footerConfirm, { backgroundColor: colors.brand }]}
          accessibilityLabel="Confirm background"
          accessibilityHint="Applies the selected background to the canvas"
        >
          <Text style={[styles.footerConfirmText, { color: colors.textInverse }]}>
            Done
          </Text>
        </PressScale>
      </View>
    </SheetContainer>
  );
}

// ── Blur slider (PanResponder-based, no external dependency) ──────────

interface BlurSliderProps {
  value: number;
  min: number;
  max: number;
  trackColor: string;
  fillColor: string;
  thumbColor: string;
  onChange: (value: number) => void;
}

function BlurSlider({ value, min, max, trackColor, fillColor, thumbColor, onChange }: BlurSliderProps) {
  const trackWidthRef = useRef(0);
  const [trackWidth, setTrackWidth] = useState(0);

  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    trackWidthRef.current = e.nativeEvent.layout.width;
    setTrackWidth(e.nativeEvent.layout.width);
  }, []);

  const range = max - min;
  const clamped = Math.min(max, Math.max(min, value));
  const ratio = range === 0 ? 0 : (clamped - min) / range;
  const trackLayoutWidth = trackWidth > 0 ? trackWidth : 1;
  const thumbPosition = ratio * trackLayoutWidth;

  const valueToPosition = useCallback(
    (x: number) => {
      const r = Math.min(1, Math.max(0, x / trackLayoutWidth));
      return min + r * range;
    },
    [trackLayoutWidth, min, range],
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (_e: GestureResponderEvent) => {},
        onPanResponderMove: (_e: GestureResponderEvent, g: PanResponderGestureState) => {
          const next = valueToPosition(thumbPosition + g.dx);
          onChange(Math.round(next));
        },
        onPanResponderRelease: () => {},
        onPanResponderTerminationRequest: () => false,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [thumbPosition, valueToPosition, onChange],
  );

  return (
    <View style={sliderStyles.trackWrap} onLayout={handleLayout} {...panResponder.panHandlers}>
      <View style={[sliderStyles.track, { backgroundColor: trackColor }]} />
      <View style={[sliderStyles.fill, { width: thumbPosition, backgroundColor: fillColor }]} />
      <View style={[sliderStyles.thumb, { left: thumbPosition, backgroundColor: thumbColor }]} />
    </View>
  );
}

const sliderStyles = StyleSheet.create({
  trackWrap: {
    height: Control.hit,
    justifyContent: 'center',
    position: 'relative',
  },
  track: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 3,
    borderRadius: Radius.full,
  },
  fill: {
    position: 'absolute',
    left: 0,
    height: 3,
    borderRadius: Radius.full,
  },
  thumb: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderRadius: Radius.full,
    marginLeft: -8,
    borderWidth: Stroke.standard,
    borderColor: 'rgba(0,0,0,0)',
  },
});

// ── Styles ────────────────────────────────────────────────────────────

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
    },
    title: {
      fontFamily: Typography.family.semibold,
      fontSize: Type.subtitle.size,
    },
    closeBtn: {
      width: 36,
      height: 36,
      justifyContent: 'center',
      alignItems: 'center',
      borderRadius: Radius.sm,
    },
    // ── Type chips ──
    chipScroll: {
      marginHorizontal: -Space.md,
    },
    chipScrollContent: {
      paddingHorizontal: Space.md,
      gap: Space.sm,
      paddingVertical: Space.xs,
    },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
      borderRadius: Radius.full,
      borderWidth: 1,
    },
    chipLabel: {
      fontFamily: Typography.family.medium,
      fontSize: Type.caption.size,
    },
    // ── Body ──
    body: {
      paddingHorizontal: Space.md,
    },
    bodyContent: {
      paddingBottom: Space.lg,
      gap: Space.sm,
    },
    sectionLabel: {
      fontFamily: Typography.family.semibold,
      fontSize: Type.caption.size,
      color: colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginTop: Space.sm,
      marginBottom: Space.xs,
    },
    // ── Swatches ──
    swatchRow: {
      gap: Space.sm,
      paddingVertical: Space.xs,
    },
    swatchWrap: {
      alignItems: 'center',
      gap: 6,
    },
    swatch: {
      width: 64,
      height: 80,
      borderRadius: Radius.lg,
      borderWidth: 2,
      overflow: 'hidden',
    },
    swatchFill: {
      width: '100%',
      height: '100%',
    },
    swatchCheck: {
      position: 'absolute',
      bottom: 6,
      right: 6,
      width: 20,
      height: 20,
      borderRadius: Radius.full,
      backgroundColor: 'rgba(0,0,0,0.45)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    swatchLabel: {
      fontFamily: Typography.family.medium,
      fontSize: Type.meta.size,
      letterSpacing: 0.1,
    },
    // ── Custom color input ──
    colorInput: {
      width: 64,
      borderWidth: 1,
      borderRadius: Radius.sm,
      paddingHorizontal: Space.xs,
      paddingVertical: Space.xxs,
      fontSize: Type.meta.size,
      fontFamily: FontFamily.regular,
      textAlign: 'center',
    },
    // ── Blurred ──
    blurPreviewWrap: {
      gap: Space.xs,
    },
    blurPreview: {
      width: '100%',
      height: 160,
      borderRadius: Radius.lg,
    },
    blurHint: {
      fontFamily: Typography.family.regular,
      fontSize: Type.caption.size,
      textAlign: 'center',
    },
    blurEmpty: {
      alignItems: 'center',
      justifyContent: 'center',
      gap: Space.sm,
      paddingVertical: Space.xl,
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: Radius.lg,
      borderStyle: 'dashed',
    },
    blurEmptyText: {
      fontFamily: Typography.family.regular,
      fontSize: Type.caption.size,
    },
    // ── Slider ──
    sliderRow: {
      marginTop: Space.md,
    },
    sliderHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: Space.xs,
    },
    sliderLabel: {
      fontFamily: FontFamily.regular,
      fontSize: Type.caption.size,
    },
    sliderValue: {
      fontFamily: FontFamily.medium,
      fontSize: Type.caption.size,
      fontVariant: ['tabular-nums'],
    },
    // ── Image ──
    imageSection: {
      paddingVertical: Space.sm,
    },
    imagePlaceholder: {
      alignItems: 'center',
      justifyContent: 'center',
      gap: Space.md,
      paddingVertical: Space.xl,
      paddingHorizontal: Space.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: Radius.lg,
      borderStyle: 'dashed',
    },
    imagePlaceholderText: {
      fontFamily: Typography.family.regular,
      fontSize: Type.body.size,
      textAlign: 'center',
      lineHeight: Type.body.lineHeight,
    },
    imageBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: Space.sm,
      paddingHorizontal: Space.lg,
      paddingVertical: Space.md,
      borderRadius: Radius.md,
    },
    imageBtnText: {
      fontFamily: Typography.family.semibold,
      fontSize: Type.body.size,
    },
    imageNote: {
      fontFamily: Typography.family.regular,
      fontSize: Type.meta.size,
    },
    // ── Footer ──
    footer: {
      flexDirection: 'row',
      gap: Space.sm,
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
    },
    footerBtn: {
      flex: 1,
      paddingVertical: Space.md,
      borderRadius: Radius.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    footerCancel: {
      borderWidth: 1,
    },
    footerCancelText: {
      fontFamily: Typography.family.semibold,
      fontSize: Type.body.size,
    },
    footerConfirm: {
      // backgroundColor set inline
    },
    footerConfirmText: {
      fontFamily: Typography.family.semibold,
      fontSize: Type.body.size,
    },
  });
}
