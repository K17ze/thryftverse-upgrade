/**
 * CreatorColorPicker — the shared professional color picker for the
 * ThryftVerse creator editor.
 *
 * Per spec 04_COLOR_SYSTEM_ZERO_GAP §2:
 *
 * Compact row mode:
 * - current color well;
 * - recent/project swatches;
 * - eyedropper;
 * - exact HEX field.
 *
 * Expanded panel mode:
 * - two-dimensional saturation/value plane;
 * - hue slider;
 * - alpha slider;
 * - HEX;
 * - RGB values;
 * - HSL/HSV under Advanced;
 * - recents;
 * - project palette;
 * - palette extracted from current media.
 *
 * History semantics (spec §12):
 * - Dragging hue/SV/alpha = transient preview. One history entry on gesture end.
 * - Typing HEX = commit on valid submit/blur.
 *
 * Quality requirements (AGENTS.md §4, §13):
 * - 44pt minimum touch targets on all interactive elements.
 * - Press feedback (scale 0.97 + opacity).
 * - Haptic on commit.
 * - Accessibility labels on all controls.
 * - Smooth 60fps gestures via Reanimated worklets.
 * - No PanResponder — use RNGH.
 * - Deterministic color serialization.
 * - Invalid colors never enter persisted state.
 * - One undo entry per committed color choice.
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Pressable,
  ScrollView,
  Dimensions,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Space, Radius, Type, Typography, Stroke, Control } from '../../theme/designTokens';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { useHaptic } from '../../hooks/useHaptic';
import { PressScale } from '../CreatorAnimations';

import { SVPlane } from './SVPlane';
import { HueSlider } from './HueSlider';
import { AlphaSlider } from './AlphaSlider';
import { HexColorField } from './HexColorField';
import { NumericColorFields } from './NumericColorFields';
import { Eyedropper } from './Eyedropper';
import { RecentColors } from './RecentColors';
import { ProjectPalette } from './ProjectPalette';

import {
  rgbToHsv,
  hsvToRgb,
  withAlpha,
  normalize,
  toHexString,
  toRgbaString,
} from './ColorMath';
import type {
  CreatorColor,
  HSV,
  RecentColor,
  ProjectPaletteEntry,
} from './ColorTypes';

// ── Constants ────────────────────────────────────────────────────────
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SV_PLANE_SIZE = Math.min(SCREEN_WIDTH - Space.md * 2, 280);
const SLIDER_WIDTH = SV_PLANE_SIZE;

// ── Props ────────────────────────────────────────────────────────────
export interface CreatorColorPickerProps {
  /** Current color value (controlled) */
  color: CreatorColor;
  /** Transient change — does NOT create an undo entry */
  onChange: (color: CreatorColor) => void;
  /** Commit — creates one undo entry */
  onCommit: (color: CreatorColor) => void;
  /** Display mode: 'compact' row or 'expanded' panel */
  mode?: 'compact' | 'expanded';
  /** Recent colors from useCreatorColorHistory */
  recents?: RecentColor[];
  /** Project palette derived from the composition document */
  projectPalette?: ProjectPaletteEntry[];
  /** Media URIs for eyedropper and media palette */
  mediaUris?: string[];
  /** Called when a color is committed and should be added to recents */
  onCommitRecent?: (color: CreatorColor) => void;
  /** Style override */
  style?: ViewStyle | ViewStyle[];
  /** Accessibility label for the picker */
  accessibilityLabel?: string;
}

// ── Component ────────────────────────────────────────────────────────
export function CreatorColorPicker({
  color,
  onChange,
  onCommit,
  mode = 'compact',
  recents = [],
  projectPalette = [],
  mediaUris = [],
  onCommitRecent,
  style,
  accessibilityLabel = 'Color picker',
}: CreatorColorPickerProps) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const styles = usePickerStyles(colors);

  const [isExpanded, setIsExpanded] = useState(mode === 'expanded');
  const [hsv, setHsv] = useState<HSV>(() => rgbToHsv(color));

  // Sync HSV when color changes externally (e.g. from recents, HEX, or project palette)
  useEffect(() => {
    const newHsv = rgbToHsv(color);
    setHsv(newHsv);
  }, [color]);

  // ── Commit helpers ─────────────────────────────────────────────────

  const commitColor = useCallback((newColor: CreatorColor) => {
    const normalized = normalize(newColor);
    haptic.light();
    onCommit(normalized);
    onCommitRecent?.(normalized);
  }, [haptic, onCommit, onCommitRecent]);

  // ── SV plane handlers ──────────────────────────────────────────────

  const handleSVChange = useCallback((newHsv: HSV) => {
    setHsv(newHsv);
    const rgb = hsvToRgb(newHsv, color.a);
    onChange(rgb);
  }, [color.a, onChange]);

  const handleSVCommit = useCallback((newHsv: HSV) => {
    setHsv(newHsv);
    const rgb = hsvToRgb(newHsv, color.a);
    commitColor(rgb);
  }, [color.a, commitColor]);

  // ── Hue slider handlers ────────────────────────────────────────────

  const handleHueChange = useCallback((hue: number) => {
    const newHsv = { ...hsv, h: hue };
    setHsv(newHsv);
    const rgb = hsvToRgb(newHsv, color.a);
    onChange(rgb);
  }, [hsv, color.a, onChange]);

  const handleHueCommit = useCallback((hue: number) => {
    const newHsv = { ...hsv, h: hue };
    setHsv(newHsv);
    const rgb = hsvToRgb(newHsv, color.a);
    commitColor(rgb);
  }, [hsv, color.a, commitColor]);

  // ── Alpha slider handlers ──────────────────────────────────────────

  const handleAlphaChange = useCallback((alpha: number) => {
    const newColor = withAlpha(color, alpha);
    onChange(newColor);
  }, [color, onChange]);

  const handleAlphaCommit = useCallback((alpha: number) => {
    const newColor = withAlpha(color, alpha);
    commitColor(newColor);
  }, [color, commitColor]);

  // ── HEX field handler ──────────────────────────────────────────────

  const handleHexCommit = useCallback((newColor: CreatorColor) => {
    commitColor(newColor);
  }, [commitColor]);

  // ── Numeric field handler ──────────────────────────────────────────

  const handleNumericCommit = useCallback((newColor: CreatorColor) => {
    commitColor(newColor);
  }, [commitColor]);

  // ── Swatch pick handlers ───────────────────────────────────────────

  const handlePickColor = useCallback((picked: CreatorColor) => {
    commitColor(picked);
  }, [commitColor]);

  // ── Eyedropper handler ─────────────────────────────────────────────

  const handleEyedropperPick = useCallback((picked: CreatorColor) => {
    commitColor(picked);
  }, [commitColor]);

  // ── Current color display ──────────────────────────────────────────

  const currentHex = toHexString(color).toUpperCase();
  const currentColorRgba = toRgbaString(color);

  // ── Compact mode ───────────────────────────────────────────────────

  if (!isExpanded) {
    return (
      <GestureHandlerRootView style={[styles.compactContainer, style]}>
        {/* Color well + expand button */}
        <View style={styles.compactRow}>
          <PressScale
            onPress={() => {
              haptic.selection();
              setIsExpanded(true);
            }}
            style={[
              styles.colorWell,
              { backgroundColor: currentColorRgba },
            ]}
            accessibilityLabel={`Current color ${currentHex}. Tap to expand color picker.`}
            accessibilityRole="button"
          >
            <View style={styles.colorWellCheckerboard} />
          </PressScale>

          <HexColorField
            color={color}
            onCommit={handleHexCommit}
            style={styles.compactHexField}
          />

          <Eyedropper
            mediaUris={mediaUris}
            onPick={handleEyedropperPick}
            style={styles.compactEyedropper}
          />

          <PressScale
            onPress={() => {
              haptic.selection();
              setIsExpanded(true);
            }}
            style={styles.expandBtn}
            accessibilityLabel="Expand color picker"
            accessibilityRole="button"
          >
            <Ionicons name="chevron-down-outline" size={20} color={colors.textSecondary} />
          </PressScale>
        </View>

        {/* Recents row */}
        {recents.length > 0 && (
          <RecentColors
            recents={recents}
            onPick={handlePickColor}
          />
        )}

        {/* Project palette row */}
        {projectPalette.length > 0 && (
          <ProjectPalette
            palette={projectPalette}
            onPick={handlePickColor}
          />
        )}
      </GestureHandlerRootView>
    );
  }

  // ── Expanded mode ──────────────────────────────────────────────────

  return (
    <GestureHandlerRootView style={[styles.expandedContainer, style]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={styles.expandedContent}
        accessibilityLabel={accessibilityLabel}
      >
        {/* SV plane */}
        <SVPlane
          hsv={hsv}
          size={SV_PLANE_SIZE}
          onChange={handleSVChange}
          onCommit={handleSVCommit}
        />

        {/* Hue slider */}
        <HueSlider
          hue={hsv.h}
          width={SLIDER_WIDTH}
          onChange={handleHueChange}
          onCommit={handleHueCommit}
        />

        {/* Alpha slider */}
        <AlphaSlider
          alpha={color.a}
          color={color}
          width={SLIDER_WIDTH}
          onChange={handleAlphaChange}
          onCommit={handleAlphaCommit}
        />

        {/* HEX + RGB fields */}
        <View style={styles.fieldsRow}>
          <HexColorField
            color={color}
            onCommit={handleHexCommit}
            style={styles.hexField}
          />
        </View>

        <NumericColorFields
          color={color}
          onCommit={handleNumericCommit}
        />

        {/* Eyedropper */}
        <Eyedropper
          mediaUris={mediaUris}
          onPick={handleEyedropperPick}
        />

        {/* Recents */}
        {recents.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Recent</Text>
            <RecentColors
              recents={recents}
              onPick={handlePickColor}
            />
          </View>
        )}

        {/* Project palette */}
        {projectPalette.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>In this project</Text>
            <ProjectPalette
              palette={projectPalette}
              onPick={handlePickColor}
            />
          </View>
        )}

        {/* Collapse button */}
        <PressScale
          onPress={() => {
            haptic.selection();
            setIsExpanded(false);
          }}
          style={styles.collapseBtn}
          accessibilityLabel="Collapse color picker"
          accessibilityRole="button"
        >
          <Ionicons name="chevron-up-outline" size={20} color={colors.textSecondary} />
        </PressScale>
      </ScrollView>
    </GestureHandlerRootView>
  );
}

// ── Styles ───────────────────────────────────────────────────────────
function usePickerStyles(colors: ThemeColors) {
  return React.useMemo(
    () =>
      StyleSheet.create({
        compactContainer: {
          gap: Space.sm,
        },
        compactRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: Space.sm,
          minHeight: Control.hit,
        },
        colorWell: {
          width: 36,
          height: 36,
          borderRadius: Radius.md,
          borderWidth: Stroke.hairline,
          borderColor: 'rgba(0,0,0,0.1)',
          overflow: 'hidden',
        },
        colorWellCheckerboard: {
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(255,255,255,0.1)',
        },
        compactHexField: {
          flex: 1,
        },
        compactEyedropper: {},
        expandBtn: {
          width: Control.hit,
          height: Control.hit,
          alignItems: 'center',
          justifyContent: 'center',
        },
        expandedContainer: {
          gap: Space.sm,
        },
        expandedContent: {
          gap: Space.sm,
          paddingVertical: Space.xs,
        },
        fieldsRow: {
          flexDirection: 'row',
          gap: Space.sm,
          alignItems: 'flex-end',
        },
        hexField: {
          flex: 1,
        },
        section: {
          gap: Space.xs,
        },
        sectionLabel: {
          fontFamily: Typography.family.semibold,
          fontSize: Type.metaElevated.size,
          letterSpacing: Type.metaElevated.letterSpacing,
          color: colors.textSecondary,
          textTransform: 'uppercase',
        },
        collapseBtn: {
          width: Control.hit,
          height: Control.hit,
          alignItems: 'center',
          justifyContent: 'center',
          alignSelf: 'center',
        },
      }),
    [colors],
  );
}
