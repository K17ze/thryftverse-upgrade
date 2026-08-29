/**
 * BackgroundSheet — bottom sheet for picking the Look canvas background.
 *
 * Supports three background types per the composition schema
 * (CreatorBackgroundSchema):
 *   - Solid: neutral color swatches + shared CreatorColorPicker
 *     (compact row with HEX, eyedropper, recents, alpha)
 *   - Gradient: preset gradient swatches (quick-select) + shared
 *     GradientEditor (2-4 draggable stops, per-stop color via
 *     CreatorColorPicker, angle control, reverse)
 *   - Blurred: blurred version of the first selected media layer's image,
 *     with a blur-radius slider (0–50)
 *   - Image: user-selected photo from the device library, rendered as a
 *     full-bleed cover background with an optional blur slider (0–20)
 *
 * The sheet maintains a local draft of the background. Each control
 * mutates the draft in real time (AGENTS.md §11). Confirm commits the
 * draft to the document via onConfirm; Cancel discards and closes.
 *
 * Uses the shared creator color system (../color/) — no duplicate
 * HSL/HEX helpers (spec 04_COLOR_SYSTEM_ZERO_GAP §14).
 */
import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  LayoutChangeEvent,
  GestureResponderEvent,
  PanResponder,
  PanResponderGestureState,
  Alert,
} from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Space, Radius, Type, Typography, FontFamily, Control, Stroke } from '../../theme/designTokens';
import { IconGrammar } from '../../theme/designTokens';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { SheetContainer, PressScale } from '../CreatorAnimations';
import { useHaptic } from '../../hooks/useHaptic';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { CreatorSlider } from '../controls/CreatorSlider';
import {
  CreatorColorPicker,
  GradientEditor,
  useCreatorColorHistory,
  toHexString,
  fromHexString,
  normalize,
} from '../color/';
import type { CreatorColor, GradientDefinition, GradientStop } from '../color/';
import { makeStableId } from '../../utils/createStableId';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { Motion } from '../../theme/motionTokens';
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
  { id: 'gradient', label: 'Gradient', icon: 'color-filter-outline' },
  { id: 'image', label: 'Image', icon: 'image-outline' },
  { id: 'blur', label: 'Blurred', icon: 'aperture-outline' },
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

// ── Helper: convert a CreatorBackground to a GradientDefinition ───────
// Used to seed the GradientEditor when the sheet opens.
function backgroundToGradient(bg: CreatorBackground): GradientDefinition {
  if (bg.type === 'gradient' && bg.gradientStops && bg.gradientStops.length >= 2) {
    return {
      type: 'linear',
      angle: bg.gradientAngle ?? 180,
      stops: bg.gradientStops.map((s) => ({
        id: makeStableId('stop'),
        position: s.position,
        color: fromHexString(s.color) ?? { space: 'srgb', r: 0, g: 0, b: 0, a: 1 },
      })),
    };
  }
  // Default: two stops from value/secondaryValue.
  const startColor = fromHexString(bg.value) ?? { space: 'srgb' as const, r: 0.1, g: 0.1, b: 0.1, a: 1 };
  const endColor = fromHexString(bg.secondaryValue ?? '#f5f5f5') ?? { space: 'srgb' as const, r: 0.96, g: 0.96, b: 0.96, a: 1 };
  return {
    type: 'linear',
    angle: bg.gradientAngle ?? 180,
    stops: [
      { id: makeStableId('stop'), position: 0, color: startColor },
      { id: makeStableId('stop'), position: 1, color: endColor },
    ],
  };
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
  const reducedMotion = useReducedMotion();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  // Recent color history (shared across creator tools, spec §4).
  const { recents, commitColor: commitRecentColor } = useCreatorColorHistory();

  // Local draft — synced from currentBackground each time the sheet opens.
  const [draft, setDraft] = useState<CreatorBackground>(currentBackground);
  // CreatorColor for the Solid tab's CreatorColorPicker.
  const [solidColor, setSolidColor] = useState<CreatorColor>(
    () => fromHexString(currentBackground.value || '#1a1a1a') ?? { space: 'srgb', r: 0.1, g: 0.1, b: 0.1, a: 1 },
  );
  // GradientDefinition for the Gradient tab's GradientEditor.
  const [gradientDef, setGradientDef] = useState<GradientDefinition>(() => ({
    type: 'linear',
    angle: 180,
    stops: [],
  }));

  // ── Type tab underline indicator (spring-animated, brand color) ──
  const typeTabLayouts = useRef<Map<BgType, { x: number; width: number }>>(new Map());
  const typeUnderlineXSV = useSharedValue(0);
  const typeUnderlineWSV = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      setDraft(currentBackground);
      setSolidColor(fromHexString(currentBackground.value || '#1a1a1a') ?? { space: 'srgb', r: 0.1, g: 0.1, b: 0.1, a: 1 });
      // Build gradient definition from draft: prefer gradientStops, else
      // derive from value/secondaryValue (preset), else default.
      setGradientDef(backgroundToGradient(currentBackground));
      // Reset underline to the active type tab (instant, not animated).
      const layout = typeTabLayouts.current.get(currentBackground.type);
      if (layout) {
        typeUnderlineXSV.value = layout.x;
        typeUnderlineWSV.value = layout.width;
      }
    }
  }, [visible, currentBackground, typeUnderlineXSV, typeUnderlineWSV]);

  // First media layer for the Blurred preview.
  const firstMediaLayer = useMemo(
    () => mediaLayers.find((l) => l.type === 'media') ?? null,
    [mediaLayers],
  );
  const blurPreviewUri = firstMediaLayer?.type === 'media' ? firstMediaLayer.payload.mediaUri : '';

  // ── Type chip selection ────────────────────────────────────────────
  const handleTypeSelect = useCallback((type: BgType) => {
    haptic.selection();
    // Animate underline to the selected tab.
    const layout = typeTabLayouts.current.get(type);
    if (layout) {
      if (reducedMotion) {
        typeUnderlineXSV.value = layout.x;
        typeUnderlineWSV.value = layout.width;
      } else {
        typeUnderlineXSV.value = withSpring(layout.x, Motion.spring.indicator);
        typeUnderlineWSV.value = withSpring(layout.width, Motion.spring.indicator);
      }
    }
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
      // When switching to image, seed imageBlur if not already set.
      if (type === 'image') {
        if (next.imageBlur == null) {
          next.imageBlur = 0;
        }
      }
      return next;
    });
  }, [haptic, firstMediaLayer, typeUnderlineXSV, typeUnderlineWSV, reducedMotion]);

  // ── Solid color selection (preset swatches) ────────────────────────
  const handleSolidSelect = useCallback((value: string) => {
    haptic.selection();
    const parsed = fromHexString(value);
    if (parsed) {
      setSolidColor(parsed);
      commitRecentColor(parsed);
    }
    setDraft((prev) => ({ ...prev, type: 'color', value, secondaryValue: undefined }));
  }, [haptic, commitRecentColor]);

  // ── Solid color (CreatorColorPicker) ───────────────────────────────
  const handleSolidColorChange = useCallback((color: CreatorColor) => {
    setSolidColor(color);
    setDraft((prev) => ({ ...prev, type: 'color', value: toHexString(color), secondaryValue: undefined }));
  }, []);

  const handleSolidColorCommit = useCallback((color: CreatorColor) => {
    const normalizedColor = normalize(color);
    setSolidColor(normalizedColor);
    commitRecentColor(normalizedColor);
    setDraft((prev) => ({ ...prev, type: 'color', value: toHexString(normalizedColor), secondaryValue: undefined }));
  }, [commitRecentColor]);

  // ── Gradient preset selection ──────────────────────────────────────
  const handleGradientPresetSelect = useCallback((value: string, secondaryValue: string) => {
    haptic.selection();
    // Build a GradientDefinition from the preset (two stops at 0 and 1).
    const stop0Color = fromHexString(value) ?? { space: 'srgb' as const, r: 0, g: 0, b: 0, a: 1 };
    const stop1Color = fromHexString(secondaryValue) ?? { space: 'srgb' as const, r: 1, g: 1, b: 1, a: 1 };
    const newGradient: GradientDefinition = {
      type: 'linear',
      angle: 180,
      stops: [
        { id: makeStableId('stop'), position: 0, color: stop0Color },
        { id: makeStableId('stop'), position: 1, color: stop1Color },
      ],
    };
    setGradientDef(newGradient);
    // Clear custom gradientStops — using preset (value/secondaryValue).
    setDraft((prev) => ({
      ...prev,
      type: 'gradient',
      value,
      secondaryValue,
      gradientStops: undefined,
      gradientAngle: undefined,
    }));
  }, [haptic]);

  // ── Gradient editor (custom) ───────────────────────────────────────
  const handleGradientChange = useCallback((g: GradientDefinition) => {
    setGradientDef(g);
    // Update draft with custom gradientStops + angle.
    setDraft((prev) => ({
      ...prev,
      type: 'gradient',
      value: toHexString(g.stops[0]?.color ?? { space: 'srgb', r: 0, g: 0, b: 0, a: 1 }),
      secondaryValue: toHexString(g.stops[g.stops.length - 1]?.color ?? { space: 'srgb', r: 1, g: 1, b: 1, a: 1 }),
      gradientStops: g.stops.map((s) => ({ position: s.position, color: toHexString(s.color) })),
      gradientAngle: g.angle,
    }));
  }, []);

  const handleGradientCommit = useCallback((g: GradientDefinition) => {
    haptic.light();
    handleGradientChange(g);
  }, [haptic, handleGradientChange]);

  // ── Blur radius slider ─────────────────────────────────────────────
  const handleBlurRadiusChange = useCallback((radius: number) => {
    const clamped = Math.max(0, Math.min(50, Math.round(radius)));
    setDraft((prev) => ({ ...prev, type: 'blur', blurRadius: clamped }));
  }, []);

  // ── Image background: pick from photo library ─────────────────────
  // Uses expo-image-picker to launch the native photo library. The
  // selected image URI is stored in the draft as { type: 'image', value:
  // uri }. Permission is requested first; if denied, an alert guides the
  // user to settings (AGENTS.md §11 — truthful, no fake success).
  const [isPickingImage, setIsPickingImage] = useState(false);

  const handlePickImage = useCallback(async () => {
    if (isPickingImage) return;
    setIsPickingImage(true);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          'Photo access needed',
          'Allow photo library access to pick a background image.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => { void ImagePicker.requestMediaLibraryPermissionsAsync(); } },
          ],
        );
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.92,
      });
      if (!result.canceled && result.assets?.[0]?.uri) {
        haptic.medium();
        setDraft((prev) => ({
          ...prev,
          type: 'image',
          value: result.assets[0].uri,
          imageBlur: prev.imageBlur ?? 0,
        }));
      }
    } catch {
      Alert.alert('Could not open photo library', 'Please try again.');
    } finally {
      setIsPickingImage(false);
    }
  }, [isPickingImage, haptic]);

  // ── Image blur slider (0–20) ──────────────────────────────────────
  const handleImageBlurChange = useCallback((blur: number) => {
    const clamped = Math.max(0, Math.min(20, Math.round(blur)));
    setDraft((prev) => ({ ...prev, type: 'image', imageBlur: clamped }));
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

  // Type tab underline animated style.
  const typeUnderlineStyle = useAnimatedStyle(() => ({
    left: typeUnderlineXSV.value,
    width: typeUnderlineWSV.value,
  }));

  // ── Derived: is a solid swatch active? ─────────────────────────────
  const activeSolidValue = draft.type === 'color' ? draft.value : null;
  const blurRadius = draft.type === 'blur' ? (draft.blurRadius ?? 20) : 20;
  const imageBlur = draft.type === 'image' ? (draft.imageBlur ?? 0) : 0;
  const imageUri = draft.type === 'image' ? draft.value : null;

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
          <Ionicons name="close" size={IconGrammar.standard} color={colors.textSecondary} />
        </PressScale>
      </View>

      {/* Type tabs — text-only with spring-animated underline */}
      <View style={styles.typeTabRow}>
        {TYPE_CHIPS.map((chip) => {
          const isActive = draft.type === chip.id;
          return (
            <PressScale
              key={chip.id}
              onPress={() => handleTypeSelect(chip.id)}
              onLayout={(e) => {
                typeTabLayouts.current.set(chip.id, {
                  x: e.nativeEvent.layout.x,
                  width: e.nativeEvent.layout.width,
                });
                if (draft.type === chip.id) {
                  typeUnderlineXSV.value = e.nativeEvent.layout.x;
                  typeUnderlineWSV.value = e.nativeEvent.layout.width;
                }
              }}
              style={styles.typeTab}
              accessibilityLabel={`${chip.label} background type${isActive ? ', selected' : ''}`}
              accessibilityRole="button"
              accessibilityState={{ selected: isActive }}
            >
              <Text
                style={[
                  styles.typeTabLabel,
                  { color: isActive ? colors.brand : colors.textSecondary },
                ]}
              >
                {chip.label}
              </Text>
            </PressScale>
          );
        })}
        {/* Spring-animated underline indicator (brand color, 2pt) */}
        <Reanimated.View
          style={[styles.typeUnderline, typeUnderlineStyle, { backgroundColor: colors.brand }]}
          pointerEvents="none"
        />
      </View>

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
                            size={IconGrammar.badge}
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
            </ScrollView>

            {/* Shared CreatorColorPicker — compact row with HEX, eyedropper, recents, alpha */}
            <View style={styles.colorPickerSection}>
              <CreatorColorPicker
                color={solidColor}
                onChange={handleSolidColorChange}
                onCommit={handleSolidColorCommit}
                mode="compact"
                recents={recents}
                onCommitRecent={commitRecentColor}
                accessibilityLabel="Background solid color"
              />
            </View>
          </View>
        )}

        {/* ── Gradient ── */}
        {draft.type === 'gradient' && (
          <View>
            <Text style={styles.sectionLabel}>Presets</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.swatchRow}
            >
              {GRADIENT_PRESETS.map((g) => {
                // A preset is "active" if the draft matches and no custom stops.
                const isActive = draft.value === g.value &&
                  draft.secondaryValue === g.secondaryValue &&
                  !draft.gradientStops;
                return (
                  <Pressable
                    key={g.label}
                    onPress={() => handleGradientPresetSelect(g.value, g.secondaryValue)}
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
                          <Ionicons name="checkmark" size={IconGrammar.badge} color="#fff" />
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

            <Text style={styles.sectionLabel}>Custom</Text>
            <GradientEditor
              gradient={gradientDef}
              onChange={handleGradientChange}
              onCommit={handleGradientCommit}
            />
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
          <View>
            <Text style={styles.sectionLabel}>Background photo</Text>
            {imageUri ? (
              <View style={styles.imagePreviewWrap}>
                <Image
                  source={{ uri: imageUri }}
                  style={styles.imagePreview}
                  contentFit="cover"
                  blurRadius={imageBlur}
                  cachePolicy="memory-disk"
                />
                <PressScale
                  onPress={handlePickImage}
                  style={[styles.imageChangeBtn, { borderColor: colors.border }]}
                  accessibilityLabel="Change image"
                  accessibilityHint="Opens the photo library to pick a different background image"
                >
                  <Ionicons name="swap-horizontal-outline" size={IconGrammar.metadata} color={colors.textPrimary} />
                  <Text style={[styles.imageChangeBtnText, { color: colors.textPrimary }]}>
                    {isPickingImage ? 'Opening…' : 'Change Image'}
                  </Text>
                </PressScale>
              </View>
            ) : (
              <PressScale
                onPress={handlePickImage}
                style={[styles.imagePickerEmpty, { borderColor: colors.border }]}
                accessibilityLabel="Pick a background photo"
                accessibilityHint="Opens the photo library to select a background image"
              >
                <Text style={[styles.imagePickerEmptyTitle, { color: colors.textPrimary }]}>
                  {isPickingImage ? 'Opening photo library…' : 'Choose from library'}
                </Text>
                <Text style={[styles.imagePickerEmptyHint, { color: colors.textMuted }]}>
                  Tap to browse your photos
                </Text>
              </PressScale>
            )}
            {imageUri && (
              <View style={styles.sliderRow}>
                <CreatorSlider
                  value={imageBlur}
                  min={0}
                  max={20}
                  step={1}
                  onValueChange={handleImageBlurChange}
                  onCommit={handleImageBlurChange}
                  label="Blur"
                  accessibilityLabel="Background image blur intensity"
                />
              </View>
            )}
          </View>
        )}

      </ScrollView>

      {/* Footer — Confirm / Cancel */}
      <View style={[styles.footer, { borderTopColor: colors.border }]}>
        <PressScale
          onPress={handleCancel}
          style={[styles.footerBtn, styles.footerCancel]}
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
    // ── Type tabs — text-only with spring underline ──
    typeTabRow: {
      flexDirection: 'row',
      paddingHorizontal: Space.md,
      paddingVertical: Space.xs,
      position: 'relative',
    },
    typeTab: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: Space.sm,
    },
    typeTabLabel: {
      fontFamily: Typography.family.semibold,
      fontSize: Type.caption.size,
    },
    typeUnderline: {
      position: 'absolute',
      bottom: 0,
      height: Stroke.emphasis,
      borderRadius: Radius.full,
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
    // ── Custom color picker section ──
    colorPickerSection: {
      marginTop: Space.md,
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
      paddingVertical: Space.xl,
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: Radius.lg,
      borderStyle: 'dashed',
    },
    blurEmptyText: {
      fontFamily: Typography.family.regular,
      fontSize: Type.caption.size,
    },
    // ── Image ──
    imagePreviewWrap: {
      gap: Space.sm,
    },
    imagePreview: {
      width: '100%',
      height: 180,
      borderRadius: Radius.lg,
    },
    imageChangeBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: Space.xs,
      minHeight: 44,
      paddingVertical: Space.sm,
      borderRadius: Radius.md,
      borderWidth: Stroke.standard,
    },
    imageChangeBtnText: {
      fontFamily: Typography.family.medium,
      fontSize: Type.body.size,
    },
    imagePickerEmpty: {
      alignItems: 'center',
      justifyContent: 'center',
      gap: Space.xs,
      paddingVertical: Space.xl + Space.sm,
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: Radius.lg,
      borderStyle: 'dashed',
      minHeight: 44,
    },
    imagePickerEmptyTitle: {
      fontFamily: Typography.family.semibold,
      fontSize: Type.body.size,
      marginTop: Space.xs,
    },
    imagePickerEmptyHint: {
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
      height: 50,
      borderRadius: Radius.lg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    footerCancel: {
      backgroundColor: 'transparent',
    },
    footerCancelText: {
      fontFamily: FontFamily.semibold,
      fontSize: Type.bodyStrong.size,
    },
    footerConfirm: {
      // backgroundColor set inline
    },
    footerConfirmText: {
      fontFamily: FontFamily.semibold,
      fontSize: Type.bodyStrong.size,
    },
  });
}
