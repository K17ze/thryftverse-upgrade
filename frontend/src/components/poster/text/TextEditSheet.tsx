/**
 * TextEditSheet — the bottom editing panel for a selected text layer.
 *
 * Extracted from TextOverlayCanvas to keep the orchestrator focused on layer
 * state and gesture wiring. This sheet hosts:
 *  - FontColorPicker (font family + color + eyedropper)
 *  - Background color row
 *  - Animation options
 *  - Text outline (stroke) toggle, color row, and width controls
 *  - Shadow toggle
 *  - Alignment + font size controls
 *  - Done button
 *
 * The sheet is rendered inside a KeyboardStickyView by the parent and is only
 * shown when a layer is being edited.
 */
import React, { useMemo } from 'react';
import {
  View,
  StyleSheet,
  Text,
  ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Radius, Space, Typography, Stroke } from '../../../theme/designTokens';
import { TypographyV2 } from '../../../theme/typography.v2';
import { useAppTheme, type ThemeColors } from '../../../theme/ThemeContext';
import { useHaptic } from '../../../hooks/useHaptic';
import { AnimatedPressable } from '../../AnimatedPressable';
import { FontColorPicker } from './FontColorPicker';
import {
  FONT_SIZE_MIN,
  FONT_SIZE_MAX,
  STROKE_WIDTH_MIN,
  STROKE_WIDTH_MAX,
  STROKE_WIDTH_DEFAULT,
  type FontFamily } from './fontRegistry';
import type { TextAlignment, TextAnimation, TextLayer } from './types';
import { isLightColor } from '../shared/colorUtils';

// ── Constants ────────────────────────────────────────────────────────────────

const ANIMATION_OPTIONS: {
  key: TextAnimation;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { key: 'none', label: 'None', icon: 'remove-outline' },
  { key: 'fade', label: 'Fade', icon: 'eye-outline' },
  { key: 'slide', label: 'Slide', icon: 'arrow-up-outline' },
  { key: 'typewriter', label: 'Type', icon: 'create-outline' },
  { key: 'bounce', label: 'Bounce', icon: 'trending-up-outline' },
  { key: 'pop', label: 'Pop', icon: 'expand-outline' },
  { key: 'slideDown', label: 'Drop', icon: 'arrow-down-outline' },
];

const PASTEL_OPTIONS = ['#e2d5c2', '#d4b896', '#b8d4c0', '#d4b8c0'];

// ── Props ────────────────────────────────────────────────────────────────────

export interface TextEditSheetProps {
  layer: TextLayer;
  allLayers: TextLayer[];
  canvasSize: { width: number; height: number };
  onUpdateLayer: (id: string, patch: Partial<TextLayer>) => void;
  onDone: () => void;
}

// ── Component ────────────────────────────────────────────────────────────────

export function TextEditSheet({
  layer,
  allLayers,
  canvasSize,
  onUpdateLayer,
  onDone }: TextEditSheetProps) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const COLOR_OPTIONS = useMemo(
    () => [
      colors.textPrimary, colors.textInverse, colors.danger, colors.bronze, colors.antiqueGold,
      colors.success, colors.commerceTrust, colors.social, colors.discovery, colors.coownDown,
      ...PASTEL_OPTIONS, colors.textMuted,
    ],
    [colors]
  );

  const STROKE_COLORS = useMemo(
    () => [
      '#000000', '#ffffff', colors.bronze, colors.antiqueGold,
      colors.danger, colors.success, colors.commerceTrust,
    ],
    [colors]
  );

  const BG_OPTIONS = useMemo<(string | undefined)[]>(
    () => [
      undefined,
      'rgba(0,0,0,0.6)',
      'rgba(255,255,255,0.8)',
      colors.danger,
      colors.commerceTrust,
      colors.success,
      colors.bronze,
      colors.social,
      colors.discovery,
    ],
    [colors]
  );

  const adjustFontSize = (delta: number) => {
    onUpdateLayer(layer.id, {
      fontSize: Math.min(Math.max(layer.fontSize + delta, FONT_SIZE_MIN), FONT_SIZE_MAX) });
  };

  const adjustStrokeWidth = (delta: number) => {
    const current = layer.strokeWidth ?? STROKE_WIDTH_DEFAULT;
    onUpdateLayer(layer.id, {
      strokeWidth: Math.min(Math.max(current + delta, STROKE_WIDTH_MIN), STROKE_WIDTH_MAX) });
  };

  return (
    <View style={styles.controlsPanel}>
      {/* ── Font family + color picker (extracted component) ────────── */}
      <FontColorPicker
        layer={layer}
        allLayers={allLayers}
        canvasSize={canvasSize}
        onFontChange={(font: FontFamily) => {
          onUpdateLayer(layer.id, { fontFamily: font });
        }}
        onColorChange={(color: string) => {
          onUpdateLayer(layer.id, { color });
        }}
        presetColors={COLOR_OPTIONS}
      />

      {/* ── Background color row ─────────────────────────────────────── */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.colorRow}>
        {BG_OPTIONS.map((c, i) => (
          <AnimatedPressable
            key={i}
            style={[
              styles.bgOrb,
              { backgroundColor: c || 'transparent', borderColor: c ? 'transparent' : colors.borderSubtle },
              layer.backgroundColor === c && styles.bgOrbActive,
            ]}
            onPress={() => {
              onUpdateLayer(layer.id, { backgroundColor: c });
              haptic.selection();
            }}
            scaleValue={0.88}
            activeOpacity={0.7}
            hapticFeedback="selection"
            hitSlop={6}
            accessibilityLabel={c ? `Background color ${c}` : 'No background'}
            accessibilityRole="button"
            accessibilityState={{ selected: layer.backgroundColor === c }}
          >
            {!c && <Ionicons name="close" size={12} color={colors.textSecondary} />}
          </AnimatedPressable>
        ))}
      </ScrollView>

      {/* ── Animation options ────────────────────────────────────────── */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.fontRow}>
        {ANIMATION_OPTIONS.map((a) => (
          <AnimatedPressable
            key={a.key}
            style={[styles.fontPill, (layer.animation ?? 'none') === a.key && styles.fontPillActive]}
            onPress={() => {
              onUpdateLayer(layer.id, { animation: a.key });
              haptic.selection();
            }}
            scaleValue={0.94}
            activeOpacity={0.8}
            hapticFeedback="selection"
            accessibilityLabel={`${a.label} animation`}
            accessibilityRole="button"
            accessibilityState={{ selected: (layer.animation ?? 'none') === a.key }}
          >
            <Ionicons
              name={a.icon}
              size={14}
              color={(layer.animation ?? 'none') === a.key ? colors.textPrimary : colors.textSecondary}
            />
            <Text
              style={[
                styles.fontPillText,
                (layer.animation ?? 'none') === a.key && styles.fontPillTextActive,
              ]}
            >
              {a.label}
            </Text>
          </AnimatedPressable>
        ))}
      </ScrollView>

      {/* ── Text stroke toggle + width controls ──────────────────────── */}
      <View style={styles.toggleRow}>
        <Text style={styles.toggleLabel}>Text Outline</Text>
        <AnimatedPressable
          style={[styles.toggleBtn, (layer.strokeEnabled ?? false) && styles.toggleBtnActive]}
          onPress={() => {
            onUpdateLayer(layer.id, {
              strokeEnabled: !(layer.strokeEnabled ?? false) });
            haptic.selection();
          }}
          scaleValue={0.92}
          activeOpacity={0.8}
          hapticFeedback="selection"
          hitSlop={4}
          accessibilityLabel="Toggle text outline"
          accessibilityRole="switch"
          accessibilityState={{ checked: layer.strokeEnabled ?? false }}
        >
          <Ionicons
            name={(layer.strokeEnabled ?? false) ? 'checkmark' : 'close'}
            size={16}
            color={(layer.strokeEnabled ?? false) ? colors.textPrimary : colors.textSecondary}
          />
        </AnimatedPressable>
      </View>

      {(layer.strokeEnabled ?? false) && (
        <>
          {/* Stroke color row */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.colorRow}>
            {STROKE_COLORS.map((c) => (
              <AnimatedPressable
                key={c}
                style={[
                  styles.colorOrb,
                  { backgroundColor: c },
                  (layer.strokeColor ?? '#000000') === c && styles.colorOrbActive,
                ]}
                onPress={() => {
                  onUpdateLayer(layer.id, { strokeColor: c });
                  haptic.selection();
                }}
                scaleValue={0.88}
                activeOpacity={0.7}
                hapticFeedback="selection"
                hitSlop={6}
                accessibilityLabel={`Outline color ${c}`}
                accessibilityRole="button"
                accessibilityState={{ selected: (layer.strokeColor ?? '#000000') === c }}
              >
                {(layer.strokeColor ?? '#000000') === c && (
                  <Ionicons
                    name="checkmark"
                    size={14}
                    color={isLightColor(c) ? '#000' : '#fff'}
                  />
                )}
              </AnimatedPressable>
            ))}
          </ScrollView>

          {/* Stroke width controls */}
          <View style={styles.toolRow}>
            <Text style={styles.toggleLabel}>Outline Width</Text>
            <View style={styles.sizeGroup}>
              <AnimatedPressable
                style={styles.sizeBtn}
                onPress={() => adjustStrokeWidth(-1)}
                scaleValue={0.9}
                activeOpacity={0.7}
                hapticFeedback="light"
                hitSlop={4}
                accessibilityLabel="Decrease outline width"
                accessibilityRole="button"
              >
                <Ionicons name="remove" size={16} color={colors.textSecondary} />
              </AnimatedPressable>
              <Text style={styles.strokeWidthLabel}>
                {layer.strokeWidth ?? STROKE_WIDTH_DEFAULT}
              </Text>
              <AnimatedPressable
                style={styles.sizeBtn}
                onPress={() => adjustStrokeWidth(1)}
                scaleValue={0.9}
                activeOpacity={0.7}
                hapticFeedback="light"
                hitSlop={4}
                accessibilityLabel="Increase outline width"
                accessibilityRole="button"
              >
                <Ionicons name="add" size={16} color={colors.textPrimary} />
              </AnimatedPressable>
            </View>
          </View>
        </>
      )}

      {/* ── Shadow toggle ────────────────────────────────────────────── */}
      <View style={styles.toggleRow}>
        <Text style={styles.toggleLabel}>Text Shadow</Text>
        <AnimatedPressable
          style={[styles.toggleBtn, (layer.shadow ?? true) && styles.toggleBtnActive]}
          onPress={() => {
            onUpdateLayer(layer.id, { shadow: !(layer.shadow ?? true) });
            haptic.selection();
          }}
          scaleValue={0.92}
          activeOpacity={0.8}
          hapticFeedback="selection"
          hitSlop={4}
          accessibilityLabel="Toggle text shadow"
          accessibilityRole="switch"
          accessibilityState={{ checked: layer.shadow ?? true }}
        >
          <Ionicons
            name={(layer.shadow ?? true) ? 'checkmark' : 'close'}
            size={16}
            color={(layer.shadow ?? true) ? colors.textPrimary : colors.textSecondary}
          />
        </AnimatedPressable>
      </View>

      {/* ── Alignment + font size controls ───────────────────────────── */}
      <View style={styles.toolRow}>
        <View style={styles.alignGroup}>
          {(['left', 'center', 'right'] as TextAlignment[]).map((a) => (
            <AnimatedPressable
              key={a}
              style={[styles.alignBtn, layer.alignment === a && styles.alignBtnActive]}
              onPress={() => {
                onUpdateLayer(layer.id, { alignment: a });
                haptic.selection();
              }}
              scaleValue={0.9}
              activeOpacity={0.7}
              hapticFeedback="selection"
              hitSlop={4}
              accessibilityLabel={`Align ${a}`}
              accessibilityRole="button"
              accessibilityState={{ selected: layer.alignment === a }}
            >
              <Text
                style={[
                  styles.alignBtnText,
                  layer.alignment === a && styles.alignBtnTextActive,
                ]}
              >
                {a === 'left' ? 'L' : a === 'center' ? 'C' : 'R'}
              </Text>
            </AnimatedPressable>
          ))}
        </View>

        <View style={styles.toolDivider} />

        <View style={styles.sizeGroup}>
          <AnimatedPressable
            style={styles.sizeBtn}
            onPress={() => adjustFontSize(-2)}
            scaleValue={0.9}
            activeOpacity={0.7}
            hapticFeedback="light"
            hitSlop={4}
            accessibilityLabel="Decrease font size"
            accessibilityRole="button"
          >
            <Text style={styles.sizeBtnTextSmall}>A</Text>
          </AnimatedPressable>
          <AnimatedPressable
            style={styles.sizeBtn}
            onPress={() => adjustFontSize(2)}
            scaleValue={0.9}
            activeOpacity={0.7}
            hapticFeedback="light"
            hitSlop={4}
            accessibilityLabel="Increase font size"
            accessibilityRole="button"
          >
            <Text style={styles.sizeBtnTextLarge}>A</Text>
          </AnimatedPressable>
        </View>
      </View>

      <AnimatedPressable
        style={styles.doneBtn}
        onPress={onDone}
        scaleValue={0.96}
        activeOpacity={0.85}
        hapticFeedback="light"
        accessibilityLabel="Done editing text"
        accessibilityRole="button"
      >
        <Text style={styles.doneBtnText}>Done</Text>
      </AnimatedPressable>
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    controlsPanel: {
      backgroundColor: colors.overlay,
      borderTopLeftRadius: Radius.xxl,
      borderTopRightRadius: Radius.xxl,
      paddingHorizontal: Space.md,
      paddingTop: 14,
      paddingBottom: 28,
      gap: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.glassBorder },
    fontRow: {
      flexDirection: 'row',
      gap: 8,
      paddingBottom: 2 },
    fontPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: Space.md,
      paddingVertical: 10,
      borderRadius: Radius.full,
      backgroundColor: colors.glassBg,
      minHeight: 44 },
    fontPillActive: {
      backgroundColor: colors.surfaceAlt },
    fontPillText: {
      color: colors.textSecondary,
      fontSize: TypographyV2.body.size },
    fontPillTextActive: {
      color: colors.textPrimary },
    colorRow: {
      flexDirection: 'row',
      gap: 10,
      paddingBottom: 2,
      paddingTop: 2 },
    colorOrb: {
      width: 32,
      height: 32,
      borderRadius: Radius.full,
      borderWidth: Stroke.standard,
      borderColor: colors.borderSubtle,
      alignItems: 'center',
      justifyContent: 'center' },
    colorOrbActive: {
      borderWidth: 2,
      borderColor: colors.textPrimary,
      transform: [{ scale: 1.08 }] },
    bgOrb: {
      width: 32,
      height: 32,
      borderRadius: Radius.full,
      borderWidth: Stroke.standard,
      alignItems: 'center',
      justifyContent: 'center' },
    bgOrbActive: {
      borderWidth: 2,
      borderColor: colors.textPrimary,
      transform: [{ scale: 1.08 }] },
    toggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 2 },
    toggleLabel: {
      color: colors.textSecondary,
      fontSize: TypographyV2.body.size,
      fontFamily: Typography.family.medium },
    toggleBtn: {
      width: 36,
      height: 36,
      borderRadius: Radius.full,
      backgroundColor: colors.glassBg,
      alignItems: 'center',
      justifyContent: 'center' },
    toggleBtnActive: {
      backgroundColor: colors.surfaceAlt },
    toolRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      paddingTop: 2 },
    alignGroup: {
      flexDirection: 'row',
      gap: 6 },
    alignBtn: {
      width: 36,
      height: 36,
      borderRadius: Radius.full,
      backgroundColor: colors.glassBg,
      alignItems: 'center',
      justifyContent: 'center' },
    alignBtnActive: {
      backgroundColor: colors.surfaceAlt },
    alignBtnText: {
      color: colors.textSecondary,
      fontSize: TypographyV2.bodyStrong.size,
      fontFamily: Typography.family.bold },
    alignBtnTextActive: {
      color: colors.textPrimary },
    toolDivider: {
      width: 1,
      height: 24,
      backgroundColor: colors.borderSubtle },
    sizeGroup: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6 },
    sizeBtn: {
      width: 36,
      height: 36,
      borderRadius: Radius.full,
      backgroundColor: colors.glassBg,
      alignItems: 'center',
      justifyContent: 'center' },
    sizeBtnTextSmall: {
      color: colors.textSecondary,
      fontSize: TypographyV2.body.size,
      fontFamily: Typography.family.semibold },
    sizeBtnTextLarge: {
      color: colors.textPrimary,
      fontSize: TypographyV2.sectionTitle.size,
      fontFamily: TypographyV2.sectionTitle.fontFamily },
    strokeWidthLabel: {
      color: colors.textPrimary,
      fontSize: TypographyV2.body.size,
      fontFamily: Typography.family.semibold,
      minWidth: 20,
      textAlign: 'center' },
    doneBtn: {
      alignSelf: 'center',
      backgroundColor: colors.brand,
      borderRadius: Radius.full,
      paddingHorizontal: 40,
      paddingVertical: 12,
      marginTop: 2 },
    doneBtnText: {
      color: colors.textInverse,
      fontSize: TypographyV2.bodyStrong.size,
      fontFamily: Typography.family.bold } });
}
