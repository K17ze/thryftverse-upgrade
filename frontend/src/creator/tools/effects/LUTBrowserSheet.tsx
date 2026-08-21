/**
 * LUTBrowserSheet — bottom sheet for browsing and applying LUT color grades.
 *
 * Presents the built-in LUT library as a 3-column grid of real Skia-rendered
 * preview thumbnails (LUTPreviewThumb). Each thumbnail runs the actual LUT
 * SkSL shader against the user's media, so the preview is WYSIWYG with the
 * canvas and export — no CSS-filter approximations (AGENTS.md §11).
 *
 * An intensity slider (CreatorSlider) at the bottom controls the blend
 * strength of the selected LUT. The "Apply" button commits the selected LUT
 * + intensity to the composition via `onApply`.
 *
 * The sheet follows the shared SheetContainer pattern (slide-up spring +
 * backdrop) used by AudioBrowserSheet, keeping the creator studio's modal
 * language consistent.
 *
 * Per AGENTS.md §4: authored composition, clear hierarchy, restraint.
 * Per AGENTS.md §13: 44pt touch targets for interactive controls.
 * Per AGENTS.md §11: real Skia RuntimeEffect previews — no fake grades.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  Space,
  Radius,
  Type,
  Typography,
  FontFamily,
  Control,
  Stroke,
  IconGrammar,
} from '../../../theme/designTokens';
import { useAppTheme, type ThemeColors } from '../../../theme/ThemeContext';
import { SheetContainer, PressScale } from '../../CreatorAnimations';
import { useHaptic } from '../../../hooks/useHaptic';
import { useReducedMotion } from '../../../hooks/useReducedMotion';
import { CreatorSlider } from '../../controls/CreatorSlider';
import { getBuiltInLUTs, type BuiltInLUT } from './LUTEffect';
import { LUTPreviewThumb } from './LUTPreviewThumb';

// ── Types ────────────────────────────────────────────────────────────────

/** The result committed when the user applies a LUT. */
export interface LUTApplyResult {
  /** The built-in LUT id (e.g. 'cinematic'), or null to clear the LUT. */
  lutId: string | null;
  /** Blend strength 0..1. */
  intensity: number;
}

export interface LUTBrowserSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Called with the selected LUT + intensity when the user taps Apply. */
  onApply: (result: LUTApplyResult) => void;
  /** Source media URI for the preview thumbnails. */
  sourceUri: string;
  /** Initially selected LUT id (null = none). */
  initialLutId?: string | null;
  /** Initial intensity 0..1. Default 1. */
  initialIntensity?: number;
}

// ── Component ────────────────────────────────────────────────────────────

export function LUTBrowserSheet({
  visible,
  onClose,
  onApply,
  sourceUri,
  initialLutId = null,
  initialIntensity = 1,
}: LUTBrowserSheetProps) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const reducedMotion = useReducedMotion();
  const styles = useSheetStyles(colors);
  const { width: screenWidth } = useWindowDimensions();

  const luts = useMemo(() => getBuiltInLUTs(), []);

  const [selectedLutId, setSelectedLutId] = useState<string | null>(initialLutId);
  const [intensity, setIntensity] = useState<number>(initialIntensity);

  // Reset internal state each time the sheet opens so stale selections from
  // a previous session do not leak in.
  useEffect(() => {
    if (visible) {
      setSelectedLutId(initialLutId);
      setIntensity(initialIntensity);
    }
  }, [visible, initialLutId, initialIntensity]);

  // 3-column grid. Column width leaves inter-cell gaps.
  const columnGap = Space.sm;
  const sidePadding = Space.md;
  const thumbSize = Math.floor(
    (screenWidth - sidePadding * 2 - columnGap * 2) / 3,
  );

  const handleSelectLut = useCallback(
    (lut: BuiltInLUT) => {
      if (!reducedMotion) haptic.selection();
      setSelectedLutId((prev) => (prev === lut.id ? null : lut.id));
    },
    [haptic, reducedMotion],
  );

  const handleIntensityChange = useCallback((v: number) => {
    setIntensity(v);
  }, []);

  const handleApply = useCallback(() => {
    if (!reducedMotion) haptic.medium();
    onApply({ lutId: selectedLutId, intensity });
  }, [selectedLutId, intensity, onApply, haptic, reducedMotion]);

  const handleClose = useCallback(() => {
    if (!reducedMotion) haptic.light();
    onClose();
  }, [haptic, onClose, reducedMotion]);

  const hasSelection = selectedLutId !== null;
  const selectedLut = useMemo(
    () => luts.find((l) => l.id === selectedLutId) ?? null,
    [luts, selectedLutId],
  );

  return (
    <SheetContainer visible={visible} onClose={handleClose} maxHeight={0.85}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ──────────────────────────────────────────────── */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Color Grades</Text>
          <PressScale
            onPress={handleClose}
            style={styles.closeBtn}
            accessibilityLabel="Close LUT browser"
            accessibilityHint="Closes the color grade browser"
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="close" size={IconGrammar.standard} color={colors.textSecondary} />
          </PressScale>
        </View>

        {/* ── LUT grid (3 columns) ────────────────────────────────── */}
        <View style={styles.grid}>
          {luts.map((lut) => (
            <View key={lut.id} style={[styles.cell, { width: thumbSize }]}>
              <LUTPreviewThumb
                sourceUri={sourceUri}
                lut={lut}
                selected={selectedLutId === lut.id}
                onPress={() => handleSelectLut(lut)}
                size={thumbSize}
                intensity={intensity}
              />
            </View>
          ))}
        </View>

        {/* ── Selected LUT description ────────────────────────────── */}
        {selectedLut ? (
          <View style={styles.descriptionWrap}>
            <Text style={[styles.descriptionTitle, { color: colors.textPrimary }]}>
              {selectedLut.name}
            </Text>
            <Text style={[styles.descriptionBody, { color: colors.textMuted }]}>
              {selectedLut.description}
            </Text>
          </View>
        ) : null}

        {/* ── Intensity slider ────────────────────────────────────── */}
        <View style={[styles.sliderWrap, !hasSelection && styles.sliderDisabled]}>
          <CreatorSlider
            value={intensity}
            min={0}
            max={1}
            step={0.01}
            onValueChange={handleIntensityChange}
            onCommit={handleIntensityChange}
            label="Intensity"
            accessibilityLabel="LUT intensity"
            disabled={!hasSelection}
          />
        </View>

        {/* ── Apply ───────────────────────────────────────────────── */}
        <View style={styles.footer}>
          <Pressable
            onPress={handleApply}
            disabled={!hasSelection}
            style={[
              styles.applyBtn,
              {
                backgroundColor: hasSelection ? colors.brand : colors.surfaceAlt,
              },
            ]}
            accessibilityLabel="Apply color grade"
            accessibilityRole="button"
            accessibilityState={{ disabled: !hasSelection }}
            accessibilityHint={
              hasSelection
                ? 'Applies the selected color grade to your photo'
                : 'Select a color grade to apply it'
            }
          >
            <Text
              style={[
                styles.applyBtnText,
                { color: hasSelection ? colors.textInverse : colors.textMuted },
              ]}
            >
              {hasSelection ? 'Apply' : 'Select a Grade'}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </SheetContainer>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    content: {
      paddingHorizontal: Space.md,
      paddingBottom: Space.xl,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: Space.sm,
    },
    title: {
      fontFamily: Typography.family.semibold,
      fontSize: Type.subtitle.size,
    },
    closeBtn: {
      width: Control.hit,
      height: Control.hit,
      justifyContent: 'center',
      alignItems: 'center',
      borderRadius: Radius.sm,
    },
    // ── Grid ──
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: Space.sm,
      paddingVertical: Space.md,
      justifyContent: 'flex-start',
    },
    cell: {
      alignItems: 'center',
    },
    // ── Description ──
    descriptionWrap: {
      paddingVertical: Space.sm,
      gap: Space.xxs,
      minHeight: Control.hit,
      justifyContent: 'center',
    },
    descriptionTitle: {
      fontFamily: Typography.family.semibold,
      fontSize: Type.bodyStrong.size,
    },
    descriptionBody: {
      fontFamily: Typography.family.regular,
      fontSize: Type.body.size,
      lineHeight: Type.body.lineHeight,
    },
    // ── Slider ──
    sliderWrap: {
      paddingVertical: Space.sm,
      marginTop: Space.xs,
    },
    sliderDisabled: {
      opacity: 0.5,
    },
    // ── Footer ──
    footer: {
      paddingTop: Space.lg,
    },
    applyBtn: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: Space.md,
      borderRadius: Radius.lg,
      minHeight: 50,
    },
    applyBtnText: {
      fontFamily: FontFamily.semibold,
      fontSize: Type.bodyStrong.size,
    },
  });
}

// Memoised style factory keyed to colors so re-renders only rebuild when
// the theme changes.
const styleCache = new WeakMap<ThemeColors, ReturnType<typeof createStyles>>();
function useSheetStyles(colors: ThemeColors): ReturnType<typeof createStyles> {
  let cached = styleCache.get(colors);
  if (!cached) {
    cached = createStyles(colors);
    styleCache.set(colors, cached);
  }
  return cached;
}
