/**
 * CameraEffectPreview — effect selection for the camera surface.
 *
 * Manages the selected camera effect and renders the `CameraEffectBar` for
 * selection. The app now uses `react-native-vision-camera` v5, which
 * supports real-time GPU preview via Skia frame processors
 * (`useSkiaFrameProcessor`). The real-time preview path can wire the
 * selected effect's color matrix into a frame processor on the Camera
 * component. Until that wiring is added, the selected effect is stored
 * and applied post-capture via Skia when the photo/video is committed,
 * exactly as the green-screen and speed features work in CreatorCamera.
 *
 * Integration contract:
 *   - The parent owns the camera and the capture lifecycle.
 *   - This component is controlled: `selectedEffect` + `onEffectChange`.
 *   - On capture, the parent reads `selectedEffect` and attaches it to the
 *     `CreatorInitialMedia` payload so the timeline/export engine applies
 *     the effect's color matrix via Skia.
 *
 * Per AGENTS.md §11: truthful UI — no stubs, no "coming soon".
 * Per AGENTS.md §13: 44pt touch targets, haptics on selection.
 */
import React, { useCallback } from 'react';
import { View, Text, StyleSheet, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Space, FontFamily, FontSize, Radius, IconGrammar } from '../../theme/designTokens';
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
 * Renders the `CameraEffectBar` and a one-line note explaining that the
 * effect is applied after capture. The note is shown only when an effect
 * other than 'none' is selected — when 'none' is active there is nothing
 * to explain.
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
            size={IconGrammar.badge}
            color={colors.textMuted}
          />
          <Text style={[styles.noteText, { color: colors.textMuted }]}>
            Effect applied after capture.
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
