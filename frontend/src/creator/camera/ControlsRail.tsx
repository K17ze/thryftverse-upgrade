import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Typography, Type, Space } from '../../theme/designTokens';

const CONTROL_RAIL_ICON = 22;

export type FlashMode = 'off' | 'on' | 'auto';

export interface ControlsRailProps {
  /** Top offset (safe-area + header clearance) in pixels. */
  top: number;
  // ── Flip (always visible) ──
  onFlip: () => void;
  // ── Flash (always visible) ──
  flash: FlashMode;
  onCycleFlash: () => void;
  /** Antique-gold accent colour from the active theme. */
  accentColor: string;
}

/**
 * Vertical controls rail — right side.
 *
 * Simplified per the camera-chrome spec: only Flash and Flip are shown
 * in the default state. All secondary tools (Timer, Grid, Hands-free,
 * Speed, Green Screen, Effects, Multi-capture) live behind the Tools
 * button in the top bar, which opens CaptureToolsSheet.
 *
 * Each control is a transparent 48×56 target with a 22pt glyph and a 10pt
 * label — no decorative chrome. Active states (flash) switch to the theme
 * accent colour so the user can read the current toggle state at a glance.
 */
export function ControlsRail({
  top,
  onFlip,
  flash,
  onCycleFlash,
  accentColor,
}: ControlsRailProps) {
  return (
    <View style={[styles.rail, { top }]} pointerEvents="box-none">
      {/* Flash — always visible (core capture control) */}
      <Pressable
        style={({ pressed }) => [styles.railBtn, pressed && styles.btnPressed]}
        onPress={onCycleFlash}
        hitSlop={12}
        accessibilityLabel={`Flash ${flash}`}
        accessibilityRole="button"
      >
        <Ionicons
          name={flash === 'off' ? 'flash-off' : flash === 'auto' ? 'flash-outline' : 'flash'}
          size={CONTROL_RAIL_ICON}
          color={flash === 'off' ? '#fff' : accentColor}
        />
        <Text style={styles.railLabel}>{flash === 'off' ? 'Flash' : flash === 'auto' ? 'Auto' : 'On'}</Text>
      </Pressable>

      {/* Flip — always visible (core capture control) */}
      <Pressable
        style={({ pressed }) => [styles.railBtn, pressed && styles.btnPressed]}
        onPress={onFlip}
        hitSlop={12}
        accessibilityLabel="Flip camera"
        accessibilityRole="button"
      >
        <Ionicons name="camera-reverse-outline" size={CONTROL_RAIL_ICON} color="#fff" />
        <Text style={styles.railLabel}>Flip</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  // Camera overlay — always high contrast on dark preview. The theme has no
  // `textOnMedia` token; textPrimary resolves to black in light mode
  // (invisible on the dark camera preview), so overlay whites are retained.
  rail: {
    position: 'absolute',
    right: 8,
    gap: Space.md,
    alignItems: 'center',
  },
  // 44pt minimum touch target (AGENTS.md §13). The visible glyph is 22pt
  // but the hit zone is 48×56 to exceed the minimum. Labels are 10pt to
  // keep the rail compact — the viewfinder dominates, not the controls.
  railBtn: {
    width: 48,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  railLabel: {
    fontFamily: Typography.family.medium,
    fontSize: 10,
    color: 'rgba(255,255,255,0.85)',
  },
  btnPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.97 }],
  },
});
