/**
 * CameraEffectBar — horizontal scrollable bar of camera effect buttons.
 *
 * Renders one CreatorToolButton per effect in the camera effect set
 * ('none', 'vintage', 'noir', 'vivid', 'warm', 'cool', 'fade'). The
 * active effect is highlighted via the 'fill' selected style. Each button
 * has a 44pt minimum touch target and triggers a selection haptic on press.
 *
 * This bar is displayed at the bottom of the camera preview. It is
 * intentionally compact — a single horizontal scroll row with icon +
 * label, so it does not compete with the viewfinder.
 *
 * Per AGENTS.md §4 (Separate hit area from visible shape): the buttons
 * use transparent backgrounds with a subtle selected backplate, not
 * large coloured chips. Per AGENTS.md §11 (truthful UI): the effects are
 * real ColorMatrix definitions reused from the filter system — no stubs.
 */
import React, { useCallback, useRef } from 'react';
import { StyleSheet, ScrollView, View, type ViewStyle } from 'react-native';
import { CreatorToolButton } from '../controls/CreatorToolButton';
import { useHaptic } from '../../hooks/useHaptic';

// ── Effect type ──────────────────────────────────────────────────────

/**
 * The set of camera preview effects. Each maps to a ColorMatrix from the
 * filter system (see filterConfig.ts). 'none' is the identity (no effect).
 */
export type CameraEffectId =
  | 'none'
  | 'vintage'
  | 'noir'
  | 'vivid'
  | 'warm'
  | 'cool'
  | 'fade';

export interface CameraEffectDef {
  id: CameraEffectId;
  label: string;
  /** Ionicons icon name for the effect. */
  icon: string;
}

/**
 * The canonical camera effect set. The ColorMatrix for each effect is
 * resolved at render time via `resolveColorMatrix` from filterConfig.
 * The icon names are chosen to communicate the effect's character:
 *   none     → circle-outline (neutral)
 *   vintage  → color-filter-outline (warm, faded, nostalgic)
 *   noir     → contrast-outline (high-contrast B&W)
 *   vivid    → sparkles-outline (punchy, saturated)
 *   warm     → sunny-outline (warm tone)
 *   cool     → snow-outline (cool tone)
 *   fade     → cloud-outline (muted, lifted blacks)
 */
export const CAMERA_EFFECTS: CameraEffectDef[] = [
  { id: 'none', label: 'None', icon: 'circle-outline' },
  { id: 'vintage', label: 'Vintage', icon: 'color-filter-outline' },
  { id: 'noir', label: 'Noir', icon: 'contrast-outline' },
  { id: 'vivid', label: 'Vivid', icon: 'sparkles-outline' },
  { id: 'warm', label: 'Warm', icon: 'sunny-outline' },
  { id: 'cool', label: 'Cool', icon: 'snow-outline' },
  { id: 'fade', label: 'Fade', icon: 'cloud-outline' },
];

// ── Component ────────────────────────────────────────────────────────

export interface CameraEffectBarProps {
  /** The currently active effect. */
  activeEffect: CameraEffectId;
  /** Called when the user selects an effect. */
  onSelectEffect: (effect: CameraEffectId) => void;
  /** Whether the bar is disabled (e.g. during recording). */
  disabled?: boolean;
}

/**
 * Horizontal scrollable bar of camera effect buttons.
 *
 * Each effect is a CreatorToolButton with a 44pt+ touch target, an icon,
 * and a label. The active effect shows a filled backplate. Haptics fire
 * on selection (handled by CreatorToolButton's internal haptic).
 */
export function CameraEffectBar({
  activeEffect,
  onSelectEffect,
  disabled = false,
}: CameraEffectBarProps): React.ReactElement {
  const haptic = useHaptic();
  const scrollRef = useRef<ScrollView>(null);

  const handleSelect = useCallback(
    (effect: CameraEffectId) => {
      // CreatorToolButton already fires a selection haptic, but we add
      // an extra light haptic here for the bar-level feedback.
      haptic.light();
      onSelectEffect(effect);
    },
    [haptic, onSelectEffect],
  );

  return (
    <View style={styles.container}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {CAMERA_EFFECTS.map((effect) => (
          <CreatorToolButton
            key={effect.id}
            icon={effect.icon}
            label={effect.label}
            active={activeEffect === effect.id}
            selectedStyle="fill"
            disabled={disabled}
            onPress={() => handleSelect(effect.id)}
            accessibilityLabel={`Camera effect: ${effect.label}`}
            accessibilityHint={
              activeEffect === effect.id
                ? `Currently active effect`
                : `Apply ${effect.label} effect to camera preview`
            }
            testID={`camera-effect-${effect.id}`}
          />
        ))}
      </ScrollView>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    // The bar sits above the bottom controls. It is a transparent
    // horizontal scroll — no card, no background — so it reads as an
    // overlay on the camera preview (AGENTS.md §4: surface budget).
    paddingVertical: 4,
  } as ViewStyle,
  scrollContent: {
    paddingHorizontal: 12,
    gap: 4,
    alignItems: 'center',
  },
});
