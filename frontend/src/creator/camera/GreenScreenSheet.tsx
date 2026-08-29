/**
 * GreenScreenSheet — bottom sheet for green screen (chroma key) configuration.
 *
 * vision-camera v5 supports real-time chroma keying via Skia frame
 * processors. The user selects a background image and key parameters;
 * the settings are preserved in CreatorInitialMedia.greenScreen so the
 * timeline can re-render the composite. The real-time frame processor
 * wiring is a future phase — until then, the effect is applied
 * post-capture via Skia.
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { Space, Radius, FontFamily, Control, Stroke, IconGrammar } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { Motion } from '../../theme/motionTokens';
import { useAppTheme } from '../../theme/ThemeContext';
import { PressScale } from '../CreatorAnimations';
import { useHaptic } from '../../hooks/useHaptic';
import { ConfirmationSheet } from '../../components/ConfirmationSheet';

// ── Settings type ────────────────────────────────────────────────────

export interface GreenScreenSettings {
  /** Background image URI to composite behind the subject. */
  backgroundUri: string;
  /** Chroma key color (hex string, e.g. '#00ff00' for green). */
  keyColor: string;
  /** Color tolerance — how similar a pixel must be to the key color to be removed (0–1). */
  tolerance: number;
  /** Edge feathering in pixels — softens the boundary between subject and background. */
  feather: number;
}

// ── Props ────────────────────────────────────────────────────────────

export interface GreenScreenSheetProps {
  visible: boolean;
  onCancel: () => void;
  onApply: (settings: GreenScreenSettings) => void;
  initialSettings?: GreenScreenSettings | null;
}

// ── Defaults ─────────────────────────────────────────────────────────

const DEFAULT_KEY_COLOR = '#00ff00';
const DEFAULT_TOLERANCE = 0.4;
const DEFAULT_FEATHER = 2;

const KEY_COLOR_PRESETS = [
  { label: 'Green', value: '#00ff00' },
  { label: 'Blue', value: '#0000ff' },
  { label: 'Red', value: '#ff0000' },
  { label: 'Black', value: '#000000' },
];

// ── Component ────────────────────────────────────────────────────────

export function GreenScreenSheet({
  visible,
  onCancel,
  onApply,
  initialSettings }: GreenScreenSheetProps) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();

  const [backgroundUri, setBackgroundUri] = useState(
    initialSettings?.backgroundUri ?? '',
  );
  const [keyColor, setKeyColor] = useState(
    initialSettings?.keyColor ?? DEFAULT_KEY_COLOR,
  );
  const [tolerance, setTolerance] = useState(
    initialSettings?.tolerance ?? DEFAULT_TOLERANCE,
  );
  const [feather, setFeather] = useState(
    initialSettings?.feather ?? DEFAULT_FEATHER,
  );
  const [isPickingBackground, setIsPickingBackground] = useState(false);
  const [confirmSheet, setConfirmSheet] = useState<{
    visible: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    variant?: 'default' | 'danger';
    onConfirm: () => void;
  }>({ visible: false, title: '', message: '', onConfirm: () => {} });

  if (!visible) return null;

  // ── Background image picker ────────────────────────────────────────
  // Opens the native media library via expo-image-picker. Permission is
  // requested first; if denied, an alert guides the user to settings
  // (AGENTS.md §11 — truthful, no fake success). The selected image URI
  // is stored in `backgroundUri` so it flows into GreenScreenSettings on
  // apply.
  const handlePickBackground = async () => {
    if (isPickingBackground) return;
    setIsPickingBackground(true);
    haptic.light();
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setConfirmSheet({
          visible: true,
          title: 'Photo access needed',
          message: 'Allow photo library access to pick a background image.',
          confirmLabel: 'Open Settings',
          variant: 'default',
          onConfirm: () => {
            void ImagePicker.requestMediaLibraryPermissionsAsync();
          } });
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images',
        allowsEditing: false,
        quality: 0.9 });
      if (!result.canceled && result.assets?.[0]?.uri) {
        haptic.medium();
        setBackgroundUri(result.assets[0].uri);
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
      setIsPickingBackground(false);
    }
  };

  const handleRemoveBackground = () => {
    haptic.light();
    setBackgroundUri('');
  };

  const handleApply = () => {
    haptic.light();
    onApply({ backgroundUri, keyColor, tolerance, feather });
  };

  const handleCancel = () => {
    haptic.light();
    onCancel();
  };

  return (
    <View style={styles.overlay}>
      <Pressable style={styles.backdrop} onPress={handleCancel} />
      <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>
            Green Screen
          </Text>
          <PressScale
            accessibilityLabel="Close green screen settings"
            accessibilityRole="button"
            onPress={handleCancel}
            style={styles.closeButton}
          >
            <Ionicons name="close" size={Control.icon} color={colors.textPrimary} />
          </PressScale>
        </View>

        <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
          {/* Info banner — flat, hairline separator */}
          <View style={styles.infoBanner}>
            <Ionicons
              name="information-circle-outline"
              size={IconGrammar.standard}
              color={colors.textSecondary}
              style={styles.infoIcon}
            />
            <Text style={[styles.infoText, { color: colors.textSecondary }]}>
              Green screen settings are saved with the capture. The chroma key
              effect is rendered on the timeline via Skia.
            </Text>
          </View>

          {/* Background image picker */}
          <Text style={[styles.label, { color: colors.textSecondary }]}>
            Background
          </Text>
          {backgroundUri ? (
            <View style={styles.bgPreviewRow}>
              <PressScale
                accessibilityLabel="Change background image"
                accessibilityRole="button"
                onPress={handlePickBackground}
                style={[
                  styles.bgThumbWrap,
                  { borderColor: colors.borderSubtle },
                ]}
              >
                <Image
                  source={{ uri: backgroundUri }}
                  style={styles.bgThumb}
                  contentFit="cover"
                  transition={Motion.transitions.mediaLoad.duration}
                />
              </PressScale>
              <PressScale
                accessibilityLabel="Remove background image"
                accessibilityRole="button"
                onPress={handleRemoveBackground}
                style={styles.bgRemoveBtn}
              >
                <Text
                  style={[styles.bgRemoveText, { color: colors.textSecondary }]}
                >
                  Remove
                </Text>
              </PressScale>
            </View>
          ) : (
            <PressScale
              accessibilityLabel="Choose background image"
              accessibilityRole="button"
              onPress={handlePickBackground}
              style={[
                styles.bgChooseBtn,
                { borderColor: colors.borderSubtle },
              ]}
            >
              <Text
                style={[styles.bgChooseText, { color: colors.textPrimary }]}
              >
                Choose Background
              </Text>
            </PressScale>
          )}

          {/* Key color presets — underline selection */}
          <Text style={[styles.label, { color: colors.textSecondary }]}>
            Key Color
          </Text>
          <View style={styles.chipRow}>
            {KEY_COLOR_PRESETS.map((preset) => {
              const isActive = keyColor === preset.value;
              return (
                <PressScale
                  key={preset.value}
                  accessibilityLabel={`Select ${preset.label} key color`}
                  accessibilityRole="button"
                  onPress={() => {
                    haptic.selection();
                    setKeyColor(preset.value);
                  }}
                  style={styles.chip}
                >
                  <View style={[styles.colorSwatch, { backgroundColor: preset.value }]} />
                  <Text
                    style={[
                      styles.chipText,
                      {
                        color: isActive ? colors.brand : colors.textSecondary,
                        textDecorationLine: isActive ? 'underline' : 'none' },
                    ]}
                  >
                    {preset.label}
                  </Text>
                </PressScale>
              );
            })}
          </View>

          {/* Tolerance control — underline selection */}
          <Text style={[styles.label, { color: colors.textSecondary }]}>
            Tolerance: {tolerance.toFixed(2)}
          </Text>
          <View style={styles.chipRow}>
            {[0.2, 0.3, 0.4, 0.5, 0.6].map((t) => {
              const isActive = tolerance === t;
              return (
                <PressScale
                  key={t}
                  accessibilityLabel={`Set tolerance to ${t.toFixed(1)}`}
                  accessibilityRole="button"
                  onPress={() => {
                    haptic.selection();
                    setTolerance(t);
                  }}
                  style={styles.chip}
                >
                  <Text
                    style={[
                      styles.chipText,
                      {
                        color: isActive ? colors.brand : colors.textSecondary,
                        textDecorationLine: isActive ? 'underline' : 'none' },
                    ]}
                  >
                    {t.toFixed(1)}
                  </Text>
                </PressScale>
              );
            })}
          </View>

          {/* Feather control — underline selection */}
          <Text style={[styles.label, { color: colors.textSecondary }]}>
            Edge Feather: {feather}px
          </Text>
          <View style={styles.chipRow}>
            {[1, 2, 4, 8].map((f) => {
              const isActive = feather === f;
              return (
                <PressScale
                  key={f}
                  accessibilityLabel={`Set feather to ${f} pixels`}
                  accessibilityRole="button"
                  onPress={() => {
                    haptic.selection();
                    setFeather(f);
                  }}
                  style={styles.chip}
                >
                  <Text
                    style={[
                      styles.chipText,
                      {
                        color: isActive ? colors.brand : colors.textSecondary,
                        textDecorationLine: isActive ? 'underline' : 'none' },
                    ]}
                  >
                    {f}px
                  </Text>
                </PressScale>
              );
            })}
          </View>
        </ScrollView>

        {/* Footer actions */}
        <View style={[styles.footer, { borderTopColor: colors.borderSubtle }]}>
          <PressScale
            accessibilityLabel="Cancel green screen"
            accessibilityRole="button"
            onPress={handleCancel}
            style={[styles.actionButton, { borderColor: colors.borderSubtle }]}
          >
            <Text style={[styles.actionText, { color: colors.textSecondary }]}>
              Cancel
            </Text>
          </PressScale>
          <PressScale
            accessibilityLabel="Apply green screen settings"
            accessibilityRole="button"
            onPress={handleApply}
            style={[styles.actionButton, styles.applyButton, { backgroundColor: colors.brand }]}
          >
            <Text style={[styles.actionText, { color: colors.textInverse }]}>
              Apply
            </Text>
          </PressScale>
        </View>
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
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'flex-end',
    zIndex: 100 },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    maxHeight: '85%',
    paddingBottom: 34, // safe area
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm },
  title: {
    fontFamily: FontFamily.semibold,
    fontSize: TypographyV2.sectionTitle.size,
    lineHeight: TypographyV2.sectionTitle.lineHeight,
    letterSpacing: TypographyV2.sectionTitle.letterSpacing },
  closeButton: {
    width: Control.hit,
    height: Control.hit,
    alignItems: 'center',
    justifyContent: 'center' },
  body: {
    paddingHorizontal: Space.md },
  bodyContent: {
    paddingBottom: Space.md,
    gap: Space.sm },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.xs,
    paddingBottom: Space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.1)' },
  infoIcon: {
    marginTop: 2 },
  infoText: {
    flex: 1,
    fontFamily: FontFamily.regular,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    letterSpacing: TypographyV2.meta.letterSpacing },
  label: {
    fontFamily: FontFamily.medium,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    letterSpacing: TypographyV2.meta.letterSpacing,
    textTransform: 'uppercase' },
  bgChooseBtn: {
    height: 50,
    borderRadius: Radius.lg,
    borderWidth: Stroke.standard,
    alignItems: 'center',
    justifyContent: 'center' },
  bgChooseText: {
    fontFamily: FontFamily.semibold,
    fontSize: TypographyV2.bodyStrong.size,
    lineHeight: TypographyV2.bodyStrong.lineHeight },
  bgPreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md },
  bgThumbWrap: {
    width: 64,
    height: 64,
    borderRadius: Radius.md,
    overflow: 'hidden',
    borderWidth: Stroke.hairline },
  bgThumb: {
    width: '100%',
    height: '100%' },
  bgRemoveBtn: {
    minHeight: Control.hit,
    paddingHorizontal: Space.xs,
    alignItems: 'center',
    justifyContent: 'center' },
  bgRemoveText: {
    fontFamily: FontFamily.medium,
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight },
  chipRow: {
    flexDirection: 'row',
    gap: Space.md,
    flexWrap: 'wrap',
    alignItems: 'center' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    paddingHorizontal: Space.xs,
    paddingVertical: Space.xs,
    minHeight: Control.hit,
    justifyContent: 'center' },
  colorSwatch: {
    width: 12,
    height: 12,
    borderRadius: Radius.full,
    borderWidth: Stroke.hairline,
    borderColor: 'rgba(255,255,255,0.2)' },
  chipText: {
    fontFamily: FontFamily.medium,
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight },
  footer: {
    flexDirection: 'row',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderTopWidth: StyleSheet.hairlineWidth },
  actionButton: {
    flex: 1,
    height: 50,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: Stroke.standard },
  applyButton: {
    borderWidth: 0 },
  actionText: {
    fontFamily: FontFamily.semibold,
    fontSize: TypographyV2.bodyStrong.size,
    lineHeight: TypographyV2.bodyStrong.lineHeight } });
