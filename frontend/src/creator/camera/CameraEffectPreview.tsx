/**
 * CameraEffectPreview — effect selection for the camera surface.
 *
 * Manages the selected camera effect and renders the `CameraEffectBar` for
 * selection. Because the app uses `expo-camera` (not react-native-vision-
 * camera), real-time GPU preview via a Skia frame processor is NOT
 * available — expo-camera exposes no per-frame pipeline. This component is
 * truthful about that limitation (AGENTS.md §11): it does not fake a live
 * preview. Instead, the selected effect is stored and applied post-capture
 * via Skia when the photo/video is committed, exactly as the green-screen
 * and speed features already work in CreatorCamera.
 *
 * Integration contract:
 *   - The parent owns the camera and the capture lifecycle.
 *   - This component is controlled: `selectedEffect` + `onEffectChange`.
 *   - On capture, the parent reads `selectedEffect` and attaches it to the
 *     `CreatorInitialMedia` payload so the timeline/export engine applies
 *     the effect's color matrix via Skia.
 *
 * If react-native-vision-camera is added in the future, the real-time
 * preview path would use `useSkiaFrameProcessor` with the effect's color
 * matrix. That import is intentionally absent today — importing it without
 * the package installed would crash the bundle.
 *
 * Per AGENTS.md §11: truthful UI — no stubs, no "coming soon".
 * Per AGENTS.md §13: 44pt touch targets, haptics on selection.
 */
import React, { useCallback } from 'react';
import { View, Text, StyleSheet, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Space, FontFamily, FontSize, Radius } from '../../theme/designTokens';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import {
  CameraEffectBar,
  type CameraEffectId,
} from './CameraEffectBar';

// ── Types ──────────────────────────────────────────────────────────────

export interface CameraEffectPreviewProps {
  /** The currently selected camera effect. */
  selectedEffect: CameraEffectId;
  /** Called when the user selects a different effect. */
  onEffectChange: (effect: CameraEffectId) => void;
  /** Whether selection is disabled (e.g. during recording). */
  disabled?: boolean;
}

// ── Component ──────────────────────────────────────────────────────────

/**
 * Effect selection for the camera surface.
 *
 * Renders the `CameraEffectBar` and a truthful one-line note explaining
 * that the effect is applied after capture (because expo-camera has no
 * frame-processor pipeline for real-time GPU preview). The note is shown
 * only when an effect other than 'none' is selected — when 'none' is
 * active there is nothing to explain.
 */
export function CameraEffectPreview({
  selectedEffect,
  onEffectChange,
  disabled = false,
}: CameraEffectPreviewProps): React.ReactElement {
  const { colors } = useAppTheme();
  const reducedMotion = useReducedMotion();
  const styles = usePreviewStyles(colors);

  const handleSelect = useCallback(
    (effect: CameraEffectId) => {
      // CameraEffectBar already fires a haptic; no need to duplicate.
      onEffectChange(effect);
    },
    [onEffectChange],
  );

  // Truthful UI: only show the post-capture note when an effect is active.
  const hasEffect = selectedEffect !== 'none';

  return (
    <View style={styles.container}>
      <CameraEffectBar
        activeEffect={selectedEffect}
        onSelectEffect={handleSelect}
        disabled={disabled}
      />

      {hasEffect && !reducedMotion ? (
        <View style={styles.noteRow}>
          <Ionicons
            name="information-circle-outline"
            size={13}
            color={colors.textMuted}
          />
          <Text style={[styles.noteText, { color: colors.textMuted }]}>
            Applied after capture — live preview needs a newer camera engine.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────

function usePreviewStyles(colors: ThemeColors) {
  return React.useMemo(
    () =>
      StyleSheet.create({
        container: {
          flexDirection: 'column',
          alignItems: 'center',
          gap: Space.xs,
        } as ViewStyle,
        noteRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          paddingHorizontal: Space.md,
          paddingVertical: 2,
          backgroundColor: colors.overlay,
          borderRadius: Radius.full,
          alignSelf: 'center',
        } as ViewStyle,
        noteText: {
          fontFamily: FontFamily.regular,
          fontSize: FontSize.micro,
          lineHeight: FontSize.micro + 3,
        } as ViewStyle,
      }),
    [colors],
  );
}

export default CameraEffectPreview;
