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
  ScrollView } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { IconGrammar } from '../../theme/designTokens';
import { useAppTheme } from '../../theme/ThemeContext';
import { SheetContainer, PressScale } from '../shared/CreatorAnimations';
import { useHaptic } from '../../hooks/useHaptic';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import {
  useCreatorColorHistory,
  toHexString,
  fromHexString,
  normalize } from '../color/';
import type { CreatorColor, GradientDefinition } from '../color/';
import { makeStableId } from '../../utils/createStableId';
import { ConfirmationSheet } from '../../components/ConfirmationSheet';
import {
  useSharedValue,
  useAnimatedStyle,
  withSpring } from 'react-native-reanimated';
import { Motion } from '../../theme/motionTokens';
import type { CreatorBackground, CreatorLayer } from '../core/projectStore/composition';
import { backgroundToGradient, type BgType } from './backgroundSheet/backgroundSheetShared';
import { createStyles } from './backgroundSheet/backgroundSheetStyles';
import { BackgroundTypeTabs } from './backgroundSheet/BackgroundTypeTabs';
import {
  SolidSection,
  GradientSection,
  BlurSection,
  ImageSection } from './backgroundSheet/BackgroundSections';

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
  onClose }: BackgroundSheetProps) {
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
    stops: [] }));

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
      ] };
    setGradientDef(newGradient);
    // Clear custom gradientStops — using preset (value/secondaryValue).
    setDraft((prev) => ({
      ...prev,
      type: 'gradient',
      value,
      secondaryValue,
      gradientStops: undefined,
      gradientAngle: undefined }));
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
      gradientAngle: g.angle }));
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
  const [confirmSheet, setConfirmSheet] = useState<{
    visible: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    variant?: 'default' | 'danger';
    onConfirm: () => void;
  }>({ visible: false, title: '', message: '', onConfirm: () => {} });

  const handlePickImage = useCallback(async () => {
    if (isPickingImage) return;
    setIsPickingImage(true);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setConfirmSheet({
          visible: true,
          title: 'Photo access needed',
          message: 'Allow photo library access to pick a background image.',
          confirmLabel: 'Open Settings',
          variant: 'default',
          onConfirm: () => { void ImagePicker.requestMediaLibraryPermissionsAsync(); } });
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.92 });
      if (!result.canceled && result.assets?.[0]?.uri) {
        haptic.medium();
        setDraft((prev) => ({
          ...prev,
          type: 'image',
          value: result.assets[0].uri,
          imageBlur: prev.imageBlur ?? 0 }));
      }
    } catch {
      setConfirmSheet({
        visible: true,
        title: 'Could not open photo library',
        message: 'Please try again.',
        confirmLabel: 'OK',
        variant: 'default',
        onConfirm: () => {} });
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
    width: typeUnderlineWSV.value }));

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
          <Ionicons name="close" size={IconGrammar.standard} color={colors.textPrimary} />
        </PressScale>
      </View>

      <BackgroundTypeTabs
        styles={styles}
        colors={colors}
        activeType={draft.type}
        typeTabLayouts={typeTabLayouts}
        typeUnderlineXSV={typeUnderlineXSV}
        typeUnderlineWSV={typeUnderlineWSV}
        typeUnderlineStyle={typeUnderlineStyle}
        onTypeSelect={handleTypeSelect}
      />

      {/* Section body */}
      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Solid ── */}
        {draft.type === 'color' && (
          <SolidSection
            styles={styles}
            activeSolidValue={activeSolidValue}
            solidColor={solidColor}
            recents={recents}
            onSolidSelect={handleSolidSelect}
            onSolidColorChange={handleSolidColorChange}
            onSolidColorCommit={handleSolidColorCommit}
            onCommitRecent={commitRecentColor}
          />
        )}

        {/* ── Gradient ── */}
        {draft.type === 'gradient' && (
          <GradientSection
            styles={styles}
            draft={draft}
            gradientDef={gradientDef}
            onGradientPresetSelect={handleGradientPresetSelect}
            onGradientChange={handleGradientChange}
            onGradientCommit={handleGradientCommit}
          />
        )}

        {/* ── Blurred ── */}
        {draft.type === 'blur' && (
          <BlurSection
            styles={styles}
            colors={colors}
            blurPreviewUri={blurPreviewUri}
            blurRadius={blurRadius}
            onBlurRadiusChange={handleBlurRadiusChange}
          />
        )}

        {/* ── Image ── */}
        {draft.type === 'image' && (
          <ImageSection
            styles={styles}
            colors={colors}
            imageUri={imageUri}
            imageBlur={imageBlur}
            isPickingImage={isPickingImage}
            onPickImage={handlePickImage}
            onImageBlurChange={handleImageBlurChange}
          />
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
      <ConfirmationSheet
        visible={confirmSheet.visible}
        onDismiss={() => setConfirmSheet((s) => ({ ...s, visible: false }))}
        title={confirmSheet.title}
        message={confirmSheet.message}
        confirmLabel={confirmSheet.confirmLabel ?? 'Confirm'}
        variant={confirmSheet.variant ?? 'default'}
        onConfirm={() => { confirmSheet.onConfirm(); setConfirmSheet((s) => ({ ...s, visible: false })); }}
      />
    </SheetContainer>
  );
}
